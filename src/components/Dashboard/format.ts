// The dashboard's one formatting module (35-locale-and-time.md SD-IN-01 – SD-IN-05): every number,
// money amount, percent, date, plural and list the board shows is formatted here with Intl, in the
// app locale, by formatters built once. Cards honour the viewer's number style (rounded or exact,
// Settings → Data preferences); readouts and exports are always exact.

import { APP_LOCALE } from '@/lib/format/locale'
import type { NumberStyle } from '@/lib/number-style'
import type { MetricFormat } from './types'

/**
 * The store's currency. The warehouse doesn't send one yet (fe-handbook/tickets/2026-11-27/
 * BE_DASHBOARD_V2_FEATURES.md D2-8: `WarehouseSummary.currency`); until it does, every amount is in
 * this one currency, named only here.
 */
export const STORE_CURRENCY = 'USD'

// ── Formatters, built once (SD-IN-03) ──────────────────────────────────────────

const number = (o: Intl.NumberFormatOptions) => new Intl.NumberFormat(APP_LOCALE, o)
// "$", not "US$": the symbol alone, as the designs show it.
const money = (o: Intl.NumberFormatOptions) => number({ style: 'currency', currency: STORE_CURRENCY, currencyDisplay: 'narrowSymbol', ...o })
// Percent values arrive as percents (4.32 means 4.32 %), so they're divided by 100 for Intl.
const percent = (o: Intl.NumberFormatOptions) => {
  const f = number({ style: 'percent', ...o })
  return { format: (v: number) => f.format(v / 100) }
}

// The designs write thousands with a small k and millions/billions with a capital M/B ("$48.2k",
// "1.1M"); en-GB’s compact forms are "1.1m" and "2.3bn", so the suffix is set here, once.
const SUFFIX = new Map([["m", "M"], ["bn", "B"]])
const compact = (f: { format: (v: number) => string }) => ({
  format: (v: number) => f.format(v).replace(/(m|bn)$/, (s: string) => SUFFIX.get(s) ?? s),
})

const NUM = {
  compact: compact(number({ notation: 'compact', maximumFractionDigits: 1 })),
  upTo2: number({ maximumFractionDigits: 2 }),
  whole: number({ maximumFractionDigits: 0 }),
  cents: number({ minimumFractionDigits: 2, maximumFractionDigits: 2 }),
}
const MONEY = {
  compact: compact(money({ notation: 'compact', maximumFractionDigits: 1 })),
  upTo2: money({ minimumFractionDigits: 0, maximumFractionDigits: 2 }),
  whole: money({ minimumFractionDigits: 0, maximumFractionDigits: 0 }),
  cents: money({ minimumFractionDigits: 2, maximumFractionDigits: 2 }),
}
const PCT = {
  compact: compact(percent({ notation: 'compact', maximumFractionDigits: 1 })),
  whole: percent({ maximumFractionDigits: 0 }),
  upTo2: percent({ maximumFractionDigits: 2 }),
  oneDecimal: percent({ minimumFractionDigits: 1, maximumFractionDigits: 1 }),
  cents: percent({ minimumFractionDigits: 2, maximumFractionDigits: 2 }),
}

/** Negative money reads "−$1,234" (a true minus, before the symbol), as the designs show it. */
const signed = (value: number, abs: string) => (value < 0 ? `−${abs}` : abs)

// ── Numbers ────────────────────────────────────────────────────────────────────

/** Axis ticks and chart labels: short ("$48.2k", "4.6", "12%"). */
export function formatMetricValue(value: number, format: MetricFormat): string {
  const big = Math.abs(value) >= 1000
  switch (format) {
    case 'currency': return signed(value, (big ? MONEY.compact : MONEY.upTo2).format(Math.abs(value)))
    case 'percent': return (big ? PCT.compact : PCT.upTo2).format(value)
    default: return (big ? NUM.compact : NUM.upTo2).format(value)
  }
}

/** A value read exactly (readouts, tables): "52", "$6,812", "$154.50", "1.42%", "3.09" (CR-10). */
export function formatExact(value: number, format: MetricFormat): string {
  switch (format) {
    case 'currency': { const a = Math.abs(value); return signed(value, (a >= 1000 ? MONEY.whole : MONEY.cents).format(a)) }
    case 'percent': return PCT.cents.format(value)
    case 'ratio': return NUM.cents.format(value)
    default: return NUM.whole.format(value)
  }
}

/**
 * A card's figure. Rounded: "$48.2k", "$86.40", "558", "24.8k", "4.32%", "3.09". Exact: every
 * digit, "$48,213.07", "24,812", "4.32%". "—" when there's no number.
 */
export function formatFigure(amount: number | null, format: MetricFormat, style: NumberStyle = 'rounded'): string {
  if (amount === null) return '—'
  if (style === 'exact') {
    switch (format) {
      case 'currency': return signed(amount, MONEY.cents.format(Math.abs(amount)))
      case 'percent': return PCT.cents.format(amount)
      case 'ratio': return NUM.cents.format(amount)
      default: return NUM.upTo2.format(amount)
    }
  }
  const big = Math.abs(amount) >= 1000
  switch (format) {
    case 'currency': return signed(amount, (big ? MONEY.compact : MONEY.cents).format(Math.abs(amount)))
    case 'percent': return (Math.abs(amount) < 10 ? PCT.cents : PCT.oneDecimal).format(amount)
    case 'ratio': return big ? NUM.compact.format(amount) : NUM.cents.format(amount)
    default: return (big ? NUM.compact : NUM.whole).format(amount)
  }
}

/** "+15.6%" / "−3.2%": a change in percent, signed. */
export function formatChangePercent(pct: number): string {
  return `${pct >= 0 ? '+' : '−'}${PCT.oneDecimal.format(Math.abs(pct))}`
}

/** A percent, whole: 12 → "12%" (the value is already times 100). */
export const formatPercent = (pct: number) => PCT.whole.format(pct)

/** A count as digits: "1,204". */
export const formatCount = (n: number) => NUM.whole.format(n)

/** A round axis maximum at or above `max`: 165 → 200, 4.6 → 5, 14100 → 20000. */
export function niceMax(max: number): number {
  if (!(max > 0)) return 1
  const exp = 10 ** Math.floor(Math.log10(max))
  const f = max / exp
  const step = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10
  return step * exp
}

// ── Dates (plain calendar days, SD-IN-08) ──────────────────────────────────────

const date = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(APP_LOCALE, o)
const DATE = {
  dayMonth: date({ day: 'numeric', month: 'short' }),
  dayMonthYear: date({ day: 'numeric', month: 'short', year: 'numeric' }),
  weekday: date({ weekday: 'short' }),
  monthYear: date({ month: 'long', year: 'numeric' }),
  long: date({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
  dayMonthLongYear: date({ day: 'numeric', month: 'long', year: 'numeric' }),
  clock: date({ hour: 'numeric', minute: '2-digit', hour12: true }),
}

/** "13 Nov"; "13 Nov 2025" with the year. */
export const formatDayMonth = (d: Date, year = false) => (year ? DATE.dayMonthYear : DATE.dayMonth).format(d)
/** "Thu". */
export const formatWeekday = (d: Date) => DATE.weekday.format(d)
/** "November 2025". */
export const formatMonthYear = (d: Date) => DATE.monthYear.format(d)
/** "Thursday 13 November 2025": a day in full, for screen readers. */
export const formatLongDate = (d: Date) => DATE.long.format(d)
/** "14 November 2025": a day with the month written out (export headers). */
export const formatFullDate = (d: Date) => DATE.dayMonthLongYear.format(d)
/** "9:42 am": a time of day in the viewer’s time zone. */
export const formatClock = (d: Date) => DATE.clock.format(d).replace(/s+/g, ' ').toLowerCase()

// ── Plurals and lists (SD-IN-04) ───────────────────────────────────────────────

const PLURAL = new Intl.PluralRules(APP_LOCALE)
const LIST = new Intl.ListFormat(APP_LOCALE, { style: 'long', type: 'conjunction' })

export interface PluralForms { one: string; other: string }

/** The word for a count: plural(1, { one: 'card', other: 'cards' }) → "card". */
export const plural = (count: number, forms: PluralForms) => (PLURAL.select(count) === 'one' ? forms.one : forms.other)

/** A count with its word: "1 card", "3 cards". */
export const countOf = (count: number, forms: PluralForms) => `${formatCount(count)} ${plural(count, forms)}`

/** Names in a sentence: "Shopify", "Shopify and Meta Ads", "Shopify, Meta Ads and Klaviyo". */
export const listNames = (names: string[]) => LIST.format(names)
