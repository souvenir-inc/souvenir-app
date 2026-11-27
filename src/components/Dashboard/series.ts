// The words charts and readouts use for days, weeks and values (05-cards-reading-rules.md CR-10,
// CR-11), and the written summary every chart carries for screen readers. The numbers themselves
// are measured by the warehouse (live/metrics.ts); formatting is format.ts.

import { formatChangePercent, formatDayMonth, formatExact, formatWeekday, listNames, plural } from './format'
import type { Metric, Series, Week } from './types'

export { formatExact } from './format'

const DAY = 86_400_000

/** "13 Nov". */
export const dayMonth = (d: Date) => formatDayMonth(d)

/** "Thu 13 Nov". */
export const weekdayDayMonth = (d: Date) => `${formatWeekday(d)} ${formatDayMonth(d)}`

/** "+15.6%" / "−3.2%" between two values. */
export function changeLabel(now: number, before: number): string {
  if (!before) return '—'
  return formatChangePercent(((now - before) / Math.abs(before)) * 100)
}

export interface WeekInfo {
  /** "Week of 10 Nov (so far)". */
  title: string
  /** "Mon 10 – Fri 14 Nov". */
  range: string
}

/** Words for one of the weekly bars; the week in progress runs to today. */
export function weekInfo(week: Week): WeekInfo {
  const range = `${formatWeekday(week.start)} ${week.start.getDate()} – ${weekdayDayMonth(week.end)}`
  return { title: `Week of ${dayMonth(week.start)}${week.inProgress ? ' (so far)' : ''}`, range }
}

/** Whole days from one date to another. */
export const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY)

// ── Chart summaries (A11Y-KB-01: what a chart shows, without a pointer) ─────────

/**
 * A line chart in a sentence: "Revenue by day, 8 Nov to 14 Nov: lowest $5,850 on 9 Nov, highest
 * $7,500 on 13 Nov, latest $7,000 on 14 Nov."; days without data are counted at the end.
 */
export function lineSummary(metric: Metric, series: Series): string {
  const days = series.days
  if (!days.length) return `${metric.label}: no days to show.`
  const span = `${metric.label} by day, ${dayMonth(days[0].date)} to ${dayMonth(days[days.length - 1].date)}`
  const known = days.filter((d): d is { date: Date; value: number } => d.value != null)
  if (known.length === 0) return `${span}: nothing recorded.`
  const exact = (v: number) => formatExact(v, metric.format)
  const low = known.reduce((a, d) => (d.value < a.value ? d : a))
  const high = known.reduce((a, d) => (d.value > a.value ? d : a))
  const last = known[known.length - 1]
  const parts = known.length === 1
    ? [`${exact(last.value)} on ${dayMonth(last.date)}`]
    : [`lowest ${exact(low.value)} on ${dayMonth(low.date)}`, `highest ${exact(high.value)} on ${dayMonth(high.date)}`, `latest ${exact(last.value)} on ${dayMonth(last.date)}`]
  const missing = days.length - known.length
  const gaps = missing > 0 ? ` ${missing} ${plural(missing, { one: 'day has', other: 'days have' })} no data.` : ''
  return `${span}: ${parts.join(', ')}.${gaps}`
}

/** Weekly bars in a sentence: "Orders by week, from the week of 13 Oct: 412, 390, 455, 470 and 210 so far this week." */
export function barsSummary(metric: Metric, weeks: Week[]): string {
  if (!weeks.length) return `${metric.label}: no weeks to show.`
  const values = weeks.map((w) => `${w.value == null ? 'no data' : formatExact(w.value, metric.format)}${w.inProgress ? ' so far this week' : ''}`)
  const head = `${metric.label} by week, from the week of ${dayMonth(weeks[0].start)}`
  return `${head}: ${listNames(values)}.`
}
