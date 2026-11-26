'use client'

import { useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Skeleton } from '@/components/Skeleton'
import { appsFor } from '@/lib/metrics/display'
import { originLabel } from '@/lib/metrics/library'
import { buildTree, displayOfMetric, fillMissingTotals, namesIn, sizeOf } from '@/lib/metrics/tree'
import { afterData, spanOf } from '@/lib/metrics/windows'
import { formatStoreDate, type RollingWindow } from '@/lib/warehouse/freshness'
import { usePeriod } from '@/lib/warehouse/period'
import { useMeasurement } from '@/lib/warehouse/queries'
import { CalculationTree } from './CalculationTree'
import { FormulaEquation } from './FormulaEquation'
import { useLibrary } from './useLibrary'
import styles from './MetricLibrary.module.css'

export interface MetricCalculationProps {
  /** The metric's catalog name. */
  name: string
  /**
   * The period every number shows, and the one it's compared with: a scorecard week and the week before, say.
   * Defaults to the dashboard's period (the header's picker), ending where the metric's data stops.
   */
  window?: Pick<RollingWindow, 'start' | 'end' | 'previousStart' | 'previousEnd'>
  /** Levels the step-by-step tree opens to. Defaults to 2. */
  openDepth?: number
  /** Opens another metric in place (the metric window); without it, each metric links to its page. */
  onOpen?: (name: string) => void
}

/**
 * "How it's calculated" for one metric, ready to drop anywhere (the metric page, the metric window): the formula
 * as one readable line of chips with the period's numbers, and every step one click down. It fetches what it
 * needs in two requests, one for the period and one for the period before.
 */
export function MetricCalculation({ name, window, openDepth, onOpen }: MetricCalculationProps) {
  const library = useLibrary()
  const [steps, setSteps] = useState(false)
  const { lookup, known } = library
  const entry = library.byName.get(name)
  const timeZone = library.workspace.data?.timezone
  const tree = useMemo(() => buildTree(name, lookup), [name, lookup])
  const names = useMemo(() => [...namesIn(tree, known)].sort(), [tree, known])
  const dashboardPeriod = usePeriod()
  const until = library.untilOf(names)
  const period = window ?? spanOf(dashboardPeriod, timeZone, until)
  const on = timeZone !== undefined && names.length > 0 && tree.body !== null
  const current = useMeasurement({ metrics: names, start: period.start, end: period.end, grain: 'total' }, on)
  const previous = useMeasurement({ metrics: names, start: period.previousStart, end: period.previousEnd, grain: 'total' }, on)

  if (library.catalog.data === undefined) return <Skeleton height="72px" radius="16px" />
  if (entry === undefined) return null

  if (tree.body === null) {
    // No formula to show: one plain line for a built-in, nothing for a custom metric.
    if (entry.category === 'custom') return null
    const apps = appsFor(entry.category, library.workspace.data?.connectors ?? [])
    return apps.length > 0 ? <p className={styles.plainLine}>Counted from {apps.join(' and ')} data.</p> : null
  }

  const fill = (n: string) => library.fill(n, period.end)
  // A period wholly after the source's last sync shows no numbers yet, whatever the API answers for those days.
  const unsynced = library.neverSyncedOf(names)
  const noDataYet = unsynced || afterData(period, until)
  const raw = noDataYet ? (current.data ? {} : undefined) : current.data?.periods[0]?.values
  const values = raw === undefined ? undefined : fillMissingTotals(raw, fill).values
  const deep = sizeOf(tree) > 4

  return (
    <div className={styles.calculation}>
      <div className={styles.equationCard}>
        <FormulaEquation
          tree={tree}
          lookup={lookup}
          unitOf={library.unitOf}
          labelOf={library.labelOf}
          values={values}
          appsOf={library.appsOf}
          onOpen={onOpen}
        />
        <span className={styles.tag} data-tone="quiet">{originLabel(entry)}</span>
      </div>
      {noDataYet && <p className={styles.plainLine}>No data yet.{!unsynced && until !== null && <> Data until {formatStoreDate(until)}.</>}</p>}
      {tree.body.type === 'operation' && (
        <>
          <button type="button" className={styles.stepsToggle} aria-expanded={steps} onClick={() => setSteps(!steps)}>
            <ChevronRight size={14} strokeWidth={1.75} aria-hidden />
            {steps ? 'Hide the steps' : deep ? 'Show every step' : 'Show where each number comes from'}
          </button>
          {steps && (
            <CalculationTree
              tree={tree}
              lookup={lookup}
              unitOf={library.unitOf}
              labelOf={library.labelOf}
              current={raw}
              previous={previous.data?.periods[0]?.values}
              unavailable={current.data?.unavailable ?? {}}
              linkable={known}
              isCustom={library.isCustom}
              sourceOf={library.appsOf}
              rootDisplay={displayOfMetric(name, entry.unit, lookup(name) ?? null, library.unitOf)}
              fill={fill}
              openDepth={openDepth ?? 3}
            />
          )}
        </>
      )}
    </div>
  )
}
