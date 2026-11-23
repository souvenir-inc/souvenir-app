import { describe, expect, it } from 'vitest'
import { METRICS } from './mock-data'
import { compareName, customId, customRange, periodName, rangeDays, rangeSummary } from './period'
import { periodDays, periodEnd, seriesFor } from './series'

// 11-dates-tabs-reference-rules.md
describe('custom ranges (DT-2 – DT-5)', () => {
  const id = customId(new Date(2025, 10, 9), new Date(2025, 9, 12))
  it('keeps the ends in order', () => {
    expect(id).toBe('custom:2025-10-12:2025-11-09')
    expect(customRange(id)?.from.getDate()).toBe(12)
    expect(customRange('7d')).toBeNull()
  })
  it('names the range and says how long it is', () => {
    expect(periodName(id)).toBe('12 Oct – 9 Nov')
    expect(periodName('60d')).toBe('Last 60 days')
    expect(rangeDays(new Date(2025, 9, 12), new Date(2025, 10, 9))).toBe(29)
    expect(rangeSummary(new Date(2025, 9, 12), new Date(2025, 10, 9), 'previous')).toBe('12 Oct – 9 Nov · 29 days, compared with the 29 days before')
    expect(rangeSummary(new Date(2025, 9, 12), new Date(2025, 10, 9), 'last-year')).toBe('12 Oct – 9 Nov · 29 days, compared with the same days last year')
  })
  it('drives the series: its days end on the range’s last day', () => {
    expect(periodDays(id)).toBe(29)
    expect(periodEnd(id).getDate()).toBe(9)
    const s = seriesFor(METRICS.revenue, id)
    expect(s.days).toHaveLength(29)
    expect(s.days[0].date.getDate()).toBe(12)
  })
})

describe('compared with last year (DT-7)', () => {
  it('the previous days are the same days a year before', () => {
    const s = seriesFor(METRICS.revenue, '7d', { compare: 'last-year' })
    expect(s.compare).toBe('last-year')
    expect(s.previous[6].date.getFullYear()).toBe(s.days[6].date.getFullYear() - 1)
    expect(s.previous[6].date.getDate()).toBe(s.days[6].date.getDate())
    expect(compareName('last-year')).toBe('Same period last year')
    expect(compareName('previous')).toBe('Previous period')
  })
})
