'use client'

import type { ReactNode } from 'react'
import { HealthPanel, HealthPill, HealthSummary, TargetField, TargetSettingsButton, useMetricHealth } from '@/components/Scorecard'
import type { MetricUnit } from '@/lib/api/warehouse'

/** The window a number covers, as the health pieces take it. */
export interface HealthWindow {
  start: string
  end: string
}

/** What the health of one row needs to know. */
export interface TrackedRowInput {
  name: string
  label: string
  unit: MetricUnit
  category: string
  value: number | null
  unavailable: string | null
}

/**
 * The one place the metrics page meets targets and health, which the Scorecards chat builds (`@/components/Scorecard`):
 * a target per metric saved on this device, "Set targets per" (weekly by default) with the other periods worked
 * out, and health for whatever window is on screen. Everything here is a thin call into those pieces, so a change
 * on their side (or targets moving to the back end, S2) touches this file only.
 */
export function useTracking() {
  const health = useMetricHealth()

  /**
   * The base a rate is judged on, so a refund rate over three orders isn't called off target: orders for store
   * rates, impressions for click and cost rates. Left out when we can't tell, and the check is skipped.
   */
  const sampleFor = (row: TrackedRowInput, values: Readonly<Record<string, number | null>>): number | undefined => {
    if (row.unit !== 'ratio' && !/(^|_)(per|avg|average|aov|cpc|cpm|cpa)(_|$)|^aov$/.test(row.name)) return undefined
    if (/(^|_)(ctr|cpc|cpm)$/.test(row.name)) return values.impressions ?? undefined
    if (row.category === 'store') return values.orders ?? undefined
    return undefined
  }

  return {
    /** Has a target, so it sits in Tracked. */
    isTracked: (name: string) => health.targetOf(name) !== null,

    /** The row's target: "≥ 100 a week", or "Set target"; click, type, Enter. */
    targetCell: (row: TrackedRowInput, window: HealthWindow): ReactNode => (
      <TargetField metric={row.name} label={row.label} unit={row.unit} window={window} />
    ),

    /** The row's health pill for the window, and whether it's off target ("Off target only" keeps those). */
    health: (row: TrackedRowInput, window: HealthWindow, dataUntil: string | null, values: Readonly<Record<string, number | null>>) => {
      const result = health.healthFor(row.name, row.unit, row.value, window, {
        unavailable: row.unavailable ?? undefined,
        dataUntil: dataUntil ?? undefined,
        sample: sampleFor(row, values),
      })
      // With the metric named, the pill also shows "Off target 3 wks running" and "Worse than usual".
      return { pill: <HealthPill health={result} metric={row.name} />, offTarget: result.verdict === 'red', result }
    },

    /** The top of a metric's page: health, the sentence about the target, the targets for every period. */
    healthPanel: (row: TrackedRowInput, window: HealthWindow, dataUntil: string | null, values: Readonly<Record<string, number | null>>): ReactNode => (
      <HealthPanel
        metric={row.name}
        label={row.label}
        unit={row.unit}
        actual={row.value}
        window={window}
        unavailable={row.unavailable ?? undefined}
        dataUntil={dataUntil ?? undefined}
        sample={sampleFor(row, values)}
      />
    ),

    /**
     * The target as a line (or band) on a daily chart, a day's worth: a floor when higher is better, a ceiling
     * when lower is better, both for "stay in range". Null without a target.
     */
    targetLine: (name: string, unit: MetricUnit): { low?: number | null; high?: number | null } | null => {
      const target = health.targetLineFor(name, unit, 1)
      if (target === null) return null
      if (target.kind === 'range') return { low: target.low, high: target.high }
      return target.direction === 'lower' ? { low: null, high: target.value } : { low: target.value, high: null }
    },

    /** "Targets per week · Edit": the one setting for every target. */
    settingsButton: <TargetSettingsButton />,

    /** "2 of 8 off target · 5 on track · 1 can't judge yet", for the Tracked header. */
    summary: (results: ReadonlyArray<ReturnType<typeof health.healthFor>>): ReactNode => <HealthSummary healths={[...results]} />,
  }
}

export type Tracking = ReturnType<typeof useTracking>
