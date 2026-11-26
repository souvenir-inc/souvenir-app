'use client'

// The scorecard as health, in pieces the metrics page drops in:
// - HealthPill: "On track", "Off target −12%", or why there's no colour.
// - TargetField: a metric's target, typed in place ("120k", "4%", "4k–6k"), Enter to save.
// - useMetricHealth: one call per page; returns healthFor(metric, unit, actual, window, extras).
// Targets are saved on this device until the back end has them (S2), per workspace.

import { useState } from 'react'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import type { MetricEntry, MetricUnit } from '@/lib/api/warehouse'
import { useTargets } from '@/lib/scorecard/hooks'
import { storeClock, type StoreClock } from '@/lib/scorecard/periods'
import { formatOf, healthLabel, scalingSentence } from '@/lib/scorecard/present'
import { healthOf, targetForWindow, weeklyContext, windowDays, type Health, type HealthInput, type WeeklyContext } from '@/lib/scorecard/targets'
import { addDays, weekStartOf } from '@/lib/scorecard/periods'
import { cutOf } from '@/lib/scorecard/status'
import { dataUntil, earliestDate } from '@/lib/warehouse/freshness'
import type { Direction, ResolvedTarget } from '@/lib/scorecard/model'
import { isAdditive } from '@/lib/scorecard/template'
import { useMeasurement, useMetricCatalog, useWorkspace } from '@/lib/warehouse/queries'
import { TargetEditor, targetSummary } from './TargetEditor'
import styles from './Scorecard.module.css'

const COLOUR_OF: Record<string, 'green' | 'amber' | 'red' | 'none'> = { green: 'green', amber: 'amber', red: 'red' }

/**
 * A metric's health for the period on screen, with the gap on a miss. Pass `metric` to add its context badges:
 * "Off target 3 wks running" and "Worse than usual ↓12%" (from one shared weekly request for every tracked metric).
 */
export function HealthPill({ health, onSetTarget, metric }: { health: Health; onSetTarget?: () => void; metric?: string }) {
  const status = COLOUR_OF[health.verdict] ?? 'none'
  const content = <><span className={styles.pillDot} aria-hidden />{healthLabel(health)}</>
  if (health.verdict === 'no_target' && onSetTarget) {
    return (
      <button type="button" className={`${styles.pill} ${styles.pillButton}`} data-status="none"
        onClick={event => { event.preventDefault(); event.stopPropagation(); onSetTarget() }}>
        {content}
      </button>
    )
  }
  const pill = <span className={styles.pill} data-status={status} title={health.reason}>{content}</span>
  return metric ? <span className={styles.pillGroup}>{pill}<HealthBadges metric={metric} /></span> : pill
}

/** Weekly values for every tracked metric in one request (shared by every pill on the page), for the badges. */
function useWeeklyContexts() {
  const { book, settings, clock, workspace, targetOf } = useMetricHealth()
  const catalog = useMetricCatalog(workspace !== undefined)
  const entries = catalog.data ?? NO_ENTRIES
  const byName = new Map(entries.map(entry => [entry.name, entry]))
  const tracked = book.targets.map(target => target.metric).filter(name => byName.has(name)).sort()
  const current = weekStartOf(clock.date)
  const request = { metrics: tracked, start: addDays(current, -7 * CONTEXT_WEEKS), end: addDays(current, -1), grain: 'week' as const }
  const query = useMeasurement(request, tracked.length > 0)
  return (metric: string): WeeklyContext | null => {
    const entry = byName.get(metric)
    if (!entry || !query.data || !workspace) return null
    const categories = entry.category === 'custom' ? workspace.categories.map(c => c.category) : [entry.category]
    const until = earliestDate(categories.map(category => dataUntil(workspace, category)))
    const values = [...query.data.periods]
      .sort((a, b) => a.start.localeCompare(b.start))
      .map(period => (cutOf(period.start, 7, until) === 'none' ? period.values[metric] ?? null : null))
    return weeklyContext(values, targetOf(metric), settings, metric, entry.unit)
  }
}

/** Closed weeks read for the badges: 8, the history rule's 4 against 4. */
const CONTEXT_WEEKS = 8
const NO_ENTRIES: MetricEntry[] = []

/** The context badges for a tracked metric; nothing when there's nothing worth saying. */
export function HealthBadges({ metric }: { metric: string }) {
  const contextOf = useWeeklyContexts()
  const context = contextOf(metric)
  if (!context) return null
  const badges: Array<{ key: string; text: string; tone: 'red' | 'amber'; title: string }> = []
  if (context.streak >= 2) {
    badges.push({ key: 'streak', text: `Off target ${context.streak} wks running`, tone: 'red', title: `Missed its weekly target each of the last ${context.streak} weeks` })
  }
  if (context.history && (context.history.verdict === 'amber' || context.history.verdict === 'red') && context.history.change !== null) {
    const change = context.history.change
    badges.push({
      key: 'history', tone: context.history.verdict === 'red' ? 'red' : 'amber',
      text: `Worse than usual ${change >= 0 ? '↑' : '↓'}${Math.round(Math.abs(change) * 100)}%`,
      title: 'The last 4 weeks against the 4 weeks before',
    })
  }
  if (badges.length === 0) return null
  return <>{badges.map(badge => <span key={badge.key} className={styles.badge} data-tone={badge.tone} title={badge.title}>{badge.text}</span>)}</>
}

/** "2 of 8 off target · 5 on track · 1 can't judge yet", for the top of a board or the Tracked section. */
export function HealthSummary({ healths }: { healths: Health[] }) {
  if (healths.length === 0) return null
  const off = healths.filter(h => h.verdict === 'red' || h.verdict === 'amber').length
  const on = healths.filter(h => h.verdict === 'green').length
  const grey = healths.length - off - on
  return (
    <p className={styles.summary} aria-live="polite">
      <span className={styles.summaryLead} data-tone={off > 0 ? 'red' : 'green'}>
        {off > 0 ? `${off} of ${healths.length} off target` : `All ${healths.length} on track`}
      </span>
      {off > 0 && on > 0 && <span> · {on} on track</span>}
      {grey > 0 && <span> · {grey} can&apos;t judge yet</span>}
    </p>
  )
}

export type MetricHealthExtras = Pick<HealthInput, 'unavailable' | 'dataUntil' | 'sample'>

/**
 * Health for any metric on the page, from this workspace's targets and setting. Call once per page:
 * `const { healthFor } = useMetricHealth()`, then `healthFor('revenue', 'money', 98_000, window)` per row.
 */
export function useMetricHealth() {
  const workspace = useWorkspace()
  const targets = useTargets(workspace.data?.id)
  const clock: StoreClock = storeClock(workspace.data?.timezone ?? 'UTC')
  return {
    ...targets,
    workspace: workspace.data,
    clock,
    healthFor: (metric: string, unit: MetricUnit, actual: number | null, window: { start: string; end: string }, extras: MetricHealthExtras = {}) =>
      healthOf({ metric, unit, actual, window, clock, target: targets.targetOf(metric), settings: targets.settings, ...extras }),
    /**
     * The target for one chart point (`days` = 1 for a daily chart, 7 for weekly bars), for a target line:
     * a running total's target scaled to the point, a rate's as set. `direction` says which side is good:
     * `higher` (on or above the line), `lower` (on or below it), `range` (between low and high). Null with no target.
     */
    targetLineFor: (metric: string, unit: MetricUnit, days: number): (ResolvedTarget & { direction: Direction }) | null => {
      const target = targets.targetOf(metric)
      const line = targetForWindow(target, targets.settings, days, isAdditive(metric, unit))?.expected ?? null
      return line && target ? { ...line, direction: target.direction } : null
    },
  }
}

export interface TargetFieldProps {
  metric: string
  label: string
  unit: MetricUnit
  /** The window on screen; with `actual`, the empty field shows the metric's own pace as its placeholder. */
  window?: { start: string; end: string }
  /** The metric's total for `window`. */
  actual?: number | null
  /** Open the form at once (after adding a metric, say). */
  autoEdit?: boolean
}

/**
 * A metric's target on a row or card: "≥ $120k / wk" or "Set target". Clicking opens the target form in a small
 * popover: condition, number, period, what it works out to. Clicks and keys inside never reach the row behind it.
 */
export function TargetField({ metric, label, unit, autoEdit = false, window, actual }: TargetFieldProps) {
  const { targetOf, clock } = useMetricHealth()
  const pace = window && actual != null ? { value: actual, days: windowDays(window, clock) } : null
  const [open, setOpen] = useState(autoEdit)
  const summary = targetSummary(targetOf(metric), unit, metric)
  const stop = (event: { stopPropagation: () => void }) => event.stopPropagation()
  return (
    <span className={styles.targetFieldWrap} onClick={event => { event.preventDefault(); event.stopPropagation() }}>
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
        <PopoverPrimitive.Trigger asChild>
          <button
            type="button"
            className={styles.targetButton}
            data-empty={summary ? undefined : ''}
            aria-label={summary ? `${label} target ${summary}. Change it` : `Set a target for ${label}`}
          >
            {summary ?? 'Set target'}
          </button>
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            className={styles.popover}
            side="bottom"
            align="start"
            sideOffset={6}
            collisionPadding={16}
            // The popover renders outside the row, but React still bubbles its events to the row: stop them here.
            onClick={stop}
            onKeyDown={stop}
            onPointerDown={stop}
          >
            <p className={styles.popoverTitle}>{label} target</p>
            <TargetEditor metric={metric} label={label} unit={unit} onDone={() => setOpen(false)} autoFocus pace={pace} />
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </span>
  )
}

/** The sentence under a health pill: what the target for this period is and where it came from. */
export function HealthNote({ metric, unit, health }: { metric: string; unit: MetricUnit; health: Health }) {
  const { targetOf } = useMetricHealth()
  const target = targetOf(metric)
  if (!target) return null
  const sentence = scalingSentence(target, health, formatOf(null, unit, metric))
  return sentence ? <p className={styles.description}>{sentence}</p> : null
}
