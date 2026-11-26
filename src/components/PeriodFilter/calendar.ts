// The period menu's calendar, as plain dates (ISO, store calendar): which days a month shows, how a day reads, where a
// key moves focus, and what a typed date means. The component draws these; nothing here touches the DOM.

import { addDays } from '@/lib/warehouse/compare'
import type { DateRange } from '@/lib/warehouse/period'

/** "2026-11" */
export type MonthKey = string

export const monthOf = (iso: string): MonthKey => iso.slice(0, 7)

export function shiftMonth(month: MonthKey, by: number): MonthKey {
  const [y, m] = month.split('-').map(Number)
  const index = y * 12 + (m - 1) + by
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
}

/** The month's weeks, Monday first; days outside the month are null. */
export function monthWeeks(month: MonthKey): Array<Array<string | null>> {
  const [y, m] = month.split('-').map(Number)
  const first = `${month}-01`
  const length = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7
  const cells: Array<string | null> = [...Array<null>(lead).fill(null), ...Array.from({ length }, (_, i) => addDays(first, i))]
  while (cells.length % 7 !== 0) cells.push(null)
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7))
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MONTH_SHORT = MONTH_NAMES.map(name => name.slice(0, 3))

/** "November 2026" */
export function monthTitle(month: MonthKey): string {
  const [y, m] = month.split('-').map(Number)
  return `${MONTH_NAMES[m - 1]} ${y}`
}

/** "18 Oct 2026", for the From and To fields. */
export function fieldText(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTH_SHORT[m - 1]} ${y}`
}

/** "Monday 16 November 2026", what a screen reader hears for a day. */
export function spokenDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)))
  return `${weekday} ${d} ${MONTH_NAMES[m - 1]} ${y}`
}

function isRealDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate()
}

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

/**
 * A typed date: "18 Oct 2026", "18 october", "Oct 18 2026", "18/10/2026" or "2026-10-18". With no year, the latest
 * such day up to today. Null when it isn't a date.
 */
export function parseTyped(text: string, today: string): string | null {
  const t = text.trim().toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ')
  if (!t) return null
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t)
  if (match) {
    const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])]
    return isRealDate(y, m, d) ? iso(y, m, d) : null
  }
  match = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(t)
  if (match) {
    const [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])]
    return isRealDate(y, m, d) ? iso(y, m, d) : null
  }
  const month = (word: string) => MONTH_SHORT.findIndex(name => word.startsWith(name.toLowerCase())) + 1
  match = /^(\d{1,2}) ([a-z]+)(?: (\d{4}))?$/.exec(t) ?? null
  let parts: { d: number; m: number; y: number | null } | null = null
  if (match) parts = { d: Number(match[1]), m: month(match[2]), y: match[3] ? Number(match[3]) : null }
  const flipped = parts ? null : /^([a-z]+) (\d{1,2})(?: (\d{4}))?$/.exec(t)
  if (flipped) parts = { d: Number(flipped[2]), m: month(flipped[1]), y: flipped[3] ? Number(flipped[3]) : null }
  if (!parts || parts.m < 1) return null
  const thisYear = Number(today.slice(0, 4))
  const year = parts.y ?? (iso(thisYear, parts.m, parts.d) > today ? thisYear - 1 : thisYear)
  return isRealDate(year, parts.m, parts.d) ? iso(year, parts.m, parts.d) : null
}

/** Where a key moves focus in the calendar: a day, a week, a month (Page Up / Down), the week's ends (Home / End). */
export function moveFocus(day: string, key: string): string | null {
  switch (key) {
    case 'ArrowLeft': return addDays(day, -1)
    case 'ArrowRight': return addDays(day, 1)
    case 'ArrowUp': return addDays(day, -7)
    case 'ArrowDown': return addDays(day, 7)
    case 'Home': return addDays(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7))
    case 'End': return addDays(day, 6 - ((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7))
    case 'PageUp': return sameDayIn(day, -1)
    case 'PageDown': return sameDayIn(day, 1)
    default: return null
  }
}

function sameDayIn(day: string, months: number): string {
  const month = shiftMonth(monthOf(day), months)
  const [y, m] = month.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${month}-${String(Math.min(Number(day.slice(8, 10)), last)).padStart(2, '0')}`
}

/** How a day reads. */
export interface DayLook {
  /** A solid end of the picked days (or the one picked day). */
  end: boolean
  /** Inside the picked days, between the ends. */
  band: boolean
  /** Inside a preset's days while the pointer or focus is on it. */
  preview: boolean
  /** The preview's first day, ringed. */
  previewStart: boolean
  /** The day under the pointer while picking the last day, ringed. */
  pickingTo: boolean
  today: boolean
  /** After today: greyed, can't be picked. */
  future: boolean
  /** Before the store's data starts: lighter. */
  beforeData: boolean
  /** The first day with data: a dot under it. */
  firstData: boolean
}

export interface CalendarMarks {
  today: string
  /** The days shown as picked: the applied days, or the draft's. */
  picked: DateRange | null
  /** While picking: the first day clicked, before the last one. */
  pickingFrom: string | null
  /** The day under the pointer, while picking. */
  pointer: string | null
  /** A preset's days, while it's pointed at or focused. */
  preview: DateRange | null
  /** The first day the store has data for; null when unknown. */
  dataFrom: string | null
}

const inside = (day: string, range: DateRange | null) => range !== null && day >= range.start && day <= range.end

export function dayLook(day: string, marks: CalendarMarks): DayLook {
  const { picked, pickingFrom, pointer, preview, today, dataFrom } = marks
  const picking = pickingFrom !== null
  const end = picking ? day === pickingFrom : picked !== null && (day === picked.start || day === picked.end)
  return {
    end,
    band: !picking && inside(day, picked) && !end,
    preview: inside(day, preview),
    previewStart: preview !== null && day === preview.start && !end,
    pickingTo: picking && pointer !== null && day === pointer && day !== pickingFrom,
    today: day === today,
    future: day > today,
    beforeData: dataFrom !== null && day < dataFrom,
    firstData: dataFrom !== null && day === dataFrom,
  }
}

/** The two months shown (one when narrow), ending on the month of `focus` and never after today's month. */
export function shownMonths(focus: string, today: string, count: 1 | 2): MonthKey[] {
  const last = monthOf(focus) > monthOf(today) ? monthOf(today) : monthOf(focus)
  return count === 1 ? [last] : [shiftMonth(last, -1), last]
}
