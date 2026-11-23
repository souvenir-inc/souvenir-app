// A metric's days for the board's period, and the same days of the period before (05-cards-reading-
// rules.md CR-3, CR-10, CR-24). Pure, so the chart rules are testable without a browser.
//
// Stand-in until the back end sends real series: the days are shaped from the metric's trend and
// scaled so they add up to (sums) or sit around (rates) the number on the card.

import type { Metric, MetricChange } from './types'

/** The dummy data's today: Fri 14 Nov 2025 (the week in progress is Mon 10 – Fri 14 Nov). */
export const TODAY = new Date(2025, 10, 14)

const DAY = 86_400_000

export interface Day { date: Date; value: number | null }

export interface Series {
  days: Day[]
  /** The same days of the period before; null values where it has no data. */
  previous: Day[]
  /** Whether the period before has enough data to compare with (CR-24). */
  comparable: boolean
  /** Days in this period that have data. */
  daysWithData: number
}

/** Sums add up over the days; rates (averages, ratios, percentages) sit around the card's number. */
export function metricKind(m: Pick<Metric, 'format' | 'value'>): 'sum' | 'rate' {
  if (m.format === 'percent' || m.format === 'ratio') return 'rate'
  if (m.format === 'currency' && parseFigure(m.value) < 1000) return 'rate'
  return 'sum'
}

/** "$48.2k" → 48200, "1.1M" → 1100000, "2.6x" → 2.6, "13.1%" → 13.1. */
export function parseFigure(value: string): number {
  const m = value.replace(/[$,%x\s]/g, '').match(/^(-?[\d.]+)([kKmM]?)$/)
  if (!m) return NaN
  const n = parseFloat(m[1])
  return m[2].toLowerCase() === 'k' ? n * 1_000 : m[2].toLowerCase() === 'm' ? n * 1_000_000 : n
}

/** Days a period's charts cover. Today and Yesterday chart the 7 days ending then (our call). */
export function periodDays(periodId: string): number {
  return periodId === '30d' ? 30 : periodId === '90d' ? 90 : 7
}

/** The last day of the period: Yesterday ends the day before, every other period today. */
export function periodEnd(periodId: string): Date {
  return periodId === 'yesterday' ? new Date(TODAY.getTime() - DAY) : TODAY
}

/** `values` (any length) resampled to `n` points by straight lines, then scaled to 0 – 1. */
function shape(values: number[], n: number): number[] {
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? values.length - 1 : (i * (values.length - 1)) / (n - 1)
    const a = Math.floor(t)
    const b = Math.min(values.length - 1, a + 1)
    out.push(values[a] + (values[b] - values[a]) * (t - a))
  }
  const lo = Math.min(...out)
  const hi = Math.max(...out)
  return out.map((v) => (hi - lo ? (v - lo) / (hi - lo) : 0.5))
}

/** The period before's total from this period's and the change on the card. */
export function previousOf(now: number, change: MetricChange): number {
  const p = parseFloat(change.label) / 100
  if (!(p >= 0)) return now
  return change.direction === 'up' ? now / (1 + p) : now / (1 - p)
}

function spread(total: number, weights: number[], kind: 'sum' | 'rate', whole: boolean): number[] {
  if (kind === 'rate') return weights.map((w) => total * (0.93 + 0.14 * w))
  const ws = weights.map((w) => 0.7 + 0.6 * w)
  const sum = ws.reduce((a, b) => a + b, 0)
  const raw = ws.map((w) => (total * w) / sum)
  return whole ? raw.map(Math.round) : raw.map((v) => Math.round(v * 100) / 100)
}

export interface SeriesOptions {
  /** The app was connected on this day: no data before it (CR-24, the Ads board on `?cards=newmeta`). */
  connectedOn?: Date
}

export function seriesFor(metric: Metric, periodId: string, opts: SeriesOptions = {}): Series {
  const n = periodDays(periodId)
  const end = periodEnd(periodId)
  const kind = metricKind(metric)
  const total = parseFigure(metric.value)
  const whole = metric.format === 'number'
  // The card number is the dummy 7 days; a longer period keeps the same size of day (a sum over
  // 30 days is about 30 of those days), so per-day targets read the same on every period.
  const scale = kind === 'sum' ? n / 7 : 1
  const cur = spread(total * scale, shape(metric.trend.current, n), kind, whole)
  const prev = spread(previousOf(total, metric.change) * scale, shape(metric.trend.previous, n), kind, whole)
  const from = opts.connectedOn?.getTime() ?? -Infinity
  const day = (i: number, back: number) => new Date(end.getTime() - (n - 1 - i + back) * DAY)
  const days = cur.map((value, i) => {
    const date = day(i, 0)
    return { date, value: date.getTime() >= from ? value : null }
  })
  const previous = prev.map((value, i) => {
    const date = day(i, n)
    return { date, value: date.getTime() >= from ? value : null }
  })
  const daysWithData = days.filter((d) => d.value != null).length
  // "Mostly empty": under half the days of the period before have data.
  const comparable = previous.filter((d) => d.value != null).length >= n / 2
  return { days, previous, comparable, daysWithData }
}

// ── Words ────────────────────────────────────────────────────────────────────

const WEEKDAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short' })

/** "13 Nov". */
export const dayMonth = (d: Date) => `${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })}`

/** "Thu 13 Nov". */
export const weekdayDayMonth = (d: Date) => `${WEEKDAY.format(d)} ${dayMonth(d)}`

const whole = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const cents = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** A day's exact value for the readout: "52", "$6,812", "$154.50", "1.42%", "2.61x" (CR-10). */
export function formatExact(value: number, format: Metric['format']): string {
  switch (format) {
    case 'currency': return `$${Math.abs(value) >= 1000 ? whole.format(value) : cents.format(value)}`
    case 'percent': return `${cents.format(value)}%`
    case 'ratio': return `${cents.format(value)}x`
    default: return whole.format(value)
  }
}

/** Whether a rise is good news for this metric (drives green / red), from the card's change. */
export function upIsGood(change: MetricChange): boolean {
  return (change.direction === 'up') === (change.sentiment === 'positive')
}

/** "+15.6%" / "−3.2%" between two values. */
export function changeLabel(now: number, before: number): string {
  if (!before) return '—'
  const p = ((now - before) / Math.abs(before)) * 100
  return `${p >= 0 ? '+' : '−'}${Math.abs(p).toFixed(1)}%`
}

// ── Weeks (CR-11) ────────────────────────────────────────────────────────────

const WEEK_STARTS = [new Date(2025, 9, 13), new Date(2025, 9, 20), new Date(2025, 9, 27), new Date(2025, 10, 3), new Date(2025, 10, 10)]

export interface WeekInfo {
  /** "Week of 10 Nov (so far)". */
  title: string
  /** "Mon 10 – Fri 14 Nov". */
  range: string
  /** The same days of the week before, for a week in progress. */
  previousRange?: string
}

const rangeLabel = (a: Date, b: Date) => `${WEEKDAY.format(a)} ${a.getDate()} – ${weekdayDayMonth(b)}`

/** Words for week `i` of the five weekly bars. The last is in progress (Mon – today). */
export function weekInfo(i: number, inProgress: boolean): WeekInfo {
  const start = WEEK_STARTS[i] ?? WEEK_STARTS[WEEK_STARTS.length - 1]
  if (!inProgress) {
    return { title: `Week of ${dayMonth(start)}`, range: rangeLabel(start, new Date(start.getTime() + 6 * DAY)) }
  }
  const days = Math.round((TODAY.getTime() - start.getTime()) / DAY)
  const before = new Date(start.getTime() - 7 * DAY)
  return {
    title: `Week of ${dayMonth(start)} (so far)`,
    range: rangeLabel(start, TODAY),
    previousRange: rangeLabel(before, new Date(before.getTime() + days * DAY)),
  }
}

/** The week before's value over the same days as a week in progress (dummy: about half a week). */
export function sameDaysBefore(fullWeekBefore: number, daysSoFar = 5): number {
  return Math.round((fullWeekBefore * daysSoFar) / 7 * 0.69)
}
