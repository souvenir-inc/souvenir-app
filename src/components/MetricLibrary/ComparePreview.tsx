'use client'

import { useMemo } from 'react'
import { ArrowRight } from 'lucide-react'
import { TrendChart, type ValueFormat } from '@/components/charts'
import { Skeleton } from '@/components/Skeleton'
import type { MetricExpression } from '@/lib/api/warehouse'
import { compareNames, compareSeries, compareValues, impactNames, impactOf, proposedTree } from '@/lib/metrics/compare'
import { changeOf, formatDisplay } from '@/lib/metrics/display'
import { displayOfMetric, fillMissingTotals, referencesOf, type DisplayUnit } from '@/lib/metrics/tree'
import { afterData, periodPhrase, spanLabel, storeToday, weeksRange } from '@/lib/metrics/windows'
import { usePeriod } from '@/lib/warehouse/period'
import { formatStoreDate } from '@/lib/warehouse/freshness'
import { useMeasurement } from '@/lib/warehouse/queries'
import { ChangeText } from './bits'
import { CalculationTree } from './CalculationTree'
import { useLibrary, useWindowTotals } from './useLibrary'
import styles from './MetricLibrary.module.css'

const WEEKS = 13

const CHART_FORMAT: Record<DisplayUnit, ValueFormat> = {
  money: 'money', count: 'count', percent: 'ratio', multiple: 'multiple', number: 'count',
}

/** Measured values without the metric's own (old) number, so the tree's top line is the new formula's. */
function without(values: Record<string, number | null>, name: string): Record<string, number | null> {
  return Object.fromEntries(Object.entries(values).filter(([key]) => key !== name))
}

export interface ComparePreviewProps {
  /** The name the new formula is saved under: the metric's own when editing, a new one when trying a formula on a built-in. */
  name: string
  /** What the new one is called, when it's a new metric ("Net sales (ours)"). */
  label?: string
  /** The metric whose number today is compared against. */
  baseName: string
  value: MetricExpression
}

/**
 * Old against new before anything is saved: the metric's number now, the number the new formula gives, the
 * change, both lines over the last 13 weeks, and the custom metrics that would move with it. The new number is
 * worked out from real measured inputs; nothing is written to the warehouse.
 */
export function ComparePreview({ name, label, baseName, value }: ComparePreviewProps) {
  const library = useLibrary()
  const period = usePeriod()
  const { lookup, known, entries, unitOf } = library
  const timeZone = library.workspace.data?.timezone
  const base = library.byName.get(baseName)
  const tree = useMemo(() => proposedTree(name, value, lookup), [name, value, lookup])
  const users = useMemo(
    () => entries
      .filter(entry => {
        // Only an edit changes what other metrics are built on; trying your own version leaves them as they are.
        if (name !== baseName || entry.name === baseName || entry.name === name) return false
        const formula = lookup(entry.name)
        return formula ? referencesOf(formula).includes(baseName) : false
      })
      .map(entry => entry.name),
    [entries, lookup, baseName, name],
  )
  const names = useMemo(() => [...new Set([
    ...compareNames(name, tree, known, name === baseName ? [] : [baseName]),
    ...impactNames(users, baseName, value, lookup, known),
  ])], [name, baseName, tree, known, users, value, lookup])

  // Stop where the inputs' data stops, like the metric page.
  const until = library.untilOf(names)
  const totals = useWindowTotals(names, period, timeZone, true, until)
  const weeks = weeksRange(WEEKS, timeZone, undefined, until)
  const weekly = useMeasurement({ metrics: [...names].sort(), ...weeks, grain: 'week' }, timeZone !== undefined && names.length > 0)

  const display = displayOfMetric(baseName, base?.unit, value, unitOf)
  // A total with no rows in the window is 0 (no refunds is $0 of refunds); rates stay missing.
  // A period wholly after the last sync has nothing to compare yet, whatever the API answers for it.
  const raw = afterData(totals.span, until) || library.neverSyncedOf(names) ? (totals.current.data ? {} : undefined) : totals.current.data?.periods[0]?.values
  const values = raw ? fillMissingTotals(raw, n => library.fill(n, totals.span.end)).values : undefined
  const comparison = values ? compareValues(name, tree, values, baseName) : null
  const impact = values ? impactOf(users, baseName, value, lookup, values) : []
  const periods = useMemo(
    () => (weekly.data?.periods ?? []).map(period => ({ ...period, values: fillMissingTotals(period.values, n => library.fill(n, period.start)).values as Record<string, number | null> })),
    [weekly.data, library],
  )
  const points = weekly.data ? compareSeries(periods, name, tree, until, baseName) : []
  const today = storeToday(timeZone)
  const periodLabel = spanLabel(period, totals.span)
  const baseLabel = base?.label ?? baseName
  const editing = name === baseName
  const change = comparison ? changeOf(comparison.after, comparison.now, display) : null
  const gap = comparison && comparison.now !== null && comparison.after !== null && (display === 'money' || display === 'count')
    ? comparison.after - comparison.now
    : null

  return (
    <div className={styles.proposal}>
      <div className={styles.proposalHead}>
        <h3 className={styles.proposalTitle}>{editing ? 'Before you save' : `Souvenir’s ${baseLabel} beside yours`}</h3>
        <span className={styles.sectionMeta}>{periodLabel}</span>
      </div>

      <div className={styles.hero} aria-live="polite">
        <div className={styles.heroCell}>
          <span className={styles.heroLabel}>{editing ? 'Now' : `Souvenir’s ${baseLabel}`}</span>
          {comparison ? <span className={styles.heroValue} data-tone="before">{formatDisplay(comparison.now, display, { exact: true })}</span> : <Skeleton width={120} height="32px" />}
        </div>
        <ArrowRight className={styles.heroArrow} size={18} strokeWidth={1.5} aria-hidden />
        <div className={styles.heroCell}>
          <span className={styles.heroLabel}>{editing ? 'After your edit' : label ?? 'Yours'}</span>
          {comparison ? <span className={styles.heroValue}>{formatDisplay(comparison.after, display, { exact: true })}</span> : <Skeleton width={120} height="32px" />}
        </div>
        <div className={`${styles.heroCell} ${styles.heroChange}`}>
          <span className={styles.heroLabel}>Difference</span>
          {comparison
            ? (
              <span className={styles.heroDelta}>
                {change ? <ChangeText change={change} /> : <span className={styles.change}>—</span>}
                {gap !== null && gap !== 0 && <span className={styles.heroGap}>{formatDisplay(Math.abs(gap), display, { exact: true })} {gap < 0 ? 'less' : 'more'}</span>}
              </span>
            )
            : <Skeleton width={80} height="20px" />}
        </div>
      </div>
      <p className={styles.treeFooter}>
        Totals for {periodPhrase(period, totals.span)}.
      </p>

      <div>
        {weekly.data === undefined
          ? <Skeleton height="180px" radius="12px" />
          : (
            <TrendChart
              points={points}
              format={CHART_FORMAT[display]}
              label={`${baseLabel} by week, ${editing ? 'now and with the new formula' : 'Souvenir’s and yours'}`}
              comparisonLabel={editing ? 'Now' : `Souvenir’s ${baseLabel}`}
              variant="line"
              height={180}
            />
          )}
        <p className={styles.chartCaption}>
          By week, last {WEEKS} weeks. The dark line is {editing ? 'the new formula' : 'yours'}; the faint line is {editing ? 'today’s' : `Souvenir’s ${baseLabel}`}.
          {until !== null && until < today && <> Data until {formatStoreDate(until)}.</>}
        </p>
      </div>

      {impact.length > 0 && (
        <div className={styles.block}>
          <h4 className={styles.subTitle}>Also moves</h4>
          <table className={styles.compare}>
            <thead>
              <tr>
                <th scope="col"><span className="sr-only">Metric</span></th>
                <th scope="col">Now</th>
                <th scope="col">After</th>
                <th scope="col">Change</th>
              </tr>
            </thead>
            <tbody>
              {impact.map(row => {
                const unit = displayOfMetric(row.name, unitOf(row.name), lookup(row.name) ?? null, unitOf)
                return (
                  <tr key={row.name}>
                    <th scope="row">{library.labelOf(row.name) ?? row.name}</th>
                    <td>{formatDisplay(row.now, unit)}</td>
                    <td>{formatDisplay(row.after, unit)}</td>
                    <td><ChangeText change={changeOf(row.after, row.now, unit)} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className={styles.block}>
        <h4 className={styles.subTitle}>How {editing ? 'the new formula' : 'yours'} is calculated</h4>
        <CalculationTree
          tree={tree}
          lookup={n => (n === name ? value : lookup(n))}
          unitOf={n => (n === name ? base?.unit : unitOf(n))}
          labelOf={n => (n === name && !editing ? label ?? 'Yours' : library.labelOf(n))}
          current={raw ? without(raw, name) : undefined}
          previous={totals.previous.data ? without(totals.previous.data.periods[0]?.values ?? {}, name) : undefined}
          unavailable={totals.current.data?.unavailable ?? {}}
          linkable={new Set()}
          isCustom={library.isCustom}
          sourceOf={library.appsOf}
          fill={n => library.fill(n, totals.span.end)}
          rootDisplay={display}
          openDepth={3}
        />
      </div>
    </div>
  )
}
