// Where a metric's target lives among the workspace's scorecards, and how one target is written
// back. Pure, so the read-modify-write is tested without a server.
//
// Which scorecard: targets set from the dashboard go into one workspace scorecard named "Targets",
// found by name and created under a client-chosen UUID on the first save. Other scorecards (made by
// an agent or another client) are read too: a metric's target is the first row for it in the order
// the server lists scorecards, and editing that target edits it where it lives, so the row in force is
// the one that changes.
//
// Writing: PUT replaces a whole scorecard and scorecards carry no version, so a save re-reads the list
// first and changes only the one row (read-modify-write). A save by someone else between that read
// and the PUT is still lost (backend ticket: a version or a row-level endpoint).

import type { Scorecard, ScorecardRequest } from '@/lib/api/warehouse'
import type { ScorecardRow } from './status'

export const TARGETS_SCORECARD = 'Targets'

export interface FoundTarget {
  scorecardId: string
  row: ScorecardRow
}

/** A metric's target: the first row for it across the scorecards, in the server's order. */
export function findTarget(scorecards: readonly Scorecard[], metric: string): FoundTarget | null {
  for (const card of scorecards) {
    const row = card.rows.find((r) => r.metric === metric)
    if (row) return { scorecardId: card.id, row }
  }
  return null
}

export interface TargetWrite {
  /** The scorecard to PUT. */
  id: string
  request: ScorecardRequest
  /** True when the PUT creates the Targets scorecard. */
  created: boolean
}

/**
 * The one PUT that sets (row) or removes (null) a metric's target, worked out from the scorecards as
 * last read. Null when there is nothing to do (removing a target that isn't there).
 * - The metric has a row: that scorecard changes; the first row is replaced (or dropped) and any
 *   duplicate rows for the metric in the same scorecard are dropped, so it never has two.
 * - It has none: the row is added to the Targets scorecard, which is created with `newId()` if missing.
 */
export function planTargetWrite(scorecards: readonly Scorecard[], metric: string, row: ScorecardRow | null, newId: () => string): TargetWrite | null {
  const home = scorecards.find((card) => card.rows.some((r) => r.metric === metric))
  if (home) {
    const first = home.rows.findIndex((r) => r.metric === metric)
    const rows = home.rows.flatMap((r, i) => (r.metric !== metric ? [r] : i === first && row ? [row] : []))
    return { id: home.id, request: { name: home.name, rows }, created: false }
  }
  if (!row) return null
  const targets = scorecards.find((card) => card.name === TARGETS_SCORECARD)
  if (targets) return { id: targets.id, request: { name: targets.name, rows: [...targets.rows, row] }, created: false }
  return { id: newId(), request: { name: TARGETS_SCORECARD, rows: [row] }, created: true }
}

/**
 * The cached list with one scorecard put in place (replaced by id, or added at the end). A scorecard
 * created optimistically has no server fields yet; `now` stands in for `updatedAt` until the refetch.
 */
export function withScorecard(scorecards: readonly Scorecard[], write: { id: string; request: ScorecardRequest }, now: string): Scorecard[] {
  const existing = scorecards.find((card) => card.id === write.id)
  const next: Scorecard = { ...(existing ?? { createdBy: '', updatedAt: now }), id: write.id, ...write.request }
  return existing ? scorecards.map((card) => (card.id === write.id ? next : card)) : [...scorecards, next]
}

/** The saved scorecard from the server in place of the optimistic one; `drop` removes a stand-in under another id. */
export function withSaved(scorecards: readonly Scorecard[], saved: Scorecard, drop?: string): Scorecard[] {
  const kept = drop && drop !== saved.id ? scorecards.filter((card) => card.id !== drop) : [...scorecards]
  return kept.some((card) => card.id === saved.id) ? kept.map((card) => (card.id === saved.id ? saved : card)) : [...kept, saved]
}

/** Undo one optimistic write: the scorecard as it was, or gone if the write created it. */
export function restoreScorecard(scorecards: readonly Scorecard[], id: string, previous: Scorecard | undefined): Scorecard[] {
  if (!previous) return scorecards.filter((card) => card.id !== id)
  return scorecards.map((card) => (card.id === id ? previous : card))
}
