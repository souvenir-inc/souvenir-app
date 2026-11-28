// Whether a metric is on track against its scorecard target (05-cards-reading-rules.md CR-28: health
// comes from scorecard targets only, never from benchmarks). Pure, so the card, the metric window and
// Needs attention all read the same verdict for the same numbers.
//
// A scorecard row is { target, direction, tolerance }: `direction` says which way is good, and
// `tolerance` is how far short of the target still counts as on track, as a share of the target
// (warehouse/schemas.py ScorecardRow). That gives three states:
// - on track:  at the target or past it on the good side;
// - at risk:   short of it, but within the tolerance (the backend still counts this as on track);
// - off track: short of it by more than the tolerance.
// A tolerance of 0 leaves two states: any miss is off track.

import type { Scorecard } from '@/lib/api/warehouse'

export type ScorecardRow = Scorecard['rows'][number]
export type TargetStatus = 'on_track' | 'at_risk' | 'off_track'

export interface Judgement {
  status: TargetStatus
  /** actual − target, signed so negative is bad (short of an up target, past a down one). */
  gap: number
  /** `gap` as a share of the target; null when the target is 0 (no share of nothing). */
  gapShare: number | null
}

/** Absorbs float error at the edges, so 95.00000000001 % of a target isn't a miss. */
const EPSILON = 1e-9

/**
 * One value against its target row, in the same units as the row (the warehouse's: a percent metric's
 * 4.5 % is 0.045 on both sides). Null when there is no value to judge, so a missing number is never
 * read as zero.
 */
export function judge(actual: number | null | undefined, row: Pick<ScorecardRow, 'target' | 'direction' | 'tolerance'>): Judgement | null {
  if (actual === null || actual === undefined || !Number.isFinite(actual)) return null
  const { target, direction } = row
  const tolerance = Math.max(0, row.tolerance)
  const gap = direction === 'up' ? actual - target : target - actual
  const slack = Math.abs(target) * EPSILON
  const width = Math.abs(target) * tolerance
  const status: TargetStatus = gap >= -slack ? 'on_track' : gap >= -width - slack && width > 0 ? 'at_risk' : 'off_track'
  return { status, gap, gapShare: target === 0 ? null : gap / Math.abs(target) }
}

/** Needs attention (CR-30, CR-31) lists what is off track; at risk is still on track to the backend. */
export function needsAttention(judgement: Judgement | null): boolean {
  return judgement?.status === 'off_track'
}

export const STATUS_LABEL: Record<TargetStatus, string> = {
  on_track: 'On track',
  at_risk: 'At risk',
  off_track: 'Off track',
}

/**
 * The sentence that says why, shown as text next to the status (never only in a tooltip, A11Y-KB-06):
 * "12% below the target", "3% short of the target, within the 10% tolerance". `percent` formats a
 * share already multiplied by 100 (the caller's locale-aware formatter).
 */
export function statusReason(judgement: Judgement, row: Pick<ScorecardRow, 'direction' | 'tolerance'>, percent: (value: number) => string): string {
  const { status, gapShare } = judgement
  // Which side of the target the value sits on, in plain words.
  const ahead = judgement.gap > 0
  const side = (row.direction === 'up') === ahead ? 'above' : 'below'
  const by = gapShare === null ? null : percent(Math.abs(gapShare) * 100)
  const tolerance = percent(Math.max(0, row.tolerance) * 100)
  if (status === 'on_track') {
    if (!ahead) return 'Right on the target'
    return by === null ? `${capital(side)} the target` : `${by} ${side} the target`
  }
  const miss = by === null ? `${capital(side)} the target` : `${by} ${side} the target`
  return status === 'at_risk' ? `${miss}, within the ${tolerance} tolerance` : row.tolerance > 0 ? `${miss}, past the ${tolerance} tolerance` : miss
}

function capital(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}
