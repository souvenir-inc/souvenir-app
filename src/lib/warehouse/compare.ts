// What a period is compared with, as dates and as words (Header · Period filter, 19 Nov). The header's menus, their
// footers and tooltips, and every board card read these, so the days a card compares are the days the menu showed.
//
// - The period before: the same number of days just before; Yesterday on Today; on Month to date, the same days of last
//   month.
// - Last month: the same dates a month back. Last year: 52 weeks back so weekdays match, except Month to date and custom
//   ranges, which keep calendar dates.
// - Today only: the same weekday last week, and the 7 days before as a per-day average.
// - When the two differ in length, change figures compare per-day averages (`perDay`).

import {
  comparisonFor, daysIn, periodLabel, periodWindow, type DashboardComparison, type DashboardPeriod, type DateRange,
  type PeriodView,
} from './period'

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

function shiftMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const index = y * 12 + (m - 1) + months
  const year = Math.floor(index / 12)
  const month = (index % 12) + 1
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${year}-${String(month).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`
}

const shiftRange = (range: DateRange, by: (iso: string) => string): DateRange => ({ start: by(range.start), end: by(range.end) })

/** The days a view covers and what they're compared with. */
export interface ViewDates {
  current: DateRange
  /** Null with no comparison. */
  comparison: DateRange | null
  /** The comparison has a different number of days: change figures compare per-day averages. */
  perDay: boolean
  /** A rolling period pulled back to the last synced day ("7 days to 13 Nov"). */
  endsAtData: boolean
}

/**
 * The comparison's days for a period's `current` days. `previous` is the period's own "before" (from `periodWindow`, so
 * a rolling window pulled back to its data compares with the days before that).
 */
export function comparisonRange(
  period: DashboardPeriod, comparison: DashboardComparison, current: DateRange, previous: DateRange,
  compareCustom: DateRange | null,
): DateRange | null {
  switch (comparisonFor(period, comparison)) {
    case 'none': return null
    case 'previous': return previous
    case 'month': return shiftRange(current, iso => shiftMonths(iso, -1))
    case 'year':
      return period === 'mtd' || period === 'custom'
        ? shiftRange(current, iso => shiftMonths(iso, -12))
        : shiftRange(current, iso => addDays(iso, -364))
    case 'week': return shiftRange(current, iso => addDays(iso, -7))
    case 'average': return { start: addDays(current.start, -7), end: addDays(current.start, -1) }
    case 'custom': return compareCustom ?? previous
  }
}

/** The view's days, on the store calendar. `until` pulls rolling periods back to the last synced day. */
export function viewDates(view: PeriodView, today: string, until: string | null = null): ViewDates {
  const window = periodWindow(view.period, today, until, view.custom)
  const current = { start: window.start, end: window.end }
  const comparison = comparisonRange(view.period, view.comparison, current,
    { start: window.previousStart, end: window.previousEnd }, view.compareCustom)
  return { current, comparison, perDay: comparison !== null && daysIn(comparison) !== daysIn(current), endsAtData: window.endsAtData }
}

/** A comparison's name in its menu: the period before reads "Yesterday" on Today and "Last month" on Month to date. */
export function comparisonName(period: DashboardPeriod, comparison: DashboardComparison): string {
  switch (comparison) {
    case 'previous': return period === 'today' ? 'Yesterday' : period === 'mtd' ? 'Last month' : 'Previous period'
    case 'month': return 'Last month'
    case 'year': return 'Last year'
    case 'week': return 'Same day last week'
    case 'average': return '7-day average'
    case 'custom': return 'Custom range'
    case 'none': return 'No comparison'
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "16 Nov": three-letter months, as the menus are drawn (the system's en-GB writes "Sept"). */
export function shortDate(iso: string): string {
  return `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`
}

/** "10 – 16 Nov", "18 Oct – 16 Nov", "16 Nov"; with the year when it isn't this year ("11 – 17 Nov 2025"). */
export function rangeText(range: DateRange, today: string): string {
  const year = (iso: string) => iso.slice(0, 4)
  const thisYear = year(today)
  const day = (iso: string) => Number(iso.slice(8, 10))
  if (range.start === range.end) return year(range.start) === thisYear ? shortDate(range.start) : `${shortDate(range.start)} ${year(range.start)}`
  // Across a new year, both ends carry their year.
  if (year(range.start) !== year(range.end)) return `${shortDate(range.start)} ${year(range.start)} – ${shortDate(range.end)} ${year(range.end)}`
  const tail = year(range.end) === thisYear ? '' : ` ${year(range.end)}`
  if (range.start.slice(0, 7) === range.end.slice(0, 7)) return `${day(range.start)} – ${shortDate(range.end)}${tail}`
  return `${shortDate(range.start)} – ${shortDate(range.end)}${tail}`
}

/** The period button: "Last 7 days", a custom range by its dates, and "7 days to 13 Nov" when every app is behind. */
export function periodButtonLabel(view: PeriodView, dates: ViewDates, today: string): string {
  if (view.period === 'custom' && view.custom) return rangeText(view.custom, today)
  if (dates.endsAtData) return `${daysIn(dates.current)} days to ${shortDate(dates.current.end)}`
  return periodLabel(view.period)
}

/** The comparison button: its name, a custom comparison by its dates, and "Off" with none. */
export function comparisonButtonLabel(view: PeriodView, today: string): string {
  const comparison = comparisonFor(view.period, view.comparison)
  if (comparison === 'none') return 'Off'
  if (comparison === 'custom' && view.compareCustom) return rangeText(view.compareCustom, today)
  return comparisonName(view.period, comparison)
}

const daysWord = (n: number) => (n === 1 ? '1 day' : `${n} days`)

/**
 * The menu's footer at rest: "10 – 16 Nov • 7 days, compared with 3 – 9 Nov". A custom comparison reads "10 – 16 Nov
 * compared with 1 – 7 Oct • 7 days each", or "• Per-day average" when the two differ in length.
 */
export function viewSummary(view: PeriodView, dates: ViewDates, today: string): string {
  const current = rangeText(dates.current, today)
  if (!dates.comparison) return `${current} • ${daysWord(daysIn(dates.current))}`
  const compared = rangeText(dates.comparison, today)
  if (comparisonFor(view.period, view.comparison) === 'custom') {
    return `${current} compared with ${compared} • ${dates.perDay ? 'Per-day average' : `${daysWord(daysIn(dates.current))} each`}`
  }
  const tail = dates.perDay ? ' • Per-day average' : ''
  return `${current} • ${daysWord(daysIn(dates.current))}, compared with ${compared}${tail}`
}
