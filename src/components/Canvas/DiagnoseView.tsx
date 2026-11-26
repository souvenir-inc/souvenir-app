'use client'

import { useState } from 'react'
import { ArrowLeft, ArrowUpRight } from 'lucide-react'
import type { MeasureRequest, MetricEntry, Workspace } from '@/lib/api/warehouse'
import { useGuardedRouter } from '@/context/nav-guard-context'
import { DASHBOARD_BOARDS_ROUTE, DASHBOARD_ROUTE, dashboardMetricRoute } from '@/lib/routes'
import { referencesOf } from '@/lib/metrics/tree'
import { useSavedFormulas } from '@/lib/metrics/use-saved-formulas'
import { periodLabel, type DashboardPeriod, type DateRange } from '@/lib/warehouse/period'
import { useMeasurement } from '@/lib/warehouse/queries'
import { createCard, removeCard, reorderCards, updateCard, type Board, type BoardCard } from './board'
import { needsOf, planMeasurements, rangeKey, withExtraMetrics, type UntilOf } from './batching'
import { BoardGrid } from './BoardGrid'
import type { CardHealthKit } from './BoardCardView'
import { diagnoseBoard, inputsFor, MAX_CANDIDATES, pickAvailable } from './diagnose'
import { connectedSources, type CardSource } from './metrics'
import styles from './Canvas.module.css'

const IDLE: MeasureRequest = { metrics: [], start: '', end: '', grain: 'total' }

export interface DiagnoseViewProps {
  focus: string
  workspace: Workspace
  catalog: ReadonlyMap<string, MetricEntry>
  today: string
  untilOf: UntilOf
  /** The dashboard's period from the header picker; every card here follows it. */
  period: DashboardPeriod
  /** The range when the period is `custom`. */
  custom: DateRange | null
  /** Opens a metric up close, from a click on its card. */
  onOpen?: (metric: string) => void
  /** The apps (with logos) a metric's numbers come from. */
  sourcesOf?: (metric: string) => ReadonlyArray<CardSource & { logo: string | null }>
  /** The scorecard's health, for the pill on cards whose metric has a target. */
  healthKit?: CardHealthKit
  /** Whether a metric's source has never synced ("No data yet" instead of a number). */
  waitingOf?: (metric: string) => boolean
}

/**
 * Where "Open in Boards" lands (`?focus=<metric>`): the metric's trend against the previous period, then its
 * inputs, all on the dashboard's period. A working view, not saved; your own board is the Boards tab.
 */
export function DiagnoseView({
  focus, workspace, catalog, today, untilOf, period, custom, onOpen, sourcesOf, healthKit, waitingOf,
}: DiagnoseViewProps) {
  const router = useGuardedRouter()
  const formulas = useSavedFormulas(workspace.id)
  const [edited, setEdited] = useState<{ focus: string; board: Board } | null>(null)

  const entry = catalog.get(focus)
  const label = entry?.label ?? focus
  const saved = formulas[focus]?.value
  const candidates = inputsFor(focus, {
    formulaInputs: saved ? referencesOf(saved) : null,
    catalog,
    sources: new Set(connectedSources(workspace)),
    max: MAX_CANDIDATES,
  })

  // Which candidates can this store measure? Ask once, on the request the lead card makes for its total anyway
  // (the plan below carries the same metrics, so React Query shares one call). Until it answers, show the first four.
  const leadWindow = needsOf(createCard(focus, 'trend'), today, untilOf(focus), period, custom).needs.window
  const probeRange = leadWindow.measured
  const probeKey = probeRange ? rangeKey(probeRange, 'total') : null
  const probeRequest: MeasureRequest | null = probeRange
    ? { metrics: [...new Set([focus, ...candidates])].sort(), start: probeRange.start, end: probeRange.end, grain: 'total' }
    : null
  const probe = useMeasurement(probeRequest ?? IDLE, probeRequest !== null && entry !== undefined)
  const inputs = pickAvailable(candidates, probe.data?.unavailable)

  const board = edited?.focus === focus ? edited.board : diagnoseBoard(focus, inputs, label)
  const leadId = `diagnose-${focus}`
  const change = (next: (b: Board) => Board) => setEdited({ focus, board: next(board) })

  const header = (
    <div className={styles.diagnoseHead}>
      <button type="button" className={styles.back} onClick={() => router.push(DASHBOARD_ROUTE)}>
        <ArrowLeft size={14} strokeWidth={1.75} aria-hidden /> Metrics
      </button>
      <div className={styles.diagnoseTitleRow}>
        <div className={styles.diagnoseTitles}>
          <h2 className={styles.diagnoseTitle}>{label}</h2>
          {entry && (
            <p className={styles.diagnoseLede}>
              {periodLabel(period, custom)} against the period before, then the numbers it&apos;s made of. See which one moved.
            </p>
          )}
        </div>
        {entry && (
          <button type="button" className={styles.back} onClick={() => router.push(dashboardMetricRoute(focus))}>
            How it&apos;s calculated <ArrowUpRight size={14} strokeWidth={1.75} aria-hidden />
          </button>
        )}
      </div>
    </div>
  )

  if (!entry) {
    return (
      <div className={styles.screen}>
        {header}
        <div className={styles.empty}>
          <p>Couldn&apos;t find “{focus}”.</p>
          <button type="button" className={styles.linkButton} onClick={() => router.replace(DASHBOARD_BOARDS_ROUTE)}>Open your board</button>
        </div>
      </div>
    )
  }

  const planned = planMeasurements(board.cards, today, untilOf, period, custom)
  const plan = probeKey ? withExtraMetrics(planned, probeKey, [focus, ...candidates]) : planned
  const lead = board.cards.find(c => c.id === leadId)
  const rest = board.cards.filter(c => c.id !== leadId)
  const grid = {
    plan,
    catalog,
    catalogReady: true,
    freshId: null,
    onOpen,
    sourcesOf,
    healthKit,
    waitingOf,
    onChange: (id: string, patch: Partial<Omit<BoardCard, 'id'>>) => change(b => updateCard(b, id, patch)),
    onRemove: (id: string) => change(b => removeCard(b, id)),
  }

  return (
    <div className={styles.screen}>
      {header}
      {lead && <BoardGrid {...grid} board={{ ...board, cards: [lead] }} onReorder={() => {}} />}
      {rest.length > 0 && (
        <section className={styles.inputs} aria-labelledby="diagnose-inputs">
          <div className={styles.inputsHead}>
            <h3 id="diagnose-inputs" className={styles.inputsTitle}>What it&apos;s made of</h3>
            <span className={styles.inputsNote}>Each against its own period before</span>
          </div>
          <BoardGrid {...grid} board={{ ...board, name: `${label} inputs`, cards: rest }}
            onReorder={ids => change(b => reorderCards(b, [leadId, ...ids]))} />
        </section>
      )}
    </div>
  )
}
