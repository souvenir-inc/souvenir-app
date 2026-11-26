'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Skeleton } from '@/components/Skeleton'
import { Sparkline, type ValueFormat } from '@/components/charts'
import { changeOf, formatDisplay } from '@/lib/metrics/display'
import type { LibraryRow } from '@/lib/metrics/library'
import { buildTree, namesIn, type DisplayUnit } from '@/lib/metrics/tree'
import { spanOf } from '@/lib/metrics/windows'
import { isPastData } from '@/lib/warehouse/freshness'
import { usePeriod } from '@/lib/warehouse/period'
import { useMeasurement } from '@/lib/warehouse/queries'
import { dashboardMetricRoute } from '@/lib/routes'
import { ChangeText } from './bits'
import type { Tracking } from './tracking'
import { useLibrary } from './useLibrary'
import styles from './MetricLibrary.module.css'

const SPARK_FORMAT: Record<DisplayUnit, ValueFormat> = {
  money: 'money', count: 'count', percent: 'ratio', multiple: 'multiple', number: 'count',
}

export interface TrackedSectionProps {
  /** The tracked metrics that pass the search and filters. */
  rows: LibraryRow[]
  tracking: Tracking
  loading: boolean
  against: string
  /** A search or filter is on: an empty section says so instead of explaining how to track. */
  filtered: boolean
  /** The days each metric's number covers, ended where its data stops. */
  windowOf: (name: string) => { start: string; end: string }
  /** The day a metric's data stops, when it stops before today. */
  untilOf: (name: string) => string | null
  /** The period's totals, for the small-sample check on rates. */
  values: Readonly<Record<string, number | null>>
}

/**
 * The metrics with a target, on top of the dashboard: each with its number, its target, whether it's on track
 * and a small trend. "Off target only" leaves just the ones to talk about.
 */
export function TrackedSection({ rows, tracking, loading, against, filtered, windowOf, untilOf: untilOfRow, values }: TrackedSectionProps) {
  const library = useLibrary()
  const period = usePeriod()
  const [offOnly, setOffOnly] = useState(false)
  const timeZone = library.workspace.data?.timezone
  const names = useMemo(() => rows.map(row => row.name).sort(), [rows])
  // One daily request for every tracked metric's trend, over the dashboard period.
  const span = spanOf(period, timeZone, library.untilOf(names))
  const daily = useMeasurement({ metrics: names, start: span.start, end: span.end, grain: 'day' }, timeZone !== undefined && names.length > 0)
  const { lookup, known, untilOf, fill } = library

  const judged = rows.map(row => ({ row, health: tracking.health(row, windowOf(row.name), untilOfRow(row.name), values) }))
  const offCount = judged.filter(item => item.health?.offTarget).length
  const visible = offOnly ? judged.filter(item => item.health?.offTarget) : judged

  return (
    <section aria-labelledby="metrics-tracked">
      <div className={styles.sectionHead}>
        <h2 id="metrics-tracked" className={styles.sectionTitle}>Tracked</h2>
        <div className={styles.sectionActions}>
          {rows.length > 0 && tracking.summary(judged.map(item => item.health.result))}
          {tracking.settingsButton}
          {rows.length > 0 && (
            <button type="button" className={styles.toggleChip} aria-pressed={offOnly} onClick={() => setOffOnly(!offOnly)}>
              Off target only{offCount > 0 && <span className={styles.toggleCount}>{offCount}</span>}
            </button>
          )}
          <span className={styles.sectionMeta}>{rows.length}</span>
        </div>
      </div>

      {rows.length === 0
        ? <p className={styles.trackedEmpty}>{filtered ? 'No tracked metric matches.' : 'Nothing tracked yet. Set a target on any metric below and it moves up here, judged against it.'}</p>
        : visible.length === 0
          ? <p className={styles.trackedEmpty}>Everything tracked is on target for this period.</p>
          : (
            <ul className={styles.rows}>
              {visible.map(({ row, health }) => {
                const until = untilOf(namesIn(buildTree(row.name, lookup), known))
                const series = (daily.data?.periods ?? []).map(p => {
                  if (isPastData(p.start, until)) return null
                  const value = p.values[row.name]
                  return value === null || value === undefined ? (fill(row.name, p.start) ? 0 : null) : value
                })
                return (
                  <li key={row.name}>
                    <div className={`${styles.row} ${styles.trackedRow}`}>
                      <div className={styles.rowText}>
                        <h3 className={styles.rowLabel}>
                          <Link href={dashboardMetricRoute(row.name)} className={styles.rowLink}>{row.label}</Link>
                        </h3>
                        <p className={styles.rowDescription}>{row.description}</p>
                      </div>
                      <div className={styles.trackedTrend}>
                        {daily.data === undefined
                          ? <Skeleton height="28px" />
                          : <Sparkline values={series} label={`${row.label} by day`} format={SPARK_FORMAT[row.display]} height={28} />}
                      </div>
                      <div className={styles.rowTarget}>{tracking.targetCell(row, windowOf(row.name))}</div>
                      <div className={styles.trackedHealth}>{health?.pill}</div>
                      <div className={styles.rowValue}>
                        {loading
                          ? <Skeleton width={72} height="20px" />
                          : (
                            <>
                              <strong>{formatDisplay(row.value, row.display)}</strong>
                              <span title={`Compared with ${against}`}><ChangeText change={changeOf(row.value, row.previous, row.display)} /></span>
                            </>
                          )}
                      </div>
                      <ArrowRight className={styles.rowArrow} size={16} strokeWidth={1.75} aria-hidden />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
    </section>
  )
}
