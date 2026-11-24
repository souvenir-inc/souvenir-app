import { describe, expect, it } from 'vitest'
import { DAILY_BEFORE, META, SHOP, TODAY, metrics } from './live-fixtures'
import { Metrics, figure, weeksWindow } from './metrics'

describe('Metrics from the warehouse', () => {
  const m = metrics()

  it('reads the period number and formats it for the card', () => {
    expect(m.get('revenue')?.amount).toBe(48200)
    expect(m.get('revenue')?.value).toBe('$48.2k')
    expect(m.get('orders')?.value).toBe('558')
    expect(m.get('aov')?.value).toBe('$86.38')
  })

  it('shows a ratio unit as a percentage', () => {
    expect(m.get('refund_rate')?.format).toBe('percent')
    expect(m.get('refund_rate')?.amount).toBeCloseTo(4.32)
    expect(m.get('refund_rate')?.value).toBe('4.32%')
  })

  it('a card id with a copy number reads its metric', () => {
    expect(Metrics.base('revenue#2')).toBe('revenue')
    expect(m.get('revenue#2')?.label).toBe('Revenue')
    expect(m.get('nope')).toBeUndefined()
  })

  it('reads its apps from its category; blended and custom ones from what they are built from', () => {
    expect(m.get('revenue')?.apps).toEqual([SHOP])
    expect(m.get('ad_spend')?.apps).toEqual([META])
    expect(m.get('mer')?.apps).toEqual([SHOP, META])
    expect(m.get('net_after_ads')?.apps).toEqual([SHOP, META])
    expect(m.get('net_after_ads')?.custom).toBe(true)
    expect(m.get('shipping_cost')?.apps).toEqual([])
  })

  it('says why the store can’t measure a metric', () => {
    expect(m.get('shipping_cost')?.unmeasured).toMatch(/no connection in this store fills/)
    expect(m.get('shipping_cost')?.value).toBe('—')
  })

  it('a sum adds up over days; a ratio does not', () => {
    expect(m.get('revenue')?.sum).toBe(true)
    expect(m.get('net_after_ads')?.sum).toBe(true)
    expect(m.get('aov')?.sum).toBe(false)
  })

  it('days come from the daily measurement; a mostly empty comparison gives no change (CR-24)', () => {
    const s = m.get('revenue')!.series
    expect(s.days).toHaveLength(7)
    expect(s.days[0].date).toEqual(new Date(2025, 10, 8))
    expect(s.days[6].value).toBe(7000)
    expect(s.previous[0].value).toBeNull()
    expect(s.comparable).toBe(false)
    expect(m.get('revenue')?.change).toBeNull()
  })

  it('with a full comparison, the change is coloured by the scorecard’s direction', () => {
    const before = { ...DAILY_BEFORE, periods: DAILY_BEFORE.periods.map((p) => ({ ...p, values: { revenue: 6000, refund_rate: 0.045 } })) }
    const full = metrics({ dailyBefore: before })
    expect(full.get('revenue')?.series.comparable).toBe(true)
    expect(full.get('revenue')?.change).toEqual({ label: '12.4%', direction: 'up', sentiment: 'positive' })
    // A falling refund rate is good news: its scorecard says lower is better.
    expect(full.get('refund_rate')?.upIsGood).toBe(false)
    expect(full.get('refund_rate')?.change).toEqual({ label: '4.4%', direction: 'down', sentiment: 'positive' })
  })

  it('no comparison at all: no previous days and no change', () => {
    const none = metrics({ totalBefore: undefined, dailyBefore: undefined, chartBefore: null, compare: 'none' })
    expect(none.get('revenue')?.series.previous).toEqual([])
    expect(none.get('revenue')?.previous).toBeNull()
    expect(none.get('revenue')?.change).toBeNull()
  })

  it('health against the scorecard: off by how much, or on track within tolerance (CR-28)', () => {
    expect(m.get('revenue')?.health).toEqual({ verdict: 'off', off: '−12%', target: '$55k' })
    expect(m.get('refund_rate')?.health).toEqual({ verdict: 'on', off: undefined, target: '5.00%' })
    expect(m.get('orders')?.health).toBeNull()
  })

  it('five weeks ending with the week in progress (CR-11)', () => {
    const w = m.get('orders')!.weekly
    expect(w.map((x) => x.value)).toEqual([165, 152, 156, 160, 84])
    expect(w[0].start).toEqual(new Date(2025, 9, 13))
    expect(w[4]).toMatchObject({ inProgress: true, end: TODAY })
    expect(weeksWindow(TODAY).from).toEqual(new Date(2025, 9, 13))
  })

  it('before the numbers land every metric reads a dash', () => {
    const waiting = metrics({ total: undefined, totalBefore: undefined, daily: undefined, dailyBefore: undefined, weekly: undefined })
    expect(waiting.get('revenue')).toMatchObject({ amount: null, value: '—', change: null, unmeasured: null })
  })
})

describe('figures', () => {
  it('formats money, counts and percentages the way cards show them', () => {
    expect(figure(48200, 'currency')).toBe('$48.2k')
    expect(figure(86.4, 'currency')).toBe('$86.40')
    expect(figure(1_100_000, 'number')).toBe('1.1M')
    expect(figure(24800, 'number')).toBe('24.8k')
    expect(figure(13.12, 'percent')).toBe('13.1%')
    expect(figure(null, 'number')).toBe('—')
  })
})
