// Card time windows: what range a card reads, what it compares against, and at what grain.
// Every date is a calendar date (ISO, inclusive) in the store's timezone, because that's how the warehouse
// buckets. "Today" comes from todayIn(workspace.timezone), never from the browser's clock alone.
//
// Team rule (shared with the Metric library): rolling windows (7, 30, 90 days) end on the source's last day
// with data and stay whole ("30 days to 9 Nov"), via freshness.ts `rollingWindow`. Calendar windows (Today,
// month to date) keep their dates and read "No data yet" past the cut.

import type { Grain } from '@/lib/api/warehouse'
import { comparisonRange, rangeText } from '@/lib/warehouse/compare'
import { formatStoreDate, rollingWindow } from '@/lib/warehouse/freshness'
import { comparisonFor, type DashboardComparison } from '@/lib/warehouse/period'

/**
 * Every window a card can read. A card's own menu offers `WINDOW_OPTIONS`; `60d` and `custom` come only from
 * following the dashboard's period picker (src/lib/warehouse/period.ts).
 */
export type WindowId = 'today' | '7d' | '30d' | '60d' | '90d' | 'mtd' | 'custom'
/** What a window is compared with: the header's comparison (src/lib/warehouse/period.ts). */
export type ComparisonId = DashboardComparison

export interface DateRange {
  /** ISO date, inclusive. */
  start: string
  /** ISO date, inclusive. */
  end: string
}

export interface WindowOption {
  id: WindowId
  /** "Last 30 days" */
  label: string
  /** "30D", for the compact chip on a card. */
  short: string
}

export const WINDOW_OPTIONS: ReadonlyArray<WindowOption> = [
  { id: 'today', label: 'Today', short: 'Today' },
  { id: '7d', label: 'Last 7 days', short: '7D' },
  { id: '30d', label: 'Last 30 days', short: '30D' },
  { id: '90d', label: 'Last 90 days', short: '90D' },
  { id: 'mtd', label: 'Month to date', short: 'MTD' },
]

/** Daily points up to about a quarter, weekly beyond. */
export const DAILY_LIMIT_DAYS = 92

export interface CardWindow {
  id: WindowId
  label: string
  /** "30D", "60D", "Custom": the card's chip. */
  short: string
  /** The range the headline number covers. */
  current: DateRange
  /** The range it's compared against, or null for no comparison. */
  comparison: DateRange | null
  /** "Previous 30 days", "Yesterday", "Last year", "1 – 7 Oct"; null with no comparison. */
  comparisonLabel: string | null
  /**
   * The comparison has a different number of days (the 7-day average, a custom comparison of another length, a month
   * back across months of different lengths): change figures compare per-day averages.
   */
  perDay: boolean
  /** The range a chart draws. Same as `current`, except Today, which draws the last 14 days for context. */
  series: DateRange
  /** The comparison's chart range, lined up under `series`; null when there's nothing sensible to draw. */
  seriesComparison: DateRange | null
  grain: Grain
  /** Days in `current`. */
  days: number
  /**
   * What the card says about its source being behind: "30 days to 9 Nov" for a rolling window pulled back to
   * its last day of data, "Data until 9 Nov" for a calendar window cut short. Null when the data is current.
   */
  note: string | null
  /**
   * The last day the card's source has data for, when that falls inside what the card shows. The API returns
   * `null` both for "nothing happened" and "no data yet" (S15), so nothing after this day is measured or drawn.
   */
  cut: string | null
  /** The whole current range is after the cut: there's nothing to measure yet. */
  empty: boolean
  /** What the headline is measured over: `current` up to the cut; null when empty. */
  measured: DateRange | null
  /** The comparison over the same number of days as `measured`, from the comparison's start. */
  measuredComparison: DateRange | null
  /** The chart's series up to the cut; null when the cut is before the chart starts. */
  seriesMeasured: DateRange | null
  /** The comparison series over the same number of days as `seriesMeasured`. */
  seriesComparisonMeasured: DateRange | null
}

// ── Calendar arithmetic on ISO dates (UTC-noon free: we only ever work in whole days) ──────────────────

function toUtc(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

const DAY_MS = 86_400_000

export function addDays(iso: string, days: number): string {
  return fromUtc(toUtc(iso) + days * DAY_MS)
}

/** Inclusive count of days from start to end. */
export function daysBetween(start: string, end: string): number {
  return Math.round((toUtc(end) - toUtc(start)) / DAY_MS) + 1
}

function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate()
}

/** The same calendar date `years` away; Feb 29 lands on Feb 28 in a common year. */
export function shiftYears(iso: string, years: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const year = y + years
  const day = Math.min(d, daysInMonth(year, m))
  return `${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** The Monday on or before a date (ISO weeks, which is how Postgres truncates to a week). */
export function weekStartOf(iso: string): string {
  const weekday = new Date(toUtc(iso)).getUTCDay() // 0 = Sunday
  return addDays(iso, -((weekday + 6) % 7))
}

/** Every ISO date from start to end, inclusive. */
export function eachDay(range: DateRange): string[] {
  const n = daysBetween(range.start, range.end)
  return n <= 0 ? [] : Array.from({ length: n }, (_, i) => addDays(range.start, i))
}

/** Today's date in the store's timezone. Falls back to UTC if the zone is unknown. */
export function todayIn(timeZone: string | undefined, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  } catch {
    return now.toISOString().slice(0, 10)
  }
}

export function grainFor(days: number): Grain {
  return days <= DAILY_LIMIT_DAYS ? 'day' : 'week'
}

/** The window of the same length that ends the day before `range` starts. */
function previousOf(range: DateRange): DateRange {
  const length = daysBetween(range.start, range.end)
  const end = addDays(range.start, -1)
  return { start: addDays(end, -(length - 1)), end }
}

const ROLLING_DAYS: Partial<Record<WindowId, number>> = { '7d': 7, '30d': 30, '60d': 60, '90d': 90 }

/** Windows the dashboard's picker has that a card's own menu doesn't. */
const EXTRA_LABELS: Partial<Record<WindowId, { label: string; short: string }>> = {
  '60d': { label: 'Last 60 days', short: '60D' },
  custom: { label: 'Custom range', short: 'Custom' },
}

/** A calendar window's dates; rolling windows come from `rollingWindow` instead. A custom range is used as is. */
function calendarOf(id: WindowId, today: string, custom: DateRange | null): DateRange {
  if (id === 'mtd') return { start: `${today.slice(0, 8)}01`, end: today }
  if (id === 'custom') return custom ?? { start: addDays(today, -29), end: today }
  return { start: today, end: today }
}

function customLabel(range: DateRange): string {
  return range.start === range.end ? formatStoreDate(range.start) : `${formatStoreDate(range.start)} – ${formatStoreDate(range.end)}`
}

/** Month to date's previous period: the same days of last month, cut at its last day (Mar 1–31 → Feb 1–28). */
function previousMonthToDate(current: DateRange): DateRange {
  const [y, m] = current.start.split('-').map(Number)
  const prevYear = m === 1 ? y - 1 : y
  const prevMonth = m === 1 ? 12 : m - 1
  const start = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`
  const lastDay = daysInMonth(prevYear, prevMonth)
  const day = Math.min(Number(current.end.slice(8, 10)), lastDay)
  return { start, end: `${start.slice(0, 8)}${String(day).padStart(2, '0')}` }
}

const TODAY_CONTEXT_DAYS = 14

/** `range` up to `until`: the whole range, its head, or null when the range starts after it. */
export function clipTo(range: DateRange, until: string | null | undefined): DateRange | null {
  if (!until || until >= range.end) return range
  if (until < range.start) return null
  return { start: range.start, end: until }
}

/** The first `days` days of a range (all of it if it's shorter). */
export function firstDays(range: DateRange, days: number): DateRange {
  const n = Math.max(1, Math.min(days, daysBetween(range.start, range.end)))
  return { start: range.start, end: addDays(range.start, n - 1) }
}

/** Cuts a comparison to the length of the measured current range, so the two stay equal in length. */
function sameLength(comparison: DateRange | null, measured: DateRange | null, whole: DateRange): DateRange | null {
  if (!comparison || !measured) return null
  if (measured.end === whole.end) return comparison
  return firstDays(comparison, daysBetween(measured.start, measured.end))
}

function comparisonLabelOf(id: WindowId, comparison: ComparisonId, days: number, compared: DateRange, today: string): string {
  switch (comparison) {
    case 'previous': return id === 'today' ? 'Yesterday' : id === 'mtd' ? 'Last month' : `Previous ${days} days`
    case 'month': return 'Last month'
    case 'year': return 'Last year'
    case 'week': return 'Same day last week'
    case 'average': return '7-day average'
    default: return rangeText(compared, today)
  }
}

/**
 * The full window for a card: current range, comparison range and labels, chart ranges, grain, and what's
 * actually measured once the source's last data day (`until`, from freshness.ts `dataUntil`) cuts it. The comparison's
 * days come from `comparisonRange` (compare.ts), the same rule the header's menu shows.
 */
export function windowFor(
  id: WindowId, comparison: ComparisonId, today: string, until: string | null = null, custom: DateRange | null = null,
  compareCustom: DateRange | null = null,
): CardWindow {
  const known = WINDOW_OPTIONS.find(o => o.id === id) ?? (EXTRA_LABELS[id] ? { id, ...EXTRA_LABELS[id]! } : WINDOW_OPTIONS[2])
  const option = { ...known, label: known.id === 'custom' && custom ? customLabel(custom) : known.label }
  const rollingDays = ROLLING_DAYS[option.id]
  const rolling = rollingDays ? rollingWindow(rollingDays, today, until) : null
  const current = rolling ? { start: rolling.start, end: rolling.end } : calendarOf(option.id, today, custom)
  const days = daysBetween(current.start, current.end)
  const series = option.id === 'today' ? { start: addDays(today, -(TODAY_CONTEXT_DAYS - 1)), end: today } : current

  const asked = comparisonFor(option.id, comparison === 'custom' && !compareCustom ? 'previous' : comparison)
  const previous = option.id === 'today' ? { start: addDays(today, -1), end: addDays(today, -1) }
    : option.id === 'mtd' ? previousMonthToDate(current)
      : rolling ? { start: rolling.previousStart, end: rolling.previousEnd } : previousOf(current)
  const compared = comparisonRange(option.id, asked, current, previous, compareCustom)
  const comparisonLabel = compared ? comparisonLabelOf(option.id, asked, days, compared, today) : null
  // The chart's dashed line: the same shift applied to what the chart draws (Today draws 14 days for context, so its
  // yesterday and 7-day average have no line); a custom comparison only when it's as long as the chart.
  let seriesComparison: DateRange | null = null
  if (compared) {
    if (asked === 'year' || asked === 'week') seriesComparison = comparisonRange(option.id, asked, series, previous, null)
    else if (asked === 'previous' || asked === 'month') seriesComparison = option.id === 'today' ? null : compared
    else if (asked === 'custom') seriesComparison = daysBetween(compared.start, compared.end) === daysBetween(series.start, series.end) ? compared : null
  }
  const perDay = compared !== null && daysBetween(compared.start, compared.end) !== days

  const measured = clipTo(current, until)
  const seriesMeasured = clipTo(series, until)
  const cutsCurrent = until !== null && until < current.end
  const cutsSeries = until !== null && until < series.end
  const cut = cutsCurrent || cutsSeries ? until : null
  const pulledBack = rolling?.endsAtData ? `${days} days to ${formatStoreDate(rolling.end)}` : null
  return {
    id: option.id, label: pulledBack ?? option.label, short: option.short, current, comparison: compared, comparisonLabel, perDay,
    series, seriesComparison, grain: grainFor(daysBetween(series.start, series.end)), days,
    note: pulledBack ?? (cut ? `Data until ${formatStoreDate(cut)}` : null),
    cut,
    empty: measured === null,
    measured,
    // Per-day comparisons read the whole comparison; the others the same number of days as what's measured.
    measuredComparison: perDay ? (measured ? compared : null) : sameLength(compared, measured, current),
    seriesMeasured,
    seriesComparisonMeasured: sameLength(seriesComparison, seriesMeasured, series),
  }
}

/** Weekly bars read whole weeks: from the Monday on or before the window's start to its (cut) end. */
export function weeklyRangeFor(window: CardWindow): DateRange | null {
  return window.measured ? { start: weekStartOf(window.measured.start), end: window.measured.end } : null
}
