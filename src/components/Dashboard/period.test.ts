import { describe, expect, it } from 'vitest'
import { chartWindow, comparedWindow, customId, customRange, periodName, periodWindow, rangeDays, rangeSummary } from './period'

// 11-dates-tabs-reference-rules.md
const TODAY = new Date(2025, 10, 14, 15, 30)
const day = (m: number, d: number, y = 2025) => new Date(y, m, d)

describe('the days a period covers (DT-1)', () => {
  it('Last N days end today, both ends counted', () => {
    expect(periodWindow('7d', TODAY)).toEqual({ from: day(10, 8), to: day(10, 14) })
    expect(rangeDays(...Object.values(periodWindow('30d', TODAY)) as [Date, Date])).toBe(30)
  })
  it('Today and Yesterday are one day; their charts draw the week ending then', () => {
    expect(periodWindow('today', TODAY)).toEqual({ from: day(10, 14), to: day(10, 14) })
    expect(periodWindow('yesterday', TODAY)).toEqual({ from: day(10, 13), to: day(10, 13) })
    expect(chartWindow('yesterday', TODAY)).toEqual({ from: day(10, 7), to: day(10, 13) })
    expect(chartWindow('7d', TODAY)).toEqual(periodWindow('7d', TODAY))
  })
})

describe('custom ranges (DT-2 – DT-5)', () => {
  const id = customId(day(10, 9), day(9, 12))
  it('keeps the ends in order', () => {
    expect(id).toBe('custom:2025-10-12:2025-11-09')
    expect(customRange(id)).toEqual({ from: day(9, 12), to: day(10, 9) })
  })
  it('names the range and says how long it is', () => {
    expect(periodName(id)).toBe('12 Oct – 9 Nov')
    expect(rangeSummary(day(9, 12), day(10, 9), 'previous')).toBe('12 Oct – 9 Nov · 29 days, compared with the 29 days before')
  })
  it('covers exactly its own days, whatever today is', () => {
    expect(periodWindow(id, TODAY)).toEqual({ from: day(9, 12), to: day(10, 9) })
  })
})

describe('what a period is compared with (DT-7)', () => {
  it('the same number of days just before', () => {
    expect(comparedWindow(periodWindow('7d', TODAY), 'previous')).toEqual({ from: day(10, 1), to: day(10, 7) })
  })
  it('the same days a year before', () => {
    expect(comparedWindow(periodWindow('7d', TODAY), 'last-year')).toEqual({ from: day(10, 8, 2024), to: day(10, 14, 2024) })
  })
  it('nothing, with no comparison', () => {
    expect(comparedWindow(periodWindow('7d', TODAY), 'none')).toBeNull()
  })
})

describe('validPeriod / validCompare (links and URLs)', () => {
  it('takes presets and real custom ranges in order', async () => {
    const { validPeriod, validCompare } = await import('./period')
    expect(validPeriod('7d')).toBe(true)
    expect(validPeriod('custom:2025-10-01:2025-10-31')).toBe(true)
    expect(validPeriod('custom:2025-10-31:2025-10-01')).toBe(false)
    expect(validPeriod('custom:2025-02-31:2025-03-01')).toBe(false)
    expect(validPeriod('custom:x:y')).toBe(false)
    expect(validPeriod('15d')).toBe(false)
    expect(validPeriod(null)).toBe(false)
    expect(validCompare('last-year')).toBe(true)
    expect(validCompare('nope')).toBe(false)
  })
})
