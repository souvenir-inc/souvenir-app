import { describe, expect, it } from 'vitest'
import { unavailableSentence } from './CardEmpty'
import { flagged, healthPill, reasonOf } from './card-states'
import { countOf, formatExact, formatFigure, formatMetricValue, listNames, plural } from './format'
import { barsSummary, lineSummary } from './series'
import { drawnWeeks } from './chart/Bars'
import { metrics } from './__fixtures__/live'
import type { Health } from './types'

// format.ts: the dashboard's one formatting module (35-locale-and-time.md), and the copy built on it.

describe('card figures follow the number style (Settings → Data preferences)', () => {
  it('rounded: short money, counts and percents', () => {
    expect(formatFigure(48213.07, 'currency', 'rounded')).toBe('$48.2k')
    expect(formatFigure(86.4, 'currency', 'rounded')).toBe('$86.40')
    expect(formatFigure(-1234, 'currency', 'rounded')).toBe('−$1.2k')
    expect(formatFigure(24812, 'number', 'rounded')).toBe('24.8k')
    expect(formatFigure(558, 'number', 'rounded')).toBe('558')
    expect(formatFigure(4.32, 'percent', 'rounded')).toBe('4.32%')
    expect(formatFigure(12.34, 'percent', 'rounded')).toBe('12.3%')
    expect(formatFigure(3.09, 'ratio', 'rounded')).toBe('3.09')
  })
  it('exact: every digit, cents on money', () => {
    expect(formatFigure(48213.07, 'currency', 'exact')).toBe('$48,213.07')
    expect(formatFigure(-1234, 'currency', 'exact')).toBe('−$1,234.00')
    expect(formatFigure(24812, 'number', 'exact')).toBe('24,812')
    expect(formatFigure(12.34, 'percent', 'exact')).toBe('12.34%')
  })
  it('rounded is the default, and no number is a dash in either style', () => {
    expect(formatFigure(48213.07, 'currency')).toBe('$48.2k')
    expect(formatFigure(null, 'currency', 'exact')).toBe('—')
  })
  it('readouts and ticks keep their own forms', () => {
    expect(formatExact(6812.4, 'currency')).toBe('$6,812')
    expect(formatExact(154.5, 'currency')).toBe('$154.50')
    expect(formatExact(1.4, 'percent')).toBe('1.40%')
    expect(formatMetricValue(-1500, 'currency')).toBe('−$1.5k')
    expect(formatMetricValue(4.6, 'number')).toBe('4.6')
  })
})

describe('plurals and lists (SD-IN-04): one helper each', () => {
  it('picks the word for the count', () => {
    expect(plural(1, { one: 'card', other: 'cards' })).toBe('card')
    expect(plural(0, { one: 'card', other: 'cards' })).toBe('cards')
    expect(countOf(1, { one: 'day', other: 'days' })).toBe('1 day')
    expect(countOf(1204, { one: 'day', other: 'days' })).toBe('1,204 days')
  })
  it('joins names in a sentence', () => {
    expect(listNames([])).toBe('')
    expect(listNames(['Shopify'])).toBe('Shopify')
    expect(listNames(['Shopify', 'Meta Ads'])).toBe('Shopify and Meta Ads')
    expect(listNames(['Shopify', 'Meta Ads', 'Klaviyo'])).toBe('Shopify, Meta Ads and Klaviyo')
  })
})

describe('why a metric can’t be measured: our words, from the code (API-ER-06)', () => {
  it('maps each known code, and never shows the warehouse’s free text', () => {
    expect(unavailableSentence('no_connection')).toBe('No connected app records it.')
    expect(unavailableSentence('first_sync')).toBe('Its app is still on its first sync.')
    expect(unavailableSentence('feed_failed')).toBe('Its app’s last sync failed.')
  })
  it('an unknown code or none gets a general sentence', () => {
    expect(unavailableSentence('quota_exceeded')).toBe('This store can’t read it right now.')
    expect(unavailableSentence(null)).toBe('This store has nothing for this metric yet.')
  })
})

describe('health from the scorecard’s judgement (lib/scorecard/status.ts)', () => {
  const rule = { direction: 'up' as const, tolerance: 0.05 }
  const off: Health = { verdict: 'off', target: '$55k', judgement: { status: 'off_track', gap: -6600, gapShare: -0.12 }, rule }
  const risk: Health = { verdict: 'on', target: '$55k', judgement: { status: 'at_risk', gap: -1100, gapShare: -0.02 }, rule }
  it('off track is flagged and says why in words', () => {
    expect(flagged(off)).toBe(true)
    expect(reasonOf(off)).toBe('12% below the target, past the 5% tolerance')
    expect(healthPill(off, 'numbers')).toEqual({ text: 'Off track', tone: 'bad', target: 'Target $55k' })
  })
  it('at risk is not in Needs attention', () => {
    expect(flagged(risk)).toBe(false)
    expect(healthPill(risk, 'numbers')?.text).toBe('At risk')
  })
})

describe('chart summaries (A11Y-KB-01): what a chart shows, in words', () => {
  const m = metrics()
  it('a line: its days, lowest, highest and latest', () => {
    const revenue = m.get('revenue')!
    const text = lineSummary(revenue, revenue.series)
    expect(text).toMatch(/^Revenue by day, \d+ \w+ to \d+ \w+: lowest \$[\d,.]+ on \d+ \w+, highest \$[\d,.]+ on \d+ \w+, latest \$[\d,.]+ on \d+ \w+\./)
  })
  it('a line with nothing recorded says so', () => {
    const revenue = m.get('revenue')!
    expect(lineSummary(revenue, { ...revenue.series, days: revenue.series.days.map((d) => ({ ...d, value: null })) })).toMatch(/nothing recorded\.$/)
  })
  it('weekly bars: each drawn week, the one in progress “so far”', () => {
    const orders = m.get('orders')!
    const text = barsSummary(orders, drawnWeeks(orders))
    expect(text).toMatch(/^Orders by week, from the week of \d+ \w+: /)
    if (orders.weekly.some((w) => w.inProgress)) expect(text).toMatch(/so far this week\.$/)
  })
})
