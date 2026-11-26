import { describe, expect, it } from 'vitest'
import { daysIn, periodLabel, periodWindow } from './period'

describe('periodWindow', () => {
  it('uses the rolling-window rule for 7, 30, 60 and 90 days', () => {
    expect(periodWindow('30d', '2026-11-12', '2026-11-09')).toMatchObject({ start: '2026-10-11', end: '2026-11-09', endsAtData: true })
    expect(periodWindow('7d', '2026-11-12', null)).toMatchObject({ start: '2026-11-06', end: '2026-11-12', endsAtData: false })
    expect(periodWindow('60d', '2026-11-12', null)).toMatchObject({ start: '2026-09-14', end: '2026-11-12', previousEnd: '2026-09-13' })
  })

  it('makes Today a one-day window compared with yesterday, never pulled back', () => {
    expect(periodWindow('today', '2026-11-12', '2026-11-09')).toEqual({
      start: '2026-11-12', end: '2026-11-12', previousStart: '2026-11-11', previousEnd: '2026-11-11', endsAtData: false,
    })
  })

  it('compares a custom range with the same number of days just before', () => {
    expect(periodWindow('custom', '2026-11-12', null, { start: '2026-10-01', end: '2026-10-10' })).toEqual({
      start: '2026-10-01', end: '2026-10-10', previousStart: '2026-09-21', previousEnd: '2026-09-30', endsAtData: false,
    })
  })

  it('falls back to the last 30 days if custom has no range', () => {
    expect(periodWindow('custom', '2026-11-12', null)).toMatchObject({ start: '2026-10-14', end: '2026-11-12' })
  })
})

describe('daysIn', () => {
  it('counts both ends', () => {
    expect(daysIn({ start: '2026-11-12', end: '2026-11-12' })).toBe(1)
    expect(daysIn({ start: '2026-02-01', end: '2026-03-01' })).toBe(29)
  })
})

describe('periodLabel', () => {
  it('names each period and writes a custom range', () => {
    expect(periodLabel('today')).toBe('Today')
    expect(periodLabel('60d')).toBe('Last 60 days')
    expect(periodLabel('custom', { start: '2026-10-12', end: '2026-11-09' })).toBe('12 Oct – 9 Nov')
    expect(periodLabel('custom', { start: '2026-11-09', end: '2026-11-09' })).toBe('9 Nov')
  })
})
