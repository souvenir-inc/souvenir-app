import { describe, expect, it } from 'vitest'
import { formatAxisValue, formatChartValue, formatChartValueExact, formatDay, formatSpan } from './format'
import { alignComparison, describeSeries, extentOf, meetsTarget, niceTicks, paddedDomain, sparkGeometry, targetStatus } from './scale'

describe('formatChartValue', () => {
  it('reads each format the way Home writes figures', () => {
    expect(formatChartValue(12431, 'money')).toBe('$12.4k')
    expect(formatChartValue(385.27, 'money')).toBe('$385.27')
    expect(formatChartValue(1234, 'count')).toBe('1,234')
    expect(formatChartValue(0.034, 'ratio')).toBe('3.40%')
    expect(formatChartValue(3.2, 'multiple')).toBe('3.2x')
  })

  it('gives a rate under 10% two decimals, so it can’t round across a line it’s judged against', () => {
    expect(formatChartValue(0.0145, 'ratio')).toBe('1.45%')
    expect(formatChartValue(0.125, 'ratio')).toBe('12.5%')
  })

  it('shows no data as a dash, never zero', () => {
    expect(formatChartValue(null, 'money')).toBe('—')
    expect(formatChartValue(undefined, 'count')).toBe('—')
    expect(formatChartValue(Number.NaN, 'ratio')).toBe('—')
  })

  it('gives the exact money figure for tooltips', () => {
    expect(formatChartValueExact(12431.4, 'money')).toBe('$12,431')
    expect(formatChartValueExact(0.034, 'ratio')).toBe('3.40%')
  })

  it('keeps axis ticks short', () => {
    expect(formatAxisValue(12000, 'money')).toBe('$12k')
    expect(formatAxisValue(1200, 'count')).toBe('1.2k')
    expect(formatAxisValue(0.25, 'ratio')).toBe('25%')
    expect(formatAxisValue(0.034, 'ratio')).toBe('3.4%')
    expect(formatAxisValue(3, 'multiple')).toBe('3x')
  })
})

describe('dates', () => {
  it('reads an ISO date as a calendar date, with no timezone shift', () => {
    expect(formatDay('2026-11-01')).toBe('1 Nov')
    expect(formatDay('2026-01-31')).toBe('31 Jan')
    expect(formatSpan('2026-11-04', '2026-11-10')).toBe('4 – 10 Nov')
    expect(formatSpan('2026-10-13', '2026-11-11')).toBe('13 Oct – 11 Nov')
    expect(formatSpan('2026-11-04', '2026-11-04')).toBe('4 Nov')
  })
})

describe('extentOf and paddedDomain', () => {
  it('skips nulls across every series', () => {
    expect(extentOf([3, null, 9], [1, undefined])).toEqual([1, 9])
    expect(extentOf([null, null])).toBeNull()
  })

  it('pads both ends, or pins zero for money and counts', () => {
    expect(paddedDomain([10, 20], { pad: 0.1 })).toEqual([9, 21])
    expect(paddedDomain([10, 20], { zero: true, pad: 0.1 })).toEqual([0, 22])
  })

  it('never pads below zero unless the data goes negative', () => {
    expect(paddedDomain([0, 486_000], { pad: 0.1 })).toEqual([0, 534_600])
    expect(paddedDomain([2_000, 486_000], { pad: 0.1 })[0]).toBe(0)
    expect(paddedDomain([0.03, 0.04], { pad: 0.1 })[0]).toBeCloseTo(0.029)
    expect(paddedDomain([0, 0])).toEqual([0, 1])
    expect(paddedDomain([-100, 100], { pad: 0.1 })).toEqual([-120, 120])
    expect(paddedDomain([-100, 100], { zero: true, pad: 0.1 })).toEqual([-120, 120])
  })

  it('gives a flat series a band so it draws mid-height', () => {
    const [lo, hi] = paddedDomain([5, 5])
    expect(lo).toBeLessThan(5)
    expect(hi).toBeGreaterThan(5)
    expect(paddedDomain(null)).toEqual([0, 1])
  })
})

describe('sparkGeometry', () => {
  it('breaks the line at a null instead of dropping to zero', () => {
    const g = sparkGeometry([1, 2, null, 3, 4], [0, 4], 100, 20, { inset: 0 })
    expect(g.lines).toHaveLength(2)
    expect(g.lines[0]).toBe('M0 15 L25 10')
    expect(g.lines[1]).toBe('M75 5 L100 0')
    expect(g.last).toEqual({ x: 100, y: 0 })
  })

  it('keeps a lone value as a dot', () => {
    const g = sparkGeometry([null, 2, null], [0, 4], 100, 20, { inset: 0 })
    expect(g.lines).toHaveLength(0)
    expect(g.dots).toEqual([{ x: 50, y: 10 }])
  })

  it('shares one x scale across series of different lengths', () => {
    const g = sparkGeometry([1, 1], [0, 2], 100, 20, { inset: 0, count: 3 })
    expect(g.lines[0]).toBe('M0 10 L50 10')
  })
})

describe('describeSeries', () => {
  it('says the range, the low and the high', () => {
    expect(describeSeries('Revenue', [100, null, 300, 200], 'money', 'days'))
      .toBe('Revenue: 4 days, from $100.00 to $200.00; low $100.00, high $300.00. 1 with no data.')
  })

  it('says when there is nothing to show', () => {
    expect(describeSeries('Orders', [null], 'count')).toBe('Orders: no data in this period.')
  })
})

describe('alignComparison', () => {
  it('lines the previous period up by position', () => {
    const points = alignComparison(
      [{ date: '2026-11-08', value: 5 }, { date: '2026-11-09', value: 6 }],
      [{ date: '2026-11-06', value: 4 }, { date: '2026-11-07', value: null }],
    )
    expect(points).toEqual([
      { date: '2026-11-08', value: 5, comparison: 4, comparisonDate: '2026-11-06' },
      { date: '2026-11-09', value: 6, comparison: null, comparisonDate: '2026-11-07' },
    ])
  })

  it('leaves the comparison off when there is none', () => {
    expect(alignComparison([{ date: '2026-11-08', value: 5 }])).toEqual([{ date: '2026-11-08', value: 5 }])
  })
})

describe('targetStatus', () => {
  it('reads higher-is-better and lower-is-better targets', () => {
    expect(targetStatus(120, 100, 'higher')).toBe('on')
    expect(targetStatus(97, 100, 'higher')).toBe('near')
    expect(targetStatus(80, 100, 'higher')).toBe('off')
    expect(targetStatus(0.03, 0.04, 'lower')).toBe('on')
    expect(targetStatus(0.041, 0.04, 'lower')).toBe('near')
    expect(targetStatus(0.06, 0.04, 'lower')).toBe('off')
  })
})

describe('niceTicks', () => {
  it('steps by round numbers with both ends on a step', () => {
    expect(niceTicks(0, 306.9)).toEqual([0, 100, 200, 300, 400])
    expect(niceTicks(0, 290)).toEqual([0, 100, 200, 300])
    expect(niceTicks(0, 1_000_000)).toEqual([0, 250_000, 500_000, 750_000, 1_000_000])
    expect(niceTicks(0.031, 0.048)).toEqual([0.03, 0.035, 0.04, 0.045, 0.05])
  })

  it('handles flat, reversed and empty ranges', () => {
    expect(niceTicks(0, 0)).toEqual([0, 0.25, 0.5, 0.75, 1])
    expect(niceTicks(10, 0)).toEqual(niceTicks(0, 10))
    expect(niceTicks(Number.NaN, 1)).toEqual([0, 1])
  })
})

describe('meetsTarget', () => {
  it('reads at least, at most and between', () => {
    expect(meetsTarget(120, { low: 100 })).toBe(true)
    expect(meetsTarget(80, { low: 100 })).toBe(false)
    expect(meetsTarget(0.03, { high: 0.04 })).toBe(true)
    expect(meetsTarget(0.05, { high: 0.04 })).toBe(false)
    expect(meetsTarget(5, { low: 4, high: 6 })).toBe(true)
    expect(meetsTarget(7, { low: 4, high: 6 })).toBe(false)
    expect(meetsTarget(null, { low: 1 })).toBeNull()
    expect(meetsTarget(5, null)).toBeNull()
  })
})
