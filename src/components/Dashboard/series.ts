// The words charts and readouts use for days, weeks and values (05-cards-reading-rules.md CR-10,
// CR-11). The numbers themselves are measured by the warehouse (live/metrics.ts).

import type { MetricFormat, Week } from './types'

const DAY = 86_400_000
const WEEKDAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short' })

/** "13 Nov". */
export const dayMonth = (d: Date) => `${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })}`

/** "Thu 13 Nov". */
export const weekdayDayMonth = (d: Date) => `${WEEKDAY.format(d)} ${dayMonth(d)}`

const whole = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const cents = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** A day's exact value for the readout: "52", "$6,812", "$154.50", "1.42%" (CR-10). */
export function formatExact(value: number, format: MetricFormat): string {
  switch (format) {
    case 'currency': return `$${Math.abs(value) >= 1000 ? whole.format(value) : cents.format(value)}`
    case 'percent': return `${cents.format(value)}%`
    default: return whole.format(value)
  }
}

/** "+15.6%" / "−3.2%" between two values. */
export function changeLabel(now: number, before: number): string {
  if (!before) return '—'
  const p = ((now - before) / Math.abs(before)) * 100
  return `${p >= 0 ? '+' : '−'}${Math.abs(p).toFixed(1)}%`
}

export interface WeekInfo {
  /** "Week of 10 Nov (so far)". */
  title: string
  /** "Mon 10 – Fri 14 Nov". */
  range: string
}

/** Words for one of the weekly bars; the week in progress runs to today. */
export function weekInfo(week: Week): WeekInfo {
  const range = `${WEEKDAY.format(week.start)} ${week.start.getDate()} – ${weekdayDayMonth(week.end)}`
  return { title: `Week of ${dayMonth(week.start)}${week.inProgress ? ' (so far)' : ''}`, range }
}

/** Whole days from one date to another. */
export const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY)
