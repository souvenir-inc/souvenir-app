'use client'

// Flagging the metrics that aren't performing well (Dev, 13 Nov): with no target, a metric outside its industry
// benchmark gets a pill: "Red flag" past the red-flag line, "Below healthy" / "Above healthy" outside the healthy
// range. With a target, the target's health shows instead. Judged on the header's period, with the value on screen.

import type { MetricUnit } from '@/lib/api/warehouse'
import { benchmarkFlag, benchmarkFlagDetail, flagLabel, type BenchmarkFlag, type FlagLevel } from '@/lib/scorecard/benchmarks'
import { useBenchmarkEdits } from '@/lib/scorecard/hooks'
import { formatOf } from '@/lib/scorecard/present'
import type { Health } from '@/lib/scorecard/targets'
import { useWorkspace } from '@/lib/warehouse/queries'
import { bandText, redFlagText } from './BenchmarkPanel'
import { HealthPill, useMetricHealth, type MetricHealthExtras } from './Health'
import styles from './Scorecard.module.css'

/** The benchmark flag for a metric's value on screen, with this workspace's own bands; null when there's none. */
export function useBenchmarkFlag(metric: string, value: number | null | undefined): BenchmarkFlag | null {
  const workspace = useWorkspace()
  const { edits } = useBenchmarkEdits(workspace.data?.id)
  return benchmarkFlagDetail(metric, value, edits)
}

/**
 * One call per page for lists like "Needs attention": `flagFor` says whether a metric needs attention for the
 * period on screen, the target first (its red / amber), else the benchmark flag. Null when it's fine, has neither,
 * or has no value yet.
 */
export function useMetricFlags() {
  const { healthFor, targetOf, workspace } = useMetricHealth()
  const { edits } = useBenchmarkEdits(workspace?.id)
  return {
    flagFor: (
      metric: string, unit: MetricUnit, value: number | null | undefined, window: { start: string; end: string }, extras: MetricHealthExtras = {},
    ): FlagLevel | null => {
      if (value === null || value === undefined) return null
      if (targetOf(metric)) {
        const verdict = healthFor(metric, unit, value, window, extras).verdict
        return verdict === 'red' ? 'red' : verdict === 'amber' ? 'amber' : null
      }
      return benchmarkFlag(metric, value, edits)
    },
  }
}

/** "Healthy for Shopify stores: at most 10.0% · red flag above 15.0%", for the pill's tooltip. */
export function flagTitle(flag: BenchmarkFlag, unit: MetricUnit, metric: string): string {
  const format = formatOf(null, unit, metric)
  const red = redFlagText(flag.band, format)
  return `${flag.edited ? 'Your healthy range' : 'Healthy for Shopify stores'}: ${bandText(flag.band, format)}${red ? ` · ${red.charAt(0).toLowerCase()}${red.slice(1)}` : ''}`
}

function FlagBadge({ flag, unit, metric }: { flag: BenchmarkFlag; unit: MetricUnit; metric: string }) {
  return (
    <span className={styles.pill} data-status={flag.level} title={flagTitle(flag, unit, metric)}>
      <span className={styles.pillDot} aria-hidden />{flagLabel(flag)}
    </span>
  )
}

export interface FlagPillProps {
  metric: string
  unit: MetricUnit
  /** The metric's value for the period on screen, the same one the card shows; null or undefined: no flag. */
  value: number | null | undefined
}

/** "Red flag", "Below healthy" or "Above healthy" for a metric outside its benchmark; nothing otherwise. */
export function FlagPill({ metric, unit, value }: FlagPillProps) {
  const flag = useBenchmarkFlag(metric, value)
  return flag ? <FlagBadge flag={flag} unit={unit} metric={metric} /> : null
}

export interface StatusPillProps extends FlagPillProps {
  /** The metric's health for the period (from `useMetricHealth().healthFor`); null when it isn't worked out. */
  health: Health | null
  /** Offered when there's no target and no flag: the "Set a target" button. */
  onSetTarget?: () => void
  /** Adds the target's context badges ("Off target 3 wks running"), as HealthPill does. */
  badges?: boolean
}

/**
 * One status per metric, the target first: with a target, its health ("On track", "Off target −12%"); with none,
 * the benchmark flag when it's outside healthy; else the "Set a target" button when offered, or nothing.
 */
export function StatusPill({ health, metric, unit, value, onSetTarget, badges = false }: StatusPillProps) {
  const flag = useBenchmarkFlag(metric, value)
  const targeted = health !== null && health.verdict !== 'no_target'
  if (targeted) return <HealthPill health={health} onSetTarget={onSetTarget} metric={badges ? metric : undefined} />
  if (flag) return <FlagBadge flag={flag} unit={unit} metric={metric} />
  return health && onSetTarget ? <HealthPill health={health} onSetTarget={onSetTarget} /> : null
}
