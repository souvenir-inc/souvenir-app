'use client'

import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { m } from 'framer-motion'
import { toast } from 'sonner'
import { userFullName, useAuth } from '@/context/auth-context'
import { useOrg } from '@/context/org-context'
import type { Warehouse } from '@/lib/api/warehouse'
import { ORG_CONNECTORS_ROUTE } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { EditBar, SpeedDial } from '../BoardActions'
import { BoardGrid } from '../BoardGrid'
import { PeriodMenu, SharedByAvatar } from '../BoardHeader'
import { Problem, Skeleton } from '../DashboardStates'
import { DraftBar, DraftLine, DraftProblem } from '../Drafts'
import { EmptyBoard } from '../EmptyBoard'
import { NeedsAttention } from '../NeedsAttention'
import type { Way } from '../NewBoardChooser'
import type { LibraryPick } from '../NewBoardLibrary'
import { DashboardDataProvider, type useLiveDashboard } from '../live/dashboard-data'
import { storeMidnight } from '../period'
import { fileBase, stamp as stampOf } from '../share/export'
import { leaveNoAccess, type LinkView } from '../share/link-view'
import { NoAccess } from '../share/NoAccess'
import { SyncBanners } from '../sync/SyncBanners'
import { SyncButton } from '../sync/SyncButton'
import { useCoarseNow, useSyncState } from '../sync/sync-store'
import type { PendingConfirm } from '../tabs/ConfirmDialogs'
import type { ManageTab } from '../tabs/ManageTabsDialog'
import { TabRow } from '../tabs/TabRow'
import type { Board } from '../tabs/board-state'
import type { DashboardApi } from '../tabs/use-dashboard'
import { TEMPLATES, templateFor, toBoardCards } from '../templates'
import { BoardDialogs } from './BoardDialogs'
import { BoardShot } from './BoardShot'
import { DatesActions } from './DatesActions'
import { LOAD_COPY } from './copy'
import { appUses, attentionFor, cardViewFor } from './card-view'
import { useBoardDraft } from './use-board-draft'
import { useCardFlows } from './use-card-flows'
import { useEditMode } from './use-edit-mode'
import { useFabRoom } from './use-fab-room'
import { useShareFlows } from './use-share-flows'
import { useSyncToasts } from './use-sync-toasts'

// The open board (Figma wRr8cpImqSXbIgk0XhNj7a: base 17:889, tabs 136:20976, sync 95:18703; rules
// 01 – 05): a 1200px column with the header row, then the cards 20px below it; the speed dial or
// the edit bar in the corner; the dialogs over it.

type Live = ReturnType<typeof useLiveDashboard>

const undoable = (message: string, undo: () => void) => toast(message, { duration: 6000, action: { label: 'Undo', onClick: undo } })

interface BoardViewProps {
  warehouse: Warehouse
  api: DashboardApi
  openBoard: Board
  live: Live
  data: NonNullable<Live['data']>
  linkView: LinkView
}

export function BoardView({ warehouse, api, openBoard, live, data, linkView }: BoardViewProps) {
  const { state } = api
  const router = useRouter()
  const panelId = useId()
  const { user } = useAuth()
  const { currentUserRole } = useOrg()
  const me = userFullName(user)
  const sf = useShareFlows(warehouse, api)
  const { scrollRef, columnRef, fabRoom } = useFabRoom()
  const edit = useEditMode(state.openId, openBoard)
  const cf = useCardFlows(api, openBoard, data.metrics, edit.editing)
  const drafts = useBoardDraft(warehouse, api, undoable, edit.stopIf)
  const { draft } = drafts
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [manage, setManage] = useState<{ open: boolean; tab: ManageTab }>({ open: false, tab: 'tabs' })
  const [confirm, setConfirm] = useState<PendingConfirm>(null)
  const [visibleCount, setVisibleCount] = useState(6)
  const [library, setLibrary] = useState<{ on: LibraryPick; fill: string | null } | null>(null)
  const [ask, setAsk] = useState({ open: false, initial: '' })

  // ── Sync (04-sync-rules.md): the 10 s clock re-renders what says "N min ago", not the board.
  const sync = useSyncState()
  const coarse = useCoarseNow()
  const now = Math.max(sync.now, coarse)
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const { uses, apps: boardApps } = appUses(openBoard, data.metrics)
  useSyncToasts(boardApps, sourcesOpen)

  const tabs = state.tabs.map((id) => state.boards[id]).filter(Boolean)
  const hidden = state.hidden.map((id) => state.boards[id]).filter(Boolean)
  const here = draft && draft.boardId === openBoard.id ? draft : null
  // Dates that aren't the board's own: Reset (and Save for board for editors) beside the period (SH-23).
  const own = linkView.dates?.boardId === openBoard.id && (linkView.dates.period !== openBoard.period || linkView.dates.compare !== openBoard.compare) ? linkView.dates : null
  const dates = own ?? { period: openBoard.period, compare: openBoard.compare }
  const cardView = cardViewFor({
    live, data, board: openBoard, sync, now, period: dates.period,
    midnight: storeMidnight(warehouse.timezone, new Date(now)),
    loading: live.measuring || here?.phase === 'drafting',
  })
  const stampText = stampOf(openBoard.label, dates.period, dates.compare, me, data.today)
  const noAccess = linkView.noAccess

  const newBoard = () => {
    const id = api.createBoard()
    setRenamingId(id)
    edit.startFor(id)
  }
  const handlers = {
    onRename: (id: string) => setRenamingId(id),
    onDuplicate: (id: string) => { api.duplicate(id) },
    onCopyLink: (id: string) => { void sf.copyBoardLink(id) },
    onMove: (id: string, by: -1 | 1) => api.moveTab(id, state.tabs.indexOf(id) + by),
    onManage: (tab: ManageTab = 'tabs') => setManage({ open: true, tab }),
    onHide: api.hide,
    onDelete: (id: string) => { const board = state.boards[id]; if (board) setConfirm({ kind: 'delete', board }) },
    onLeave: (id: string) => { const board = state.boards[id]; if (board) setConfirm({ kind: 'leave', board }) },
  }
  const renameAgain = (id: string) => { api.open(id); setRenamingId(id) }

  // ── New board: the chooser's ways (NB-6) ─────────────────────────────────────────
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
    const fields = { label: t.name, cards: toBoardCards(templateFor(t.cards, data.metrics).cards), period: t.period, compare: t.compare }
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
  const sendDraft = (request: string) => {
    setAsk({ open: false, initial: '' })
    drafts.send(request)
  }

  return (
    <DashboardDataProvider value={data}>
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--neutral-50)] py-2.5 pr-2.5">
      <section data-dashboard-panel aria-labelledby="dashboard-title" className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--layout-radius)] border border-solid border-[var(--border-default)] bg-[var(--dashboard-panel-bg)]">
        <h1 id="dashboard-title" className="sr-only">Dashboard</h1>
        {/* Gutter on both edges keeps the 1200px column centred; no sideways scrolling at any width.
            Inline, because the unlayered .kaya-scrollbar rule outranks a Tailwind utility. */}
        <m.div ref={scrollRef} layoutScroll className="kaya-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain" style={{ scrollbarGutter: 'stable both-edges' }}>
          {/* overflow-x: clip makes no scroll container, so a card dragged past the edge can't widen the scroll area. */}
          <div ref={columnRef} className={cn('mx-auto box-border w-full min-w-0 max-w-[1232px] overflow-x-clip px-4 pt-[var(--dashboard-page-top)] [overflow-clip-margin:var(--space-3)]', fabRoom ? 'pb-20' : 'pb-4')}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <TabRow
                boards={tabs}
                openId={noAccess ? '' : state.openId}
                renamingId={renamingId}
                panelId={panelId}
                onOpen={(id) => { leaveNoAccess(); api.open(id) }}
                onStartRename={setRenamingId}
                onEndRename={() => setRenamingId(null)}
                onCommitRename={(id, raw) => api.rename(id, raw, renameAgain)}
                onMoveTo={api.moveTab}
                onLayout={setVisibleCount}
                {...handlers}
              />
              {/* The period and sync button keep their place at the top right (TAB-16). */}
              <div className={cn('ml-auto flex shrink-0 items-center gap-1', noAccess && 'invisible')}>
                {openBoard.sharedBy && <SharedByAvatar person={openBoard.sharedBy} />}
                <NeedsAttention items={attentionFor(tabs, data.metrics)} onOpenMetric={cf.openWindow} />
                {own && <DatesActions canSave={openBoard.access !== 'view'} onReset={sf.resetDates} onSave={() => { api.setDates(openBoard.id, own); sf.resetDates() }} />}
                <PeriodMenu
                  period={dates.period}
                  compare={dates.compare}
                  // Changing dates changes only your view (11 DT-6); back on the board's own, nothing shows (SH-2, SH-23).
                  onChange={(d) => {
                    const next = { boardId: openBoard.id, period: d.period ?? dates.period, compare: d.compare ?? dates.compare }
                    sf.setViewDates(next.period === openBoard.period && next.compare === openBoard.compare ? null : next)
                  }}
                />
                <SyncButton apps={boardApps} uses={uses} open={sourcesOpen} onOpenChange={setSourcesOpen} />
              </div>
            </div>

            <div id={panelId} role="tabpanel" aria-labelledby={`board-tab-${openBoard.id}`} className="mt-5 outline-none">
              {here && !noAccess && <div className="mb-4"><DraftLine draft={here} /></div>}
              <div className="empty:hidden mb-4"><SyncBanners boardId={openBoard.id} apps={boardApps} /></div>
              {noAccess ? (
                <NoAccess onBack={() => { leaveNoAccess(); api.open(state.tabs[0]) }} />
              ) : here?.phase === 'drafting' && openBoard.cards.length === 0 ? (
                <Skeleton />
              ) : here && (here.phase === 'failed' || here.phase === 'empty') ? (
                <DraftProblem draft={here} onTryAgain={drafts.retry} onChange={() => setAsk({ open: true, initial: here.request })} onConnect={() => router.push(ORG_CONNECTORS_ROUTE)} />
              ) : live.failed ? (
                // The board's numbers couldn't load; the header keeps working (CR-21).
                <Problem text={LOAD_COPY.board} onRetry={live.retry} />
              ) : (
                <BoardGrid
                  key={openBoard.id}
                  cards={openBoard.cards}
                  empty={openBoard.access !== 'view' ? (
                    <EmptyBoard onAddCards={cf.openPicker} onFill={(id) => applyTemplate(id, openBoard.id)} onAllTemplates={() => setLibrary({ on: 'template:founder', fill: openBoard.id })} />
                  ) : undefined}
                  editing={edit.editing}
                  cardView={cardView}
                  onOpenCard={cf.openWindow}
                  onRetryCard={live.retry}
                  onOpenSettings={edit.editing ? cf.settings.open : undefined}
                  onRemoveEmpty={cf.removeWithUndo}
                  landed={cf.landed}
                  onMoveTo={cf.cards.moveTo}
                  onSetLayout={cf.cards.setLayout}
                  onStep={cf.cards.step}
                  onResize={cf.cards.resize}
                  onRemove={cf.removeWithUndo}
                />
              )}
            </div>
          </div>
        </m.div>

        {/* The corner: the speed dial, the edit bar in edit mode (BS-17), a draft's bar. None on the no-access page (SH-24). */}
        {noAccess ? null : edit.editing ? (
          <EditBar
            key={`${openBoard.id}-${edit.pickKey}`}
            onAddCards={cf.openPicker}
            onNewBoard={pickWay}
            onDone={edit.stop}
            onUndo={() => api.undo()}
            onRedo={api.redo}
            canUndo={api.canUndo}
            canRedo={api.canRedo}
          />
        ) : here ? (
          <DraftBar draft={here} onStop={drafts.discard} onRedraft={drafts.send} onEdit={edit.start} onDiscard={drafts.discard} onKeep={drafts.keep} />
        ) : (
          <SpeedDial
            key={openBoard.id}
            board={openBoard}
            tabs={tabs}
            hidden={hidden}
            deletedCount={state.deleted.length}
            onlyOne={state.tabs.length <= 1}
            startOpen={openBoard.cards.length <= 2} // BS-5
            onAddCards={cf.openPicker} // reading mode stays on (AC-19)
            onNewBoard={pickWay}
            onEditBoard={edit.start}
            onShare={() => sf.openShare()}
            onDownload={sf.openDownload}
            onDefaultBoard={currentUserRole === 'admin' ? sf.openDefault : undefined}
            onOpen={api.open}
            onShow={api.show}
            onStartOver={api.startOver}
            {...handlers}
          />
        )}
      </section>

      <BoardDialogs
        api={api} warehouse={warehouse} board={openBoard} tabs={tabs} hidden={hidden} metrics={data.metrics}
        dates={dates} cardView={cardView} stamp={stampText} by={me} today={data.today}
        cardFlows={cf} shareFlows={sf}
        manage={manage} onCloseManage={() => setManage((m0) => ({ ...m0, open: false }))} visibleCount={visibleCount} onRenameAgain={renameAgain}
        confirm={confirm} onConfirm={setConfirm}
        library={library} onCloseLibrary={() => setLibrary(null)} onUseTemplate={applyTemplate} onCopyBoard={copyBoard}
        ask={ask} onCloseAsk={() => setAsk({ open: false, initial: '' })} onSendDraft={sendDraft}
      />
      {sf.shot > 0 && (
        <BoardShot key={sf.shot} cards={openBoard.cards} cardView={(id) => cardView(id, true)} stamp={stampText} onDone={(blob) => sf.imageDone(blob, fileBase(openBoard.label, dates.period, data.today))} />
      )}
    </div>
    </DashboardDataProvider>
  )
}
