// The comparison rules (Header · Period filter, 19 Nov), checked against the dates on the Figma screens: today is
// Monday 16 Nov 2026.

import { describe, expect, it } from 'vitest'
import {
  comparisonButtonLabel, comparisonName, periodButtonLabel, rangeText, viewDates, viewSummary,
} from './compare'
import { comparisonFor, comparisonOptions, periodWindow, previousMonthToDate, type PeriodView } from './period'

const TODAY = '2026-11-16'
const view = (patch: Partial<PeriodView>): PeriodView => ({ period: '7d', custom: null, comparison: 'previous', compareCustom: null, ...patch })
const compared = (patch: Partial<PeriodView>) => {
  const dates = viewDates(view(patch), TODAY)
  return dates.comparison ? rangeText(dates.comparison, TODAY) : null
}

describe('what each comparison means', () => {
  it('compares a rolling period with the days before, the same dates a month back, or 52 weeks back', () => {
    expect(rangeText(viewDates(view({}), TODAY).current, TODAY)).toBe('10 – 16 Nov')
    expect(compared({})).toBe('3 – 9 Nov')
    expect(compared({ comparison: 'month' })).toBe('10 – 16 Oct')
    expect(compared({ comparison: 'year' })).toBe('11 – 17 Nov 2025')
    expect(compared({ comparison: 'none' })).toBeNull()
    expect(compared({ period: '30d' })).toBe('18 Sep – 17 Oct')
  })

  it('offers Today yesterday, the same day last week, the 7-day average and last year on the same weekday', () => {
    expect(compared({ period: 'today' })).toBe('15 Nov')
    expect(compared({ period: 'today', comparison: 'week' })).toBe('9 Nov')
    expect(compared({ period: 'today', comparison: 'average' })).toBe('9 – 15 Nov')
    expect(compared({ period: 'today', comparison: 'year' })).toBe('17 Nov 2025')
    expect(viewDates(view({ period: 'today', comparison: 'average' }), TODAY).perDay).toBe(true)
  })

  it('keeps calendar dates for Month to date and custom ranges', () => {
    expect(compared({ period: 'mtd' })).toBe('1 – 16 Oct')
    expect(compared({ period: 'mtd', comparison: 'year' })).toBe('1 – 16 Nov 2025')
    const october = { start: '2026-10-01', end: '2026-10-31' }
    expect(compared({ period: 'custom', custom: october })).toBe('31 Aug – 30 Sep')
    expect(compared({ period: 'custom', custom: october, comparison: 'year' })).toBe('1 – 31 Oct 2025')
  })

  it('compares with days of your own, as per-day averages when the lengths differ', () => {
    const own = viewDates(view({ comparison: 'custom', compareCustom: { start: '2026-10-01', end: '2026-10-07' } }), TODAY)
    expect(rangeText(own.comparison!, TODAY)).toBe('1 – 7 Oct')
    expect(own.perDay).toBe(false)
    expect(viewDates(view({ comparison: 'custom', compareCustom: { start: '2026-10-01', end: '2026-10-03' } }), TODAY).perDay).toBe(true)
  })

  it('ends rolling periods on the last synced day when every app is behind', () => {
    const behind = viewDates(view({}), TODAY, '2026-11-13')
    expect(rangeText(behind.current, TODAY)).toBe('7 – 13 Nov')
    expect(periodButtonLabel(view({}), behind, TODAY)).toBe('7 days to 13 Nov')
    expect(periodButtonLabel(view({ period: 'today' }), viewDates(view({ period: 'today' }), TODAY, '2026-11-13'), TODAY)).toBe('Today')
  })
})

describe('which comparisons a period offers', () => {
  it('lists them in menu order, No comparison last', () => {
    expect(comparisonOptions('7d')).toEqual(['previous', 'month', 'year', 'custom', 'none'])
    expect(comparisonOptions('today')).toEqual(['previous', 'week', 'average', 'year', 'custom', 'none'])
    expect(comparisonOptions('mtd')).toEqual(['previous', 'year', 'custom', 'none'])
  })

  it('falls back to the period before when the new period doesn’t offer the comparison', () => {
    expect(comparisonFor('30d', 'average')).toBe('previous')
    expect(comparisonFor('mtd', 'month')).toBe('previous')
    expect(comparisonFor('today', 'year')).toBe('year')
  })
})

describe('words', () => {
  it('names the period before by the period', () => {
    expect(comparisonName('today', 'previous')).toBe('Yesterday')
    expect(comparisonName('mtd', 'previous')).toBe('Last month')
    expect(comparisonName('30d', 'previous')).toBe('Previous period')
  })

  it('labels the comparison button, custom days by their dates and none as Off', () => {
    expect(comparisonButtonLabel(view({}), TODAY)).toBe('Previous period')
    expect(comparisonButtonLabel(view({ comparison: 'none' }), TODAY)).toBe('Off')
    expect(comparisonButtonLabel(view({ period: 'today', comparison: 'average' }), TODAY)).toBe('7-day average')
    expect(comparisonButtonLabel(view({ comparison: 'custom', compareCustom: { start: '2026-10-01', end: '2026-10-07' } }), TODAY)).toBe('1 – 7 Oct')
    expect(periodButtonLabel(view({ period: 'custom', custom: { start: '2026-10-01', end: '2026-10-31' } }), viewDates(view({}), TODAY), TODAY)).toBe('1 – 31 Oct')
  })

  it('writes the menu footer', () => {
    expect(viewSummary(view({}), viewDates(view({}), TODAY), TODAY)).toBe('10 – 16 Nov • 7 days, compared with 3 – 9 Nov')
    const own = view({ comparison: 'custom', compareCustom: { start: '2026-10-01', end: '2026-10-07' } })
    expect(viewSummary(own, viewDates(own, TODAY), TODAY)).toBe('10 – 16 Nov compared with 1 – 7 Oct • 7 days each')
    const short = view({ comparison: 'custom', compareCustom: { start: '2026-10-01', end: '2026-10-03' } })
    expect(viewSummary(short, viewDates(short, TODAY), TODAY)).toBe('10 – 16 Nov compared with 1 – 3 Oct • Per-day average')
    const off = view({ comparison: 'none' })
    expect(viewSummary(off, viewDates(off, TODAY), TODAY)).toBe('10 – 16 Nov • 7 days')
  })

  it('writes ranges across months and years', () => {
    expect(rangeText({ start: '2026-10-18', end: '2026-11-16' }, TODAY)).toBe('18 Oct – 16 Nov')
    expect(rangeText({ start: '2025-12-20', end: '2026-01-05' }, TODAY)).toBe('20 Dec 2025 – 5 Jan 2026')
    expect(rangeText({ start: '2025-11-17', end: '2025-11-17' }, TODAY)).toBe('17 Nov 2025')
  })
})

describe('Month to date', () => {
  it('runs from the 1st, against the same days of last month cut at its end', () => {
    expect(periodWindow('mtd', TODAY, null)).toEqual({
      start: '2026-11-01', end: TODAY, previousStart: '2026-10-01', previousEnd: '2026-10-16', endsAtData: false,
    })
    expect(previousMonthToDate({ start: '2026-03-01', end: '2026-03-31' })).toEqual({ start: '2026-02-01', end: '2026-02-28' })
    expect(previousMonthToDate({ start: '2027-01-01', end: '2027-01-09' })).toEqual({ start: '2026-12-01', end: '2026-12-09' })
  })
})
