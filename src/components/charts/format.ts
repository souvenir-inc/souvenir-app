// How the chart kit writes numbers and dates. Built on Home's formatters so a figure in a chart reads the
// same as the figure on the Home strip.

import { formatCount, formatCurrency, formatCurrencyCompact, formatPercent } from '@/lib/home/format'

/**
 * How a series' values read. `money`, `count` and `ratio` mirror the warehouse catalog's units (a ratio
 * arrives as a fraction, 0.034 → 3.4%). `multiple` is a ratio read as "times", like ROAS 3.2x.
 */
export type ValueFormat = 'money' | 'count' | 'ratio' | 'multiple'

const LOCALE = 'en-US'

/** The full figure: "$12.4k", "1,234", "3.4%", "3.2x". `null` (no rows) reads as an em dash. */
export function formatChartValue(value: number | null | undefined, format: ValueFormat): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  switch (format) {
    case 'money': return formatCurrencyCompact(value)
    case 'count': return formatCount(value)
    // Two decimals under 10%, so a rate near a line it's judged against (CTR 1.45% vs a 1.5% benchmark) can't round
    // across it; the metric library writes rates the same way.
    case 'ratio': return formatPercent(value * 100, Math.abs(value) < 0.1 ? 2 : 1)
    case 'multiple': return `${new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(value)}x`
  }
}

/** The exact figure for tooltips and screen readers: "$12,431", "$385.27". */
export function formatChartValueExact(value: number | null | undefined, format: ValueFormat): string {
  if (format === 'money' && value !== null && value !== undefined && Number.isFinite(value)) return formatCurrency(value)
  return formatChartValue(value, format)
}

/** A short axis tick: "$12k", "1.2k", "3%", "3x". */
export function formatAxisValue(value: number, format: ValueFormat): string {
  if (!Number.isFinite(value)) return ''
  const compact = (n: number, style: 'currency' | 'decimal') => new Intl.NumberFormat(LOCALE, {
    style, currency: 'USD', notation: 'compact', maximumFractionDigits: 1,
  }).format(n).replace('K', 'k')
  switch (format) {
    case 'money': return compact(value, 'currency')
    case 'count': return compact(value, 'decimal')
    case 'ratio': return `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: Math.abs(value) < 0.1 ? 1 : 0 }).format(value * 100)}%`
    case 'multiple': return `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 }).format(value)}x`
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Dates read day first ("9 Nov"), the same as the dashboard's freshness lines (freshness.ts formatStoreDate).

/** "2026-11-04" → "4 Nov". Read as a calendar date, so no timezone can shift it a day. */
export function formatDay(iso: string): string {
  const [, month, day] = iso.split('-').map(Number)
  if (!month || !day) return iso
  return `${day} ${MONTHS[month - 1]}`
}

/** "2026-11-04" → "4 Nov 2026", for tooltips that compare across years. */
export function formatDayLong(iso: string): string {
  return `${formatDay(iso)} ${iso.slice(0, 4)}`
}

/** "4 – 10 Nov" within a month, "13 Oct – 11 Nov" across months, one day when both ends match. */
export function formatSpan(start: string, end: string): string {
  if (start === end) return formatDay(start)
  if (start.slice(0, 7) === end.slice(0, 7)) return `${Number(start.slice(8, 10))} – ${formatDay(end)}`
  return `${formatDay(start)} – ${formatDay(end)}`
}
