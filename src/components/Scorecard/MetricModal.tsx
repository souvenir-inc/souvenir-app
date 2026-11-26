'use client'

// The metric pop-up from Dev's wireframe: click a card, see the metric's name and number for the dashboard's
// period, then Trend | Target | Definition | Sources | Other related. Each tab opens with one plain sentence that
// says what it means, then the detail. Built from the shared pieces: the chart kit, the metric library's
// "How it's calculated" and formula editor, and this module's health panel.

import { useMemo, useState } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/Button'
import { ConnectorGlyph } from '@/components/ConnectorGlyph'
import { useConnectorIdentities } from '@/components/ContextPanel/identity'
import { ChannelIcon } from '@/components/Home/ChannelIcon'
import { InputField } from '@/components/InputField'
import { MetricCalculation } from '@/components/MetricLibrary'
import { FormulaEditorDialog } from '@/components/MetricLibrary/FormulaEditorDialog'
import { Skeleton } from '@/components/Skeleton'
import { TabItem } from '@/components/TabItem'
import { alignComparison, TrendChart, type TrendTarget, type ValueFormat } from '@/components/charts'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import type { MetricEntry, Measurement, Workspace } from '@/lib/api/warehouse'
import { appsFor, categoryName, describeSource } from '@/lib/metrics/display'
import { dataUntilOf } from '@/lib/metrics/library'
import { formulaLookup, liveFormulas } from '@/lib/metrics/registry'
import { buildTree, isAggregate, namesIn, referencesOf, type CalcNode } from '@/lib/metrics/tree'
import { useSavedFormulas } from '@/lib/metrics/use-saved-formulas'
import type { Direction, DisplayFormat, ResolvedTarget } from '@/lib/scorecard/model'
import { addDays, daysBetween, isoWeekOf, storeClock, weekRangeLabel, weekStartOf } from '@/lib/scorecard/periods'
import { formatOf, formatValue, healthLabel } from '@/lib/scorecard/present'
import { cutOf } from '@/lib/scorecard/status'
import { defaultDirection, isAdditive, minSampleFor } from '@/lib/scorecard/template'
import { formatStoreDate, formatSyncedAt, isPastData, sourcesOf } from '@/lib/warehouse/freshness'
import { periodLabel, periodWindow, usePeriod, type DashboardPeriod } from '@/lib/warehouse/period'
import { useMeasurement, useMetricCatalog, usePutMetric, useWorkspace } from '@/lib/warehouse/queries'
import { useMetricHealth } from './Health'
import { StatusPill } from './Flag'
import { BenchmarkPanel } from './BenchmarkPanel'
import { HealthPanel } from './HealthPanel'
import styles from './MetricModal.module.css'

export type MetricModalTab = 'trend' | 'target' | 'definition' | 'sources' | 'related'
type Tab = MetricModalTab

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: 'trend', label: 'Trend' },
  { id: 'target', label: 'Target' },
  { id: 'definition', label: 'Definition' },
  { id: 'sources', label: 'Sources' },
  { id: 'related', label: 'Other related' },
]

const CHART_FORMAT: Record<DisplayFormat, ValueFormat> = { money: 'money', number: 'count', percent: 'ratio', multiple: 'multiple' }
const NO_ENTRIES: MetricEntry[] = []
/** Shopify is drawn with Home's own mark; every other app with its catalog logo. */
const SHOPIFY = new Set(['shopify', 'shopify_app'])
/** A window shorter than this draws the last two weeks on the chart, so "Today" is never a single dot. */
const MIN_CHART_DAYS = 7
const CONTEXT_CHART_DAYS = 14

export interface MetricModalProps {
  /** The metric to show, by catalog name; null closes the modal. */
  metric: string | null
  onClose: () => void
  /** The tab it opens on (Settings → Metrics opens on Definition). Opening a related metric goes back to Trend. */
  initialTab?: MetricModalTab
}

/** One metric up close: its number for the dashboard's period, and everything about it in five tabs. */
export function MetricModal({ metric, onClose, initialTab = 'trend' }: MetricModalProps) {
  return (
    <Dialog open={metric !== null} onOpenChange={open => { if (!open) onClose() }}>
      {metric !== null && <ModalBody key={`${metric}:${initialTab}`} initial={metric} initialTab={initialTab} />}
    </Dialog>
  )
}

type MeasureRequest = { metrics: string[]; start: string; end: string; grain: 'day' | 'total' }

/**
 * The card behind the modal usually holds these numbers already (same dates, often more metrics in one request).
 * Use that cached answer while our own request runs, so the number and chart paint at once.
 */
function cachedFor(client: QueryClient, request: MeasureRequest): Measurement | undefined {
  const queries = client.getQueryCache().findAll({ predicate: query => query.queryKey.includes('measure') })
  for (const query of queries) {
    const data = query.state.data as Measurement | undefined
    if (!data || data.grain !== request.grain || data.start !== request.start || data.end !== request.end) continue
    const first = data.periods[0]?.values ?? {}
    if (request.metrics.every(metric => metric in first || metric in data.unavailable)) return data
  }
  return undefined
}

function useMeasured(request: MeasureRequest, enabled: boolean) {
  const query = useMeasurement(request, enabled)
  const client = useQueryClient()
  return { data: query.data ?? (enabled ? cachedFor(client, request) : undefined), isLoading: query.isLoading }
}

function valueOf(measurement: Measurement | undefined, name: string): number | null | undefined {
  const values = measurement?.periods[0]?.values
  return values === undefined ? undefined : values[name] ?? null
}

/** "yesterday", "the day before", "the 7 days before": what the header's change compares with. */
export function comparisonLabel(period: DashboardPeriod, previous: { previousStart: string; previousEnd: string }): string {
  if (period === 'today') return 'yesterday'
  const days = daysBetween(previous.previousStart, previous.previousEnd) + 1
  return days === 1 ? 'the day before' : `the ${days} days before`
}

/**
 * The span the chart draws: the period itself, ended at the last day with data; or, when that leaves less than a
 * week (Today, or a period after the data stops), the two weeks up to the last day with data.
 */
export function chartSpan(window: { start: string; end: string }, until: string | null = null): { start: string; end: string; previousStart: string; previousEnd: string; widened: boolean } {
  const end = until && until < window.end ? until : window.end
  const days = daysBetween(window.start, end) + 1
  const start = days < MIN_CHART_DAYS ? addDays(end, -(CONTEXT_CHART_DAYS - 1)) : window.start
  const length = daysBetween(start, end) + 1
  const previousEnd = addDays(start, -1)
  return { start, end, previousStart: addDays(previousEnd, -(length - 1)), previousEnd, widened: start !== window.start || end !== window.end }
}

/** Whether a value meets a target line, by the target's direction. */
export function meets(value: number, line: ResolvedTarget, direction: Direction): boolean {
  if (line.kind === 'range') return value >= line.low && value <= line.high
  return direction === 'lower' ? value <= line.value : value >= line.value
}

/** Whether a change is good news for this metric: up is good for revenue, down is good for refund rate. */
export function changeTone(change: number | null, direction: Direction): 'good' | 'bad' | 'neutral' {
  if (change === null || change === 0 || direction === 'range') return 'neutral'
  return (change > 0) === (direction === 'higher') ? 'good' : 'bad'
}

/** "≥ 1,500", "≤ 4.0%", "$300–$380". */
function lineText(line: ResolvedTarget, direction: Direction, format: DisplayFormat): string {
  if (line.kind === 'range') return `${formatValue(line.low, format)}–${formatValue(line.high, format)}`
  return `${direction === 'lower' ? '≤' : '≥'} ${formatValue(line.value, format)}`
}

/** Everything the tabs read about one metric, fetched once: catalog, formula, data cut, the period's numbers. */
function useMetricContext(name: string) {
  const workspace = useWorkspace()
  const catalog = useMetricCatalog(workspace.isSuccess)
  const entries = catalog.data ?? NO_ENTRIES
  const saved = useSavedFormulas(workspace.data?.id)
  const byName = useMemo(() => new Map(entries.map(entry => [entry.name, entry])), [entries])
  const known = useMemo(() => new Set(entries.map(entry => entry.name)), [entries])
  const lookup = useMemo(() => formulaLookup(entries, liveFormulas(saved, entries)), [entries, saved])
  const tree = useMemo(() => buildTree(name, lookup), [name, lookup])
  const treeNames = useMemo(() => namesIn(tree, known), [tree, known])
  const entry = byName.get(name)
  const formula = lookup(name) ?? null

  const until = dataUntilOf(treeNames, metric => byName.get(metric)?.category, workspace.data)
  const { period, custom } = usePeriod()
  const clock = storeClock(workspace.data?.timezone ?? 'UTC')
  const window = periodWindow(period, clock.date, until, custom)
  const chart = chartSpan(window, until)
  // The period starts after the last day with data (Today before the day's sync): nothing to show yet, not a zero.
  const noDataYet = isPastData(window.start, until)
  const sample = minSampleFor(name)?.metric
  const metrics = sample && known.has(sample) ? [name, sample].sort() : [name]
  const on = entry !== undefined
  const total = useMeasured({ metrics, start: window.start, end: window.end, grain: 'total' }, on)
  const before = useMeasured({ metrics: [name], start: window.previousStart, end: window.previousEnd, grain: 'total' }, on)
  const daily = useMeasured({ metrics: [name], start: chart.start, end: chart.end, grain: 'day' }, on)
  const dailyBefore = useMeasured({ metrics: [name], start: chart.previousStart, end: chart.previousEnd, grain: 'day' }, on)

  return {
    workspace: workspace.data, entries, byName, known, lookup, tree, treeNames, entry, formula, until, period, custom, window, chart, noDataYet,
    actual: valueOf(total.data, name),
    previous: valueOf(before.data, name),
    sample: sample && known.has(sample) ? valueOf(total.data, sample) ?? null : undefined,
    unavailable: total.data?.unavailable[name] ?? null,
    daily: daily.data,
    dailyBefore: dailyBefore.data,
    loading: total.isLoading,
  }
}

type Context = ReturnType<typeof useMetricContext>

function ModalBody({ initial, initialTab }: { initial: string; initialTab: Tab }) {
  const [name, setName] = useState(initial)
  const [tab, setTab] = useState<Tab>(initialTab)
  const context = useMetricContext(name)
  const { entry } = context
  const open = (other: string) => { setName(other); setTab('trend') }

  return (
    <DialogContent size="lg" className={styles.modal} aria-describedby={undefined}>
      {entry === undefined
        ? (
          <div className={styles.loading}>
            <DialogTitle className={styles.label}>{name}</DialogTitle>
            <Skeleton width={180} height={44} />
            <Skeleton width="100%" height={240} radius={12} />
          </div>
        )
        : (
          <>
            <Header context={context} name={name} />
            <div className={styles.tabs} role="tablist" aria-label={`${entry.label} details`}>
              {TABS.map(item => (
                <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={styles.tab} onClick={() => setTab(item.id)}>
                  {item.label}
                </button>
              ))}
            </div>
            <div className={styles.panel} role="tabpanel">
              {tab === 'trend' && <TrendTab context={context} name={name} onSetTarget={() => setTab('target')} />}
              {tab === 'target' && (
                <HealthPanel
                  bare
                  metric={name}
                  label={entry.label}
                  unit={entry.unit}
                  actual={context.actual ?? null}
                  window={{ start: context.window.start, end: context.window.end }}
                  unavailable={context.unavailable}
                  dataUntil={context.until}
                  sample={context.sample}
                />
              )}
              {tab === 'definition' && <DefinitionTab context={context} name={name} onOpen={open} />}
              {tab === 'sources' && <SourcesTab context={context} />}
              {tab === 'related' && <RelatedTab context={context} name={name} onOpen={open} />}
            </div>
          </>
        )}
    </DialogContent>
  )
}

// ── Header: name, the number, its change, its health ─────────────────────────

function Header({ context, name }: { context: Context; name: string }) {
  const { entry, actual, previous, window, period, custom, unavailable, until, sample, noDataYet } = context
  const { healthFor, targetOf } = useMetricHealth()
  if (!entry) return null
  const format = formatOf(null, entry.unit, name)
  const change = !noDataYet && actual != null && previous != null && previous !== 0 ? (actual - previous) / Math.abs(previous) : null
  // Just the period: the header above the board already says when the data was last synced.
  const span = periodLabel(period, custom)
  // Green when it moves the good way, red the bad way: a fall in refund or discount rate is good news.
  const tone = changeTone(change, targetOf(name)?.direction ?? defaultDirection(name))
  const health = targetOf(name) && actual !== undefined && !noDataYet
    ? healthFor(name, entry.unit, actual, { start: window.start, end: window.end }, { unavailable, dataUntil: until, sample })
    : null

  return (
    <header className={styles.header}>
      <DialogTitle className={styles.label}>{entry.label}</DialogTitle>
      <DialogDescription className={styles.span}>{span}</DialogDescription>
      <div className={styles.numberRow}>
        {actual === undefined
          ? <Skeleton width={180} height={44} />
          : <strong className={styles.number}>{unavailable || noDataYet ? '—' : formatValue(actual, format)}</strong>}
        {noDataYet && !unavailable && <span className={styles.muted}>No data yet</span>}
        {change !== null && !unavailable && (
          <span className={styles.change} data-tone={tone}>
            {change > 0 ? <ArrowUp size={13} strokeWidth={1.75} aria-hidden /> : change < 0 ? <ArrowDown size={13} strokeWidth={1.75} aria-hidden /> : null}
            {`${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(Math.abs(change) * 100)}%`}
            <span className={styles.muted}>&nbsp;vs {comparisonLabel(period, window)}</span>
          </span>
        )}
        {/* The target's health when there is one; with none, the benchmark flag when it's outside healthy. */}
        <StatusPill health={health} metric={name} unit={entry.unit} value={unavailable || noDataYet ? null : actual} />
      </div>
    </header>
  )
}

// ── Trend: chart or table ────────────────────────────────────────────────────

const percent = (share: number) => `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(Math.abs(share) * 100)}%`

function TrendTab({ context, name, onSetTarget }: { context: Context; name: string; onSetTarget: () => void }) {
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const { entry, daily, dailyBefore, until, unavailable, period, custom, actual, previous, window, chart, noDataYet } = context
  const { targetOf, targetLineFor } = useMetricHealth()
  if (!entry) return null
  if (unavailable) return <p className={styles.lead}>There&apos;s no {entry.label.toLowerCase()} data for this store.</p>

  const format = formatOf(null, entry.unit, name)
  const target = targetOf(name)
  const direction = target?.direction ?? defaultDirection(name)
  const current = (daily?.periods ?? []).map(p => ({ date: p.start, value: isPastData(p.start, until) ? null : p.values[name] ?? null }))
  const before = (dailyBefore?.periods ?? []).map(p => ({ date: p.start, value: p.values[name] ?? null }))
  const points = alignComparison(current, before)
  const line = target ? targetLineFor(name, entry.unit, 1) : null
  const chartTarget: TrendTarget | null = line === null
    ? null
    : line.kind === 'range'
      ? { low: line.low, high: line.high }
      : line.direction === 'lower' ? { high: line.value } : { low: line.value }

  // The answer first: how it moved, and with a target, how many days hit it.
  const versus = comparisonLabel(period, window)
  const change = !noDataYet && actual != null && previous != null && previous !== 0 ? (actual - previous) / Math.abs(previous) : null
  const changeText = noDataYet
    ? `No data for ${periodLabel(period, custom).toLowerCase()} yet`
    : change === null
      ? null
      : Math.abs(change) < 0.0005 ? `Level with ${versus}` : `${change > 0 ? 'Up' : 'Down'} ${percent(change)} on ${versus}`
  const withData = current.filter((p): p is { date: string; value: number } => p.value !== null)
  // Under two days with data there's no trend to read: the chart says so, and the legend and counts step aside.
  const sparse = daily !== undefined && withData.length < 2
  const judged = line && !sparse ? withData : []
  const hits = line ? judged.filter(p => meets(p.value, line, direction)).length : 0
  const daysText = line && judged.length > 0
    ? `${hits} of ${judged.length} days ${judged.length < current.length ? 'with data ' : ''}on target`
    : null
  const summary = [changeText, daysText].filter(Boolean).join(' · ')

  // The legend says what each line is. Totals only when the chart covers the header's period exactly.
  // A widened or cut chart names its own dates ("22 Oct – 4 Nov"), so it never claims days it doesn't show.
  const currentLabel = chart.widened ? `${formatStoreDate(chart.start)} – ${formatStoreDate(chart.end)}` : periodLabel(period, custom)
  const beforeLabel = chart.widened
    ? `The ${daysBetween(chart.previousStart, chart.previousEnd) + 1} days before`
    : versus.replace(/^the /, '').replace(/^\w/, c => c.toUpperCase())

  return (
    <div className={styles.trend}>
      <div className={styles.trendHead}>
        <p className={styles.lead}>{summary}</p>
        <div className={styles.segment} role="radiogroup" aria-label="Show as">
          <TabItem size="small" role="radio" aria-checked={view === 'chart'} selected={view === 'chart'} onClick={() => setView('chart')}>Chart</TabItem>
          <TabItem size="small" role="radio" aria-checked={view === 'table'} selected={view === 'table'} onClick={() => setView('table')}>Table</TabItem>
        </div>
      </div>
      {view === 'table'
        ? <WeekTable context={context} name={name} onSetTarget={onSetTarget} />
        : (
          <>
            {!sparse && <div className={styles.legend}>
              <span className={styles.legendItem}>
                <span className={styles.swatch} data-kind="current" aria-hidden />
                {currentLabel}
                {!chart.widened && actual != null && <strong>{formatValue(actual, format)}</strong>}
              </span>
              <span className={styles.legendItem}>
                <span className={styles.swatch} data-kind="before" aria-hidden />
                {beforeLabel}
                {!chart.widened && previous != null && <strong>{formatValue(previous, format)}</strong>}
              </span>
              {line
                ? (
                  <span className={styles.legendItem}>
                    <span className={styles.swatch} data-kind="target" aria-hidden />
                    Target {lineText(line, direction, format)}{isAdditive(name, entry.unit) ? ' a day' : ''}
                  </span>
                )
                : <button type="button" className={styles.textButton} onClick={onSetTarget}>Set a target</button>}
            </div>}
            {daily === undefined
              ? <Skeleton width="100%" height={240} radius={12} />
              : (
                <TrendChart
                  points={points}
                  format={CHART_FORMAT[format]}
                  label={`${entry.label}, ${currentLabel.toLowerCase()}`}
                  comparisonLabel={beforeLabel}
                  target={chartTarget}
                  polarity={direction === 'range' ? 'neutral' : direction}
                  height={240}
                />
              )}
          </>
        )}
    </div>
  )
}

/** Weeks in the table: a quarter. */
const WEEKS_SHOWN = 13

const STATUS_OF: Record<string, 'green' | 'amber' | 'red'> = { green: 'green', amber: 'amber', red: 'red' }

/**
 * Calendar weeks across, scorecard style: the metric's row, two columns a week (Actual and Target), oldest on the
 * left and scrolled to the newest. The actual is green on target, orange close to it, red off it.
 */
function WeekTable({ context, name, onSetTarget }: { context: Context; name: string; onSetTarget: () => void }) {
  const { entry, until, known, unavailable } = context
  const { clock, healthFor, targetOf, targetLineFor } = useMetricHealth()
  // The newest column is the week holding the last day with data (today's week when sources are current).
  const last = weekStartOf(until && until < clock.date ? until : clock.date)
  const weeks = Array.from({ length: WEEKS_SHOWN }, (_, i) => addDays(last, (i - WEEKS_SHOWN + 1) * 7))
  const sampleName = minSampleFor(name)?.metric
  const sample = sampleName && known.has(sampleName) ? sampleName : null
  const metrics = sample ? [name, sample].sort() : [name]
  const weekly = useMeasurement({ metrics, start: weeks[0], end: addDays(last, 6) < clock.date ? addDays(last, 6) : clock.date, grain: 'week' }, entry !== undefined)
  if (!entry) return null
  if (weekly.data === undefined) return <Skeleton width="100%" height={120} radius={12} />

  const format = formatOf(null, entry.unit, name)
  const target = targetOf(name)
  const direction = target?.direction ?? defaultDirection(name)
  const byWeek = new Map(weekly.data.periods.map(period => [weekStartOf(period.start), period.values]))
  const weekLine = target ? targetLineFor(name, entry.unit, 7) : null

  const cells = weeks.map(start => {
    const end = addDays(start, 6)
    const cut = cutOf(start, 7, until)
    const values = byWeek.get(start)
    const value = cut === 'past' ? undefined : values?.[name] ?? null
    const ends = [end, clock.date, ...(until ? [until] : [])].sort()
    const health = weekLine !== null && value !== undefined && !unavailable
      ? healthFor(name, entry.unit, value, { start, end: ends[0] }, { dataUntil: until, sample: sample ? values?.[sample] ?? null : undefined })
      : null
    // A running week is compared with the target for its days so far.
    const expected = health?.expected ?? weekLine
    return { start, value, soFar: cut === 'partial' || end >= clock.date, health, expected }
  })
  const onTarget = cells.filter(cell => cell.health && cell.health.verdict === 'green').length
  const judged = cells.filter(cell => cell.health && STATUS_OF[cell.health.verdict]).length

  return (
    <div className={styles.weekBlock}>
      {weekLine === null
        ? (
          <p className={styles.weekNote}>
            No target yet. <button type="button" className={styles.textButton} onClick={onSetTarget}>Set a target</button> to colour the weeks.
          </p>
        )
        : judged > 0 && <p className={styles.weekNote}>On target {onTarget} of {judged} weeks</p>}
      <div className={styles.weekWrap} ref={node => { if (node) node.scrollLeft = node.scrollWidth }}>
        <table className={styles.weekTable}>
          <thead>
            <tr>
              <th scope="col" rowSpan={2} className={styles.metricCell}><span className={styles.visuallyHidden}>Metric</span></th>
              {cells.map((cell, i) => (
                <th key={cell.start} scope="colgroup" colSpan={2} className={styles.weekGroup} data-newest={i === cells.length - 1 ? '' : undefined}>
                  <span className={styles.weekNumber}>Wk {isoWeekOf(cell.start)}</span>
                  <span className={styles.weekDates}>{weekRangeLabel(cell.start)}</span>
                </th>
              ))}
            </tr>
            <tr className={styles.subHead}>
              {cells.map((cell, i) => (
                <SubHeads key={cell.start} newest={i === cells.length - 1} />
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row" className={styles.metricCell}>{entry.label}</th>
              {cells.map((cell, i) => {
                const status = cell.health ? STATUS_OF[cell.health.verdict] : undefined
                const newest = i === cells.length - 1 ? '' : undefined
                return [
                  <td key={`${cell.start}-a`} className={styles.actualCell} data-status={status} data-newest={newest}
                    title={cell.health ? healthLabel(cell.health) : undefined}>
                    {cell.value === undefined ? '—' : cell.value === null ? '—' : formatValue(cell.value, format)}
                    {cell.soFar && cell.value !== undefined && <span className={styles.soFar}>so far</span>}
                  </td>,
                  <td key={`${cell.start}-t`} className={styles.targetCell} data-newest={newest}>
                    {cell.expected ? lineText(cell.expected, direction, format) : '—'}
                  </td>,
                ]
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SubHeads({ newest }: { newest: boolean }) {
  const flag = newest ? '' : undefined
  return (
    <>
      <th scope="col" className={styles.actualHead} data-newest={flag}>Actual</th>
      <th scope="col" data-newest={flag}>Target</th>
    </>
  )
}

// ── Definition: what it means, how it's calculated, how it compares ─────────

function DefinitionTab({ context, name, onOpen }: { context: Context; name: string; onOpen: (name: string) => void }) {
  const { entry, formula, window } = context
  const [editingFormula, setEditingFormula] = useState<'edit' | 'try' | null>(null)
  const [editingText, setEditingText] = useState(false)
  if (!entry) return null
  const custom = entry.category === 'custom'

  return (
    <div className={styles.stack}>
      {editingText && custom && formula
        ? <TextEditor entry={entry} formula={formula} onDone={() => setEditingText(false)} />
        : (
          <div className={styles.intro}>
            <p className={styles.lead}>{entry.description || entry.label}</p>
            <p className={styles.meta}>
              <span>{categoryName(entry.category)}</span>
              <span aria-hidden>·</span>
              <span>{custom ? 'Custom' : 'Built in'}</span>
              {custom && formula && (
                <button type="button" className={`${styles.textButton} ${styles.metaAction}`} onClick={() => setEditingText(true)}>
                  <Pencil size={12} strokeWidth={1.75} aria-hidden /> Edit name and description
                </button>
              )}
            </p>
          </div>
        )}

      <section className={styles.block}>
        <div className={styles.blockHead}>
          <h3 className={styles.blockTitle}>How it&apos;s calculated</h3>
          {custom
            ? formula && !isAggregate(formula) && (
              <button type="button" className={styles.textButton} onClick={() => setEditingFormula('edit')}>
                <Pencil size={12} strokeWidth={1.75} aria-hidden /> Edit formula
              </button>
            )
            : (
              <button type="button" className={styles.textButton} onClick={() => setEditingFormula('try')}>
                <Pencil size={12} strokeWidth={1.75} aria-hidden /> Try your own formula
              </button>
            )}
        </div>
        <MetricCalculation name={name} window={window} onOpen={onOpen} />
      </section>

      <section className={styles.block}>
        <h3 className={styles.blockTitle}>Benchmark</h3>
        <BenchmarkPanel metric={name} label={entry.label} unit={entry.unit} actual={context.unavailable ? null : context.actual ?? null}
          periodLabel={periodLabel(context.period, context.custom).toLowerCase()} />
      </section>

      {editingFormula && (
        <FormulaEditorDialog
          entry={entry}
          mode={editingFormula}
          current={editingFormula === 'edit' && formula && !isAggregate(formula) ? formula : undefined}
          onClose={() => setEditingFormula(null)}
        />
      )}
    </div>
  )
}

/** Rename a custom metric or rewrite its description. Saving replaces it in the warehouse under the same key. */
function TextEditor({ entry, formula, onDone }: { entry: MetricEntry; formula: NonNullable<Context['formula']>; onDone: () => void }) {
  const [label, setLabel] = useState(entry.label)
  const [description, setDescription] = useState(entry.description)
  const put = usePutMetric()
  const changed = label.trim() !== entry.label || description.trim() !== entry.description
  const save = async () => {
    if (label.trim() === '') return
    try {
      await put.mutateAsync({ name: entry.name, label: label.trim(), unit: entry.unit, description: description.trim(), value: formula })
      toast.success('Saved')
      onDone()
    } catch {
      toast.error('Couldn’t save the change. Try again.')
    }
  }
  return (
    <form className={styles.block} onSubmit={event => { event.preventDefault(); void save() }}>
      <InputField label="Name" fluid value={label} onChange={setLabel} maxLength={80} autoFocus />
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Description</span>
        <textarea className={styles.textarea} rows={3} value={description} onChange={event => setDescription(event.target.value)} />
      </label>
      <div className={styles.actions}>
        <Button variant="secondary" size="sm" type="button" onClick={onDone} disabled={put.isPending}>Cancel</Button>
        <Button size="sm" type="submit" disabled={!changed || label.trim() === '' || put.isPending} loading={put.isPending}>Save</Button>
      </div>
    </form>
  )
}

// ── Sources: the apps behind the number ──────────────────────────────────────

function sourceNodes(node: CalcNode, out: Array<Extract<CalcNode, { type: 'source' }>> = []): Array<Extract<CalcNode, { type: 'source' }>> {
  if (node.type === 'source') out.push(node)
  else if (node.type === 'metric' && node.body) sourceNodes(node.body, out)
  else if (node.type === 'operation') node.children.forEach(child => sourceNodes(child, out))
  return out
}

export interface AppRow {
  /** The connector slug, or null when no connected app is known for the area (the area's own name shows). */
  slug: string | null
  name: string
  /** The areas it feeds here: "Store", "Ads". */
  areas: string[]
  /** The oldest last sync among those areas; null for a first sync still running. */
  lastSyncedAt: string | null
  failed: boolean
}

/** One row per app feeding these areas, merged when an app feeds several; an area no known app feeds keeps its name. */
export function appRows(
  sources: ReadonlyArray<{ category: string; label: string; state: string; lastSyncedAt: string | null }>,
  connectors: readonly string[],
): AppRow[] {
  const rows: AppRow[] = []
  for (const source of sources) {
    const slugs = connectors.filter(slug => appsFor(source.category, [slug]).length > 0)
    const apps = slugs.length > 0
      ? slugs.map(slug => ({ slug: slug as string | null, name: appsFor(source.category, [slug])[0] }))
      : [{ slug: null, name: source.label }]
    for (const app of apps) {
      const row = rows.find(existing => existing.name === app.name)
      if (row) {
        if (!row.areas.includes(source.label)) row.areas.push(source.label)
        row.failed ||= source.state === 'failed'
        if (row.lastSyncedAt && (!source.lastSyncedAt || source.lastSyncedAt < row.lastSyncedAt)) row.lastSyncedAt = source.lastSyncedAt
      } else {
        rows.push({ ...app, areas: [source.label], lastSyncedAt: source.lastSyncedAt, failed: source.state === 'failed' })
      }
    }
  }
  return rows
}

/** "Shopify", "Shopify and Triple Whale", "Shopify, Triple Whale and ShipHero". */
function listOf(names: string[]): string {
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

function SourcesTab({ context }: { context: Context }) {
  const { entry, workspace, treeNames, byName, tree } = context
  const rows = workspace ? sourceRowsOf(workspace, treeNames, byName) : []
  const identities = useConnectorIdentities(rows.flatMap(row => (row.slug && !SHOPIFY.has(row.slug) ? [row.slug] : [])))
  if (!entry || !workspace) return null
  const roots = sourceNodes(tree)
  // Name the app in the sentence when one known app feeds the number ("Shopify orders").
  const app = rows.length === 1 && rows[0].slug ? rows[0].name : undefined
  const synced = (row: AppRow) => (row.lastSyncedAt ? `synced ${formatSyncedAt(row.lastSyncedAt, workspace.timezone)}` : 'first sync running')
  const lead = rows.length === 0
    ? 'No connected app feeds this yet.'
    : `From ${listOf(rows.map(row => row.name))}${rows.length === 1 ? ` · ${synced(rows[0])}` : ''}`

  return (
    <div className={styles.stack}>
      <p className={styles.lead}>{lead}</p>
      {rows.length > 0 && (
        <ul className={styles.plainList}>
          {rows.map(row => (
            <li key={row.slug ?? row.name} className={styles.sourceRow}>
              {row.slug && SHOPIFY.has(row.slug)
                ? <ChannelIcon channel="shopify" size={24} className={styles.sourceLogo} />
                : <ConnectorGlyph slug={row.slug ?? row.name} name={row.name} logoUrl={row.slug ? identities.get(row.slug)?.logo ?? null : null}
                    size={24} className={styles.sourceLogo} />}
              <span className={styles.sourceText}>
                <span className={styles.rowTitle}>{row.name}</span>
                <span className={styles.rowMeta}>{listOf(row.areas)} data</span>
              </span>
              <span className={styles.rowAside} data-state={row.failed ? 'failed' : 'ready'}>
                {row.failed ? 'Sync failed · ' : ''}{synced(row)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {roots.length > 0 && (
        <section className={styles.block}>
          <h3 className={styles.blockTitle}>What&apos;s counted</h3>
          <ul className={styles.plainList}>
            {roots.map(root => (
              <li key={root.id} className={styles.fieldRow}>
                {/* One plain line: "Counted from Shopify orders, not cancelled, by order date". */}
                <span className={styles.rowTitle}>{describeSource(root.aggregate, app).sentence}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function sourceRowsOf(workspace: Workspace, treeNames: string[], byName: Map<string, MetricEntry>): AppRow[] {
  const categories = [...new Set(treeNames.map(n => byName.get(n)?.category).filter((c): c is string => !!c && c !== 'custom'))]
  return appRows(sourcesOf(workspace).filter(source => categories.includes(source.category)), workspace.connectors)
}

// ── Other related ────────────────────────────────────────────────────────────

/** Rows shown in a related group before "Show all". */
const RELATED_LIMIT = 6

function RelatedGroup({ title, items, onOpen }: { title: string; items: MetricEntry[]; onOpen: (name: string) => void }) {
  const [all, setAll] = useState(false)
  const shown = all ? items : items.slice(0, RELATED_LIMIT)
  return (
    <section className={styles.block}>
      <h3 className={styles.blockTitle}>{title}</h3>
      <ul className={styles.plainList}>
        {shown.map(item => (
          <li key={item.name}>
            <button type="button" className={styles.relatedRow} onClick={() => onOpen(item.name)}>
              <span className={styles.rowTitle}>{item.label}</span>
              <span className={styles.rowMeta}>{item.description}</span>
            </button>
          </li>
        ))}
      </ul>
      {items.length > RELATED_LIMIT && (
        <button type="button" className={`${styles.textButton} ${styles.showAll}`} onClick={() => setAll(!all)}>
          {all ? 'Show fewer' : `Show all ${items.length}`}
        </button>
      )}
    </section>
  )
}

function RelatedTab({ context, name, onOpen }: { context: Context; name: string; onOpen: (name: string) => void }) {
  const { entry, entries, formula, lookup, byName } = context
  if (!entry) return null
  const builtFrom = formula && !isAggregate(formula) ? referencesOf(formula).map(n => byName.get(n)).filter((e): e is MetricEntry => !!e) : []
  const usedBy = entries.filter(other => {
    if (other.name === name) return false
    const value = lookup(other.name)
    return value ? referencesOf(value).includes(name) : false
  })
  const shown = new Set([name, ...builtFrom.map(e => e.name), ...usedBy.map(e => e.name)])
  const sameArea = entries.filter(other => other.category === entry.category && !shown.has(other.name))
  // Only groups with something in them: an empty group says nothing useful.
  const groups = [
    { title: 'Built from', items: builtFrom },
    { title: 'Used by', items: usedBy },
    { title: `More in ${categoryName(entry.category)}`, items: sameArea },
  ].filter(group => group.items.length > 0)

  return (
    <div className={styles.stack}>
      {groups.length === 0
        ? <p className={styles.lead}>Nothing related yet.</p>
        : groups.map(group => <RelatedGroup key={group.title} title={group.title} items={group.items} onOpen={onOpen} />)}
    </div>
  )
}
