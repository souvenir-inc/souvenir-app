'use client'

import { formatMetricValue } from '@/components/Dashboard/format'
import { STATUS_LABEL, statusReason, type Judgement, type ScorecardRow, type TargetStatus } from '@/lib/scorecard/status'
import { cn } from '@/lib/utils'

// A metric's health against its scorecard target (CR-28: targets only, no benchmarks): a pill that
// names the status in words, and the reason beside it as visible text, never only in a tooltip
// (A11Y-CO-03, A11Y-KB-06). The dot's colour repeats what the words already say.

const PILL: Record<TargetStatus, string> = {
  on_track: 'border-[var(--dashboard-pill-border)] bg-[var(--dashboard-pill-bg)] text-[var(--dashboard-positive)]',
  at_risk: 'border-[var(--dashboard-pill-border)] bg-[var(--dashboard-pill-bg)] text-[var(--dashboard-pill-warn-text)]',
  off_track: 'border-[var(--dashboard-pill-bad-border)] bg-[var(--dashboard-pill-bad-bg)] text-[var(--dashboard-pill-bad-text)]',
}
const DOT: Record<TargetStatus, string> = {
  on_track: 'bg-[var(--dashboard-positive)]',
  at_risk: 'bg-[var(--dashboard-pill-warn-dot)]',
  off_track: 'bg-[var(--dashboard-negative)]',
}

/** A share already × 100 as the dashboard writes percentages: "12%", "4.5%". */
export function percentText(value: number): string {
  return formatMetricValue(Number(value.toFixed(value < 10 ? 1 : 0)), 'percent')
}

export function HealthPill({ status }: { status: TargetStatus }) {
  return (
    <span data-target-status={status} className={cn('inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-solid pl-2 pr-2.5 text-[length:var(--font-size-small)] leading-4', PILL[status])}>
      <span aria-hidden className={cn('size-1.5 rounded-full', DOT[status])} />
      {STATUS_LABEL[status]}
    </span>
  )
}

/** The pill and why: "Off track · 12% below the target, past the 10% tolerance". */
export function Health({ judgement, row, className }: { judgement: Judgement; row: Pick<ScorecardRow, 'direction' | 'tolerance'>; className?: string }) {
  return (
    <p className={cn('m-0 flex flex-wrap items-center gap-x-2 gap-y-1', className)}>
      <HealthPill status={judgement.status} />
      <span className="text-[length:var(--font-size-small)] leading-4 text-[var(--dashboard-label)]">{statusReason(judgement, row, percentText)}</span>
    </p>
  )
}
