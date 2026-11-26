import { describe, expect, it } from 'vitest'

import type { Band, HistoryRule, Row, Target, TrendRule } from './model'
import {
  adverseTrend, compare, cutOf, judgeCell, judgeHistory, judgePace, judgeRow, resolveTarget, streakOf, targetInForce, worst,
  type RowSeries,
} from './status'
import { ALL_WEEKS, defaultRules, nextTargets, typedTarget } from './template'

const twoColours: Band = { kind: 'relative', amber: 0 }
const threeColours: Band = { kind: 'relative', amber: 0.05 }
const value = (v: number) => ({ kind: 'value' as const, value: v })

describe('against target', () => {
  it('two colours (the weekly default): on or past target is green, any miss is red', () => {
    expect(compare(100, value(100), 'higher', twoColours).verdict).toBe('green')
    expect(compare(99.9, value(100), 'higher', twoColours).verdict).toBe('red')
    expect(compare(0.04, value(0.04), 'lower', twoColours).verdict).toBe('green')
    expect(compare(0.0401, value(0.04), 'lower', twoColours).verdict).toBe('red')
  })

  it('three colours: a miss within the band is amber', () => {
    expect(compare(97, value(100), 'higher', threeColours).verdict).toBe('amber')
    expect(compare(95, value(100), 'higher', threeColours).verdict).toBe('amber')
    expect(compare(94.9, value(100), 'higher', threeColours).verdict).toBe('red')
    expect(compare(0.042, value(0.04), 'lower', threeColours).verdict).toBe('amber')
  })

  it('signs the gap so negative is bad, as a share of the target', () => {
    expect(compare(97, value(100), 'higher', twoColours)).toMatchObject({ gap: -3, gapPct: -0.03 })
    expect(compare(90, value(100), 'lower', twoColours).gapPct).toBeCloseTo(0.1)
  })

  it('range: green inside, amber within the band of the nearer edge, red beyond', () => {
    const budget = { kind: 'range' as const, low: 4000, high: 6000 }
    expect(compare(5000, budget, 'range', threeColours).verdict).toBe('green')
    expect(compare(6200, budget, 'range', threeColours).verdict).toBe('amber')
    expect(compare(3700, budget, 'range', threeColours).verdict).toBe('red')
    expect(compare(6100, budget, 'range', twoColours)).toMatchObject({ verdict: 'red', reference: { low: 4000, high: 6000 } })
  })

  it('lines: amber between the target and a red-flag line', () => {
    const lines: Band = { kind: 'lines', redBelow: 2.5 }
    expect(compare(3.1, value(3), 'higher', lines).verdict).toBe('green')
    expect(compare(2.7, value(3), 'higher', lines).verdict).toBe('amber')
    expect(compare(2.4, value(3), 'higher', lines).verdict).toBe('red')
  })

  it('an absolute band is in the metric’s units (points for rates)', () => {
    expect(compare(0.044, value(0.04), 'lower', { kind: 'absolute', amber: 0.005 }).verdict).toBe('amber')
  })

  it('handles a zero target without dividing by it', () => {
    expect(compare(0, value(0), 'lower', twoColours)).toMatchObject({ verdict: 'green', gapPct: null })
    expect(compare(3, value(0), 'lower', twoColours).verdict).toBe('red')
  })
})

function target(over: Partial<Target> & { effectiveFrom: string }): Target {
  return { id: over.effectiveFrom, kind: 'fixed', value: 100, window: 'period', origin: 'typed', setBy: '', setAt: '2026-11-01T00:00:00Z', ...over } as Target
}

describe('targets with start dates', () => {
  const targets = [target({ effectiveFrom: ALL_WEEKS, value: 100 }), target({ effectiveFrom: '2026-11-02', value: 130 })]

  it('judges each period by the target in force at its start', () => {
    expect((targetInForce(targets, '2026-10-26') as { value: number }).value).toBe(100)
    expect((targetInForce(targets, '2026-11-02') as { value: number }).value).toBe(130)
    expect((targetInForce(targets, '2026-11-09') as { value: number }).value).toBe(130)
    expect(targetInForce([target({ effectiveFrom: '2026-11-02' })], '2026-10-26')).toBeNull()
  })

  it('resolves fixed, range and schedule targets', () => {
    expect(resolveTarget(targets[0], '2026-10-26', 'higher')).toEqual({ kind: 'value', value: 100 })
    expect(resolveTarget(target({ effectiveFrom: ALL_WEEKS, value: undefined, low: 6, high: 4 }), '2026-10-26', 'range')).toEqual({ kind: 'range', low: 4, high: 6 })
    const schedule = { ...target({ effectiveFrom: ALL_WEEKS }), kind: 'schedule', schedule: { '2026-11-02': 9 } } as Target
    expect(resolveTarget(schedule, '2026-11-02', 'higher')).toEqual({ kind: 'value', value: 9 })
    expect(resolveTarget(schedule, '2026-11-09', 'higher')).toBeNull()
  })

  it('the first target colours every week; a later change applies from this week on unless told otherwise', () => {
    const monday = new Date('2026-11-09T10:00:00Z')
    const thursday = new Date('2026-11-12T10:00:00Z')
    const first = nextTargets([], typedTarget({ value: 100, effectiveFrom: '2026-11-02', now: monday }), 'from_now', '2026-11-02')
    expect(first.map(t => t.effectiveFrom)).toEqual([ALL_WEEKS])
    const changed = nextTargets(first, typedTarget({ value: 130, effectiveFrom: '2026-11-09', now: thursday }), 'from_now', '2026-11-09')
    expect(changed.map(t => [t.effectiveFrom, (t as { value: number }).value])).toEqual([[ALL_WEEKS, 100], ['2026-11-09', 130]])
    expect(nextTargets(changed, typedTarget({ value: 90, effectiveFrom: '2026-11-09', now: thursday }), 'all', '2026-11-09')).toHaveLength(1)
    expect(nextTargets(changed, null, 'from_now', '2026-11-09')).toEqual([])
  })

  it('a change on the day the target was set is a correction: it replaces that target where it stood', () => {
    const now = new Date('2026-11-12T10:00:00Z')
    const first = nextTargets([], typedTarget({ value: 100, effectiveFrom: '2026-11-09', now }), 'from_now', '2026-11-09')
    const fixed = nextTargets(first, typedTarget({ value: 1000, effectiveFrom: '2026-11-09', now: new Date('2026-11-12T10:05:00Z') }), 'from_now', '2026-11-09')
    expect(fixed.map(t => [t.effectiveFrom, (t as { value: number }).value])).toEqual([[ALL_WEEKS, 1000]])
  })
})

const history: HistoryRule = {
  id: 'history', type: 'history', effect: 'flag', enabled: true, method: 'pooled_change', compareTo: 'previous',
  periods: 4, noise: 0.05, alert: 0.10,
}

describe('against its own history', () => {
  const flat = [100, 100, 100, 100]

  it('a move under 5% is noise', () => {
    expect(judgeHistory([...flat, 96, 97, 96, 97], 'higher', history)).toMatchObject({ verdict: 'neutral', explain: 'steady' })
  })

  it('5–10% worse is amber, 10% or more red', () => {
    expect(judgeHistory([...flat, 95, 95, 95, 95], 'higher', history).verdict).toBe('amber')
    expect(judgeHistory([...flat, 92, 92, 92, 92], 'higher', history).verdict).toBe('amber')
    expect(judgeHistory([...flat, 90, 90, 90, 90], 'higher', history).verdict).toBe('red')
    expect(judgeHistory([...flat, 80, 85, 85, 90], 'higher', history)).toMatchObject({ verdict: 'red', explain: 'worse_than_history' })
  })

  it('notes a clear improvement without colouring it', () => {
    const check = judgeHistory([...flat, 120, 120, 120, 120], 'higher', history)
    expect(check).toMatchObject({ verdict: 'neutral', explain: 'better_than_history', recent: 120, earlier: 100 })
    expect(check.change).toBeCloseTo(0.2)
  })

  it('reads a rise as worse when lower is better', () => {
    expect(judgeHistory([0.03, 0.03, 0.03, 0.03, 0.04, 0.04, 0.04, 0.04], 'lower', history).verdict).toBe('red')
  })

  it('uses pooled totals when given, so rates are recomputed rather than averaged', () => {
    const check = judgeHistory([...flat, ...flat], 'higher', history, { recent: 360, earlier: 400 })
    expect(check).toMatchObject({ verdict: 'red', recent: 360, earlier: 400 })
  })

  it('leaves out empty weeks and needs three in four on each side', () => {
    expect(judgeHistory([100, null, 100, 100, 100, 100, null, 100], 'higher', history).verdict).toBe('neutral')
    expect(judgeHistory([100, null, null, 100, ...flat], 'higher', history).verdict).toBe('no_history')
    expect(judgeHistory(flat, 'higher', history).verdict).toBe('no_history')
  })

  it('cannot compare against nothing', () => {
    expect(judgeHistory([0, 0, 0, 0, 5, 5, 5, 5], 'higher', history).verdict).toBe('no_history')
    expect(judgeHistory([0, 0, 0, 0, 0, 0, 0, 0], 'higher', history).verdict).toBe('neutral')
  })
})

describe('duration and trend', () => {
  it('counts reds running, skipping grey weeks, broken by unavailable', () => {
    expect(streakOf(['red', 'green', 'red', 'red'], 'red')).toBe(2)
    expect(streakOf(['red', 'red', 'green'], 'red')).toBe(0)
    expect(streakOf(['red', 'too_small', 'red'], 'red')).toBe(2)
    expect(streakOf(['red', 'unavailable', 'red'], 'red')).toBe(1)
    expect(streakOf(['amber', 'red'], 'amber')).toBe(2)
  })

  it('flags three weeks the wrong way by 5% or more', () => {
    const trend: TrendRule = { id: 'trend', type: 'trend', effect: 'flag', enabled: true, periods: 3, minMove: 0.05, direction: 'adverse' }
    expect(adverseTrend([100, 98, 96, 94], 'higher', trend)).toBe(true)
    expect(adverseTrend([100, 99.5, 99, 98.5], 'higher', trend)).toBe(false)
    expect(adverseTrend([100, 98, 99, 94], 'higher', trend)).toBe(false)
  })

  it('orders red over amber over green', () => {
    expect(worst('green', 'amber')).toBe('amber')
    expect(worst('red', 'amber')).toBe('red')
  })
})

function row(over: Partial<Row> = {}): Row {
  return {
    id: 'revenue-1', source: { kind: 'metric', metric: 'revenue' }, direction: 'higher',
    targets: [target({ effectiveFrom: ALL_WEEKS, value: 100 })], rules: defaultRules(), order: 0,
    ...over,
  }
}

const context = { unavailable: null, additive: true }

function weeks(values: (number | null)[], current?: { value: number | null; completedDays: number }, samples?: (number | null)[]): RowSeries {
  const start = Date.UTC(2026, 8, 7)
  const iso = (i: number) => new Date(start + i * 7 * 86_400_000).toISOString().slice(0, 10)
  return {
    closed: values.map((value, i) => ({ start: iso(i), value, sample: samples?.[i] ?? null })),
    current: current ? { start: iso(values.length), value: current.value, sample: null, completedDays: current.completedDays, periodDays: 7 } : null,
  }
}

describe('judgeCell', () => {
  it('greys in order: unavailable, no data, too small, then no target', () => {
    const point = { start: '2026-11-02', value: 0.05, sample: 12 }
    const guarded = row({ minSample: { metric: 'orders', min: 30 }, direction: 'lower', targets: [target({ effectiveFrom: ALL_WEEKS, value: 0.04 })] })
    expect(judgeCell(guarded, point, { ...context, unavailable: 'needs Klaviyo' })).toMatchObject({ verdict: 'unavailable', reason: 'needs Klaviyo' })
    expect(judgeCell(guarded, { ...point, value: null }, context).verdict).toBe('no_data')
    expect(judgeCell(guarded, point, context)).toMatchObject({ verdict: 'too_small', reason: 'only 12 orders' })
    expect(judgeCell(row({ targets: [] }), point, context)).toMatchObject({ verdict: 'no_target', value: 0.05 })
    expect(judgeCell(guarded, { ...point, sample: 30 }, context).verdict).toBe('red')
  })
})

describe('judgePace (the running week)', () => {
  const current = (value: number | null, completedDays: number) => ({ start: '2026-11-09', value, sample: null, completedDays, periodDays: 7 })

  it('is never a filled colour: a total is paced against the target pro-rated by completed days', () => {
    const pace = judgePace(row(), current(40, 3), context)
    expect(pace).toMatchObject({ verdict: 'in_progress', flag: 'behind_pace' })
    expect(pace.expected).toEqual({ kind: 'value', value: 300 / 7 })
    expect(pace.gapPct).toBeLessThan(0)
    expect(judgePace(row(), current(50, 3), context).flag).toBe('ahead_of_pace')
  })

  it('judges a rate against the full target', () => {
    const rate = row({ direction: 'lower', targets: [target({ effectiveFrom: ALL_WEEKS, value: 0.04 })] })
    const pace = judgePace(rate, current(0.05, 2), { ...context, additive: false })
    expect(pace).toMatchObject({ expected: { kind: 'value', value: 0.04 }, flag: 'behind_pace', verdict: 'in_progress' })
  })

  it('is too early before a whole day has passed, and says nothing without a target', () => {
    expect(judgePace(row(), current(10, 0), context)).toMatchObject({ verdict: 'in_progress', flag: null })
    expect(judgePace(row({ targets: [] }), current(10, 3), context).flag).toBeNull()
  })

  it('colours the running week only when the pacing rule is a status rule (D-3 off)', () => {
    const rules = defaultRules().map(rule => (rule.type === 'pacing' ? { ...rule, effect: 'status' as const } : rule))
    expect(judgePace(row({ rules }), current(20, 3), context).verdict).toBe('red')
  })
})

describe('judgeRow', () => {
  it('colours each closed week and takes the row verdict from the latest', () => {
    const judgement = judgeRow(row(), weeks([110, 96, 80, 101]), context)
    expect(judgement.cells.map(c => c.verdict)).toEqual(['green', 'red', 'red', 'green'])
    expect(judgement.verdict).toBe('green')
  })

  it('judges past weeks by the target in force then', () => {
    const targets = [target({ effectiveFrom: ALL_WEEKS, value: 100 }), target({ effectiveFrom: '2026-09-21', value: 120 })]
    const judgement = judgeRow(row({ targets }), weeks([110, 110, 110]), context)
    expect(judgement.cells.map(c => c.verdict)).toEqual(['green', 'green', 'red'])
  })

  it('flags a red two weeks running and a fall against its own history, without changing the colour', () => {
    const judgement = judgeRow(row(), weeks([120, 120, 120, 120, 100, 100, 80, 80]), context)
    expect(judgement.verdict).toBe('red')
    expect(judgement.streak).toBe(2)
    expect(judgement.history?.verdict).toBe('red')
    expect(judgement.flags).toEqual(['worse_than_history', 'red_streak'])
  })

  it('lets history set the colour when a template makes it a status rule (D-1 off)', () => {
    const rules = defaultRules().map(rule => (rule.type === 'history' ? { ...rule, effect: 'status' as const } : rule))
    const judgement = judgeRow(row({ rules }), weeks([120, 120, 120, 120, 101, 101, 101, 101]), context)
    expect(judgement.cells.at(-1)?.verdict).toBe('green')
    expect(judgement.verdict).toBe('red')
  })

  it('says a row has no target rather than inventing one', () => {
    const judgement = judgeRow(row({ targets: [] }), weeks([110, 96]), context)
    expect(judgement.verdict).toBe('no_target')
    expect(judgement.cells.every(c => c.verdict === 'no_target' && c.value !== null)).toBe(true)
    expect(judgement.flags).toEqual([])
  })

  it('marks weeks before the store’s data as before_data, and later empty weeks as no data', () => {
    const judgement = judgeRow(row(), weeks([null, null, 110, null]), context)
    expect(judgement.cells.map(c => c.verdict)).toEqual(['before_data', 'before_data', 'green', 'no_data'])
    expect(judgement.verdict).toBe('no_data')
  })

  it('greys out a metric the store cannot measure, with the reason', () => {
    const judgement = judgeRow(row(), weeks([110, 96], { value: 5, completedDays: 3 }), { ...context, unavailable: 'no connection fills ad_insights' })
    expect(judgement).toMatchObject({ verdict: 'unavailable', reason: 'no connection fills ad_insights' })
    expect(judgement.current?.verdict).toBe('unavailable')
    expect(judgement.history).toBeNull()
  })

  it('adds the pace flag from the running week', () => {
    expect(judgeRow(row(), weeks([110], { value: 5, completedDays: 3 }), context).flags).toContain('behind_pace')
  })

  it('skips disabled rules', () => {
    const rules = defaultRules().map(rule => (rule.type === 'duration' ? { ...rule, enabled: false } : rule))
    expect(judgeRow(row({ rules }), weeks([80, 80, 80]), context).flags).not.toContain('red_streak')
  })
})

describe('the data cut (the source stopped syncing)', () => {
  // weeks() starts on 7 Sep 2026: 7, 14, 21, 28 Sep, 5 Oct...
  it('places the cut against a period', () => {
    expect(cutOf('2026-11-02', 7, null)).toBe('none')
    expect(cutOf('2026-11-02', 7, '2026-11-09')).toBe('none')
    expect(cutOf('2026-11-02', 7, '2026-11-08')).toBe('none')
    expect(cutOf('2026-11-02', 7, '2026-11-05')).toBe('partial')
    expect(cutOf('2026-11-09', 7, '2026-11-05')).toBe('past')
  })

  it('a week after the cut is grey "no data yet", never red, even when the API said 0', () => {
    const judgement = judgeRow(row(), weeks([110, 120, 0, 0]), { ...context, dataUntil: '2026-09-20' })
    expect(judgement.cells.map(c => c.verdict)).toEqual(['green', 'green', 'no_data', 'no_data'])
    expect(judgement.cells[3]).toMatchObject({ value: null, reason: 'no data yet', dataUntil: '2026-09-20' })
    expect(judgement).toMatchObject({ verdict: 'no_data', reason: 'no data yet', streak: 0 })
  })

  it('a week containing the cut is partial: its value so far, no colour', () => {
    const judgement = judgeRow(row(), weeks([110, 40]), { ...context, dataUntil: '2026-09-16' })
    expect(judgement.cells[1]).toMatchObject({ verdict: 'in_progress', value: 40, dataUntil: '2026-09-16' })
  })

  it('leaves cut weeks out of history instead of reading them as a fall', () => {
    const judgement = judgeRow(row(), weeks([100, 100, 100, 100, 100, 100, 100, 0]), { ...context, dataUntil: '2026-10-25' })
    expect(judgement.flags).not.toContain('worse_than_history')
    expect(judgement.history?.verdict).toBe('neutral')
  })

  it('the running week after the cut has no data yet; one the cut falls in is partial and not paced', () => {
    const current = (completedDays: number) => ({ start: '2026-11-09', value: 0, sample: null, completedDays, periodDays: 7 })
    expect(judgePace(row(), current(3), { ...context, dataUntil: '2026-11-05' })).toMatchObject({ verdict: 'no_data', value: null, flag: null, dataUntil: '2026-11-05' })
    expect(judgePace(row(), current(3), { ...context, dataUntil: '2026-11-09' })).toMatchObject({ verdict: 'in_progress', value: 0, flag: null, dataUntil: '2026-11-09' })
    // Synced yesterday: the data covers every finished day, so it's paced as usual.
    expect(judgePace(row(), current(3), { ...context, dataUntil: '2026-11-11' })).toMatchObject({ flag: 'behind_pace' })
    expect(judgePace(row(), current(3), { ...context, dataUntil: '2026-11-11' }).dataUntil).toBeUndefined()
  })
})
