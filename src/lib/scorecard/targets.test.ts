import { describe, expect, it } from 'vitest'
import type { Scorecard } from '@/lib/api/warehouse'
import type { ScorecardRow } from './status'
import { findTarget, planTargetWrite, restoreScorecard, TARGETS_SCORECARD, withSaved, withScorecard } from './targets'

const row = (metric: string, target = 100, over: Partial<ScorecardRow> = {}): ScorecardRow =>
  ({ metric, target, direction: 'up', tolerance: 0.1, owner: null, note: '', ...over })
const card = (id: string, name: string, rows: ScorecardRow[]): Scorecard =>
  ({ id, name, rows, createdBy: 'auth0|maker', updatedAt: '2026-11-20T10:00:00Z' })
const newId = () => 'new-id'

describe('findTarget', () => {
  it('reads the first row for the metric across every scorecard, in server order', () => {
    const cards = [card('a', 'Weekly', [row('orders')]), card('b', TARGETS_SCORECARD, [row('revenue', 1)]), card('c', 'Other', [row('revenue', 2)])]
    expect(findTarget(cards, 'revenue')).toEqual({ scorecardId: 'b', row: row('revenue', 1) })
    expect(findTarget(cards, 'aov')).toBeNull()
  })
})

describe('planTargetWrite (read-modify-write)', () => {
  it('creates the Targets scorecard on the first save', () => {
    expect(planTargetWrite([], 'revenue', row('revenue'), newId)).toEqual({
      id: 'new-id', request: { name: TARGETS_SCORECARD, rows: [row('revenue')] }, created: true,
    })
  })

  it('adds a new target to the existing Targets scorecard and keeps every other row', () => {
    const cards = [card('w', 'Weekly', [row('orders')]), card('t', TARGETS_SCORECARD, [row('aov')])]
    expect(planTargetWrite(cards, 'revenue', row('revenue'), newId)).toEqual({
      id: 't', request: { name: TARGETS_SCORECARD, rows: [row('aov'), row('revenue')] }, created: false,
    })
  })

  it('edits a target where it lives, in place, even outside Targets', () => {
    const cards = [card('w', 'Weekly', [row('orders'), row('revenue', 5), row('aov')]), card('t', TARGETS_SCORECARD, [])]
    const write = planTargetWrite(cards, 'revenue', row('revenue', 9), newId)
    expect(write?.id).toBe('w')
    expect(write?.request).toEqual({ name: 'Weekly', rows: [row('orders'), row('revenue', 9), row('aov')] })
  })

  it('drops duplicate rows for the metric in the scorecard it edits', () => {
    const cards = [card('t', TARGETS_SCORECARD, [row('revenue', 1), row('orders'), row('revenue', 2)])]
    expect(planTargetWrite(cards, 'revenue', row('revenue', 3), newId)?.request.rows).toEqual([row('revenue', 3), row('orders')])
  })

  it('removing takes the row out and leaves the rest', () => {
    const cards = [card('t', TARGETS_SCORECARD, [row('revenue'), row('orders')])]
    expect(planTargetWrite(cards, 'revenue', null, newId)?.request.rows).toEqual([row('orders')])
  })

  it('removing a target that is not there does nothing', () => {
    expect(planTargetWrite([card('t', TARGETS_SCORECARD, [row('orders')])], 'revenue', null, newId)).toBeNull()
  })

  it('plans from the list it is given, so a row someone else added since is kept', () => {
    const cached = [card('t', TARGETS_SCORECARD, [row('aov')])]
    const fresh = [card('t', TARGETS_SCORECARD, [row('aov'), row('orders')])]
    expect(planTargetWrite(cached, 'revenue', row('revenue'), newId)?.request.rows).toEqual([row('aov'), row('revenue')])
    expect(planTargetWrite(fresh, 'revenue', row('revenue'), newId)?.request.rows).toEqual([row('aov'), row('orders'), row('revenue')])
  })
})

describe('optimistic cache helpers', () => {
  const now = '2026-11-27T09:00:00Z'

  it('withScorecard replaces by id and keeps the server fields', () => {
    const cards = [card('t', TARGETS_SCORECARD, [])]
    const next = withScorecard(cards, { id: 't', request: { name: TARGETS_SCORECARD, rows: [row('revenue')] } }, now)
    expect(next).toEqual([{ ...cards[0], rows: [row('revenue')] }])
  })

  it('withScorecard appends a created one with a stand-in time', () => {
    const next = withScorecard([], { id: 'n', request: { name: TARGETS_SCORECARD, rows: [row('revenue')] } }, now)
    expect(next).toEqual([{ id: 'n', name: TARGETS_SCORECARD, rows: [row('revenue')], createdBy: '', updatedAt: now }])
  })

  it('restoreScorecard puts back only the touched scorecard, or removes a created one', () => {
    const before = card('t', TARGETS_SCORECARD, [row('aov')])
    const other = card('w', 'Weekly', [row('orders')])
    const optimistic = [other, { ...before, rows: [row('aov'), row('revenue')] }, card('n', 'New', [])]
    expect(restoreScorecard(optimistic, 't', before)).toEqual([other, before, card('n', 'New', [])])
    expect(restoreScorecard(optimistic, 'n', undefined)).toEqual([other, { ...before, rows: [row('aov'), row('revenue')] }])
  })

  it('withSaved swaps in the server copy and drops a stand-in under another id', () => {
    const saved = card('server', TARGETS_SCORECARD, [row('revenue')])
    expect(withSaved([card('temp', TARGETS_SCORECARD, [row('revenue')])], saved, 'temp')).toEqual([saved])
    expect(withSaved([card('server', TARGETS_SCORECARD, [])], saved)).toEqual([saved])
  })
})
