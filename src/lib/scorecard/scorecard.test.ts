import { describe, expect, it } from 'vitest'

import {
  addDays, completedDays, daysBetween, elapsedFraction, isComplete, isoWeekOf, periodLength, storeClock, weekRangeLabel, weekStartOf,
  weeklyWindows,
} from './periods'
import { DECISIONS, MER_SLOT, MONDAY_STORE_REVIEW, isAdditive, metricOf, scorecardFromTemplate, slotMatches } from './template'

describe('periods', () => {
  it("reads today on the store's clock, not the browser's", () => {
    // 03:30 UTC on 12 Nov is still 11 Nov, 22:30 in New York.
    expect(storeClock('America/New_York', new Date('2026-11-12T03:30:00Z'))).toEqual({ date: '2026-11-11', secondsIntoDay: 22.5 * 3600 })
    expect(storeClock('Asia/Kolkata', new Date('2026-11-12T03:30:00Z')).date).toBe('2026-11-12')
  })

  it('falls back to UTC for an unknown zone', () => {
    expect(storeClock('Not/AZone', new Date('2026-11-12T03:30:00Z')).date).toBe('2026-11-12')
  })

  it('does date arithmetic on calendar days, weeks starting Monday', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02')
    expect(daysBetween('2026-11-02', '2026-11-09')).toBe(7)
    expect(weekStartOf('2026-11-12')).toBe('2026-11-09')
    expect(weekStartOf('2026-11-09')).toBe('2026-11-09')
    expect(weekStartOf('2026-11-15')).toBe('2026-11-09')
    expect(periodLength('2026-02-01', 'month')).toBe(28)
  })

  it('counts completed days with today excluded, and knows when a week is closed', () => {
    const thursday = { date: '2026-11-12', secondsIntoDay: 12 * 3600 }
    expect(completedDays('2026-11-09', 'week', thursday)).toBe(3)
    expect(completedDays('2026-11-09', 'week', { date: '2026-11-09', secondsIntoDay: 0 })).toBe(0)
    expect(isComplete('2026-11-02', 'week', thursday)).toBe(true)
    expect(isComplete('2026-11-09', 'week', thursday)).toBe(false)
    expect(elapsedFraction('2026-11-09', 'week', thursday)).toBeCloseTo(3.5 / 7)
  })

  it('asks for whole weeks: the strip up to yesterday, and the two history sides', () => {
    expect(weeklyWindows({ date: '2026-11-12', secondsIntoDay: 0 }, 12)).toEqual({
      weekly: { start: '2026-08-17', end: '2026-11-11' },
      recent: { start: '2026-10-12', end: '2026-11-08' },
      earlier: { start: '2026-09-14', end: '2026-10-11' },
      current: '2026-11-09',
    })
    // On a Monday nothing of the running week has finished, so the strip stops at Sunday.
    expect(weeklyWindows({ date: '2026-11-09', secondsIntoDay: 0 }, 12).weekly.end).toBe('2026-11-08')
  })

  it('labels a week by its dates', () => {
    expect(weekRangeLabel('2026-11-09')).toBe('9 – 15 Nov')
    expect(weekRangeLabel('2026-10-26')).toBe('26 Oct – 1 Nov')
  })

  it('numbers calendar weeks the ISO way', () => {
    expect(isoWeekOf('2026-11-02')).toBe(45)
    expect(isoWeekOf('2026-11-08')).toBe(45)
    expect(isoWeekOf('2026-11-09')).toBe(46)
    expect(isoWeekOf('2026-01-01')).toBe(1) // a Thursday
    expect(isoWeekOf('2027-01-01')).toBe(53) // a Friday: still 2026's last week
    expect(isoWeekOf('2024-12-30')).toBe(1) // Monday of 2025's first week
  })
})

describe('template', () => {
  const scorecard = scorecardFromTemplate(MONDAY_STORE_REVIEW, 'ws-1', new Date('2026-11-12T10:00:00Z'))

  it('starts the Monday store review with ten rows and no targets', () => {
    expect(scorecard.rows.map(metricOf)).toEqual([
      'revenue', 'orders', 'aov', 'new_customers', 'refund_rate', 'discount_rate', 'cancellation_rate', 'ad_spend', 'ctr', 'mer',
    ])
    expect(scorecard.rows.every(row => row.targets.length === 0)).toBe(true)
    expect(new Set(scorecard.rows.map(row => row.id)).size).toBe(10)
    expect(scorecard).toMatchObject({ method: 'weekly_scorecard', cadence: 'week', weekStart: 'monday', periodsShown: 6, scope: { kind: 'store', workspaceId: 'ws-1' } })
  })

  it('applies the checkpoint defaults: target sets the colour in two colours, the rest are flags', () => {
    const rules = scorecard.rows[0].rules
    expect(rules.find(r => r.type === 'target')).toMatchObject({ effect: 'status', band: { kind: 'relative', amber: DECISIONS.weeklyAmberBand } })
    expect(DECISIONS.weeklyAmberBand).toBe(0)
    expect(rules.filter(r => r.effect === 'status').map(r => r.type)).toEqual(['target'])
    expect(rules.find(r => r.type === 'duration')).toMatchObject({ periods: 2, atLeast: 'red', watches: 'target' })
    expect(rules.find(r => r.type === 'trend')?.enabled).toBe(false)
  })

  it('gives each row a sensible direction, sample guard and display', () => {
    const by = Object.fromEntries(scorecard.rows.map(row => [metricOf(row), row]))
    expect(by.refund_rate).toMatchObject({ direction: 'lower', minSample: { metric: 'orders', min: 30 } })
    expect(by.ctr.minSample).toEqual({ metric: 'impressions', min: 1000 })
    expect(by.revenue).toMatchObject({ direction: 'higher', minSample: undefined })
    expect(by.ad_spend.direction).toBe('range')
    expect(by.mer).toMatchObject({ slot: MER_SLOT, display: { format: 'multiple' } })
  })

  it('treats ratios and averages as levels, everything else as running totals', () => {
    expect(isAdditive('refund_rate', 'ratio')).toBe(false)
    expect(isAdditive('aov', 'money')).toBe(false)
    expect(isAdditive('mer', 'count')).toBe(false)
    expect(isAdditive('revenue', 'money')).toBe(true)
  })
})


describe('the MER slot', () => {
  it('matches MER however the chat named it, never a built-in like platform ROAS', () => {
    const custom = (name: string, label: string) => ({ name, label, category: 'custom' })
    expect(slotMatches(MER_SLOT, custom('revenue_per_ad_dollar', 'Revenue per dollar of ads'))).toBe(true)
    expect(slotMatches(MER_SLOT, custom('blended_mer', 'Blended MER'))).toBe(true)
    expect(slotMatches(MER_SLOT, { name: 'mer', label: 'MER', category: 'blended' })).toBe(true)
    expect(slotMatches(MER_SLOT, { name: 'platform_roas', label: 'Platform ROAS', category: 'ads' })).toBe(false)
    expect(slotMatches(MER_SLOT, custom('merch_sales', 'Merchandise sales'))).toBe(false)
  })
})
