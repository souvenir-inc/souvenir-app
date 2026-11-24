'use client'

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { m } from 'framer-motion'
import { TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { userFullName, useAuth } from '@/context/auth-context'
import { useOrg, useOrgMembers } from '@/context/org-context'
import { Warehouse } from '@/lib/api/warehouse'
import { orgScope, queryKeys } from '@/lib/query-keys'
import { cn } from '@/lib/utils'
import { EditBar, SpeedDial } from './BoardActions'
import { AskAIDialog, DraftBar, DraftLine, DraftProblem, type Draft } from './Drafts'
import { EmptyBoard } from './EmptyBoard'
import { EmptyBoardList, Frame, NoStore, Problem, Skeleton } from './DashboardStates'
import { BoardSnapshot } from './share/BoardSnapshot'
import { fileBase, nodeToPng, numbersCsv, saveFile, stamp } from './share/export'
import { leaveNoAccess, seedLinkFromQuery, setViewDates, useLinkView } from './share/link-view'
import { NoAccess } from './share/NoAccess'
import type { ShareStart } from './share/ShareDialog'
import { boardLink, copyText, periodLabel } from './share/share-model'
import { Spinner } from './sync/Spinner'
import type { Way } from './NewBoardChooser'
import type { LibraryPick } from './NewBoardLibrary'
import { TEMPLATES, measurable, starterState, templateFor, toBoardCards } from './templates'
import { landingSize } from './catalog'
import { BoardGrid } from './BoardGrid'
import { cardBody, flagged, healthPill, reasonOf } from './card-states'
import type { CardView } from './MetricCard'
import { NeedsAttention, type AttentionItem } from './NeedsAttention'
import { PeriodMenu, SharedByAvatar } from './BoardHeader'
import { Apps } from './live/apps'
import { BoardStore } from './live/board-store'
import { DashboardDataProvider, useBoardStatus, useCatalog, useLiveDashboard, useWarehouses } from './live/dashboard-data'
import { Metrics } from './live/metrics'
import { SyncBanners } from './sync/SyncBanners'
import { SyncButton } from './sync/SyncButton'
import { clock, hoursSince } from './sync/sync-model'
import { getSyncSnapshot, onSyncEnd, reconnect, useCoarseNow, useSyncState } from './sync/sync-store'
import { showSyncErrorToast, showSyncedToast } from './sync/sync-toasts'
import type { BoardMenuHandlers } from './tabs/BoardMenus'
import { ConfirmDialogs, type PendingConfirm } from './tabs/ConfirmDialogs'
import type { ManageTab } from './tabs/ManageTabsDialog'
import { TabRow } from './tabs/TabRow'
import { cardIdsFor, namesInUse, uniqueName, type DashboardState, type Person } from './tabs/board-state'
import { useDashboard } from './tabs/use-dashboard'
import { storeMidnight } from './period'
import { AddCardsDialog, CardSettings, DefaultBoardDialog, DownloadDialog, ManageTabsDialog, MetricWindow, NewBoardLibrary, ShareDialog, preloadDashboardDialogs } from './lazy-dialogs'
import type { AppId, Metric } from './types'

// Dashboard board panel (Figma wRr8cpImqSXbIgk0XhNj7a: base 17:889, tabs 136:20976, Manage tabs
// 415:64464, sync 95:18703). Rules: docs-v2/dashboard/01 – 04. AppLayout renders /dashboard bare (like
// /schedules), so this builds its own panel: 16px radius, hairline border, warm fill. Inside, a
// 1200px column: the header row, then the open board's cards 20px below it. The numbers, boards and
// sync come from the organization's warehouse (live/).

const BASE_PAD = 16 // space under the cards (pb-4)
const AVATARS = 6

/** The organization's warehouse, its catalog and the viewer's boards; then the board screen. */
export function DashboardScreen() {
  const { user, isHydrated, refreshUser } = useAuth()
  const viewer = user?.auth0Id ?? ''
  const warehouses = useWarehouses()
  const warehouse = warehouses.data?.[0]
  if (warehouses.isError) return <Frame><Problem text="Couldn’t load the dashboard." onRetry={() => { void warehouses.refetch() }} /></Frame>
  if (!warehouses.data) return <Frame><Skeleton /></Frame>
  if (!warehouse) return <Frame><NoStore /></Frame>
  // Boards are read as the viewer, so wait for who that is; once auth has settled without one, say so.
  if (!viewer) {
    if (!isHydrated) return <Frame><Skeleton /></Frame>
    return <Frame><Problem text="Couldn’t load your boards." onRetry={() => { void refreshUser() }} /></Frame>
  }
  return <Loaded key={`${warehouse.id}:${viewer}`} warehouse={warehouse} viewer={viewer} />
}

function Loaded({ warehouse, viewer }: { warehouse: Warehouse; viewer: string }) {
  const { orgId } = useOrg()
  const { members, membersLoading } = useOrgMembers()
  const org = orgScope(orgId)
  // One store for the screen's life (keyed by warehouse and viewer): it remembers what it last wrote.
  const [store] = useState(() => new BoardStore(warehouse, viewer))
  const catalog = useCatalog(warehouse)
  // Read once: from here the screen owns the boards and writes them back (tabs/use-dashboard.ts).
  const boards = useQuery({
    queryKey: queryKeys.warehouse.boards(org, warehouse.id),
    queryFn: ({ signal }) => {
      const people = new Map<string, Person>(members.map((p, i) => [p.id, {
        name: p.name, initials: p.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase(),
        color: `var(--dashboard-avatar-${(i % AVATARS) + 1})`,
      }]))
      return store.load(people, signal)
    },
    // Read once, so only after the members are in: owners and avatars come from them.
    enabled: !membersLoading,
    staleTime: Infinity,
    gcTime: 0,
  })
  const names = useMemo(() => new Set(catalog.data?.map((e) => e.name) ?? []), [catalog.data])
  const initial = useMemo((): DashboardState | null => {
    if (!boards.data || !catalog.data) return null
    if (boards.data.tabs.length) return boards.data
    // A warehouse with no boards yet gets the starter boards (NB-32).
    const apps = new Apps(warehouse.connections)
    return starterState(new Metrics({ catalog: catalog.data, scorecards: [], apps, chart: { from: new Date(), to: new Date() }, chartBefore: null, compare: 'none', today: new Date() }), () => crypto.randomUUID(), viewer)
  }, [boards.data, catalog.data, warehouse, viewer])
  if (catalog.isError || boards.isError) {
    return <Frame><Problem text="Couldn’t load your boards." onRetry={() => { void catalog.refetch(); void boards.refetch() }} /></Frame>
  }
  if (!initial) return <Frame><Skeleton /></Frame>
  return <Board warehouse={warehouse} initial={initial} store={store} names={names} viewer={viewer} />
}

function Board({ warehouse, initial, store, names, viewer }: { warehouse: Warehouse; initial: DashboardState; store: BoardStore; names: Set<string>; viewer: string }) {
  const api = useDashboard(initial, store, names, viewer)
  const queryClient = useQueryClient()
  const { orgId } = useOrg()
  const { state, openBoard } = api
  const panelId = useId()
  const { user } = useAuth()
  const { currentUserRole } = useOrg()
  const isAdmin = currentUserRole === 'admin'
  const me = userFullName(user)
  const open = openBoard ?? state.boards[state.tabs[0]]
  const linkView = useLinkView()
  // Measure the dates on screen: the viewer's own pick (or a link's) wins over the board's saved ones (SH-23).
  const viewing = open && linkView.dates?.boardId === open.id ? linkView.dates : open
  const live = useLiveDashboard(warehouse, { id: open?.id ?? '', period: viewing?.period ?? '7d', compare: viewing?.compare ?? 'previous', metricIds: (open?.cards ?? []).map((c) => c.metricId) })
  useBoardStatus(warehouse, open?.id ?? '', !!open && !open.draft)

  const [renamingId, setRenamingId] = useState<string | null>(null)
  useEffect(() => preloadDashboardDialogs(), [])
  const [manage, setManage] = useState<{ open: boolean; tab: ManageTab }>({ open: false, tab: 'tabs' })
  const [confirm, setConfirm] = useState<PendingConfirm>(null)
  const [visibleCount, setVisibleCount] = useState(6)
  // The latest state, for the stand-in AI's answer that lands later.
  const stateRef = useRef(state)
  useEffect(() => { stateRef.current = state })

  // Room under the cards for the + button, only when it's needed: the board is taller than the
  // panel, or a card would sit under the button. Otherwise the panel doesn't scroll at all (a
  // fixed gap made it scroll on any window under ~840px tall). Decided from where the cards are,
  // which the bottom padding doesn't move, so adding the room can't flip the answer back.
  const scrollRef = useRef<HTMLDivElement>(null)
  const columnRef = useRef<HTMLDivElement>(null)
  const [fabRoom, setFabRoom] = useState(false)
  useLayoutEffect(() => {
    const sc = scrollRef.current
    const col = columnRef.current
    if (!sc || !col) return
    const check = () => {
      const pad = parseFloat(getComputedStyle(col).paddingBottom) || 0
      const tooTall = col.offsetHeight - pad + BASE_PAD > sc.clientHeight + 0.5
      // Where each card sits with the panel scrolled to the top, against the button.
      const box = sc.getBoundingClientRect()
      const fab = sc.parentElement?.querySelector('[data-dashboard-fab]')?.getBoundingClientRect()
      const underFab = !!fab && [...col.querySelectorAll('[data-card-id]')].some((el) => {
        const r = el.getBoundingClientRect()
        const top = r.top - box.top + sc.scrollTop
        const bottom = top + r.height
        return r.right > fab.left && r.left < fab.right && bottom > fab.top - box.top && top < fab.bottom - box.top
      })
      setFabRoom(tooTall || underFab)
    }
    const ro = new ResizeObserver(check)
    ro.observe(sc)
    ro.observe(col)
    check()
    return () => ro.disconnect()
  }, [])

  // /dashboard?board=<id> opens that board (TAB-61); the URL follows the open board.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    // A link: a board you can't see shows the no-access page; one you can opens on the link's dates,
    // and is added as the last tab when it isn't in your tabs (09 SH-23, SH-24).
    const id = seedLinkFromQuery({ board: q.get('board'), period: q.get('period'), compare: q.get('compare') }, (boardId) => !!state.boards[boardId])
    if (id && state.hidden.includes(id)) api.apply([{ type: 'show', id, index: state.tabs.length, open: true }])
    else if (id) api.open(id)
    // Read once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    const url = new URL(window.location.href)
    if (state.openId === state.tabs[0]) url.searchParams.delete('board')
    else url.searchParams.set('board', state.openId)
    window.history.replaceState(window.history.state, '', url)
  }, [state.openId, state.tabs])

  // ── Edit mode (BS-17 – BS-22) ──────────────────────────────────────────────
  // Per board: switching boards leaves it; a new board opens in it (TAB-36, BS-19, BS-21).
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pickKey, setPickKey] = useState(0)
  // When the open board changes, edit mode ends unless it belongs to the board now open (a new
  // board). Adjusted while rendering, React's pattern for state that follows a prop.
  const [seenOpenId, setSeenOpenId] = useState(state.openId)
  if (seenOpenId !== state.openId) {
    setSeenOpenId(state.openId)
    if (editingId && editingId !== state.openId) setEditingId(null)
  }
  const editing = !!openBoard && editingId === openBoard.id && openBoard.access !== 'view' // BS-22
  const startEditing = () => {
    setEditingId(state.openId)
    setPickKey((k) => k + 1)
  }
  const newBoard = () => {
    const id = api.createBoard()
    setRenamingId(id)
    setEditingId(id)
    setPickKey((k) => k + 1)
  }
  // Esc leaves edit mode, like Done, when nothing else is open (BS-19).
  useEffect(() => {
    if (!editing) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      const t = e.target as HTMLElement | null
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return
      if (document.querySelector('[role="menu"], [role="dialog"], [data-radix-popper-content-wrapper]')) return
      setEditingId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing])

  // ── Sync (04-sync-rules.md) ───────────────────────────────────────────────
  // Real sync changes only: the 10 s clock re-renders the small parts that show "N min ago", not the board.
  const sync = useSyncState()
  const clockNow = useCoarseNow()
  const now = Math.max(sync.now, clockNow)
  const [sourcesOpen, setSourcesOpen] = useState(false)
  // How a sync ended, as a toast when the board on screen doesn't already say so (SY-29, SY-30).
  // The listener reads the latest board and list through a ref, set after each render.
  const toastCtx = useRef({ apps: [] as AppId[], sourcesOpen: false })
  useEffect(() => {
    return onSyncEnd((e) => {
      const ctx = toastCtx.current
      const apps = getSyncSnapshot().apps
      const names = (ids: AppId[]) => ids.map((id) => apps[id]?.name ?? 'An app')
      const fix = (ids: AppId[]) => (ids.some((id) => apps[id]?.yours) ? reconnect : null)
      if (e.kind === 'refresh') {
        // With Data sources open the list already shows it (SY-28).
        if (e.failed.length && !ctx.sourcesOpen) showSyncErrorToast({ names: names(e.failed), rest: 'Other apps synced', onReconnect: fix(e.failed) })
        return
      }
      // Boards that read the app show its banner instead (SY-30).
      if ([...e.ok, ...e.failed].some((id) => ctx.apps.includes(id))) return
      if (e.failed.length) {
        const at = e.failed.map((id) => apps[id]?.syncedAt).find((t) => t != null)
        showSyncErrorToast({ names: names(e.failed), rest: at ? `Data from ${clock(at)}` : 'No data yet', onReconnect: fix(e.failed) })
      }
      if (e.ok.length) showSyncedToast(names(e.ok))
    })
    // The listener lives as long as the screen; it reads the moment's values from toastCtx.
  }, [])
  useEffect(() => {
    const apps = [...new Set((open?.cards ?? []).flatMap((c) => live.data?.metrics.get(c.metricId)?.apps ?? []))]
    toastCtx.current = { apps, sourcesOpen }
  })

  // ── Share and export (09-share-export-rules.md) ─────────────────────────────────────
  const [share, setShare] = useState<{ open: boolean; start: ShareStart }>({ open: false, start: 'people' })
  const [downloadOpen, setDownloadOpen] = useState(false)
  // The workspace's default board for new members (11 DT-8): the warehouse keeps it.
  const [defaultOpen, setDefaultOpen] = useState(false)
  const saveDefaultBoard = async (id: string) => {
    setDefaultOpen(false)
    try {
      const saved = await warehouse.setDefaultBoard(id)
      queryClient.setQueryData<Warehouse[]>(queryKeys.warehouse.list(orgScope(orgId)), (list) => list?.map((w) => (w.id === saved.id ? saved : w)))
      toast(`New members start on ${state.boards[id]?.label ?? 'this board'}`, { duration: 6000 })
    } catch (error) {
      console.error('[dashboard] saving the default board failed', error)
      toast.error('Couldn’t save the default board.', { id: 'dashboard-default' })
    }
  }
  // The dates a board is looked at on: a link's, or a viewer's own, else the board's (SH-2, SH-23).
  const datesFor = (id: string) => {
    const d = linkView.dates?.boardId === id ? linkView.dates : state.boards[id]
    return { period: d?.period ?? '7d', compare: d?.compare ?? 'previous' }
  }
  // More → Copy link: a toast says what it opens on; a refusal offers Show link (SH-22).
  const copyBoardLink = async (id: string) => {
    const d = datesFor(id)
    const ok = await copyText(boardLink(window.location.origin, id, d.period, d.compare))
    if (ok) toast(`Link copied. It opens on ${periodLabel(d.period)}.`, { id: 'dashboard-link' })
    else toast('Couldn’t copy the link.', { id: 'dashboard-link', action: { label: 'Show link', onClick: () => { api.open(id); setShare({ open: true, start: 'link' }) } } })
  }
  // The image: the board drawn off screen, then into a PNG at 2× (SH-33 – SH-35). `shot` counts tries.
  const [shot, setShot] = useState(0)
  const shotRef = useRef<HTMLDivElement>(null)
  const prepareImage = () => {
    setDownloadOpen(false)
    toast('Preparing image…', { id: 'dashboard-image', duration: Infinity, icon: <Spinner size={14} /> })
    setShot((n) => n + 1)
  }
  useEffect(() => {
    if (!shot) return
    let gone = false
    // Long enough for the numbers to fade in, so the picture never shows a shimmer.
    const t = window.setTimeout(() => {
      const node = shotRef.current
      const name = node?.parentElement?.dataset.file ?? 'board'
      const job = node ? nodeToPng(node) : Promise.reject(new Error('no image'))
      job.then(
        (blob) => { if (gone) return; saveFile(blob, `${name}.png`); toast.dismiss('dashboard-image'); setShot(0) },
        () => {
          if (gone) return
          setShot(0)
          toast('Couldn’t download the image.', {
            id: 'dashboard-image', duration: Infinity,
            icon: <TriangleAlert aria-hidden size={16} strokeWidth={1.5} absoluteStrokeWidth className="text-[var(--dashboard-sync-failed)]" />,
            action: { label: 'Try again', onClick: () => { toast('Preparing image…', { id: 'dashboard-image', duration: Infinity, icon: <Spinner size={14} /> }); setShot(1) } },
          })
        },
      )
    }, 900)
    return () => { gone = true; window.clearTimeout(t) }
  }, [shot])

  const handlers: BoardMenuHandlers = {
    onRename: (id) => setRenamingId(id),
    onDuplicate: (id) => { api.duplicate(id) },
    onCopyLink: (id) => { void copyBoardLink(id) },
    onMove: (id, by) => api.moveTab(id, state.tabs.indexOf(id) + by),
    onManage: (tab = 'tabs') => setManage({ open: true, tab }),
    onHide: api.hide,
    onDelete: (id) => { const board = state.boards[id]; if (board) setConfirm({ kind: 'delete', board }) },
    onLeave: (id) => { const board = state.boards[id]; if (board) setConfirm({ kind: 'leave', board }) },
  }

  // ── Add cards (06-add-cards-rules.md) ──────────────────────────────────────
  const [pickerOpen, setPickerOpen] = useState(false)
  // New cards, ringed for 2 s and scrolled into view (AC-17). Added from the metric window to the
  // board on screen, the ring waits until the window closes (AC-24).
  const [landed, setLanded] = useState<{ boardId: string; ids: string[]; n: number } | null>(null)
  const [landLater, setLandLater] = useState<{ boardId: string; ids: string[] } | null>(null)
  const land = (boardId: string, ids: string[]) => setLanded((l) => ({ boardId, ids, n: (l?.n ?? 0) + 1 }))

  // ── Cards while reading (05-cards-reading-rules.md) ──────────────────────────
  // The metric window: the card it was opened from, or a Needs attention row (CR-15, CR-33).
  const [windowFor, setWindowFor] = useState<string | null>(null)
  // Card settings: the card id it's open for (10 CS-1).
  const [settingsFor, setSettingsFor] = useState<string | null>(null)

  // ── New board (08-new-board-rules.md) ──────────────────────────────────────────
  const [library, setLibrary] = useState<{ on: LibraryPick; fill: string | null } | null>(null)
  const [ask, setAsk] = useState({ open: false, initial: '' })
  // One draft at a time (NB-20). Dropped if its board goes (a ⌘Z past it, say). Adjusted while rendering.
  const [draft, setDraft] = useState<Draft | null>(null)
  if (draft && !state.boards[draft.boardId]) setDraft(null)
  // Each try asks the drafter with the conversation so far; a late answer to an old try is dropped
  // (NB-21 – NB-23, NB-28, NB-29).
  const drafting = draft?.phase === 'drafting' ? draft : null
  useEffect(() => {
    if (!drafting) return
    const { boardId, messages, run } = drafting
    const stop = new AbortController()
    const settle = (patch: Partial<Draft>, board: Parameters<typeof api.apply>[0]) => {
      if (stop.signal.aborted) return
      api.apply(board)
      setDraft((d) => (d && d.run === run ? { ...d, ...patch } : d))
    }
    const empty: Parameters<typeof api.apply>[0] = [{ type: 'update-board', id: boardId, patch: { label: 'Draft', cards: [], initialCards: [] } }]
    warehouse.draftBoard(messages, stop.signal).then(
      (answer) => {
        const said = [...messages, { role: 'assistant' as const, content: answer.reply }]
        if (!answer.board) { settle({ phase: 'empty', reply: answer.reply, messages: said }, empty); return }
        const cards = toBoardCards(answer.board.cards.map((c) => ({ metricId: c.metric, size: c.size })))
        const label = uniqueName(answer.board.name, namesInUse(stateRef.current, boardId))
        settle({ phase: 'ready', reply: answer.reply, messages: said }, [{ type: 'update-board', id: boardId, patch: { label, cards, initialCards: cards, period: answer.board.period, compare: answer.board.compare } }])
      },
      (error: unknown) => {
        if (stop.signal.aborted) return
        console.error('[dashboard] drafting a board failed', error)
        settle({ phase: 'failed' }, empty)
      },
    )
    return () => stop.abort()
    // One request per try: the run number changes on every try.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafting?.run])
  // Leaving or reloading drops a draft: the browser asks first (NB-30).
  const hasDraft = !!draft
  useEffect(() => {
    if (!hasDraft) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [hasDraft])

  if (!openBoard) return <Frame><EmptyBoardList /></Frame>
  if (!live.data) {
    return <Frame>{live.failed ? <Problem text="Couldn’t load this board." onRetry={live.retry} /> : <Skeleton />}</Frame>
  }
  const { metrics, apps: workspaceApps } = live.data
  const cards = api.cardActions(openBoard.id)
  const tabs = state.tabs.map((id) => state.boards[id]).filter(Boolean)
  const hidden = state.hidden.map((id) => state.boards[id]).filter(Boolean)
  // The apps this board's cards read, and how many cards read each (SY-1, SY-6). A card reading
  // two apps counts for both (MER).
  const appsOf = (metricId: string): AppId[] => {
    const m0 = metrics.get(metricId)
    return !m0 || m0.unmeasured ? [] : m0.apps
  }
  const uses: Partial<Record<AppId, number>> = {}
  for (const c of openBoard.cards) for (const app of appsOf(c.metricId)) uses[app] = (uses[app] ?? 0) + 1
  const boardApps = Object.keys(uses) as AppId[]
  const here = draft && draft.boardId === openBoard.id ? draft : null
  // The numbers are on their way, or a draft is being made: the cards shimmer (TAB-6, NB-21, NB-24).
  const boardLoading = live.measuring || here?.phase === 'drafting'
  // Dates that aren't the board's own: Reset (and Save for board for editors) beside the period (SH-23).
  const own = linkView.dates?.boardId === openBoard.id && (linkView.dates.period !== openBoard.period || linkView.dates.compare !== openBoard.compare) ? linkView.dates : null
  const dates = own ?? { period: openBoard.period, compare: openBoard.compare }
  // The store's midnight: its app hasn't synced "today" when the last sync was before the store's day began.
  const midnight = storeMidnight(warehouse.timezone, new Date(now))

  // How a card reads (CR-18 – CR-29): its body, its app's dot, a shimmer while it syncs, its days
  // and its health.
  // `picture`: for an image, cards as they'll read once loaded (SH-34).
  const cardView = (metricId: string, picture = false): CardView | undefined => {
    const metric = metrics.get(metricId)
    if (!metric) return { body: 'removed', canEdit: openBoard.access !== 'view' }
    // The board's status knows each app's state; until it answers, the warehouse summary's first syncs.
    const apps = appsOf(metricId).map((id) => ({ id, a: sync.apps[id] }))
    const firstSync = apps.some((x) => (x.a ? x.a.state === 'first' : workspaceApps.firstSync(x.id)))
    const body = cardBody({
      loading: !picture && boardLoading,
      firstSyncRunning: firstSync,
      unmeasured: !!metric.unmeasured,
      // On Today, an app that hasn't synced since yesterday has nothing for today (CR-26).
      todayEmpty: dates.period === 'today' && apps.some((x) => x.a?.syncedAt != null && x.a.syncedAt < midnight),
    })
    // The worse dot; hovering it names the app(s) and how old the numbers are (CR-25).
    const failed = apps.filter((x) => x.a?.state === 'failed')
    const behind = apps.filter((x) => x.a?.state === 'behind')
    const tips = failed.length
      ? failed.map((x) => `${x.a.name} sync failed · numbers from ${x.a.syncedAt == null ? 'its first sync' : clock(x.a.syncedAt)}`)
      : behind.map((x) => {
          const h = hoursSince(x.a.syncedAt, now)
          return `${x.a.name} hasn’t synced in ${h} hour${h === 1 ? '' : 's'} · numbers from ${x.a.syncedAt == null ? 'its first sync' : clock(x.a.syncedAt)}`
        })
    const chart = openBoard.cards.find((c) => c.metricId === metricId)?.chart
    return {
      body,
      dot: tips.length ? { tone: failed.length ? 'failed' : 'behind', tip: tips.join('; ') } : undefined,
      syncing: !picture && apps.some((x) => x.a?.state === 'syncing'),
      health: healthPill(metric.health, body),
      canEdit: openBoard.access !== 'view',
      bars: chart ? chart === 'bars' : undefined,
    }
  }

  // Needs attention: every flagged metric on your tabs, red first, with the boards it's on (CR-31).
  const attention: AttentionItem[] = []
  for (const b of tabs) {
    for (const c of b.cards) {
      const metric = metrics.get(c.metricId)
      const health = metric?.health ?? null
      if (!metric || !flagged(health)) continue
      const seen = attention.find((x) => x.metricId === metric.id)
      if (seen) {
        if (!seen.boards.split(', ').includes(b.label)) seen.boards += `, ${b.label}`
        continue
      }
      attention.push({ metricId: metric.id, label: metric.label, boards: b.label, reason: reasonOf(health), value: metric.value, tone: 'red' })
    }
  }
  const windowMetric = windowFor ? metrics.get(windowFor) ?? null : null
  const related = windowMetric
    ? openBoard.cards.map((c) => metrics.get(c.metricId)).filter((x): x is Metric => !!x && x.id !== windowMetric.id && x.apps.some((a) => windowMetric.apps.includes(a)))
    : []
  const notReady = (what: string) => toast.info(`${what} isn’t ready yet`, { id: 'dashboard-not-ready' })
  const stampText = stamp(openBoard.label, dates.period, dates.compare, me, live.data?.today)
  // Numbers: one CSV, then the dialog closes; no toast, the file is the confirmation (SH-36, SH-37).
  const downloadNumbers = async (ids: string[]) => {
    const title = ids.length === 1 ? metrics.get(ids[0])?.label ?? openBoard.label : openBoard.label
    const csv = numbersCsv({ title, metrics: ids.map((id) => metrics.get(id)).filter((x): x is Metric => !!x), period: dates.period, compare: dates.compare, by: me, on: live.data?.today })
    saveFile(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${fileBase(title, dates.period, live.data?.today)}.csv`)
    setDownloadOpen(false)
  }
  const noAccess = linkView.noAccess

  // The picker's Add: at the end, in the order picked, each at the size that suits it (AC-16 – AC-18).
  const addPicked = (metricIds: string[]) => {
    setPickerOpen(false)
    const picked = metricIds.map((id) => metrics.get(id)).filter((x): x is Metric => !!x)
    const result = api.addCards(openBoard.id, picked.map((x) => ({ metricId: x.id, size: landingSize(x) })))
    if (!result) return
    land(openBoard.id, result.ids)
    const message = picked.length === 1 ? `Added ${picked[0].label}` : `Added ${picked.length} cards`
    toast(message, { duration: 6000, action: { label: 'Undo', onClick: result.undo } })
  }

  // Add to board from a metric's window (AC-22 – AC-25).
  const addToBoard = (metricId: string, boardId: string) => {
    const board = state.boards[boardId]
    const metric = metrics.get(metricId)
    if (!board || !metric) return
    const result = api.addCards(boardId, [{ metricId: metric.id, size: landingSize(metric) }])
    if (!result) return
    if (boardId === openBoard.id) {
      setLandLater({ boardId, ids: result.ids })
      toast(`Added ${metric.label} to ${board.label}`, { duration: 6000, action: { label: 'Undo', onClick: result.undo } })
      return
    }
    toast(`Added ${metric.label} to ${board.label}`, {
      duration: 6000,
      action: { label: 'Undo', onClick: result.undo },
      // View: close the window and open that board on the new card (AC-24).
      cancel: { label: 'View', onClick: () => { setWindowFor(null); api.open(boardId); land(boardId, result.ids) } },
    })
  }
  const closeWindow = () => {
    setWindowFor(null)
    if (landLater) { land(landLater.boardId, landLater.ids); setLandLater(null) }
  }
  const editableBoards = tabs.filter((b) => b.access !== 'view')

  // ── Card settings (10-cards-reference-rules.md CS-1 – CS-9) ─────────────────────────
  // Only while editing, and only for a card still on the board.
  const settingsCard = editing && settingsFor ? openBoard.cards.find((c) => c.metricId === settingsFor) ?? null : null
  const pickable = measurable
  const setCards = (next: typeof openBoard.cards) => api.change([{ type: 'set-cards', id: openBoard.id, cards: next }], [{ type: 'set-cards', id: openBoard.id, cards: openBoard.cards }])
  // Another metric, same size and place; a chart it doesn't suit goes back to Trend (CS-5).
  const swapMetric = (metricId: string) => {
    if (!settingsCard) return
    const others = openBoard.cards.filter((c) => c.metricId !== settingsCard.metricId).map((c) => c.metricId)
    const [cardId] = cardIdsFor(others, [metricId])
    const chart = settingsCard.chart
    setCards(openBoard.cards.map((c) => (c.metricId === settingsCard.metricId ? { ...c, metricId: cardId, chart } : c)))
    setSettingsFor(cardId)
  }
  const setChart = (chart: 'trend' | 'bars') => {
    if (!settingsCard) return
    setCards(openBoard.cards.map((c) => (c.metricId === settingsCard.metricId ? { ...c, chart } : c)))
  }
  // Duplicate: a copy at the end, same size and chart, ringed, with Undo (CS-7).
  const duplicateCard = () => {
    if (!settingsCard) return
    const label = metrics.get(settingsCard.metricId)?.label ?? 'Card'
    setSettingsFor(null)
    const result = api.addCards(openBoard.id, [{ metricId: Metrics.base(settingsCard.metricId), size: settingsCard.size }])
    if (!result) return
    if (settingsCard.chart) {
      const copyId = result.ids[0]
      // The copy keeps the chart: patched on the board right after it lands.
      window.setTimeout(() => {
        const b = stateRef.current.boards[openBoard.id]
        if (b) api.apply([{ type: 'set-cards', id: b.id, cards: b.cards.map((c) => (c.metricId === copyId ? { ...c, chart: settingsCard.chart } : c)) }])
      })
    }
    land(openBoard.id, result.ids)
    toast(`Duplicated ${label}`, { duration: 6000, action: { label: 'Undo', onClick: result.undo } })
  }

  // ── New board: the chooser's ways (NB-6) ─────────────────────────────────────────
  const undoable = (message: string, undoIt: () => void) => toast(message, { duration: 6000, action: { label: 'Undo', onClick: undoIt } })
  const pickWay = (way: Way) => {
    if (way === 'empty') { newBoard(); return }
    if (way === 'ai') {
      // With a draft open, Ask the AI goes to it (NB-20).
      if (draft) api.open(draft.boardId)
      else setAsk({ open: true, initial: '' })
      return
    }
    const copyFrom = openBoard.draft ? state.tabs.find((id) => !state.boards[id]?.draft) ?? openBoard.id : openBoard.id
    setLibrary({ on: way === 'template' ? 'template:founder' : `board:${copyFrom}`, fill: null })
  }
  // Use template: a new last tab (NB-12), or this empty board filled (NB-18).
  const applyTemplate = (templateId: string, fill: string | null) => {
    const t = TEMPLATES.find((x) => x.id === templateId)
    if (!t) return
    setLibrary(null)
    const fields = { label: t.name, cards: toBoardCards(templateFor(t.cards, metrics).cards), period: t.period, compare: t.compare }
    if (fill) {
      const undoIt = api.fillBoard(fill, fields)
      if (undoIt) undoable(`Filled from the ${t.name} template`, undoIt)
      return
    }
    const r = api.addBoard(fields)
    undoable(`${r.label} board added`, r.undo)
  }
  const copyBoard = (boardId: string) => {
    setLibrary(null)
    const r = api.copyBoard(boardId)
    if (r) undoable(`${r.label} added`, r.undo)
  }

  // ── Ask the AI (NB-20 – NB-30) ───────────────────────────────────────────────────
  const sendDraft = (request: string) => {
    setAsk({ open: false, initial: '' })
    if (draft) {
      // A new request replaces the draft in its own tab (NB-24).
      const b = state.boards[draft.boardId]
      api.apply([{ type: 'update-board', id: draft.boardId, patch: { label: draft.phase === 'ready' && b ? b.label : 'Drafting…' } }, { type: 'open', id: draft.boardId }])
      setDraft({ ...draft, phase: 'drafting', reply: undefined, messages: [...draft.messages, { role: 'user', content: request }], run: draft.run + 1 })
      return
    }
    const r = api.addBoard({ label: 'Drafting…', cards: [], period: '7d', compare: 'previous', draft: true }, false)
    setDraft({ boardId: r.id, request, phase: 'drafting', openBefore: state.openId, messages: [{ role: 'user', content: request }], run: 1 })
  }
  // A change is the next turn of the same conversation: the drafter has what came before (NB-24).
  const redraft = (change: string) => { if (draft) sendDraft(change) }
  // Discard, and Stop while drafting (NB-27): no confirm, not in Recently deleted, Undo brings it back.
  const discardDraft = () => {
    if (!draft) return
    const before = draft
    const openAfter = state.boards[before.openBefore] ? before.openBefore : state.tabs.find((id) => id !== before.boardId) ?? state.tabs[0]
    const undoIt = api.discardDraft(before.boardId, openAfter)
    setDraft(null)
    if (editingId === before.boardId) setEditingId(null)
    if (undoIt) undoable('Draft discarded', () => { undoIt(); setDraft(before.phase === 'drafting' ? { ...before, run: before.run + 1 } : before) })
  }
  // Keep board (NB-26): a private board you own; Undo turns it back into the draft.
  const keepDraft = () => {
    if (!draft) return
    const before = draft
    const label = state.boards[before.boardId]?.label ?? 'Board'
    const undoIt = api.change([{ type: 'update-board', id: before.boardId, patch: { draft: false } }], [{ type: 'update-board', id: before.boardId, patch: { draft: true } }])
    setDraft(null)
    undoable(`${label} saved`, () => { undoIt(); setDraft(before) })
  }

  return (
    <DashboardDataProvider value={live.data}>
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--neutral-50)] py-2.5 pr-2.5">
      <section
        data-dashboard-panel
        aria-labelledby="dashboard-title"
        className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--layout-radius)] border border-solid border-[var(--border-default)] bg-[var(--dashboard-panel-bg)]"
      >
        <h1 id="dashboard-title" className="sr-only">Dashboard</h1>
        {/* Gutter on both edges keeps the 1200px column centred in the panel, as in the Figma.
            Inline, because the unlayered .kaya-scrollbar rule outranks a Tailwind utility. */}
        <m.div
          ref={scrollRef}
          layoutScroll
          // No sideways scrolling at any width, sidebar open or not. Everything inside is sized to
          // fit; this only catches transient overflow, like a card dragged past the edge.
          className="kaya-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain"
          style={{ scrollbarGutter: 'stable both-edges' }}
        >
          {/* overflow-x: clip (not hidden) makes no scroll container, so a card dragged past the
              edge can't widen the scroll area even for a moment; the margin keeps its shadow. */}
          <div
            ref={columnRef}
            className={cn(
              'mx-auto box-border w-full min-w-0 max-w-[1232px] overflow-x-clip px-4 pt-[15px] [overflow-clip-margin:12px]',
              // + button: 44px, 20px from the bottom, so 64px; plus the usual 16px.
              fabRoom ? 'pb-20' : 'pb-4',
            )}
          >
            {/* One row; on a very narrow panel the period and sync drop below the tabs rather than
                pushing the row wider. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <TabRow
                boards={tabs}
                openId={noAccess ? '' : state.openId}
                renamingId={renamingId}
                panelId={panelId}
                onOpen={(id) => { leaveNoAccess(); api.open(id) }}
                onStartRename={setRenamingId}
                onEndRename={() => setRenamingId(null)}
                onCommitRename={(id, raw) => api.rename(id, raw, (again) => { api.open(again); setRenamingId(again) })}
                onMoveTo={api.moveTab}
                onLayout={setVisibleCount}
                {...handlers}
              />
              {/* The period and sync button keep their place at the top right (TAB-16). */}
              <div className={cn('ml-auto flex shrink-0 items-center gap-1', noAccess && 'invisible')}>
                {openBoard.sharedBy && <SharedByAvatar person={openBoard.sharedBy} />}
                {/* Before the period: what needs attention across every board (CR-31). */}
                <NeedsAttention items={attention} onOpenMetric={setWindowFor} />
                {own && (
                  // The link's dates, not the board's (SH-23): back to the board's, or keep them for it.
                  <span data-own-dates className="flex items-center gap-0.5 text-[13px] leading-5">
                    {/* eslint-disable-next-line no-restricted-syntax -- ds-allow: a quiet text action beside the period (Period row P-5) */}
                    <button type="button" onClick={() => setViewDates(null)} className="h-8 cursor-pointer rounded-lg border-0 bg-transparent px-2 text-[var(--neutral-700)] hover:bg-[var(--dashboard-sync-bg)]">Reset</button>
                    {openBoard.access !== 'view' && (
                      <>
                        <span aria-hidden className="text-[var(--dashboard-faint)]">·</span>
                        {/* eslint-disable-next-line no-restricted-syntax -- ds-allow: a quiet text action beside the period (Period row P-5) */}
                        <button type="button" onClick={() => { api.setDates(openBoard.id, own); setViewDates(null) }} className="h-8 cursor-pointer rounded-lg border-0 bg-transparent px-2 font-medium text-[var(--dashboard-figure)] hover:bg-[var(--dashboard-sync-bg)]">Save for board</button>
                      </>
                    )}
                  </span>
                )}
                <PeriodMenu
                  period={dates.period}
                  compare={dates.compare}
                  // A viewer picks dates for themselves; with a link's dates on, so does everyone (SH-2, SH-23).
                  // Changing dates changes only your view (11 DT-6); back on the board's own, nothing shows.
                  onChange={(d) => {
                    const next = { boardId: openBoard.id, period: d.period ?? dates.period, compare: d.compare ?? dates.compare }
                    setViewDates(next.period === openBoard.period && next.compare === openBoard.compare ? null : next)
                  }}
                />
                <SyncButton apps={boardApps} uses={uses} open={sourcesOpen} onOpenChange={setSourcesOpen} />
              </div>
            </div>

            <div id={panelId} role="tabpanel" aria-labelledby={`board-tab-${openBoard.id}`} className="mt-5 outline-none">
              {/* Above the cards, also in edit mode and with Data sources open (SY-13, SY-21). */}
              {here && !noAccess && <div className="mb-4"><DraftLine draft={here} /></div>}
              <div className="empty:hidden mb-4"><SyncBanners boardId={openBoard.id} apps={boardApps} /></div>
              {noAccess ? (
                <NoAccess onBack={() => { leaveNoAccess(); api.open(state.tabs[0]) }} />
              ) : here?.phase === 'drafting' && openBoard.cards.length === 0 ? (
                // Plain card skeletons: a draft being made (NB-21).
                <Skeleton />
              ) : here && (here.phase === 'failed' || here.phase === 'empty') ? (
                <DraftProblem
                  draft={here}
                  onTryAgain={() => { api.apply([{ type: 'update-board', id: here.boardId, patch: { label: 'Drafting…' } }]); setDraft({ ...here, phase: 'drafting', run: here.run + 1 }) }}
                  onChange={() => setAsk({ open: true, initial: here.request })}
                  onConnect={() => notReady('Connecting an app')}
                />
              ) : live.failed ? (
                // The board's numbers couldn't load; the header keeps working (CR-21).
                <Problem text="Couldn’t load this board." onRetry={live.retry} />
              ) : (
                <BoardGrid
                  key={openBoard.id}
                  cards={openBoard.cards}
                  empty={openBoard.access !== 'view' ? (
                    <EmptyBoard
                      onAddCards={() => setPickerOpen(true)}
                      onFill={(id) => applyTemplate(id, openBoard.id)}
                      onAllTemplates={() => setLibrary({ on: 'template:founder', fill: openBoard.id })}
                    />
                  ) : undefined}
                  editing={editing}
                  cardView={cardView}
                  onOpenCard={setWindowFor}
                  onRetryCard={live.retry}
                  onOpenSettings={editing ? setSettingsFor : undefined}
                  onRemoveEmpty={(id) => cards.removeWithUndo(id, metrics.get(id)?.label ?? 'Card')}
                  landed={landed?.boardId === openBoard.id ? landed : null}
                  onMoveTo={cards.moveTo}
                  onSetLayout={cards.setLayout}
                  onStep={cards.step}
                  onResize={cards.resize}
                  onRemove={(id) => cards.removeWithUndo(id, metrics.get(id)?.label ?? 'Card')} // "Removed Revenue" with Undo (07, Toast)
                />
              )}
            </div>
          </div>
        </m.div>

        {/* The corner: the speed dial reading the board, the edit bar in edit mode (BS-17). None on the no-access page (SH-24). */}
        {noAccess ? null : editing ? (
          <EditBar
            key={`${openBoard.id}-${pickKey}`}
            onAddCards={() => setPickerOpen(true)}
            onNewBoard={pickWay}
            onDone={() => setEditingId(null)}
          />
        ) : here ? (
          // A draft's own bar in the dial's corner (NB-21, NB-22, NB-28).
          <DraftBar draft={here} onStop={discardDraft} onRedraft={redraft} onEdit={startEditing} onDiscard={discardDraft} onKeep={keepDraft} />
        ) : (
          <SpeedDial
            key={openBoard.id}
            board={openBoard}
            tabs={tabs}
            hidden={hidden}
            deletedCount={state.deleted.length}
            onlyOne={state.tabs.length <= 1}
            startOpen={openBoard.cards.length <= 2} // BS-5
            onAddCards={() => setPickerOpen(true)} // reading mode stays on (AC-19)
            onNewBoard={pickWay}
            onEditBoard={startEditing}
            onShare={() => setShare({ open: true, start: 'people' })}
            onDownload={() => setDownloadOpen(true)}
            onDefaultBoard={isAdmin ? () => setDefaultOpen(true) : undefined}
            onOpen={api.open}
            onShow={api.show}
            onStartOver={api.startOver}
            onNotReady={notReady}
            {...handlers}
          />
        )}
      </section>

      <MetricWindow
        metric={windowMetric}
        view={windowFor ? cardView(windowFor) : undefined}
        periodId={dates.period}
        related={related}
        onClose={closeWindow}
        onOpenMetric={setWindowFor}
        onNotReady={notReady}
        boards={editableBoards}
        onAddToBoard={(boardId) => windowFor && addToBoard(windowFor, boardId)}
      />
      <NewBoardLibrary
        openOn={library?.on ?? null}
        boards={[...tabs, ...hidden]}
        onClose={() => setLibrary(null)}
        onUseTemplate={(id) => applyTemplate(id, library?.fill ?? null)}
        onCopy={copyBoard}
      />
      <AskAIDialog open={ask.open} initial={ask.initial} onClose={() => setAsk({ open: false, initial: '' })} onSend={sendDraft} />
      <CardSettings
        card={settingsCard}
        period={dates.period}
        compare={dates.compare}
        cardView={(id) => cardView(id, true)}
        stamp={stampText}
        pickable={pickable}
        onClose={() => setSettingsFor(null)}
        onSwap={swapMetric}
        onChart={setChart}
        onDuplicate={duplicateCard}
        onRemove={() => {
          if (!settingsCard) return
          setSettingsFor(null)
          cards.removeWithUndo(settingsCard.metricId, metrics.get(settingsCard.metricId)?.label ?? 'Card') // CS-8
        }}
      />
      <AddCardsDialog open={pickerOpen} onBoard={openBoard.cards.map((c) => c.metricId)} onClose={() => setPickerOpen(false)} onAdd={addPicked} />
      <ManageTabsDialog
        open={manage.open}
        initialTab={manage.tab}
        state={state}
        visibleCount={visibleCount}
        onClose={() => setManage((m0) => ({ ...m0, open: false }))}
        onSave={(draft) => api.applyManage(draft, (again) => { api.open(again); setRenamingId(again) })}
        onDuplicate={api.duplicate}
        onCreate={api.createBoard}
        onRestore={api.restore}
        onCopyLink={api.copyLink}
        onRequestDelete={handlers.onDelete}
        onRequestLeave={handlers.onLeave}
      />
      <ShareDialog
        open={share.open}
        startOn={share.start}
        board={openBoard}
        period={dates.period}
        compare={dates.compare}
        cardView={(id) => cardView(id, true)}
        stamp={stampText}
        onChange={(access) => api.apply([{ type: 'update-board', id: openBoard.id, patch: access }])}
        onClose={() => setShare((s) => ({ ...s, open: false }))}
        onPosted={(channel) => {
          setShare((s) => ({ ...s, open: false }))
          toast(`Posted to #${channel}`, { duration: 6000 })
        }}
      />
      <DefaultBoardDialog
        open={defaultOpen}
        // New members have to be able to see it: boards open to the workspace only (DT-8).
        boards={[...tabs, ...hidden].filter((b) => !b.draft && b.general !== 'none')}
        current={warehouse.defaultBoard ?? ''}
        onClose={() => setDefaultOpen(false)}
        onSave={(id) => { void saveDefaultBoard(id) }}
      />
      <DownloadDialog
        open={downloadOpen}
        board={openBoard}
        period={dates.period}
        compare={dates.compare}
        onClose={() => setDownloadOpen(false)}
        onImage={prepareImage}
        onNumbers={downloadNumbers}
      />
      {/* The board drawn off screen for its image (SH-33, SH-34). */}
      {shot > 0 && (
        <div aria-hidden data-file={fileBase(openBoard.label, dates.period, live.data?.today)} style={{ position: 'fixed', left: 0, top: 0, transform: 'translateX(-200vw)', pointerEvents: 'none' }}>
          <BoardSnapshot ref={shotRef} cards={openBoard.cards} cardView={(id) => cardView(id, true)} stamp={stampText} />
        </div>
      )}
      <ConfirmDialogs
        pending={confirm}
        onCancel={() => setConfirm(null)}
        onConfirm={(kind, id) => {
          setConfirm(null)
          if (kind === 'delete') api.remove(id)
          else api.leave(id)
        }}
      />
    </div>
    </DashboardDataProvider>
  )
}
