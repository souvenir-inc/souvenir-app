'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { m } from 'framer-motion'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { EditBar, SpeedDial } from './BoardActions'
import { BoardGrid } from './BoardGrid'
import { PeriodMenu, SharedByAvatar } from './BoardHeader'
import { METRICS } from './mock-data'
import { SyncBanners } from './sync/SyncBanners'
import { SyncButton } from './sync/SyncButton'
import { appState, clock, type AppId } from './sync/sync-model'
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
    seedFromQuery({ sync: q.get('sync'), fail: q.get('fail'), role: q.get('role') })
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
  const [pickKey, setPickKey] = useState<{ n: number; pick: boolean }>({ n: 0, pick: false })
  // When the open board changes, edit mode ends unless it belongs to the board now open (a new
  // board). Adjusted while rendering, React's pattern for state that follows a prop.
  const [seenOpenId, setSeenOpenId] = useState(state.openId)
  if (seenOpenId !== state.openId) {
    setSeenOpenId(state.openId)
    if (editingId && editingId !== state.openId) setEditingId(null)
  }
  const editing = !!openBoard && editingId === openBoard.id && openBoard.access !== 'view' // BS-22
  const startEditing = (pick: boolean) => {
    setEditingId(state.openId)
    setPickKey((k) => ({ n: k.n + 1, pick }))
  }
  const newBoard = () => {
    const id = api.createBoard()
    setRenamingId(id)
    setEditingId(id)
    setPickKey((k) => ({ n: k.n + 1, pick: false }))
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

  if (!openBoard) return null
  const cards = api.cardActions(openBoard.id)
  const tabs = state.tabs.map((id) => state.boards[id]).filter(Boolean)
  const hidden = state.hidden.map((id) => state.boards[id]).filter(Boolean)
  // The apps this board's cards read, and how many cards read each (SY-1, SY-6).
  const uses: Partial<Record<AppId, number>> = {}
  for (const c of openBoard.cards) {
    const app = METRICS[c.metricId]?.source
    if (app) uses[app] = (uses[app] ?? 0) + 1
  }
  const boardApps = Object.keys(uses) as AppId[]
  // A card's look follows its app (SY-23, SY-24): a dot, a shimmer, or a first sync's skeleton.
  const cardSync = (metricId: string) => {
    const app = METRICS[metricId]?.source
    if (!app) return undefined
    const st = appState(sync.apps[app], sync.now)
    return {
      dot: st === 'failed' || st === 'behind' ? st : undefined,
      syncing: st === 'syncing',
      loading: st === 'first',
    }
  }
  const notReady = (what: string) => toast.info(`${what} isn’t ready yet`, { id: 'dashboard-not-ready' })

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
              <BoardGrid
                cardSync={cardSync}
                key={openBoard.id}
                cards={openBoard.cards}
                editing={editing}
                loading={loadedId !== openBoard.id}
                onMoveTo={cards.moveTo}
                onSetLayout={cards.setLayout}
                onStep={cards.step}
                onResize={cards.resize}
                onRemove={cards.remove}
              />
            </div>
          </div>
        </m.div>

        {/* The corner: the speed dial reading the board, the edit bar in edit mode (BS-17). */}
        {editing ? (
          <EditBar
            key={`${openBoard.id}-${pickKey.n}`}
            board={openBoard}
            startPicking={pickKey.pick}
            onAdd={cards.add}
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
            onAddCards={() => startEditing(true)}
            onNewBoard={newBoard}
            onEditBoard={() => startEditing(false)}
            onShare={() => notReady('Sharing')}
            onOpen={api.open}
            onShow={api.show}
            onStartOver={api.startOver}
            onNotReady={notReady}
            {...handlers}
          />
        )}
      </section>

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
