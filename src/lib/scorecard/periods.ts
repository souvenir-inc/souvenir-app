// Calendar arithmetic for scorecard periods, in the store's timezone. The warehouse buckets periods in the
// store's zone, so "today" and "how much of this week has passed" must be read there too, never from the
// browser's clock. Dates are ISO `YYYY-MM-DD` strings and all arithmetic is on whole calendar days.

export type PeriodGrain = 'day' | 'week' | 'month'

const DAY_MS = 86_400_000

/** The store's wall clock: today's date there and how far into that day it is. */
export interface StoreClock {
  date: string
  secondsIntoDay: number
}

function partsIn(timeZone: string, now: Date): Record<string, string> {
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  })
  return Object.fromEntries(format.formatToParts(now).map(part => [part.type, part.value]))
}

/** Now, on the store's clock. An unknown timezone falls back to UTC rather than throwing. */
export function storeClock(timeZone: string, now = new Date()): StoreClock {
  let parts: Record<string, string>
  try {
    parts = partsIn(timeZone, now)
  } catch {
    parts = partsIn('UTC', now)
  }
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    secondsIntoDay: Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second),
  }
}

function toUtc(iso: string): number {
  return Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

export function addDays(iso: string, days: number): string {
  return fromUtc(toUtc(iso) + days * DAY_MS)
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS)
}

/** 0 for Sunday through 6 for Saturday. */
export function weekdayOf(iso: string): number {
  return new Date(toUtc(iso)).getUTCDay()
}

/** The first day of the week holding `iso`. Weeks start on Monday (1) unless told otherwise. */
export function weekStartOf(iso: string, weekStartsOn = 1): string {
  return addDays(iso, -((weekdayOf(iso) - weekStartsOn + 7) % 7))
}

export function monthStartOf(iso: string): string {
  return `${iso.slice(0, 7)}-01`
}

/** How many days the period starting on `start` lasts. */
export function periodLength(start: string, grain: PeriodGrain): number {
  if (grain === 'day') return 1
  if (grain === 'week') return 7
  const year = Number(start.slice(0, 4))
  const month = Number(start.slice(5, 7))
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** True once the whole period is behind the store's today. */
export function isComplete(start: string, grain: PeriodGrain, clock: StoreClock): boolean {
  return daysBetween(start, clock.date) >= periodLength(start, grain)
}

/** Whole days of the period that have ended on the store's clock: today doesn't count until it's over. */
export function completedDays(start: string, grain: PeriodGrain, clock: StoreClock): number {
  return Math.min(periodLength(start, grain), Math.max(0, daysBetween(start, clock.date)))
}

/** How much of the period has passed on the store's clock, 0 to 1. */
export function elapsedFraction(start: string, grain: PeriodGrain, clock: StoreClock): number {
  const days = daysBetween(start, clock.date) + clock.secondsIntoDay / 86_400
  return Math.min(1, Math.max(0, days / periodLength(start, grain)))
}

/** The first day of the running week. */
export function currentWeekStart(clock: StoreClock, weekStartsOn = 1): string {
  return weekStartOf(clock.date, weekStartsOn)
}

/**
 * The dates a weekly scorecard asks for, all on week boundaries in the store's zone: `weeks` closed weeks plus the
 * running week up to yesterday (today isn't over, so it isn't counted), and the history rule's two pooled sides.
 */
export function weeklyWindows(clock: StoreClock, weeks: number, historyWeeks = 4, weekStartsOn = 1) {
  const current = currentWeekStart(clock, weekStartsOn)
  const yesterday = addDays(clock.date, -1)
  return {
    weekly: { start: addDays(current, -7 * weeks), end: yesterday < current ? addDays(current, -1) : yesterday },
    recent: { start: addDays(current, -7 * historyWeeks), end: addDays(current, -1) },
    earlier: { start: addDays(current, -14 * historyWeeks), end: addDays(current, -7 * historyWeeks - 1) },
    current,
  }
}

/** The ISO week number (1–53) of the week holding `iso`: weeks start Monday, week 1 holds the year's first Thursday. */
export function isoWeekOf(iso: string): number {
  const thursday = addDays(weekStartOf(iso), 3)
  const yearStart = `${thursday.slice(0, 4)}-01-01`
  return Math.floor(daysBetween(yearStart, thursday) / 7) + 1
}

/** "3 Nov" for a period start, in the shell's date style. */
export function shortDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(toUtc(iso)))
}

/** "3 – 9 Nov" or "27 Oct – 2 Nov" for a week starting on `iso`. */
export function weekRangeLabel(iso: string): string {
  const end = addDays(iso, 6)
  const sameMonth = iso.slice(0, 7) === end.slice(0, 7)
  return `${sameMonth ? Number(iso.slice(8, 10)) : shortDate(iso)} – ${shortDate(end)}`
}
