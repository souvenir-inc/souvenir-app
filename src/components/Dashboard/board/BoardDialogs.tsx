'use client'

import { toast } from 'sonner'
import type { Warehouse } from '@/lib/api/warehouse'
import { AskAIDialog } from '../Drafts'
import { AddCardsDialog, CardSettings, DefaultBoardDialog, DownloadDialog, ManageTabsDialog, MetricWindow, NewBoardLibrary, ShareDialog } from '../lazy-dialogs'
import type { CardView } from '../MetricCard'
import type { LibraryPick } from '../NewBoardLibrary'
import type { Metrics } from '../live/metrics'
import { ConfirmDialogs, type PendingConfirm } from '../tabs/ConfirmDialogs'
import type { ManageTab } from '../tabs/ManageTabsDialog'
import type { Board } from '../tabs/board-state'
import type { DashboardApi } from '../tabs/use-dashboard'
import { measurable } from '../templates'
import type { Metric } from '../types'
import type { useCardFlows } from './use-card-flows'
import type { useShareFlows } from './use-share-flows'

// Every dialog and window over the board screen, in one place.

export interface BoardDialogsProps {
  api: DashboardApi
  warehouse: Warehouse
  board: Board
  tabs: Board[]
  hidden: Board[]
  metrics: Metrics
  dates: { period: string; compare: string }
  cardView: (metricId: string, picture?: boolean) => CardView | undefined
  stamp: string
  /** Name and date of the viewer, for the numbers file. */
  by: string
  today?: Date
  cardFlows: ReturnType<typeof useCardFlows>
  shareFlows: ReturnType<typeof useShareFlows>
  manage: { open: boolean; tab: ManageTab }
  onCloseManage: () => void
  visibleCount: number
  onRenameAgain: (id: string) => void
  confirm: PendingConfirm
  onConfirm: (pending: PendingConfirm) => void
  library: { on: LibraryPick; fill: string | null } | null
  onCloseLibrary: () => void
  onUseTemplate: (templateId: string, fill: string | null) => void
  onCopyBoard: (boardId: string) => void
  ask: { open: boolean; initial: string }
  onCloseAsk: () => void
  onSendDraft: (request: string) => void
}

export function BoardDialogs(p: BoardDialogsProps) {
  const { api, board, tabs, hidden, metrics, dates, cardFlows: cf, shareFlows: sf } = p
  const windowMetric = cf.windowFor ? metrics.get(cf.windowFor) ?? null : null
  const related = windowMetric
    ? board.cards.map((c) => metrics.get(c.metricId)).filter((x): x is Metric => !!x && x.id !== windowMetric.id && x.apps.some((a) => windowMetric.apps.includes(a)))
    : []
  const picture = (id: string) => p.cardView(id, true)
  return (
    <>
      <MetricWindow
        metric={windowMetric}
        periodId={dates.period}
        related={related}
        onClose={cf.closeWindow}
        onOpenMetric={cf.openWindow}
        boards={tabs.filter((b) => b.access !== 'view')}
        onAddToBoard={(boardId) => { if (cf.windowFor) cf.addToBoard(cf.windowFor, boardId) }}
      />
      <NewBoardLibrary
        openOn={p.library?.on ?? null}
        boards={[...tabs, ...hidden]}
        onClose={p.onCloseLibrary}
        onUseTemplate={(id) => p.onUseTemplate(id, p.library?.fill ?? null)}
        onCopy={p.onCopyBoard}
      />
      <AskAIDialog open={p.ask.open} initial={p.ask.initial} onClose={p.onCloseAsk} onSend={p.onSendDraft} />
      <CardSettings
        card={cf.settings.card}
        period={dates.period}
        compare={dates.compare}
        cardView={picture}
        stamp={p.stamp}
        pickable={measurable}
        onClose={cf.settings.close}
        onSwap={cf.settings.swap}
        onChart={cf.settings.chart}
        onDuplicate={cf.settings.duplicate}
        onRemove={cf.settings.remove}
      />
      <AddCardsDialog open={cf.pickerOpen} onBoard={board.cards.map((c) => c.metricId)} onClose={cf.closePicker} onAdd={cf.addPicked} />
      <ManageTabsDialog
        open={p.manage.open}
        initialTab={p.manage.tab}
        state={api.state}
        visibleCount={p.visibleCount}
        onClose={p.onCloseManage}
        onSave={(draft) => api.applyManage(draft, p.onRenameAgain)}
        onDuplicate={api.duplicate}
        onCreate={api.createBoard}
        onRestore={api.restore}
        onCopyLink={(id) => { void api.copyLink(id) }}
        onRequestDelete={(id) => { const b = api.state.boards[id]; if (b) p.onConfirm({ kind: 'delete', board: b }) }}
        onRequestLeave={(id) => { const b = api.state.boards[id]; if (b) p.onConfirm({ kind: 'leave', board: b }) }}
      />
      <ShareDialog
        open={sf.share.open}
        startOn={sf.share.start}
        board={board}
        period={dates.period}
        compare={dates.compare}
        cardView={picture}
        stamp={p.stamp}
        isDefault={p.warehouse.defaultBoard === board.id}
        onChange={(access) => api.apply([{ type: 'update-board', id: board.id, patch: access }])}
        onClose={sf.closeShare}
        onPosted={(channel) => { sf.closeShare(); toast(`Posted to #${channel}`, { duration: 6000 }) }}
      />
      <DefaultBoardDialog
        open={sf.defaultOpen}
        // New members have to be able to see it: boards open to the workspace only (DT-8).
        boards={[...tabs, ...hidden].filter((b) => !b.draft && b.general !== 'none')}
        current={p.warehouse.defaultBoard ?? ''}
        onClose={sf.closeDefault}
        onSave={(id) => { void sf.saveDefaultBoard(id) }}
      />
      <DownloadDialog
        open={sf.downloadOpen}
        board={board}
        period={dates.period}
        compare={dates.compare}
        onClose={sf.closeDownload}
        onImage={sf.prepareImage}
        onNumbers={(ids) => sf.downloadNumbers(ids, metrics, { board: board.label, period: dates.period, compare: dates.compare, by: p.by, on: p.today })}
      />
      <ConfirmDialogs
        pending={p.confirm}
        onCancel={() => p.onConfirm(null)}
        onConfirm={(kind, id) => {
          p.onConfirm(null)
          if (kind === 'delete') api.remove(id)
          else api.leave(id)
        }}
      />
    </>
  )
}
