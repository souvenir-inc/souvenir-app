// A board's dates (docs-v2/dashboard/11-dates-tabs-reference-rules.md DT-1 – DT-7): the preset ids
// ("7d") and custom ranges ("custom:2025-10-12:2025-11-09"), their names, the days each covers and
// the days it is compared with. Pure, so the measurements and the UI read the same windows.

import type { Period } from './types'

const DAY = 86_400_000

export const PERIODS: Period[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: '60d', label: 'Last 60 days' }, // 11 DT-1
  { id: '90d', label: 'Last 90 days' },
]

export const COMPARISONS: Period[] = [
  { id: 'previous', label: 'vs previous', menuLabel: 'Previous period' },
  { id: 'last-year', label: 'vs last year', menuLabel: 'Same period last year' },
  { id: 'none', label: 'No comparison' },
]

/** First and last day, both counted, as local calendar days. */
export interface Window { from: Date; to: Date }

/** "2025-11-14": the day as the warehouse takes it. */
export const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const fromIsoDate = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

/**
 * The time on the store's clock, as a Date whose local fields read that time: the warehouse counts
 * days in its own zone, so "today" and every window are worked out on its clock, not the viewer's.
 */
export function wallClock(timeZone: string | undefined, at: Date = new Date()): Date {
  if (!timeZone) return at
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
    }).formatToParts(at)
    const n = (type: string) => Number(parts.find((p) => p.type === type)?.value)
    return new Date(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'))
  } catch {
    return at // an unknown zone: the viewer's clock rather than nothing
  }
}

/** The instant the store's day began (its midnight), for comparing with real times such as a last sync. */
export function storeMidnight(timeZone: string | undefined, at: Date = new Date()): number {
  const wall = wallClock(timeZone, at)
  return at.getTime() - (wall.getTime() - startOfDay(wall).getTime())
}
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

export const isCustom = (id: string) => id.startsWith('custom:')

/** A custom range's id, ends in order. */
export function customId(a: Date, b: Date): string {
  const [from, to] = a.getTime() <= b.getTime() ? [a, b] : [b, a]
  return `custom:${isoDate(from)}:${isoDate(to)}`
}

/** A custom range's first and last day, or null for a preset. */
export function customRange(id: string): Window | null {
  if (!isCustom(id)) return null
  const [, a, b] = id.split(':')
  return { from: fromIsoDate(a), to: fromIsoDate(b) }
}

const CUSTOM_ID = /^custom:(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/

/** A real date written as YYYY-MM-DD (not 2025-02-31). */
const realDay = (s: string) => { const d = fromIsoDate(s); return !Number.isNaN(d.getTime()) && isoDate(d) === s }

/** A period id the board can read: a preset, or a custom range of two real days in order. Links and URLs are checked with it. */
export function validPeriod(id: string | null | undefined): id is string {
  if (!id) return false
  if (PERIODS.some((p) => p.id === id)) return true
  const m = CUSTOM_ID.exec(id)
  return !!m && realDay(m[1]) && realDay(m[2]) && m[1] <= m[2]
}

/** A comparison the board can read. */
export const validCompare = (id: string | null | undefined): id is 'previous' | 'last-year' | 'none' => COMPARISONS.some((c) => c.id === id)

/** Days in a window, both ends counted. */
export const rangeDays = (from: Date, to: Date) => Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY) + 1

/** The days a period's numbers cover, ending today (or yesterday). */
export function periodWindow(id: string, today: Date): Window {
  const custom = customRange(id)
  if (custom) return custom
  const end = startOfDay(today)
  if (id === 'today') return { from: end, to: end }
  if (id === 'yesterday') return { from: addDays(end, -1), to: addDays(end, -1) }
  const days = id === '30d' ? 30 : id === '60d' ? 60 : id === '90d' ? 90 : 7
  return { from: addDays(end, 1 - days), to: end }
}

/** The days a period's charts draw: Today and Yesterday chart the 7 days ending then (our call). */
export function chartWindow(id: string, today: Date): Window {
  const w = periodWindow(id, today)
  return rangeDays(w.from, w.to) === 1 ? { from: addDays(w.to, -6), to: w.to } : w
}

/** The days a window is compared with: the same number of days before, or the same days last year (DT-7). */
export function comparedWindow(w: Window, compare: string): Window | null {
  if (compare === 'none') return null
  const n = rangeDays(w.from, w.to)
  // Last year: from the same date, for the same number of days, so a window across 29 Feb still
  // compares day for day (25 Feb – 2 Mar 2028 with 25 Feb – 3 Mar 2027, 7 days each).
  if (compare === 'last-year') { const from = yearBefore(w.from); return { from, to: addDays(from, n - 1) } }
  return { from: addDays(w.from, -n), to: addDays(w.to, -n) }
}

/** "12 Oct", "12 Oct 2024". */
export const dayMonth = (d: Date, year = false) =>
  d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}) })

/** "Last 7 days"; "12 Oct – 9 Nov" for a custom range. */
export function periodName(id: string): string {
  const r = customRange(id)
  if (r) return `${dayMonth(r.from)} – ${dayMonth(r.to)}`
  return PERIODS.find((p) => p.id === id)?.label ?? id
}

/** "vs previous" or "vs last year", as the period trigger shows it. */
export const compareShort = (id: string) => COMPARISONS.find((c) => c.id === id)?.label ?? ''

/** "12 Oct – 9 Nov · 29 days, compared with the 29 days before" (DT-4). */
export function rangeSummary(from: Date, to: Date, compare: string): string {
  const n = rangeDays(from, to)
  const days = `${n} day${n === 1 ? '' : 's'}`
  const vs = compare === 'last-year' ? 'compared with the same days last year' : compare === 'none' ? 'no comparison' : `compared with the ${days} before`
  return `${dayMonth(from)} – ${dayMonth(to)} · ${days}, ${vs}`
}

/** What the comparison is called beside "This period" (DT-7). */
export const compareName = (compare: string) => (compare === 'last-year' ? 'Same period last year' : 'Previous period')

/** The same day a year before; 29 Feb becomes 28 Feb (not 1 Mar). */
export const yearBefore = (d: Date) => {
  const lastOfMonth = new Date(d.getFullYear() - 1, d.getMonth() + 1, 0).getDate()
  return new Date(d.getFullYear() - 1, d.getMonth(), Math.min(d.getDate(), lastOfMonth))
}
