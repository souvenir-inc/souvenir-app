'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, Info, PencilLine, Stethoscope } from 'lucide-react'
import { Button } from '@/components/Button'
import { Skeleton } from '@/components/Skeleton'
import { alignComparison, TrendChart, type TrendPoint, type ValueFormat } from '@/components/charts'
import { useGuardedRouter } from '@/context/nav-guard-context'
import { appsFor, categoryName, changeOf, DISPLAY_NAMES, formatDisplay } from '@/lib/metrics/display'
import { originOf } from '@/lib/metrics/library'
import { buildTree, displayOfMetric, isAggregate, namesIn, referencesOf, type DisplayUnit } from '@/lib/metrics/tree'
import { afterData, againstOf, againstPhrase, periodPhrase, spanLabel } from '@/lib/metrics/windows'
import { dashboardBoardsFocusRoute, dashboardMetricRoute, SETTINGS_METRICS_ROUTE } from '@/lib/routes'
import { formatStoreDate, isPastData } from '@/lib/warehouse/freshness'
import { usePeriod } from '@/lib/warehouse/period'
import { useMeasurement } from '@/lib/warehouse/queries'
import { ChangeText, CustomTag, KindTag } from './bits'
import { FormulaEditorDialog } from './FormulaEditorDialog'
import { MetricCalculation } from './MetricCalculation'
import { useTracking } from './tracking'
import { useLibrary, useWindowTotals } from './useLibrary'
import styles from './MetricLibrary.module.css'

const CHART_HEIGHT = 220

const CHART_FORMAT: Record<DisplayUnit, ValueFormat> = {
  money: 'money', count: 'count', percent: 'ratio', multiple: 'multiple', number: 'count',
}

const DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * One metric: whether it's on track, its number for the dashboard period, its days as a chart or a table, how
 * it's calculated, and what it means. The period is the header's.
 */
export function MetricPageScreen({ name }: { name: string }) {
  const library = useLibrary()
  const tracking = useTracking()
  const { push } = useGuardedRouter()
  const period = usePeriod()
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const [editing, setEditing] = useState<'edit' | 'try' | null>(null)
  const entry = library.byName.get(name)
  const timeZone = library.workspace.data?.timezone
  const formula = library.lookup(name) ?? null
  const tree = useMemo(() => buildTree(name, library.lookup), [name, library.lookup])
  const names = useMemo(() => namesIn(tree, library.known), [tree, library.known])
  const ready = entry !== undefined

  // The period ends where the data stops: for a nested metric, where its first root's source last synced. The
  // API can't tell "nothing happened" from "not synced" after that day (S15), so nothing after it is drawn.
  const until = library.untilOf(names)
  const totals = useWindowTotals(names, period, timeZone, ready, until)
  const { span } = totals
  const on = ready && timeZone !== undefined
  const daily = useMeasurement({ metrics: [name], start: span.start, end: span.end, grain: 'day' }, on)
  const dailyBefore = useMeasurement({ metrics: [name], start: span.previousStart, end: span.previousEnd, grain: 'day' }, on)

  // A day with no rows is 0 for a total (no refunds that day); nothing after the data stops is drawn, and nothing
  // at all when a source the metric reads has never synced (the API can answer 0 for it).
  const { fill, entries, lookup } = library
  const unsynced = library.neverSyncedOf(names)
  const points = useMemo(() => {
    const read = (value: number | null | undefined, day: string) => (value === null || value === undefined ? (fill(name, day) ? 0 : null) : value)
    return alignComparison(
      (daily.data?.periods ?? []).map(p => ({ date: p.start, value: unsynced || isPastData(p.start, until) ? null : read(p.values[name], p.start) })),
      dailyBefore.data?.periods.map(p => ({ date: p.start, value: unsynced ? null : read(p.values[name], p.start) })),
    )
  }, [daily.data, dailyBefore.data, name, until, fill, unsynced])

  const usedBy = useMemo(
    () => entries.filter(other => {
      const value = other.name === name ? null : lookup(other.name)
      return value ? referencesOf(value).includes(name) : false
    }),
    [entries, lookup, name],
  )

  if (library.catalog.isError) {
    return (
      <div className={styles.empty}>
        <p>Couldn&apos;t load this metric. Try again.</p>
        <Button variant="secondary" size="sm" onClick={() => { void library.catalog.refetch() }}>Try again</Button>
      </div>
    )
  }
  if (library.catalog.data === undefined) return <PageSkeleton />
  if (entry === undefined) {
    return (
      <div className={styles.screen}>
        <BackLink />
        <div className={styles.empty}>
          <p>There&apos;s no metric called <span className={styles.mono}>{name}</span> in this workspace. It may have been removed.</p>
        </div>
      </div>
    )
  }

  const display = displayOfMetric(name, entry.unit, formula, library.unitOf)
  const origin = originOf(entry)
  const apps = appsFor(entry.category, library.workspace.data?.connectors ?? [])
  const cannot = totals.current.data?.unavailable[name]
  const label = spanLabel(period, span)
  const against = againstOf(period)
  const inPeriod = periodPhrase(period, span)
  const comparedWith = againstPhrase(period)
  // The whole period after the source's last sync (Today, a few days on): nothing to show yet, whatever the API
  // answers for those days (it can say 0, ask S15).
  const noDataYet = unsynced || afterData(span, until)
  const editable = origin === 'custom' && formula !== null && !isAggregate(formula)
  const tryable = origin === 'builtin'
  const filled = (value: number | null | undefined, end: string) => (value === null && fill(name, end) ? 0 : value)
  const value = filled(totals.current.data?.periods[0]?.values[name], span.end)
  const previous = filled(totals.previous.data?.periods[0]?.values[name], span.previousEnd)
  const target = tracking.targetLine(name, entry.unit)
  const window = { start: span.start, end: span.end }
  const values = totals.current.data?.periods[0]?.values ?? {}
  const row = { name, label: entry.label, unit: entry.unit, category: entry.category, value: value ?? null, unavailable: cannot ?? null }
  // "This month" keeps its calendar days, so the days after the data stops are shown as empty, and said so.
  const stopsInside = until !== null && until < span.end

  return (
    <div className={styles.screen}>
      <BackLink />

      <header className={styles.pageHead}>
        <div className={styles.titleRow}>
          <h2 className={styles.title}>{entry.label}</h2>
          <KindTag kind={tree.kind} />
          {origin === 'custom' && <CustomTag />}
        </div>
        {entry.description && <p className={styles.lede}>{entry.description}</p>}
        <ul className={styles.facts} aria-label="About this metric">
          <li>{origin === 'custom' ? 'Custom metric' : 'Built-in metric'}</li>
          <li><b>{DISPLAY_NAMES[display]}</b></li>
          <li>{origin === 'custom' ? 'Built on other metrics' : <>{categoryName(entry.category)}{apps.length > 0 && <> · <b>{apps.join(', ')}</b></>}</>}</li>
        </ul>
        <div className={styles.pageActions}>
          <Button variant="secondary" size="sm" leftIcon={<Stethoscope size={14} strokeWidth={1.75} aria-hidden />} onClick={() => push(dashboardBoardsFocusRoute(name))}>
            Diagnose
          </Button>
        </div>
      </header>

      {cannot !== undefined && (
        <div className={styles.notice} role="status">
          <Info size={16} strokeWidth={1.75} aria-hidden />
          <span>This store can&apos;t measure {entry.label} yet: {cannot}.</span>
        </div>
      )}

      {cannot === undefined && tracking.healthPanel(row, window, until, values)}

      <section className={styles.block} aria-labelledby="metric-number">
        <div className={styles.headline}>
          <div className={styles.headlineValue}>
            <span id="metric-number" className={styles.windowLabel}>{label}</span>
            {totals.current.data === undefined && !totals.current.isError
              ? <Skeleton width={140} height="36px" />
              : (
                noDataYet
                  ? <span className={styles.windowValueRow}><span className={styles.bigValue} data-empty="">No data yet</span></span>
                  : (
                    <span className={styles.windowValueRow}>
                      <span className={styles.bigValue}>{formatDisplay(value, display, { exact: true })}</span>
                      <ChangeText change={changeOf(value, previous, display)} against={against} />
                    </span>
                  )
              )}
          </div>
          <div className={styles.modes} role="tablist" aria-label="Show as">
            <button type="button" role="tab" aria-selected={view === 'chart'} className={styles.modeTab} onClick={() => setView('chart')}>Chart</button>
            <button type="button" role="tab" aria-selected={view === 'table'} className={styles.modeTab} onClick={() => setView('table')}>Table</button>
          </div>
        </div>

        {view === 'chart'
          ? (
            <div className={styles.chart}>
              {target !== null && (
                // The line can hug the axis when one day spikes, so it's named here too.
                <p className={styles.chartLegend}>
                  <span className={styles.legendLine} aria-hidden />
                  Target {targetText(target, display)} a day
                </p>
              )}
              {daily.data === undefined
                ? <Skeleton height={`${CHART_HEIGHT}px`} radius="12px" />
                : (
                  <TrendChart
                    points={points}
                    format={CHART_FORMAT[display]}
                    label={`${entry.label}, ${label.toLowerCase()}`}
                    comparisonLabel={capitalised(against)}
                    target={target}
                    height={CHART_HEIGHT}
                  />
                )}
            </div>
          )
          : <DayTable points={points} display={display} against={against} loading={daily.data === undefined} />}
        <p className={styles.chartCaption}>
          {unsynced ? 'No data yet.' : <>By day, in the store&apos;s time zone. The faint line is {comparedWith}{targetCaption(target)}.</>}
          {!unsynced && (span.endsAtData || stopsInside) && until !== null && <> Data until {formatStoreDate(until)}.</>}
        </p>
      </section>

      <section className={styles.block} aria-labelledby="how-calculated">
        <div className={styles.sectionHead}>
          <h2 id="how-calculated" className={styles.sectionTitle}>How it&apos;s calculated</h2>
          <div className={styles.sectionActions}>
            <span className={styles.sectionMeta}>{label}</span>
            {(editable || tryable) && (
              <Button variant="secondary" size="sm" leftIcon={<PencilLine size={14} strokeWidth={1.75} aria-hidden />} onClick={() => setEditing(editable ? 'edit' : 'try')}>
                {editable ? 'Edit formula' : 'Try your own formula'}
              </Button>
            )}
          </div>
        </div>
        <MetricCalculation name={name} window={span} />
        {formula !== null && (
          <p className={styles.treeFooter}>
            Every line is the total for {inPeriod}, compared with {comparedWith}. A ratio is the ratio of the totals, so the lines add up.
          </p>
        )}
      </section>

      <section className={styles.block} aria-labelledby="definition">
        <div className={styles.sectionHead}>
          <h2 id="definition" className={styles.sectionTitle}>Definition</h2>
        </div>
        <dl className={styles.definition}>
          <div><dt>Created by</dt><dd>{origin === 'custom' ? 'Your organization' : 'Souvenir'}</dd></div>
          <div><dt>Counted in</dt><dd>The store&apos;s time zone ({timeZone ?? '…'})</dd></div>
        </dl>
      </section>

      {usedBy.length > 0 && (
        <section className={styles.block} aria-labelledby="used-by">
          <div className={styles.sectionHead}>
            <h2 id="used-by" className={styles.sectionTitle}>Used by</h2>
            <span className={styles.sectionMeta}>{usedBy.length}</span>
          </div>
          <ul className={styles.rows}>
            {usedBy.map(other => (
              <li key={other.name}>
                <div className={styles.row}>
                  <div className={styles.rowText}>
                    <h3 className={styles.rowLabel}><Link href={dashboardMetricRoute(other.name)} className={styles.rowLink}>{other.label}</Link></h3>
                    <p className={styles.rowDescription}>{other.description}</p>
                  </div>
                  <div className={styles.rowTags}><CustomTag /></div>
                  <div />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {editing !== null && (
        <FormulaEditorDialog
          entry={entry}
          mode={editing}
          current={editing === 'edit' && formula !== null && !isAggregate(formula) ? formula : undefined}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

/** How the caption names the target: a band for a range, a dashed line for a floor or a ceiling. */
function targetCaption(target: { low?: number | null; high?: number | null } | null): string {
  if (target === null) return ''
  const isRange = target.low != null && target.high != null && target.low !== target.high
  return isRange ? '; the band is the target' : '; the dashed line is the target'
}

/** "≥ $12.5k", "≤ 4.0%", "$4k–$6k": a day's target as the legend reads it. */
function targetText(target: { low?: number | null; high?: number | null }, display: DisplayUnit): string {
  const low = target.low ?? null
  const high = target.high ?? null
  if (low !== null && high !== null) return low === high ? formatDisplay(low, display) : `${formatDisplay(low, display)}–${formatDisplay(high, display)}`
  if (high !== null) return `≤ ${formatDisplay(high, display)}`
  return `≥ ${formatDisplay(low, display)}`
}

/** The chart's days as a table, newest first: the day, its number, and the same day of the period before. */
function DayTable({ points, display, against, loading }: { points: TrendPoint[]; display: DisplayUnit; against: string; loading: boolean }) {
  if (loading) return <Skeleton height={`${CHART_HEIGHT}px`} radius="12px" />
  return (
    <div className={styles.dayTableWrap}>
      <table className={styles.compare}>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Value</th>
            <th scope="col">{capitalised(against)}</th>
            <th scope="col">Change</th>
          </tr>
        </thead>
        <tbody>
          {[...points].reverse().map(point => (
            <tr key={point.date}>
              <th scope="row">{DAY.format(new Date(`${point.date}T00:00:00Z`))}</th>
              <td><strong className={styles.dayValue}>{formatDisplay(point.value, display, { exact: true })}</strong></td>
              <td>{formatDisplay(point.comparison, display, { exact: true })}</td>
              <td><ChangeText change={changeOf(point.value, point.comparison, display)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function BackLink() {
  return (
    <Link href={SETTINGS_METRICS_ROUTE} className={styles.back}>
      <ChevronLeft size={16} strokeWidth={1.75} aria-hidden />
      Metric definitions
    </Link>
  )
}

function PageSkeleton() {
  return (
    <div className={styles.screen} aria-busy aria-label="Loading metric">
      <Skeleton width={96} height="18px" />
      <Skeleton width={240} height="30px" />
      <Skeleton width="60%" height="18px" />
      <Skeleton height="96px" radius="16px" />
      <Skeleton height={`${CHART_HEIGHT}px`} radius="12px" />
    </div>
  )
}
