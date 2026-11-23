'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { m } from 'framer-motion'
import { TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { AddCardsDialog } from './AddCardsDialog'
import { EditBar, SpeedDial } from './BoardActions'
import { landingSize } from './catalog'
import { BoardGrid } from './BoardGrid'
import { cardBody, consumeAddFail, flagOf, healthFor, healthPill, reasonOf, retryBoard, retryCard, seedAddFail, seedCardsFromQuery, useCardStates } from './card-states'
import type { CardView } from './MetricCard'
import { MetricWindow } from './MetricWindow'
import { NeedsAttention, type AttentionItem } from './NeedsAttention'
import { seriesFor } from './series'
import { SOURCE_NAMES } from './sources'
import { PeriodMenu, SharedByAvatar } from './BoardHeader'
import { METRICS } from './mock-data'
import { SyncBanners } from './sync/SyncBanners'
import { SyncButton } from './sync/SyncButton'
import { appState, clock, hoursSince, type AppId } from './sync/sync-model'
import { getSyncSnapshot, onSyncEnd, reconnectApps, seedFromQuery, useSyncSnapshot } from './sync/sync-store'
import { showSyncErrorToast, showSyncedToast } from './sync/sync-toasts'
import type { BoardMenuHandlers } from './tabs/BoardMenus'
import { ConfirmDialogs, type PendingConfirm } from './tabs/ConfirmDialogs'
import { ManageTabsDialog, type ManageTab } from './tabs/ManageTabsDialog'
import { TabRow } from './tabs/TabRow'
import { useDashboard } from './tabs/use-dashboard'

// Dashboard board panel (Figma wRr8cpImqSXbIgk0XhNj7a: base 17:889, tabs 136:20976, Manage tabs
// 415:64464, sync 95:18703). Rules: docs-v2/dashboard/01 – 04. AppLayout renders /dashboard bare (like
// /schedules), so this builds its own panel: 16px radius, hairline border, warm fill. Inside, a
// 1200px column: the header row, then the open board's cards 20px below it.

const LOAD_MS = 450 // dummy load after a switch, so the shimmer → numbers step shows (TAB-6)
const BASE_PAD = 16 // space under the cards (pb-4)

export function DashboardScreen() {
  const api = useDashboard()
  const { state, openBoard } = api
  const panelId = useId()

  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [manage, setManage] = useState<{ open: boolean; tab: ManageTab }>({ open: false, tab: 'tabs' })
  const [confirm, setConfirm] = useState<PendingConfirm>(null)
  const [visibleCount, setVisibleCount] = useState(6)

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
    const id = q.get('board')
    if (id) api.open(id)
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

  const handlers: BoardMenuHandlers = {
    onRename: (id) => setRenamingId(id),
    onDuplicate: (id) => { api.duplicate(id) },
    onCopyLink: api.copyLink,
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
  const boardLoading = loadedId !== openBoard.id || cardStates.retrying.includes('*')
  const midnight = new Date(sync.now)
  midnight.setHours(0, 0, 0, 0)

  // How a card reads (CR-18 – CR-29): its body, its app's dot, a shimmer while it syncs, its days
  // and its health.
  const cardView = (metricId: string): CardView | undefined => {
    const metric = METRICS[metricId]
    if (!metric) return undefined
    const apps = appsOf(metricId).map((id) => ({ id, a: sync.apps[id], st: appState(sync.apps[id], sync.now) }))
    // An app on its first sync: "No data yet" until it lands (CR-22, AC-20).
    const firstLong = apps.some((x) => x.st === 'first')
    const body = cardBody({
      loading: boardLoading || cardStates.retrying.includes(metricId),
      removed: cardStates.removed.includes(metricId),
      locked: cardStates.locked.includes(metricId),
      firstSyncRunning: firstLong,
      couldntLoad: cardStates.couldntLoad.includes(metricId),
      unmeasured: metric.unmeasured,
      // On Today, an app that hasn't synced since yesterday has nothing for today (CR-26).
      todayEmpty: openBoard.period === 'today' && apps.some((x) => x.a.syncedAt != null && x.a.syncedAt < midnight.getTime()),
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
    return {
      body,
      dot: tips.length ? { tone: failed.length ? 'failed' : 'behind', tip: tips.join('; ') } : undefined,
      syncing: apps.some((x) => x.st === 'syncing'),
      series: seriesFor(metric, openBoard.period, { connectedOn: cardStates.newMeta && apps.some((x) => x.id === 'meta') ? new Date(2025, 10, 12) : undefined }),
      health: healthPill(health, body),
      targetPerDay: health?.by === 'target' ? health.perDay : undefined,
      canEdit: openBoard.access !== 'view',
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
              <TabRow
                boards={tabs}
                openId={state.openId}
                renamingId={renamingId}
                panelId={panelId}
                onOpen={api.open}
                onStartRename={setRenamingId}
                onEndRename={() => setRenamingId(null)}
                onCommitRename={(id, raw) => api.rename(id, raw, (again) => { api.open(again); setRenamingId(again) })}
                onMoveTo={api.moveTab}
                onLayout={setVisibleCount}
                {...handlers}
              />
              {/* The period and sync button keep their place at the top right (TAB-16). */}
              <div className="ml-auto flex shrink-0 items-center gap-1">
                {openBoard.sharedBy && <SharedByAvatar person={openBoard.sharedBy} />}
                {/* Before the period: what needs attention across every board (CR-31). */}
                <NeedsAttention items={attention} onOpenMetric={setWindowFor} />
                <PeriodMenu
                  period={openBoard.period}
                  compare={openBoard.compare}
                  onChange={(dates) => api.setDates(openBoard.id, dates)}
                />
                <SyncButton boardId={openBoard.id} apps={boardApps} uses={uses} open={sourcesOpen} onOpenChange={setSourcesOpen} />
              </div>
            </div>

            <div id={panelId} role="tabpanel" aria-labelledby={`board-tab-${openBoard.id}`} className="mt-5 outline-none">
              {/* Above the cards, also in edit mode and with Data sources open (SY-13, SY-21). */}
              <div className="empty:hidden mb-4"><SyncBanners boardId={openBoard.id} apps={boardApps} /></div>
              {cardStates.boardFailed && !cardStates.retrying.includes('*') ? (
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
                  editing={editing}
                  cardView={cardView}
                  onOpenCard={setWindowFor}
                  onRetryCard={retryCard}
                  onRemoveEmpty={(id) => cards.removeWithUndo(id, METRICS[id]?.label ?? 'Card')}
                  landed={landed?.boardId === openBoard.id ? landed : null}
                  onMoveTo={cards.moveTo}
                  onSetLayout={cards.setLayout}
                  onStep={cards.step}
                  onResize={cards.resize}
                  onRemove={cards.remove}
                />
              )}
            </div>
          </div>
        </m.div>

        {/* The corner: the speed dial reading the board, the edit bar in edit mode (BS-17). */}
        {editing ? (
          <EditBar
            key={`${openBoard.id}-${pickKey}`}
            onAddCards={() => setPickerOpen(true)}
            onNewBoard={newBoard}
            onDone={() => setEditingId(null)}
          />
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
            onNewBoard={newBoard}
            onEditBoard={startEditing}
            onShare={() => notReady('Sharing')}
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
        periodId={openBoard.period}
        related={related}
        onClose={closeWindow}
        onOpenMetric={setWindowFor}
        onNotReady={notReady}
        boards={editableBoards}
        onAddToBoard={(boardId) => windowFor && addToBoard(windowFor, boardId)}
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
