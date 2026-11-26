import { describe, expect, it } from 'vitest'

import { healthLabel, scalingSentence } from './present'
import {
  DEFAULT_TARGET_SETTINGS, deviceTargets, EMPTY_BOOK, legacyTargets, replaceTarget, weeklyContext, editablePeriod, healthOf, parseBook, periodForDays, targetForWindow,
  targetOf, targetsByPeriod, targetsKey, TargetSaveError, windowDays, withDirection, withTarget,
  type MetricTarget, type TargetBook,
} from './targets'

const now = new Date('2026-11-12T10:00:00Z')
const noon = { date: '2026-11-12', secondsIntoDay: 12 * 3600 }
const orders = (book: TargetBook) => targetOf(book, 'orders')!

describe('working out targets from the weekly one (the default)', () => {
  const book = withTarget(EMPTY_BOOK, 'orders', 'week', { kind: 'value', value: 100 }, now)

  it('typing 100 orders a week gives 433 a month, 1,300 a quarter and 5,200 a year', () => {
    const periods = targetsByPeriod(orders(book), book.settings, true)
    expect(periods.week).toEqual({ period: 'week', number: { value: 100 }, derived: false })
    expect((periods.month!.number as { value: number }).value).toBeCloseTo(433.33, 1)
    expect(periods.quarter).toMatchObject({ number: { value: 1300 }, derived: true, from: 'week' })
    expect(periods.year).toMatchObject({ number: { value: 5200 }, derived: true })
  })

  it('a rate keeps its value in every period', () => {
    const rate = withTarget(EMPTY_BOOK, 'refund_rate', 'week', { kind: 'value', value: 0.04 }, now)
    const periods = targetsByPeriod(targetOf(rate, 'refund_rate'), rate.settings, false)
    expect(periods.quarter).toMatchObject({ number: { value: 0.04 }, derived: true })
    expect(targetOf(rate, 'refund_rate')?.direction).toBe('lower')
  })

  it('works from another base when the setting says so', () => {
    const monthly = { ...EMPTY_BOOK, settings: { ...DEFAULT_TARGET_SETTINGS, base: 'month' as const } }
    const set = withTarget(monthly, 'revenue', 'month', { kind: 'value', value: 520_000 }, now)
    expect((targetsByPeriod(targetOf(set, 'revenue'), set.settings, true).week!.number as { value: number }).value).toBeCloseTo(120_000)
  })

  it('retyping the base replaces the target', () => {
    const again = withTarget(book, 'orders', 'week', { kind: 'value', value: 120 }, now)
    expect(orders(again).values).toEqual({ week: { value: 120 } })
    expect(withTarget(book, 'orders', 'week', { kind: 'none' }, now).targets).toEqual([])
  })
})

describe('setting each period yourself (working-out off)', () => {
  const manual = { ...EMPTY_BOOK, settings: { ...DEFAULT_TARGET_SETTINGS, derive: false } }
  const book = withTarget(withTarget(manual, 'orders', 'week', { kind: 'value', value: 100 }, now), 'orders', 'quarter', { kind: 'value', value: 1500 }, now)

  it('keeps each typed period and leaves the rest empty', () => {
    const periods = targetsByPeriod(orders(book), book.settings, true)
    expect(periods.week?.number).toEqual({ value: 100 })
    expect(periods.quarter).toEqual({ period: 'quarter', number: { value: 1500 }, derived: false })
    expect(periods.month).toBeNull()
    expect(periods.year).toBeNull()
  })

  it('judges a window with the closest period that has a target, scaled to its days', () => {
    // 90 days → the quarter's own 1,500, scaled from 91 to 90 days.
    expect((targetForWindow(orders(book), book.settings, 90, true)!.expected as { value: number }).value).toBeCloseTo(1500 * 90 / 91)
    // 30 days → no monthly target; the nearest set one is the week, scaled to 30 days.
    const thirty = targetForWindow(orders(book), book.settings, 30, true)!
    expect(thirty.basis.period).toBe('week')
    expect((thirty.expected as { value: number }).value).toBeCloseTo(100 * 30 / 7)
  })

  it('edits the period nearest the window on screen', () => {
    expect(editablePeriod(book.settings, 30)).toBe('month')
    expect(editablePeriod(DEFAULT_TARGET_SETTINGS, 30)).toBe('week')
  })

  it('clearing one period keeps the others', () => {
    const cleared = withTarget(book, 'orders', 'quarter', { kind: 'none' }, now)
    expect(orders(cleared).values).toEqual({ week: { value: 100 } })
  })
})

describe('periods for the header picker', () => {
  it('maps today and 7 days to the week, 30 and 60 to the month, 90 to the quarter', () => {
    expect(periodForDays(0.5)).toBe('week')
    expect(periodForDays(7)).toBe('week')
    expect(periodForDays(30)).toBe('month')
    expect(periodForDays(60)).toBe('month')
    expect(periodForDays(90)).toBe('quarter')
    expect(periodForDays(365)).toBe('year')
  })

  it('counts today to the hour on the store’s clock', () => {
    expect(windowDays({ start: '2026-11-12', end: '2026-11-12' }, noon)).toBe(0.5)
    expect(windowDays({ start: '2026-11-06', end: '2026-11-12' }, noon)).toBe(6.5)
    // A window that ends where the data stops is whole days.
    expect(windowDays({ start: '2026-10-11', end: '2026-11-09' }, noon)).toBe(30)
  })
})

describe('health for the period on screen', () => {
  const book = withTarget(EMPTY_BOOK, 'revenue', 'week', { kind: 'value', value: 30_000 }, now)
  const revenue = targetOf(book, 'revenue')
  const base = { metric: 'revenue', unit: 'money' as const, target: revenue, settings: book.settings, clock: noon }

  it('scales the weekly target to 30 days and judges the actual against it (two colours)', () => {
    const health = healthOf({ ...base, actual: 98_000, window: { start: '2026-10-11', end: '2026-11-09' } })
    expect(health).toMatchObject({ verdict: 'red', additive: true, days: 30 })
    expect(health.basis?.period).toBe('month')
    expect((health.expected as { value: number }).value).toBeCloseTo(30_000 * 30 / 7, 0)
    expect(healthLabel(health)).toBe('Off target −24%')
    expect(scalingSentence(revenue!, health, 'money')).toBe('Monthly target ≥ $130k (worked out from the weekly target), so ≥ $128.6k for these 30 days.')
  })

  it('judges today against a day’s share of the week, so far', () => {
    const health = healthOf({ ...base, actual: 2_500, window: { start: '2026-11-12', end: '2026-11-12' } })
    expect((health.expected as { value: number }).value).toBeCloseTo(30_000 * 0.5 / 7)
    expect(health.verdict).toBe('green')
    expect(healthLabel(health)).toBe('On track')
  })

  it('adds amber within the band when the setting has one', () => {
    const settings = { ...book.settings, amberBand: 0.05 }
    expect(healthOf({ ...base, settings, actual: 30_000 * 30 / 7 * 0.97, window: { start: '2026-10-11', end: '2026-11-09' } }).verdict).toBe('amber')
  })

  it('compares a rate as it is, with a sample guard', () => {
    const rate = withTarget(EMPTY_BOOK, 'refund_rate', 'week', { kind: 'value', value: 0.04 }, now)
    const input = { metric: 'refund_rate', unit: 'ratio' as const, target: targetOf(rate, 'refund_rate'), settings: rate.settings, clock: noon, window: { start: '2026-10-11', end: '2026-11-09' } }
    expect(healthOf({ ...input, actual: 0.05, sample: 400 })).toMatchObject({ verdict: 'red', expected: { kind: 'value', value: 0.04 } })
    expect(healthOf({ ...input, actual: 0.05, sample: 12 })).toMatchObject({ verdict: 'too_small', reason: 'only 12 orders' })
  })

  it('says why there is no colour, never a zero', () => {
    const window = { start: '2026-11-12', end: '2026-11-12' }
    expect(healthOf({ ...base, actual: 10, window, unavailable: 'needs Klaviyo' })).toMatchObject({ verdict: 'unavailable', reason: 'needs Klaviyo' })
    expect(healthOf({ ...base, actual: 0, window, dataUntil: '2026-11-09' }).verdict).toBe('no_data_yet')
    expect(healthOf({ ...base, actual: null, window }).verdict).toBe('no_data')
    expect(healthOf({ ...base, target: null, actual: 10, window }).verdict).toBe('no_target')
    expect(healthOf({ ...base, actual: 10, window, clock: { date: '2026-11-12', secondsIntoDay: 3600 } }).verdict).toBe('too_early')
  })

  it('judges a budget range and keeps direction changes', () => {
    const spend = withTarget(EMPTY_BOOK, 'ad_spend', 'week', { kind: 'range', low: 4000, high: 6000 }, now)
    expect(targetOf(spend, 'ad_spend')?.direction).toBe('range')
    const input = { metric: 'ad_spend', unit: 'money' as const, target: targetOf(spend, 'ad_spend'), settings: spend.settings, clock: noon, window: { start: '2026-11-02', end: '2026-11-08' } }
    expect(healthOf({ ...input, actual: 5000 }).verdict).toBe('green')
    expect(healthOf({ ...input, actual: 7000 }).verdict).toBe('red')
    expect(targetOf(withDirection(book, 'revenue', 'lower'), 'revenue')?.direction).toBe('lower')
  })
})

class MemoryStorage implements Storage {
  data = new Map<string, string>()
  failWrites = false
  get length() { return this.data.size }
  clear() { this.data.clear() }
  getItem(key: string) { return this.data.get(key) ?? null }
  key(index: number) { return [...this.data.keys()][index] ?? null }
  removeItem(key: string) { this.data.delete(key) }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new Error('QuotaExceededError')
    this.data.set(key, value)
  }
}

describe('target storage', () => {
  const book = withTarget(EMPTY_BOOK, 'orders', 'week', { kind: 'value', value: 100 }, now)

  it('saves and reads back per workspace, weekly with working-out on by default', async () => {
    const storage = new MemoryStorage()
    expect(await deviceTargets('ws-1', storage).read()).toEqual(EMPTY_BOOK)
    expect(EMPTY_BOOK.settings).toEqual({ base: 'week', derive: true, amberBand: 0.1 })
    await deviceTargets('ws-1', storage).write(book)
    expect(await deviceTargets('ws-1', storage).read()).toEqual(book)
    expect(await deviceTargets('ws-2', storage).read()).toEqual(EMPTY_BOOK)
  })

  it('drops a bad target, keeps the good ones, and survives corrupt storage', () => {
    expect(parseBook('{nope')).toEqual(EMPTY_BOOK)
    const raw = JSON.stringify({ settings: book.settings, targets: [...book.targets, { id: 'x', metric: 'y' }] })
    expect(parseBook(raw).targets.map((t: MetricTarget) => t.metric)).toEqual(['orders'])
  })

  it('fails a save with a message to show', async () => {
    const storage = new MemoryStorage()
    storage.failWrites = true
    await expect(deviceTargets('ws-1', storage).write(book)).rejects.toBeInstanceOf(TargetSaveError)
    await expect(deviceTargets('ws-1', null).write(book)).rejects.toThrow(/site data/)
    expect(targetsKey('ws-1')).toBe('souvenir.targets.v1.ws-1')
  })
})

describe('targets from the earlier weekly scorecard', () => {
  const legacy = {
    version: 2,
    scorecards: [{
      rows: [
        { source: { kind: 'metric', metric: 'revenue' }, direction: 'higher', targets: [
          { kind: 'fixed', value: 100, effectiveFrom: '0001-01-01', setAt: '2026-11-12T09:00:00Z' },
          { kind: 'fixed', value: 250, effectiveFrom: '2026-11-09', setAt: '2026-11-12T11:00:00Z' },
        ] },
        { source: { kind: 'metric', metric: 'refund_rate' }, direction: 'lower', targets: [{ kind: 'fixed', value: 0.04, setAt: '2026-11-12T10:00:00Z' }] },
        { source: { kind: 'metric', metric: 'ad_spend' }, direction: 'range', targets: [{ kind: 'fixed', low: 40, high: 60, setAt: '2026-11-12T10:00:00Z' }] },
        { source: { kind: 'metric', metric: 'orders' }, direction: 'higher', targets: [] },
      ],
    }],
    notes: [],
  }

  it('carries each row’s latest target over as a weekly target with its condition', () => {
    const storage = new MemoryStorage()
    storage.setItem('souvenir.scorecards.v2.ws-1', JSON.stringify(legacy))
    const carried = legacyTargets(storage, 'ws-1')
    expect(carried.map(t => [t.metric, t.direction, t.values.week])).toEqual([
      ['revenue', 'higher', { value: 250 }],
      ['refund_rate', 'lower', { value: 0.04 }],
      ['ad_spend', 'range', { low: 40, high: 60 }],
    ])
  })

  it('shows them on first read, and the saved book wins after that', async () => {
    const storage = new MemoryStorage()
    storage.setItem('souvenir.scorecards.v2.ws-1', JSON.stringify(legacy))
    const store = deviceTargets('ws-1', storage)
    const first = await store.read()
    expect(targetOf(first, 'revenue')?.values.week).toEqual({ value: 250 })
    await store.write({ ...first, targets: [] })
    expect((await store.read()).targets).toEqual([])
    expect(legacyTargets(new MemoryStorage(), 'ws-1')).toEqual([])
    expect(legacyTargets(null, 'ws-1')).toEqual([])
  })
})

describe('context badges', () => {
  const book = withTarget(EMPTY_BOOK, 'orders', 'week', { kind: 'value', value: 100 }, now)
  const target = targetOf(book, 'orders')

  it('counts weeks running that missed the weekly target, skipping weeks with no data', () => {
    // Two colours: every miss is red. With the default orange band (10%), 90 against 100 is orange, so it breaks the run.
    expect(weeklyContext([120, 110, 90, null, 80, 70], target, { ...book.settings, amberBand: 0 }, 'orders', 'count').streak).toBe(3)
    expect(weeklyContext([120, 110, 90, null, 80, 70], target, book.settings, 'orders', 'count').streak).toBe(2)
    expect(weeklyContext([90, 90, 120], target, book.settings, 'orders', 'count').streak).toBe(0)
    expect(weeklyContext([90, 90], null, book.settings, 'orders', 'count').streak).toBe(0)
  })

  it('says worse than usual when the last 4 weeks fell against the 4 before', () => {
    const context = weeklyContext([100, 100, 100, 100, 80, 80, 80, 80], target, book.settings, 'orders', 'count')
    expect(context.history).toMatchObject({ verdict: 'red' })
    expect(context.history?.change).toBeCloseTo(-0.2)
    expect(weeklyContext([100, 100, 100, 100], target, book.settings, 'orders', 'count').history).toBeNull()
  })

  it('reads a rise as worse for a lower-is-better metric', () => {
    const rate = withTarget(EMPTY_BOOK, 'refund_rate', 'week', { kind: 'value', value: 0.04 }, now)
    const context = weeklyContext([0.03, 0.03, 0.03, 0.03, 0.05, 0.05, 0.05, 0.05], targetOf(rate, 'refund_rate'), rate.settings, 'refund_rate', 'ratio')
    expect(context).toMatchObject({ streak: 4, history: { verdict: 'red' } })
  })
})

describe('replacing a whole target', () => {
  it('sets the condition and numbers at once, and no numbers removes it', () => {
    const book = replaceTarget(EMPTY_BOOK, 'orders', 'lower', { month: { value: 400 } }, now)
    expect(targetOf(book, 'orders')).toMatchObject({ direction: 'lower', values: { month: { value: 400 } } })
    expect(replaceTarget(book, 'orders', 'lower', {}, now).targets).toEqual([])
  })
})
