import { describe, expect, it } from 'vitest'

import { formatGap, formatOf, formatPeriodTarget, formatTarget, formatValue, fromInput, looksLikeRange, parseTarget, parseTargetAuto, spanLabel, toInput } from './present'

describe('formatting', () => {
  it('shows money compact, counts whole, ratios as percent and returns on spend as multiples', () => {
    expect(formatValue(98_210, formatOf(null, 'money', 'revenue'))).toBe('$98.2k')
    expect(formatValue(2417, formatOf(null, 'count', 'orders'))).toBe('2,417')
    expect(formatValue(0.034, formatOf(null, 'ratio', 'refund_rate'))).toBe('3.4%')
    expect(formatValue(3.2, formatOf(null, 'ratio', 'mer'))).toBe('3.2×')
    expect(formatValue(2.456, formatOf(null, 'ratio', 'platform_roas'))).toBe('2.46×')
    expect(formatValue(3.2, formatOf({ display: { format: 'multiple' } }, 'ratio', 'custom_ratio'))).toBe('3.2×')
    expect(formatValue(null, 'money')).toBe('—')
  })

  it('writes a target with its direction', () => {
    expect(formatTarget({ kind: 'value', value: 120_000 }, 'higher', 'money')).toBe('≥ $120k')
    expect(formatTarget({ kind: 'value', value: 0.04 }, 'lower', 'percent')).toBe('≤ 4.0%')
    expect(formatTarget({ kind: 'range', low: 4000, high: 6000 }, 'range', 'money')).toBe('$4k–$6k')
    expect(formatTarget(null, 'higher', 'money')).toBeNull()
    expect(formatPeriodTarget({ value: 100 }, 'higher', 'number')).toBe('≥ 100')
    expect(formatPeriodTarget({ low: 4000, high: 6000 }, 'range', 'money')).toBe('$4k–$6k')
  })

  it('shows the gap signed so negative is bad, and how long a span is', () => {
    expect(formatGap(-0.031)).toBe('−3%')
    expect(formatGap(0.06)).toBe('+6%')
    expect(formatGap(-0.001)).toBe('−<1%')
    expect(formatGap(null)).toBeNull()
    expect(spanLabel(0.5)).toBe('today so far')
    expect(spanLabel(30)).toBe('30 days')
    expect(spanLabel(6.5)).toBe('6.5 days')
  })
})

describe('typing a target', () => {
  it('reads numbers the way people say them', () => {
    expect(fromInput('4', 'percent')).toBeCloseTo(0.04)
    expect(fromInput('$120,000', 'money')).toBe(120_000)
    expect(fromInput('3x', 'multiple')).toBe(3)
    expect(fromInput('  ', 'money')).toBeNull()
    expect(fromInput('lots', 'money')).toBeNaN()
    expect(toInput(0.04, 'percent')).toBe('4')
    expect(toInput(null, 'money')).toBe('')
  })

  it('reads k and m, percent, multiples and ranges', () => {
    expect(parseTarget('120k', 'money', 'higher')).toEqual({ kind: 'value', value: 120_000 })
    expect(parseTarget('$1.2m', 'money', 'higher')).toEqual({ kind: 'value', value: 1_200_000 })
    expect(parseTarget('2.4M', 'money', 'higher')).toEqual({ kind: 'value', value: 2_400_000 })
    expect(parseTarget('1.5B', 'money', 'higher')).toEqual({ kind: 'value', value: 1_500_000_000 })
    expect(parseTarget('4%', 'percent', 'lower')).toEqual({ kind: 'value', value: 0.04 })
    expect(parseTarget('4k–6k', 'money', 'range')).toEqual({ kind: 'range', low: 4000, high: 6000 })
    expect(parseTarget('6000 - 4000', 'money', 'range')).toEqual({ kind: 'range', low: 4000, high: 6000 })
    expect(parseTarget('4k to 6k', 'money', 'range')).toEqual({ kind: 'range', low: 4000, high: 6000 })
    expect(parseTarget('5k', 'money', 'range')).toMatchObject({ kind: 'invalid' })
    expect(parseTarget('lots', 'money', 'higher')).toMatchObject({ kind: 'invalid', message: 'Enter a number, like 120k' })
    expect(parseTarget('  ', 'money', 'higher')).toEqual({ kind: 'none' })
  })

  it('recognises a range whatever the row’s direction, so typing one sets "stay in range"', () => {
    expect(looksLikeRange('4k–6k')).toBe(true)
    expect(looksLikeRange('-5')).toBe(false)
    expect(parseTargetAuto('4k-6k', 'money', 'higher')).toEqual({ kind: 'range', low: 4000, high: 6000 })
    expect(parseTargetAuto('120k', 'money', 'higher')).toEqual({ kind: 'value', value: 120_000 })
  })
})
