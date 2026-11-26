import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { EMPTY_BOOK, healthOf, targetOf, withTarget, type TargetBook } from '@/lib/scorecard/targets'
import { HealthPill, HealthSummary, useMetricHealth } from './Health'
import { BenchmarkPanel, barScale } from './BenchmarkPanel'
import { compactExample, HealthPanel, settingsSummary, TargetSettingsForm, workedExample } from './HealthPanel'

const now = new Date('2026-11-12T10:00:00Z')
let book: TargetBook = withTarget(EMPTY_BOOK, 'orders', 'week', { kind: 'value', value: 100 }, now)

vi.mock('@/lib/warehouse/queries', () => ({
  useWorkspace: () => ({ data: { id: 'ws-1', timezone: 'America/New_York' } }),
}))
vi.mock('@/lib/scorecard/hooks', () => ({
  useTargets: () => ({
    book, settings: book.settings, isLoading: false, location: 'device',
    targetOf: (metric: string) => targetOf(book, metric),
    setTarget: async () => book, setDirection: async () => book, setSettings: async () => book, saveTarget: async () => book,
  }),
  useBenchmarkEdits: () => ({ edits: {}, setBand: async () => {} }),
}))

const noon = { date: '2026-11-12', secondsIntoDay: 12 * 3600 }
const window30 = { start: '2026-10-11', end: '2026-11-09' }

describe('HealthPill', () => {
  it('reads "Off target" with the gap, "On track", or why there is no colour', () => {
    const target = targetOf(book, 'orders')
    const red = healthOf({ metric: 'orders', unit: 'count', actual: 300, target, settings: book.settings, window: window30, clock: noon })
    expect(renderToStaticMarkup(<HealthPill health={red} />)).toContain('Off target −30%')
    const green = healthOf({ metric: 'orders', unit: 'count', actual: 500, target, settings: book.settings, window: window30, clock: noon })
    expect(renderToStaticMarkup(<HealthPill health={green} />)).toContain('On track')
    const none = healthOf({ metric: 'revenue', unit: 'money', actual: 5, target: null, settings: book.settings, window: window30, clock: noon })
    expect(renderToStaticMarkup(<HealthPill health={none} onSetTarget={() => {}} />)).toMatch(/<button[^>]*>.*Set a target/)
  })
})

describe('target settings', () => {
  it('shows what working out does with a weekly base', () => {
    expect(workedExample(EMPTY_BOOK.settings)).toBe('100 orders a week → 433 a month · 1,300 a quarter · 5,200 a year')
    expect(workedExample({ ...EMPTY_BOOK.settings, base: 'month' })).toBe('100 orders a month → 23 a week · 300 a quarter · 1,200 a year')
    expect(settingsSummary(EMPTY_BOOK.settings)).toBe('Targets: per week')
    expect(settingsSummary({ ...EMPTY_BOOK.settings, derive: false })).toBe('Targets: set per period')
    expect(compactExample(EMPTY_BOOK.settings)).toBe('100 / wk → 433 / mo · 1,300 / qtr · 5,200 / yr')
    expect(compactExample({ ...EMPTY_BOOK.settings, base: 'month' })).toBe('100 / mo → 23 / wk · 300 / qtr · 1,200 / yr')
  })

  it('is three rows of a label and a control, with no paragraphs', () => {
    const saved = book
    book = { ...EMPTY_BOOK, settings: { ...EMPTY_BOOK.settings, derive: true, amberBand: 0.1 } }
    const three = renderToStaticMarkup(<TargetSettingsForm />)
    expect(three).toContain('Targets per')
    expect(three).toContain('Auto-calculate other periods')
    expect(three).toContain('100 / wk → 433 / mo · 1,300 / qtr · 5,200 / yr')
    expect(three).toContain('Green / red')
    expect(three).toContain('Green / orange / red')
    expect(three).toContain('orange within')
    expect(three).toContain('value="10"')
    expect(three).not.toMatch(/<p[ >]/)
    expect(three).not.toMatch(/device|back end|warehouse/i)
    book = { ...EMPTY_BOOK, settings: { ...EMPTY_BOOK.settings, derive: false, amberBand: 0 } }
    const two = renderToStaticMarkup(<TargetSettingsForm />)
    expect(two).not.toContain('orange within')
    expect(two).not.toContain('100 / wk')
    book = saved
  })
})

describe('HealthPanel (the one-line target form)', () => {
  it('reads like a sentence: condition, number, period, then what it works out to and where it stands', () => {
    const html = renderToStaticMarkup(<HealthPanel metric="orders" label="Orders" unit="count" actual={300} window={window30} />)
    expect(html).toMatch(/<option value="higher" selected="">≥ at least<\/option>/)
    expect(html).toContain('value="100"')
    expect(html).toMatch(/<option value="week" selected="">per week<\/option>/)
    // Always: what it comes to for the other periods.
    expect(html).toMatch(/<dt>Per month<\/dt><dd>433<\/dd>/)
    expect(html).toMatch(/<dt>Per quarter<\/dt><dd>1,300<\/dd>/)
    expect(html).toMatch(/<dt>Per year<\/dt><dd>5,200<\/dd>/)
    expect(html).toContain('Worked out from the weekly number above.')
    // Answer first: one sentence saying where it stands.
    expect(html).toMatch(/Off target: 300 against ≥ 4\d\d \(−30%\)/)
    expect(html).toContain('Remove target')
    expect(html).not.toMatch(/device|back end|warehouse/i)
  })

  it('starts empty with the metric’s natural condition when there is no target', () => {
    book = EMPTY_BOOK
    const html = renderToStaticMarkup(<HealthPanel metric="refund_rate" label="Refund rate" unit="ratio" actual={0.05} window={window30} />)
    expect(html).toMatch(/<option value="lower" selected="">≤ at most<\/option>/)
    // The placeholder is the metric's own value, not a made-up number.
    expect(html).toContain('placeholder="5"')
    expect(html).not.toContain('Remove target')
    expect(html).toContain('No target yet')
    // The per-period line is there before anything is typed.
    expect(html).toMatch(/<dt>Per month<\/dt><dd>—<\/dd>/)
  })

  it('a rate is the same every period, and "between" gives two fields', () => {
    book = withTarget(EMPTY_BOOK, 'refund_rate', 'week', { kind: 'value', value: 0.04 }, now)
    const rate = renderToStaticMarkup(<HealthPanel metric="refund_rate" label="Refund rate" unit="ratio" actual={0.05} window={window30} />)
    expect(rate).toContain('value="4"')
    expect(rate).toMatch(/<dt>Per year<\/dt><dd>4(\.0)?%<\/dd>/)
    expect(rate).toContain('Refund rate is an average, so the target is the same for every period.')
    book = withTarget(EMPTY_BOOK, 'ad_spend', 'week', { kind: 'range', low: 4000, high: 6000 }, now)
    const range = renderToStaticMarkup(<HealthPanel metric="ad_spend" label="Ad spend" unit="money" actual={5000} window={window30} />)
    expect(range).toMatch(/<option value="range" selected="">↔ between<\/option>/)
    expect(range).toContain('aria-label="Ad spend target, from"')
    expect(range).toContain('value="4000"')
    expect(range).toContain('value="6000"')
    expect(range).toContain('placeholder="to"')
    expect(range).toMatch(/<dt>Per month<\/dt><dd>\$17\.3k–\$26k<\/dd>/)
  })
})

describe('targetLineFor', () => {
  it('says which side of the line is good', () => {
    book = withTarget(withTarget(EMPTY_BOOK, 'refund_rate', 'week', { kind: 'value', value: 0.04 }, now), 'revenue', 'week', { kind: 'value', value: 70_000 }, now)
    let line: ReturnType<ReturnType<typeof useMetricHealth>['targetLineFor']> = null
    let revenue: typeof line = null
    function Probe() {
      const health = useMetricHealth()
      line = health.targetLineFor('refund_rate', 'ratio', 1)
      revenue = health.targetLineFor('revenue', 'money', 1)
      return null
    }
    renderToStaticMarkup(<Probe />)
    expect(line).toEqual({ kind: 'value', value: 0.04, direction: 'lower' })
    expect(revenue).toEqual({ kind: 'value', value: 10_000, direction: 'higher' })
  })
})

describe('HealthSummary', () => {
  const target = targetOf(withTarget(EMPTY_BOOK, 'orders', 'week', { kind: 'value', value: 100 }, now), 'orders')
  const settings = EMPTY_BOOK.settings
  const at = (actual: number | null) => healthOf({ metric: 'orders', unit: 'count', actual, target, settings, window: window30, clock: noon })

  it('leads with how many are off target', () => {
    const html = renderToStaticMarkup(<HealthSummary healths={[at(300), at(500), at(600), at(null)]} />)
    expect(html).toContain('1 of 4 off target')
    expect(html).toContain('2 on track')
    expect(html).toContain('1 can&#x27;t judge yet')
  })

  it('says when everything is on track, and nothing when nothing is tracked', () => {
    expect(renderToStaticMarkup(<HealthSummary healths={[at(500), at(600)]} />)).toContain('All 2 on track')
    expect(renderToStaticMarkup(<HealthSummary healths={[]} />)).toBe('')
  })
})

describe('roughInput', () => {
  it('rounds the current pace the way someone would type it', async () => {
    const { roughInput } = await import('./TargetEditor')
    expect(roughInput(1_734_219, 'money')).toBe('1.7M')
    expect(roughInput(2_310_000_000, 'money')).toBe('2.3B')
    expect(roughInput(564_000, 'money')).toBe('560k')
    expect(roughInput(47, 'number')).toBe('47')
    expect(roughInput(0.0438, 'percent')).toBe('4.4')
    expect(roughInput(3.21, 'multiple')).toBe('3.2')
    expect(roughInput(0, 'money')).toBe('')
  })
})

describe('BenchmarkPanel', () => {
  it('draws the healthy band as a bar with the store’s number on it', () => {
    const html = renderToStaticMarkup(<BenchmarkPanel metric="aov" label="Average order value" unit="money" actual={120} periodLabel="last 30 days" />)
    expect(html).toContain('Healthy for Shopify stores')
    expect(html).toContain('Yours $120')
    expect(html).toMatch(/Healthy (at least |at most )?\$/)
    expect(html).not.toMatch(/device|back end|warehouse/i)
  })

  it('says why there is no band for an absolute number, in one line', () => {
    const html = renderToStaticMarkup(<BenchmarkPanel metric="orders" label="Orders" unit="count" actual={1000} periodLabel="last 30 days" />)
    expect(html).toContain('size of the store')
    expect(html).not.toContain('Yours')
  })

  it('scales the bar to every edge and the value, never below zero for a value that can’t be', () => {
    const { min, max } = barScale({ healthy: { low: 3 }, redFlag: { below: 2.5 } }, 3.4)
    expect(min).toBeGreaterThanOrEqual(0)
    expect(min).toBeLessThan(2.5)
    expect(max).toBeGreaterThan(3.4)
  })
})
