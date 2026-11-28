import { describe, expect, it } from 'vitest'
import { formatMetricValue } from '../format'
import { figure } from '../live/metrics'
import { formatExact } from '../series'
import { scaleFor } from './LineChart'

describe('chart scale', () => {
  it('full chart from 0 with round ticks', () => {
    // Same as before this change for ordinary data: a step of 150 (480 / 4 rounded up), top at 600.
    expect(scaleFor([120, 480, 300], true)).toEqual({ min: 0, max: 600, ticks: [0, 150, 300, 450, 600] })
  })
  it('reaches below 0 when a day is negative, and keeps 0 as a tick', () => {
    const s = scaleFor([-50, 20, 10, 15], true)
    expect(s.min).toBeLessThanOrEqual(-50)
    expect(s.max).toBeGreaterThanOrEqual(20)
    expect(s.ticks).toContain(0)
  })
  it('all negative stays the right way up', () => {
    const s = scaleFor([-5, -5, -5], true)
    expect(s.min).toBeLessThan(s.max)
    expect(s.min).toBeLessThanOrEqual(-5)
  })
  it('all zero: one tick at 0, no fractional axis', () => {
    expect(scaleFor([0, 0, 0], true)).toEqual({ min: 0, max: 1, ticks: [0] })
  })
  it('a flat sparkline sits in the middle', () => {
    const s = scaleFor([100, 100, 100], false)
    expect((100 - s.min) / (s.max - s.min)).toBeCloseTo(0.5)
  })
  it('a sparkline with a negative day keeps it inside the box', () => {
    const s = scaleFor([-50, 20, 10, 15], false)
    expect(s.min).toBeLessThanOrEqual(-50)
    expect(s.max).toBeGreaterThanOrEqual(20)
  })
})

describe('negative money', () => {
  it('puts the minus before the $', () => {
    expect(figure(-1234, 'currency')).toBe('−$1.2k')
    expect(figure(-12.5, 'currency')).toBe('−$12.50')
    expect(formatExact(-1234, 'currency')).toBe('−$1,234')
    expect(formatMetricValue(-1500, 'currency')).toBe('−$1.5k')
    expect(figure(48200, 'currency')).toBe('$48.2k')
  })
})
