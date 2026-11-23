import type { Metric } from './types'

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })
const decimal = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

/** Axis ticks and tooltip values for a metric's raw chart numbers. */
export function formatMetricValue(value: number, format: Metric['format']): string {
  // Lowercase "k" to match the card figures ("$48.2k"); millions stay "M".
  const n = Math.abs(value) >= 1000 ? compact.format(value).replace('K', 'k') : decimal.format(value)
  switch (format) {
    case 'currency': return `$${n}`
    case 'percent':  return `${n}%`
    case 'ratio':    return `${n}x`
    default:         return n
  }
}

/** A round axis maximum at or above `max`: 165 → 200, 4.6 → 5, 14100 → 20000. */
export function niceMax(max: number): number {
  if (!(max > 0)) return 1
  const exp = 10 ** Math.floor(Math.log10(max))
  const f = max / exp
  const step = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10
  return step * exp
}
