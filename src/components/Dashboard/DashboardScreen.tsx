'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { m } from 'framer-motion'
import { TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { AddCardsDialog } from './AddCardsDialog'
import { EditBar, SpeedDial } from './BoardActions'
import { AskAIDialog, DraftBar, DraftLine, DraftProblem, type Draft } from './Drafts'
import { CardSettings } from './CardSettings'
import { DefaultBoardDialog } from './DefaultBoardDialog'
import { EmptyBoard } from './EmptyBoard'
import { BoardSnapshot } from './share/BoardSnapshot'
import { DownloadDialog } from './share/DownloadDialog'
import { consumeDownloadFail, fileBase, nodeToPng, numbersCsv, saveFile, seedDownloadFail, stamp } from './share/export'
import { leaveNoAccess, seedLinkFromQuery, setViewDates, useLinkView } from './share/link-view'
import { NoAccess } from './share/NoAccess'
import { ShareDialog, type ShareStart } from './share/ShareDialog'
import { ME, boardLink, nameOf, periodLabel } from './share/share-model'
import { copyText, seedShareFromQuery } from './share/share-store'
import { Spinner } from './sync/Spinner'
import { startFirstVisit, useFirstVisitChecking } from './first-visit'
import type { Way } from './NewBoardChooser'
import { NewBoardLibrary, type LibraryPick } from './NewBoardLibrary'
import { TEMPLATES, draftFor, hasTopic, starterState, templateFor, toBoardCards } from './templates'
import { landingSize } from './catalog'
import { BoardGrid } from './BoardGrid'
import { cardBody, consumeAddFail, flagOf, healthFor, healthPill, reasonOf, retryBoard, retryCard, seedAddFail, seedCardsFromQuery, useCardStates } from './card-states'
import type { CardView } from './MetricCard'
import { MetricWindow } from './MetricWindow'
import { NeedsAttention, type AttentionItem } from './NeedsAttention'
import { seriesFor } from './series'
import { SOURCE_NAMES } from './sources'
import { PeriodMenu, SharedByAvatar } from './BoardHeader'
import { METRICS, baseMetricId, initialDashboardState } from './mock-data'
import { SyncBanners } from './sync/SyncBanners'
import { SyncButton } from './sync/SyncButton'
import { appState, clock, hoursSince, type AppId } from './sync/sync-model'
import { getSyncSnapshot, isConnected, onSyncEnd, reconnectApps, seedFromQuery, seedShopifyOnly, useSyncSnapshot } from './sync/sync-store'
import { showSyncErrorToast, showSyncedToast } from './sync/sync-toasts'
import type { BoardMenuHandlers } from './tabs/BoardMenus'
import { ConfirmDialogs, type PendingConfirm } from './tabs/ConfirmDialogs'
import { ManageTabsDialog, type ManageTab } from './tabs/ManageTabsDialog'
import { TabRow } from './tabs/TabRow'
import { cardIdsFor, namesInUse, uniqueName } from './tabs/board-state'
import { useDashboard } from './tabs/use-dashboard'

// Dashboard board panel (Figma wRr8cpImqSXbIgk0XhNj7a: base 17:889, tabs 136:20976, Manage tabs
// 415:64464, sync 95:18703). Rules: docs-v2/dashboard/01 – 04. AppLayout renders /dashboard bare (like
// /schedules), so this builds its own panel: 16px radius, hairline border, warm fill. Inside, a
// 1200px column: the header row, then the open board's cards 20px below it.

const LOAD_MS = 450 // dummy load after a switch, so the shimmer → numbers step shows (TAB-6)
const BASE_PAD = 16 // space under the cards (pb-4)
const DRAFT_MS = 2_500 // the stand-in AI's answer (08 NB-21)

export function DashboardScreen() {
  const api = useDashboard()
  const { state, openBoard } = api
  const panelId = useId()

  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [manage, setManage] = useState<{ open: boolean; tab: ManageTab }>({ open: false, tab: 'tabs' })
  const [confirm, setConfirm] = useState<PendingConfirm>(null)
  const [visibleCount, setVisibleCount] = useState(6)
  // ?ai=fail: the first draft doesn't come through (08 NB-28).
  const aiFail = useRef(false)
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

  // Switching boards: the cards show at once, their numbers a moment later (TAB-6).
  const [loadedId, setLoadedId] = useState(state.openId)
  useEffect(() => {
    if (loadedId === state.openId) return
    const t = window.setTimeout(() => setLoadedId(state.openId), LOAD_MS)
    return () => window.clearTimeout(t)
  }, [state.openId, loadedId])

  // /dashboard?board=<id> opens that board (TAB-61); the URL follows the open board.
  // ?sync=<scenario> starts the dummy sync in a drawn state (04-sync-rules.md §9).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    seedFromQuery({ sync: q.get('sync'), fail: q.get('fail'), role: q.get('role'), connect: q.get('connect') })
    // ?cards=<scenario> puts cards in the drawn states (05-cards-reading-rules.md §9).
    seedCardsFromQuery(q.get('cards'))
    seedAddFail(q.get('add'))
    aiFail.current = q.get('ai') === 'fail'
    // ?visit=first: the first visit's check, then the starter boards (08 NB-31 – NB-33).
    if (q.get('visit') === 'first') {
      if (q.get('store') === 'shopify-only') seedShopifyOnly()
      startFirstVisit(() => api.apply([{ type: 'replace', state: starterState(initialDashboardState(Date.now()), (a) => isConnected(getSyncSnapshot(), a)) }]))
    }
    seedShareFromQuery({ slack: q.get('slack'), copy: q.get('copy') })
    seedDownloadFail(q.get('download'))
    // A link: a board you can't see shows the no-access page; one you can opens on the link's dates,
    // and is added as the last tab when it isn't in your tabs (09 SH-23, SH-24).
    const id = seedLinkFromQuery({ board: q.get('board'), period: q.get('period'), compare: q.get('compare') })
    if (id && state.hidden.includes(id)) api.apply([{ type: 'show', id, index: state.tabs.length, open: true }])
    else if (id) api.open(id)
    // ?shared=1: Maya Patel shares Q4 plan with you; it waits outside your tabs (SH-29, T-8).
    if (q.get('shared') === '1') {
      api.apply([{ type: 'hide', id: 'q4-plan' }])
      // After the toaster is listening (its effect runs after this one).
      window.setTimeout(() => toast('Maya Patel shared Q4 plan with you', {
        duration: 10_000,
        action: { label: 'Add to tabs', onClick: () => api.apply([{ type: 'show', id: 'q4-plan', index: stateRef.current.tabs.length, open: true }]) },
      }), 300)
    }
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
  const sync = useSyncSnapshot()
  const [sourcesOpen, setSourcesOpen] = useState(false)
  // Back online: the board fetches its numbers again (SY-34). Adjusted while rendering.
  const [seenBackOnline, setSeenBackOnline] = useState(sync.backOnlineAt)
  if (seenBackOnline !== sync.backOnlineAt) {
    setSeenBackOnline(sync.backOnlineAt)
    if (sync.backOnlineAt) setLoadedId('')
  }
  // How a sync ended, as a toast when the board on screen doesn't already say so (SY-29, SY-30).
  // The listener reads the latest board and list through a ref, set after each render.
  const toastCtx = useRef({ boardId: '', apps: [] as AppId[], sourcesOpen: false, isAdmin: true })
  useEffect(() => {
    return onSyncEnd((e) => {
      const ctx = toastCtx.current
      const reconnect = (ids: AppId[]) => (ctx.isAdmin ? () => { reconnectApps(ids, ctx.boardId) } : null)
      if (e.kind === 'refresh') {
        // With Data sources open the list already shows it (SY-28).
        if (e.failed.length && !ctx.sourcesOpen) showSyncErrorToast({ apps: e.failed, rest: 'Other apps synced', onReconnect: reconnect(e.failed) })
        return
      }
      // Boards that read the app show its banner instead (SY-30).
      if ([...e.ok, ...e.failed].some((id) => ctx.apps.includes(id))) return
      if (e.failed.length) {
        const at = e.failed.map((id) => getSyncSnapshot().apps[id]?.syncedAt).find((t) => t != null)
        showSyncErrorToast({ apps: e.failed, rest: at ? `Data from ${clock(at)}` : 'No data yet', onReconnect: reconnect(e.failed) })
      }
      if (e.ok.length) showSyncedToast(e.ok)
    })
    // The listener lives as long as the screen; it reads the moment's values from toastCtx.
  }, [])
  useEffect(() => {
    const apps = [...new Set((openBoard?.cards ?? []).map((c) => METRICS[c.metricId]?.source).filter(Boolean))] as AppId[]
    toastCtx.current = { boardId: openBoard?.id ?? '', apps, sourcesOpen, isAdmin: sync.isAdmin }
  })

  // ── Share and export (09-share-export-rules.md) ─────────────────────────────────────
  const linkView = useLinkView()
  const [share, setShare] = useState<{ open: boolean; start: ShareStart }>({ open: false, start: 'people' })
  const [downloadOpen, setDownloadOpen] = useState(false)
  // The workspace's default board for new members (11 DT-8, stand-in: in memory).
  const [defaultOpen, setDefaultOpen] = useState(false)
  const [defaultBoard, setDefaultBoard] = useState('store-overview')
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
      const job = !node || consumeDownloadFail() ? Promise.reject(new Error('no image')) : nodeToPng(node)
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
  const cardStates = useCardStates()
  // The metric window: the card it was opened from, or a Needs attention row (CR-15, CR-33).
  const [windowFor, setWindowFor] = useState<string | null>(null)
  // Card settings: the card id it's open for (10 CS-1).
  const [settingsFor, setSettingsFor] = useState<string | null>(null)

  // ── New board (08-new-board-rules.md) ──────────────────────────────────────────
  const checking = useFirstVisitChecking()
  const [library, setLibrary] = useState<{ on: LibraryPick; fill: string | null } | null>(null)
  const [ask, setAsk] = useState({ open: false, initial: '' })
  // One draft at a time (NB-20). Dropped if its board goes (a ⌘Z past it, say). Adjusted while rendering.
  const [draft, setDraft] = useState<Draft | null>(null)
  if (draft && !state.boards[draft.boardId]) setDraft(null)
  // The stand-in AI answers 2.5 s after each try (NB-21 – NB-23, NB-28, NB-29).
  const drafting = draft?.phase === 'drafting' ? draft : null
  useEffect(() => {
    if (!drafting) return
    const { boardId, request, run } = drafting
    const t = window.setTimeout(() => {
      const settle = (patch: Partial<Draft>, board: Parameters<typeof api.apply>[0]) => {
        api.apply(board)
        setDraft((d) => (d && d.run === run ? { ...d, ...patch } : d))
      }
      if (aiFail.current) {
        aiFail.current = false
        settle({ phase: 'failed' }, [{ type: 'update-board', id: boardId, patch: { label: 'Draft', cards: [], initialCards: [] } }])
        return
      }
      const res = draftFor(request, (a) => isConnected(getSyncSnapshot(), a))
      if (res.status === 'empty') {
        settle({ phase: 'empty', reason: res.reason }, [{ type: 'update-board', id: boardId, patch: { label: 'Draft', cards: [], initialCards: [] } }])
        return
      }
      const cards = toBoardCards(res.cards)
      const label = uniqueName(res.name, namesInUse(stateRef.current, boardId))
      settle({ phase: 'ready', leftOut: res.leftOut }, [{ type: 'update-board', id: boardId, patch: { label, cards, initialCards: cards, period: res.period, compare: res.compare } }])
    }, DRAFT_MS)
    return () => window.clearTimeout(t)
    // One timer per try: the run number changes on every try.
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

  if (!openBoard) return null
  const cards = api.cardActions(openBoard.id)
  const tabs = state.tabs.map((id) => state.boards[id]).filter(Boolean)
  const hidden = state.hidden.map((id) => state.boards[id]).filter(Boolean)
  // The apps this board's cards read, and how many cards read each (SY-1, SY-6). A card reading
  // two apps counts for both (MER).
  const appsOf = (metricId: string): AppId[] => {
    const m0 = METRICS[metricId]
    if (!m0 || m0.unmeasured) return []
    return m0.alsoFrom ? [m0.source, m0.alsoFrom] : [m0.source]
  }
  const uses: Partial<Record<AppId, number>> = {}
  for (const c of openBoard.cards) for (const app of appsOf(c.metricId)) uses[app] = (uses[app] ?? 0) + 1
  const boardApps = Object.keys(uses) as AppId[]
  const here = draft && draft.boardId === openBoard.id ? draft : null
  // A draft being made shimmers like a board that's loading (NB-21, NB-24).
  const boardLoading = loadedId !== openBoard.id || cardStates.retrying.includes('*') || here?.phase === 'drafting'
  // Dates that aren't the board's own: Reset (and Save for board for editors) beside the period (SH-23).
  const own = linkView.dates?.boardId === openBoard.id && (linkView.dates.period !== openBoard.period || linkView.dates.compare !== openBoard.compare) ? linkView.dates : null
  const dates = own ?? { period: openBoard.period, compare: openBoard.compare }
  const midnight = new Date(sync.now)
  midnight.setHours(0, 0, 0, 0)

  // How a card reads (CR-18 – CR-29): its body, its app's dot, a shimmer while it syncs, its days
  // and its health.
  // `picture`: for an image, cards as they'll read once loaded (SH-34).
  const cardView = (metricId: string, picture = false): CardView | undefined => {
    const metric = METRICS[metricId]
    if (!metric) return undefined
    const apps = appsOf(metricId).map((id) => ({ id, a: sync.apps[id], st: appState(sync.apps[id], sync.now) }))
    // An app on its first sync: "No data yet" until it lands (CR-22, AC-20).
    const firstLong = apps.some((x) => x.st === 'first')
    // Its app isn't connected: it waits, with Connect (08 NB-13).
    const waiting = apps.find((x) => !isConnected(sync, x.id))
    const body = cardBody({
      loading: !picture && (boardLoading || cardStates.retrying.includes(metricId)),
      needsApp: !!waiting,
      removed: cardStates.removed.includes(metricId),
      locked: cardStates.locked.includes(metricId),
      firstSyncRunning: firstLong,
      couldntLoad: cardStates.couldntLoad.includes(metricId),
      unmeasured: metric.unmeasured,
      // On Today, an app that hasn't synced since yesterday has nothing for today (CR-26).
      todayEmpty: dates.period === 'today' && apps.some((x) => x.a.syncedAt != null && x.a.syncedAt < midnight.getTime()),
    })
    // The worse dot; hovering it names the app(s) and how old the numbers are (CR-25).
    const failed = apps.filter((x) => x.st === 'failed')
    const behind = apps.filter((x) => x.st === 'behind')
    const tips = failed.length
      ? failed.map((x) => `${SOURCE_NAMES[x.id]} sync failed · numbers from ${clock(x.a.syncedAt ?? sync.now)}`)
      : behind.map((x) => {
          const h = hoursSince(x.a.syncedAt, sync.now)
          return `${SOURCE_NAMES[x.id]} hasn’t synced in ${h} hour${h === 1 ? '' : 's'} · numbers from ${clock(x.a.syncedAt ?? sync.now)}`
        })
    const health = healthFor(metric, cardStates)
    const chart = openBoard.cards.find((c) => c.metricId === metricId)?.chart
    return {
      body,
      needsApp: waiting ? { app: waiting.id, connecting: sync.connections[waiting.id] === 'connecting' } : undefined,
      dot: !waiting && tips.length ? { tone: failed.length ? 'failed' : 'behind', tip: tips.join('; ') } : undefined,
      syncing: !picture && apps.some((x) => x.st === 'syncing'),
      series: seriesFor(metric, dates.period, { compare: dates.compare, connectedOn: cardStates.newMeta && apps.some((x) => x.id === 'meta') ? new Date(2025, 10, 12) : undefined }),
      health: healthPill(health, body),
      targetPerDay: health?.by === 'target' ? health.perDay : undefined,
      canEdit: openBoard.access !== 'view',
      bars: chart ? chart === 'bars' : undefined,
    }
  }

  // Needs attention: every flagged metric on your tabs, red first, with the boards it's on (CR-31).
  const attention: AttentionItem[] = []
  for (const b of tabs) {
    for (const c of b.cards) {
      const metric = METRICS[c.metricId]
      const health = metric && healthFor(metric, cardStates)
      const tone = flagOf(health)
      if (!metric || !health || !tone || cardStates.locked.includes(metric.id) || cardStates.removed.includes(metric.id)) continue
      const seen = attention.find((x) => x.metricId === metric.id)
      if (seen) {
        if (!seen.boards.split(', ').includes(b.label)) seen.boards += `, ${b.label}`
        continue
      }
      attention.push({ metricId: metric.id, label: metric.label, boards: b.label, reason: reasonOf(health), value: metric.value, tone })
    }
  }
  attention.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === 'red' ? -1 : 1))
  const windowMetric = windowFor ? METRICS[windowFor] ?? null : null
  const related = windowMetric
    ? openBoard.cards.map((c) => METRICS[c.metricId]).filter((x) => x && x.id !== windowMetric.id && x.source === windowMetric.source)
    : []
  const notReady = (what: string) => toast.info(`${what} isn’t ready yet`, { id: 'dashboard-not-ready' })
  const stampText = stamp(openBoard.label, dates.period, dates.compare, nameOf(ME))
  // Numbers: one CSV, then the dialog closes; no toast, the file is the confirmation (SH-36, SH-37).
  const downloadNumbers = (ids: string[]) => new Promise<void>((resolve, reject) => {
    window.setTimeout(() => {
      if (consumeDownloadFail()) { reject(new Error('failed')); return }
      const title = ids.length === 1 ? METRICS[ids[0]]?.label ?? openBoard.label : openBoard.label
      const csv = numbersCsv({ title, metricIds: ids, period: dates.period, compare: dates.compare, by: nameOf(ME) })
      saveFile(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${fileBase(title, dates.period)}.csv`)
      setDownloadOpen(false)
      resolve()
    }, 900)
  })
  const noAccess = linkView.noAccess

  // The picker's Add: at the end, in the order picked, each at the size that suits it (AC-16 – AC-18).
  const addPicked = (metricIds: string[]) => {
    setPickerOpen(false)
    const result = api.addCards(openBoard.id, metricIds.map((id) => ({ metricId: id, size: landingSize(METRICS[id]) })))
    if (!result) return
    land(openBoard.id, result.ids)
    const message = metricIds.length === 1 ? `Added ${METRICS[metricIds[0]]?.label}` : `Added ${metricIds.length} cards`
    toast(message, { duration: 6000, action: { label: 'Undo', onClick: result.undo } })
  }

  // Add to board from a metric's window (AC-22 – AC-25).
  const addToBoard = (metricId: string, boardId: string) => {
    const board = state.boards[boardId]
    const metric = METRICS[metricId]
    if (!board || !metric) return
    if (consumeAddFail()) {
      toast(`Couldn’t add ${metric.label} to ${board.label}.`, {
        duration: 6000, icon: <TriangleAlert aria-hidden size={16} strokeWidth={1.5} absoluteStrokeWidth className="text-[var(--dashboard-sync-failed)]" />,
        action: { label: 'Try again', onClick: () => addToBoard(metricId, boardId) },
      })
      return
    }
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
  const pickable = (m: (typeof METRICS)[string]) => !m.unmeasured && isConnected(sync, m.source) && (!m.alsoFrom || isConnected(sync, m.alsoFrom))
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
    const label = METRICS[settingsCard.metricId]?.label ?? 'Card'
    setSettingsFor(null)
    const result = api.addCards(openBoard.id, [{ metricId: baseMetricId(settingsCard.metricId), size: settingsCard.size }])
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
  const connected = (app: AppId) => isConnected(sync, app)
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
    const fields = { label: t.name, cards: toBoardCards(templateFor(t.cards, connected).cards), period: t.period, compare: t.compare }
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
      setDraft({ ...draft, request, phase: 'drafting', leftOut: [], reason: undefined, run: draft.run + 1 })
      return
    }
    const r = api.addBoard({ label: 'Drafting…', cards: [], period: '7d', compare: 'previous', draft: true }, false)
    setDraft({ boardId: r.id, request, phase: 'drafting', openBefore: state.openId, leftOut: [], run: 1 })
  }
  const redraft = (change: string) => { if (draft) sendDraft(hasTopic(change) ? change : `${draft.request}, ${change}`) }
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
              {checking ? (
                // The first visit's check: a placeholder capsule, no names (NB-31).
                <span data-first-visit aria-label="Setting up your boards" role="status" className="dashboard-shape-shimmer block h-10 w-[min(420px,100%)] rounded-full" />
              ) : (
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
              )}
              {/* The period and sync button keep their place at the top right (TAB-16). */}
              <div className={cn('ml-auto flex shrink-0 items-center gap-1', (checking || noAccess) && 'invisible')}>
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
                <SyncButton boardId={openBoard.id} apps={boardApps} uses={uses} open={sourcesOpen} onOpenChange={setSourcesOpen} />
              </div>
            </div>

            <div id={panelId} role="tabpanel" aria-labelledby={`board-tab-${openBoard.id}`} className="mt-5 outline-none">
              {/* Above the cards, also in edit mode and with Data sources open (SY-13, SY-21). */}
              {here && !checking && !noAccess && <div className="mb-4"><DraftLine draft={here} /></div>}
              <div className="empty:hidden mb-4"><SyncBanners boardId={openBoard.id} apps={boardApps} /></div>
              {noAccess ? (
                <NoAccess label={noAccess.label} owner={noAccess.owner} onBack={() => { leaveNoAccess(); api.open(state.tabs[0]) }} />
              ) : checking || (here?.phase === 'drafting' && openBoard.cards.length === 0) ? (
                // Plain card skeletons: the first visit's check, a draft being made (NB-21, NB-31).
                <Skeleton />
              ) : here && (here.phase === 'failed' || here.phase === 'empty') ? (
                <DraftProblem
                  draft={here}
                  onTryAgain={() => { api.apply([{ type: 'update-board', id: here.boardId, patch: { label: 'Drafting…' } }]); setDraft({ ...here, phase: 'drafting', run: here.run + 1 }) }}
                  onChange={() => setAsk({ open: true, initial: here.request })}
                  onConnect={() => notReady('Connecting an app')}
                />
              ) : cardStates.boardFailed && !cardStates.retrying.includes('*') ? (
                // The board itself couldn't load; the header keeps working (CR-21).
                <div data-board-failed className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-xl text-[13px] leading-[17px] text-[var(--dashboard-figure)]">
                  <p className="m-0">Couldn’t load this board.</p>
                  {/* eslint-disable-next-line no-restricted-syntax -- ds-allow: the white Try again of Figma 170:47131 (1px #D3CEC8, 8px radius, 32px) */}
                  <button type="button" onClick={retryBoard} className="h-8 cursor-pointer rounded-lg border border-solid border-[var(--dashboard-list-border)] bg-[var(--dashboard-card-bg)] px-3.5 text-[13px] text-[var(--dashboard-figure)] outline-none hover:bg-[var(--neutral-100)] focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]">
                    Try again
                  </button>
                </div>
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
                  onRetryCard={retryCard}
                  onOpenSettings={editing ? setSettingsFor : undefined}
                  onRemoveEmpty={(id) => cards.removeWithUndo(id, METRICS[id]?.label ?? 'Card')}
                  landed={landed?.boardId === openBoard.id ? landed : null}
                  onMoveTo={cards.moveTo}
                  onSetLayout={cards.setLayout}
                  onStep={cards.step}
                  onResize={cards.resize}
                  onRemove={(id) => cards.removeWithUndo(id, METRICS[id]?.label ?? 'Card')} // "Removed Revenue" with Undo (07, Toast)
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
            waiting={checking}
            onEditBoard={startEditing}
            onShare={() => setShare({ open: true, start: 'people' })}
            onDownload={() => setDownloadOpen(true)}
            onDefaultBoard={sync.isAdmin ? () => setDefaultOpen(true) : undefined}
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
        locked={!!settingsCard && cardStates.locked.includes(baseMetricId(settingsCard.metricId))}
        stamp={stampText}
        pickable={pickable}
        onClose={() => setSettingsFor(null)}
        onSwap={swapMetric}
        onChart={setChart}
        onDuplicate={duplicateCard}
        onRemove={() => {
          if (!settingsCard) return
          setSettingsFor(null)
          cards.removeWithUndo(settingsCard.metricId, METRICS[settingsCard.metricId]?.label ?? 'Card') // CS-8
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
        isAdmin={sync.isAdmin}
        cardView={(id) => cardView(id, true)}
        stamp={stampText}
        onClose={() => setShare((s) => ({ ...s, open: false }))}
        onPosted={(channel) => {
          setShare((s) => ({ ...s, open: false }))
          toast(`Posted to #${channel}`, { duration: 6000, action: { label: 'Open in Slack', onClick: () => notReady('Open in Slack') } })
        }}
        onNotReady={notReady}
      />
      <DefaultBoardDialog
        open={defaultOpen}
        boards={[...tabs, ...hidden].filter((b) => !b.draft)}
        current={defaultBoard}
        onClose={() => setDefaultOpen(false)}
        onSave={(id) => {
          setDefaultOpen(false)
          setDefaultBoard(id)
          toast(`New members start on ${state.boards[id]?.label ?? 'this board'}`, { duration: 6000 })
        }}
      />
      <DownloadDialog
        open={downloadOpen}
        board={openBoard}
        period={dates.period}
        compare={dates.compare}
        locked={cardStates.locked}
        onClose={() => setDownloadOpen(false)}
        onImage={prepareImage}
        onNumbers={downloadNumbers}
      />
      {/* The board drawn off screen for its image (SH-33, SH-34). */}
      {shot > 0 && (
        <div aria-hidden data-file={fileBase(openBoard.label, dates.period)} style={{ position: 'fixed', left: 0, top: 0, transform: 'translateX(-200vw)', pointerEvents: 'none' }}>
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
  )
}

/** Plain card skeletons, no names or numbers (08 NB-21, NB-31). */
function Skeleton() {
  return (
    <div className="@container" data-skeleton aria-hidden>
      <ul className="m-0 grid list-none auto-rows-[156px] grid-cols-1 gap-4 p-0 @lg:grid-cols-2 @min-[60rem]:grid-cols-4">
        {[4, 1, 1, 1, 1].map((span, i) => (
          <li key={i} className="relative rounded-xl bg-[var(--dashboard-card-bg)] shadow-[var(--dashboard-card-shadow)]" style={{ gridColumn: span === 4 ? '1 / -1' : undefined }}>
            <span className="dashboard-shape-shimmer absolute left-4 top-4 h-4 w-24 rounded-md" />
            <span className="dashboard-shape-shimmer absolute bottom-[18px] left-4 h-7 w-28 rounded-md" />
          </li>
        ))}
      </ul>
    </div>
  )
}
