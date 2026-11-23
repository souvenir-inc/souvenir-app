import { describe, expect, it } from 'vitest'
import { cardBody, flagOf, healthPill, opens, reasonOf } from './card-states'
import { pickDates, readoutFor } from './chart/LineChart'
import { weekReadout } from './chart/Bars'
import { METRICS } from './mock-data'
import { formatExact, metricKind, parseFigure, sameDaysBefore, seriesFor, weekInfo } from './series'

describe('one body state per card, in order (CR-18)', () => {
  it('loading beats everything, then removed, locked, no data yet, couldn’t load, no data', () => {
    expect(cardBody({ loading: true, removed: true, locked: true })).toBe('loading')
    expect(cardBody({ removed: true, locked: true, couldntLoad: true })).toBe('removed')
    expect(cardBody({ locked: true, firstSyncRunning: true })).toBe('locked')
    expect(cardBody({ firstSyncRunning: true, couldntLoad: true })).toBe('no-data-yet')
    expect(cardBody({ couldntLoad: true, unmeasured: true })).toBe('couldnt-load')
    expect(cardBody({ unmeasured: true, todayEmpty: true })).toBe('no-data')
    expect(cardBody({ todayEmpty: true })).toBe('today-empty')
    expect(cardBody({})).toBe('numbers')
  })
  it('only numbers (and Today’s dash) open the metric window', () => {
    expect(opens('numbers')).toBe(true)
    expect(opens('today-empty')).toBe(true)
    for (const b of ['loading', 'removed', 'locked', 'no-data-yet', 'couldnt-load', 'no-data'] as const) expect(opens(b)).toBe(false)
  })
})

describe('health (CR-28 – CR-30)', () => {
  it('a target beats the benchmark; healthy shows nothing; empty cards show no pill', () => {
    expect(healthPill(METRICS.revenue.health, 'numbers')).toEqual({ text: 'Off target −12%', tone: 'bad', target: 'Target $55k' })
    expect(healthPill(METRICS.aov.health, 'numbers')?.text).toBe('On track')
    expect(healthPill(METRICS['discount-rate'].health, 'numbers')).toEqual({ text: 'Red flag', tone: 'bad' })
    expect(healthPill(METRICS.ctr.health, 'numbers')).toEqual({ text: 'Below healthy', tone: 'warn' })
    expect(healthPill(METRICS['refund-rate'].health, 'numbers')).toBeNull()
    expect(healthPill(METRICS.revenue.health, 'locked')).toBeNull()
  })
  it('feeds Needs attention: red for off target and red flag, amber outside the healthy range', () => {
    expect(flagOf(METRICS.revenue.health)).toBe('red')
    expect(flagOf(METRICS['discount-rate'].health)).toBe('red')
    expect(flagOf(METRICS.ctr.health)).toBe('amber')
    expect(flagOf(METRICS.cpc.health)).toBe('amber')
    expect(flagOf(METRICS.aov.health)).toBeNull()
    expect(reasonOf(METRICS.cpc.health!)).toBe('Above healthy')
  })
  it('the dummy data flags four metrics across the boards, as drawn (C-6)', () => {
    const flagged = Object.values(METRICS).filter((m) => flagOf(m.health))
    expect(flagged.map((m) => m.label).sort()).toEqual(['CTR', 'Cost per click', 'Discount rate', 'Revenue'])
  })
})

describe('days for the period (CR-3, CR-24)', () => {
  it('reads card figures', () => {
    expect(parseFigure('$48.2k')).toBe(48200)
    expect(parseFigure('1.1M')).toBe(1100000)
    expect(parseFigure('2.6x')).toBe(2.6)
    expect(metricKind(METRICS.revenue)).toBe('sum')
    expect(metricKind(METRICS.aov)).toBe('rate')
    expect(metricKind(METRICS.ctr)).toBe('rate')
  })
  it('a sum’s days add up to the card’s number; the last day is the mock today, Fri 14 Nov', () => {
    const s = seriesFor(METRICS.orders, '7d')
    expect(s.days).toHaveLength(7)
    expect(s.days.reduce((a, d) => a + (d.value ?? 0), 0)).toBe(558)
    expect(s.days[6].date.toDateString()).toBe('Fri Nov 14 2025')
    expect(s.previous[0].date.toDateString()).toBe('Sat Nov 01 2025')
    expect(s.comparable).toBe(true)
  })
  it('an app connected on 12 Nov: three days of data, nothing to compare with', () => {
    const s = seriesFor(METRICS['ad-spend'], '7d', { connectedOn: new Date(2025, 10, 12) })
    expect(s.daysWithData).toBe(3)
    expect(s.comparable).toBe(false)
  })
  it('30 and 90 days', () => {
    expect(seriesFor(METRICS.revenue, '30d').days).toHaveLength(30)
    expect(seriesFor(METRICS.revenue, '90d').days).toHaveLength(90)
  })
})

describe('the readout (CR-10 – CR-13)', () => {
  it('says the day, its exact value, the same day before and the change, coloured by what’s good', () => {
    const s = seriesFor(METRICS['new-customers'], '7d')
    const r = readoutFor(METRICS['new-customers'], s, 5, true)
    expect(r.title).toBe('Thu 13 Nov')
    expect(r.rows[0].label).toBe('13 Nov')
    expect(r.rows[1].label).toBe('Previous period · 6 Nov')
    expect(r.footer?.text).toMatch(/^[+−]\d+\.\d% vs previous period$/)
  })
  it('a sparkline’s readout has no change line; a target adds Met / Missed', () => {
    const s = seriesFor(METRICS['new-customers'], '7d')
    expect(readoutFor(METRICS['new-customers'], s, 5, false).footer).toBeUndefined()
    const t = readoutFor(METRICS['new-customers'], s, 5, true, 46)
    expect(t.rows[2].label).toBe('Target 46')
    expect(['Met', 'Missed']).toContain(t.rows[2].value)
  })
  it('exact values: whole dollars from $1,000, cents below', () => {
    expect(formatExact(6812.4, 'currency')).toBe('$6,812')
    expect(formatExact(154.5, 'currency')).toBe('$154.50')
    expect(formatExact(52, 'number')).toBe('52')
    expect(formatExact(1.4, 'percent')).toBe('1.40%')
  })
  it('weeks: a finished week, and a week in progress against the same days before', () => {
    expect(weekInfo(3, false)).toEqual({ title: 'Week of 3 Nov', range: 'Mon 3 – Sun 9 Nov' })
    expect(weekInfo(4, true)).toEqual({ title: 'Week of 10 Nov (so far)', range: 'Mon 10 – Fri 14 Nov', previousRange: 'Mon 3 – Fri 7 Nov' })
    expect(sameDaysBefore(160)).toBe(79)
    const r = weekReadout(METRICS.orders, 4)
    expect(r.rows.map((x) => x.value)).toEqual(['84', '79'])
    expect(r.footer?.text).toBe('+6.3% on the same days')
  })
  it('dates under the chart: all seven when they fit, the ends and evenly between when not', () => {
    expect(pickDates(7, 1120)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(pickDates(7, 512)).toEqual([0, 2, 4, 6])
    const thirty = pickDates(30, 512)
    expect(thirty[0]).toBe(0)
    expect(thirty[thirty.length - 1]).toBe(29)
  })
})
