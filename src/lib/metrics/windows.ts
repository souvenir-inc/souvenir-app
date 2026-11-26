// The time windows the library shows a metric over, counted in the store's timezone, since that's how the
// warehouse buckets days. Each window ends today and has a previous window of the same length to compare with.

import { formatStoreDate, rollingWindow, type RollingWindow } from '@/lib/warehouse/freshness'
import { daysIn, periodLabel, periodWindow, type DashboardPeriod, type DateRange } from '@/lib/warehouse/period'

export type WindowId = '7d' | '30d' | '90d'

export interface MetricWindow {
  id: WindowId
  days: number
  label: string
  /** "previous 30 days", for the change caption. */
  against: string
}

export const WINDOWS: readonly MetricWindow[] = [
  { id: '7d', days: 7, label: 'Last 7 days', against: 'previous 7 days' },
  { id: '30d', days: 30, label: 'Last 30 days', against: 'previous 30 days' },
  { id: '90d', days: 90, label: 'Last 90 days', against: 'previous 90 days' },
]

export const DEFAULT_WINDOW: WindowId = '30d'

export function windowOf(id: WindowId): MetricWindow {
  return WINDOWS.find(window => window.id === id) ?? WINDOWS[1]
}

export function isWindowId(value: unknown): value is WindowId {
  return WINDOWS.some(window => window.id === value)
}

export interface WindowRange {
  /** ISO dates, inclusive. */
  start: string
  end: string
}

/** Today's date on the store's clock, as YYYY-MM-DD. Falls back to UTC for an unknown zone. */
export function storeToday(timeZone: string | undefined, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  } catch {
    return now.toISOString().slice(0, 10)
  }
}

function shift(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/**
 * The day a window ends: today on the store's clock, or the day the data stops when a source's last sync is
 * older (the API can't tell "nothing happened" from "no data" after it, ask S15). The team's `rollingWindow`
 * does the arithmetic, so Metrics and Boards cut the same way.
 */
export function endOf(timeZone: string | undefined, until: string | null = null, now = new Date()): string {
  return rollingWindow(1, storeToday(timeZone, now), until).end
}

/** The window's days, ending today in the store's timezone (or on the day the data stops), via `rollingWindow`. */
export function rangeOf(id: WindowId, timeZone: string | undefined, now = new Date(), until: string | null = null): WindowRange {
  const window = rollingWindow(windowOf(id).days, storeToday(timeZone, now), until)
  return { start: window.start, end: window.end }
}

/** The same number of days just before rangeOf's. */
export function previousRangeOf(id: WindowId, timeZone: string | undefined, now = new Date(), until: string | null = null): WindowRange {
  const window = rollingWindow(windowOf(id).days, storeToday(timeZone, now), until)
  return { start: window.previousStart, end: window.previousEnd }
}

/** The last `count` weeks, Monday to today (or the day the data stops) on the store's clock, so buckets start whole. */
export function weeksRange(count: number, timeZone: string | undefined, now = new Date(), until: string | null = null): WindowRange {
  const end = endOf(timeZone, until, now)
  const weekday = (new Date(`${end}T00:00:00Z`).getUTCDay() + 6) % 7 // Monday is 0
  return { start: shift(end, -(weekday + 7 * (count - 1))), end }
}

/** "Last 30 days", or "30 days to 6 Nov" when the data stops before today (the team's label for a pulled-back window). */
export function windowLabel(id: WindowId, end: string, today: string): string {
  const window = windowOf(id)
  return end >= today ? window.label : `${window.days} days to ${formatStoreDate(end)}`
}

/** The header's period: which one, and the dates when it's a custom range. */
export interface PeriodChoice {
  period: DashboardPeriod
  custom: DateRange | null
}

const ROLLING: Partial<Record<DashboardPeriod, number>> = { '7d': 7, '30d': 30, '60d': 60, '90d': 90 }

/**
 * The dashboard's one period (picked in the header) as dates: rolling 7/30/60/90 days pulled back to the last
 * day with data, Today against yesterday, or a custom range against the same number of days before. See
 * `periodWindow`.
 */
export function spanOf(choice: PeriodChoice, timeZone: string | undefined, until: string | null, now = new Date()): RollingWindow {
  return periodWindow(choice.period, storeToday(timeZone, now), until, choice.custom)
}

/** "Last 30 days", "30 days to 6 Nov" when pulled back, "Today", or the custom dates. */
export function spanLabel(choice: PeriodChoice, span: Pick<RollingWindow, 'end' | 'endsAtData'>): string {
  const days = ROLLING[choice.period]
  if (days !== undefined && span.endsAtData) return `${days} days to ${formatStoreDate(span.end)}`
  return periodLabel(choice.period, choice.custom)
}

/** What a period is compared with: "previous 30 days", "yesterday". */
export function againstOf(choice: PeriodChoice): string {
  if (choice.period === 'today') return 'yesterday'
  const days = ROLLING[choice.period] ?? (choice.custom ? daysIn(choice.custom) : 30)
  return days === 1 ? 'day before' : `previous ${days} days`
}

/** The period inside a sentence: "today", "the last 30 days", "the 30 days to 6 Nov", "1 Oct – 10 Oct". */
export function periodPhrase(choice: PeriodChoice, span: Pick<RollingWindow, 'end' | 'endsAtData'>): string {
  if (choice.period === 'today') return 'today'
  const label = spanLabel(choice, span)
  if (choice.period === 'custom') return label
  return `the ${label.charAt(0).toLowerCase()}${label.slice(1)}`
}

/** What it's compared with, inside a sentence: "yesterday", "the previous 30 days". */
export function againstPhrase(choice: PeriodChoice): string {
  const against = againstOf(choice)
  return choice.period === 'today' ? against : `the ${against}`
}

/** The whole period comes after the source's last sync: there's nothing to show for it yet, whatever the API says. */
export function afterData(span: Pick<RollingWindow, 'start'>, until: string | null): boolean {
  return until !== null && span.start > until
}
