import { describe, expect, it } from 'vitest'
import { cardBody, flagged, healthPill, opens, reasonOf } from './card-states'
import { pickDates, readoutFor } from './chart/LineChart'
import { weekReadout } from './chart/Bars'
import { DAILY, DAILY_BEFORE, metrics } from './__fixtures__/live'
import { formatExact, weekInfo } from './series'

const m = metrics()
const get = (id: string) => m.get(id)!

describe('one body state per card, in order (CR-18)', () => {
  it('loading beats everything, then removed, no data yet, couldn’t load, no data', () => {
    expect(cardBody({ loading: true, removed: true })).toBe('loading')
    expect(cardBody({ removed: true, couldntLoad: true })).toBe('removed')
    expect(cardBody({ firstSyncRunning: true, couldntLoad: true })).toBe('no-data-yet')
    expect(cardBody({ couldntLoad: true, unmeasured: true })).toBe('couldnt-load')
    expect(cardBody({ unmeasured: true, todayEmpty: true })).toBe('no-data')
    expect(cardBody({ todayEmpty: true })).toBe('today-empty')
    expect(cardBody({})).toBe('numbers')
  })
  it('only numbers (and Today’s dash) open the metric window', () => {
    expect(opens('numbers')).toBe(true)
    expect(opens('today-empty')).toBe(true)
    for (const b of ['loading', 'removed', 'no-data-yet', 'couldnt-load', 'no-data'] as const) expect(opens(b)).toBe(false)
  })
})

describe('health (CR-28 – CR-30)', () => {
  it('a scorecard target gives the pill; no target shows nothing; empty cards show no pill', () => {
    expect(healthPill(get('revenue').health, 'numbers')).toEqual({ text: 'Off target −12%', tone: 'bad', target: 'Target $55k' })
    expect(healthPill(get('refund_rate').health, 'numbers')?.text).toBe('On track')
    expect(healthPill(get('orders').health, 'numbers')).toBeNull()
    expect(healthPill(get('revenue').health, 'no-data')).toBeNull()
  })
  it('off target goes into Needs attention', () => {
    expect(flagged(get('revenue').health)).toBe(true)
    expect(flagged(get('refund_rate').health)).toBe(false)
    expect(reasonOf(get('revenue').health!)).toBe('Off target −12%')
  })
})

describe('the readout (CR-10 – CR-13)', () => {
  const before = { ...DAILY_BEFORE, periods: DAILY_BEFORE.periods.map((p) => ({ ...p, values: { revenue: 6000 } })) }
  const revenue = metrics({ dailyBefore: before }).get('revenue')!
  it('says the day, its exact value, the same day before and the change, coloured by what’s good', () => {
    const r = readoutFor(revenue, revenue.series, 5, true)
    expect(r.title).toBe('Thu 13 Nov')
    expect(r.rows[0]).toMatchObject({ label: '13 Nov', value: '$7,500' })
    expect(r.rows[1]).toMatchObject({ label: 'Previous period · 6 Nov', value: '$6,000' })
    expect(r.footer).toEqual({ text: '+25.0% vs previous period', tone: 'good' })
  })
  it('a sparkline’s readout has no change line; a day without data says so, never 0', () => {
    expect(readoutFor(revenue, revenue.series, 5, false).footer).toBeUndefined()
    const empty = metrics({ daily: { ...DAILY, periods: [] } }).get('revenue')!
    expect(readoutFor(empty, empty.series, 0, false).rows[0].value).toBe('No data yet')
  })
  it('exact values: whole dollars from $1,000, cents below', () => {
    expect(formatExact(6812.4, 'currency')).toBe('$6,812')
    expect(formatExact(154.5, 'currency')).toBe('$154.50')
    expect(formatExact(52, 'number')).toBe('52')
    expect(formatExact(1.4, 'percent')).toBe('1.40%')
  })
  it('weeks: a finished week against the one before, a week in progress so far', () => {
    const orders = get('orders')
    expect(weekInfo(orders.weekly[3])).toEqual({ title: 'Week of 3 Nov', range: 'Mon 3 – Sun 9 Nov' })
    expect(weekInfo(orders.weekly[4])).toEqual({ title: 'Week of 10 Nov (so far)', range: 'Mon 10 – Fri 14 Nov' })
    expect(weekReadout(orders, 3).footer).toEqual({ text: '+2.6% vs the week before', tone: 'good' })
    const now = weekReadout(orders, 4)
    expect(now.rows.map((x) => x.value)).toEqual(['84'])
    expect(now.footer).toBeUndefined()
  })
  it('dates under the chart: all seven when they fit, the ends and evenly between when not', () => {
    expect(pickDates(7, 1120)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(pickDates(7, 512)).toEqual([0, 2, 4, 6])
    const thirty = pickDates(30, 512)
    expect(thirty[0]).toBe(0)
    expect(thirty[thirty.length - 1]).toBe(29)
  })
})
