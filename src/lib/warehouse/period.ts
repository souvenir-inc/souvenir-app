'use client'

import { useCallback, useSyncExternalStore } from 'react'
import { formatStoreDate, rollingWindow, type RollingWindow } from './freshness'

/** The dashboard's one period, picked in the header and read by every page under /dashboard. */
export type DashboardPeriod = 'today' | '7d' | '30d' | '60d' | '90d' | 'mtd' | 'custom'

/**
 * What the period is compared with (Header · Period filter, 19 Nov). Which ones a period offers is `comparisonOptions`;
 * the dates behind each are `comparisonRange` in compare.ts.
 * - `previous`: the same number of days just before ("Yesterday" on Today, "Last month" on Month to date).
 * - `month`: the same dates a month back. `year`: last year (same weekdays; calendar dates for Month to date and custom).
 * - `week`: the same weekday last week, and `average`: the 7 days before as a per-day average (both Today only).
 * - `custom`: days of your own. `none`: no comparison.
 */
export type DashboardComparison = 'previous' | 'month' | 'year' | 'week' | 'average' | 'custom' | 'none'

/** A custom range on the store calendar, both days inclusive (YYYY-MM-DD). */
export interface DateRange {
  start: string
  end: string
}

export const PERIOD_OPTIONS: ReadonlyArray<{ value: Exclude<DashboardPeriod, 'custom'>; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '60d', label: 'Last 60 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'mtd', label: 'Month to date' },
]

/** A period you can pick from the list (everything but a custom range). */
export type QuickPeriod = Exclude<DashboardPeriod, 'custom'>

/** What the dashboard opens on until someone picks another default in Settings → Account. */
export const FALLBACK_DEFAULT_PERIOD: QuickPeriod = 'today'
// The default lives on this device. The current pick lives in this tab only, so every new visit opens on the default.
const DEFAULT_KEY = 'souvenir.dashboard.defaultPeriod.v1'
const PICK_KEY = 'souvenir.dashboard.period.v4'
const ROLLING_DAYS = { '7d': 7, '30d': 30, '60d': 60, '90d': 90 } as const

/** What's on screen: the period, and what it's compared with. Custom days ride along while they're picked. */
export interface PeriodView {
  period: DashboardPeriod
  /** The days of a custom period. Kept after picking a preset, so the calendar can reopen on them. */
  custom: DateRange | null
  comparison: DashboardComparison
  /** The days of a custom comparison. */
  compareCustom: DateRange | null
}

type PeriodState = PeriodView

const SERVER_STATE: PeriodState = { period: FALLBACK_DEFAULT_PERIOD, custom: null, comparison: 'previous', compareCustom: null }

export function isQuickPeriod(value: unknown): value is QuickPeriod {
  return value === 'today' || value === '7d' || value === '30d' || value === '60d' || value === '90d' || value === 'mtd'
}

const COMPARISONS: ReadonlyArray<DashboardComparison> = ['previous', 'month', 'year', 'week', 'average', 'custom', 'none']

export function isComparison(value: unknown): value is DashboardComparison {
  return COMPARISONS.includes(value as DashboardComparison)
}

/** The comparisons a period offers, in menu order; `none` is last, under a line. */
export function comparisonOptions(period: DashboardPeriod): ReadonlyArray<DashboardComparison> {
  if (period === 'today') return ['previous', 'week', 'average', 'year', 'custom', 'none']
  // On Month to date the period before is last month, so a separate "Last month" would be the same days twice.
  if (period === 'mtd') return ['previous', 'year', 'custom', 'none']
  return ['previous', 'month', 'year', 'custom', 'none']
}

/** A comparison the period offers: the one asked for, else the period before (Month to date's Last month is it). */
export function comparisonFor(period: DashboardPeriod, comparison: DashboardComparison): DashboardComparison {
  return comparisonOptions(period).includes(comparison) ? comparison : 'previous'
}

function isDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function rangeOf(value: unknown): DateRange | null {
  const range = value as { start?: unknown; end?: unknown } | null | undefined
  return range && isDate(range.start) && isDate(range.end) && range.start <= range.end ? { start: range.start, end: range.end } : null
}

function parse(raw: string | null): PeriodState | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as { period?: unknown; custom?: unknown; comparison?: unknown; compareCustom?: unknown }
    const custom = rangeOf(value.custom)
    const compareCustom = rangeOf(value.compareCustom)
    const p = value.period
    const period: DashboardPeriod | null = p === 'custom' ? (custom ? 'custom' : null) : isQuickPeriod(p) ? p : null
    if (!period) return null
    const asked = isComparison(value.comparison) ? value.comparison : 'previous'
    const comparison = asked === 'custom' && !compareCustom ? 'previous' : comparisonFor(period, asked)
    return { period, custom, comparison, compareCustom }
  } catch {
    // Unreadable: use the default.
  }
  return null
}

// A tiny shared store: the header and Settings write, every page reads. useSyncExternalStore needs the same object
// back while nothing changed, so the state is cached by the raw text it came from. With storage blocked, both
// values live in memory for this page load.
let memoryPick: string | null = null
let memoryDefault: QuickPeriod | null = null
let cachedKey: string | undefined
let cachedState: PeriodState = SERVER_STATE
const listeners = new Set<() => void>()

function readDefault(): QuickPeriod {
  let raw: string | null = null
  try { raw = window.localStorage.getItem(DEFAULT_KEY) } catch { /* storage blocked */ }
  if (raw === null) return memoryDefault ?? FALLBACK_DEFAULT_PERIOD
  return isQuickPeriod(raw) ? raw : FALLBACK_DEFAULT_PERIOD
}

function readPick(): string | null {
  try { return window.sessionStorage.getItem(PICK_KEY) ?? memoryPick } catch { return memoryPick }
}

function read(): PeriodState {
  const fallback = readDefault()
  const pick = readPick()
  const key = `${fallback}|${pick ?? ''}`
  if (key !== cachedKey) {
    cachedKey = key
    cachedState = parse(pick) ?? { period: fallback, custom: null, comparison: 'previous', compareCustom: null }
  }
  return cachedState
}

function notify() {
  listeners.forEach(listener => listener())
}

function writePick(next: PeriodState) {
  const raw = JSON.stringify(next)
  memoryPick = raw
  try { window.sessionStorage.setItem(PICK_KEY, raw) } catch { /* in-memory only */ }
  notify()
}

function clearPick() {
  memoryPick = null
  try { window.sessionStorage.removeItem(PICK_KEY) } catch { /* in-memory only */ }
  notify()
}

function ordered(range: DateRange): DateRange {
  return range.start <= range.end ? range : { start: range.end, end: range.start }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/**
 * What's on screen (the period, its custom days, the comparison) and the setters. Dates are a filter: a pick lasts
 * until the board is left (`reset`), and nothing is saved to a board. With nothing picked, the view is your default
 * from Settings → Account, compared with the period before. Server render and first paint use Today.
 */
export function usePeriod(): PeriodView & {
  setPeriod: (period: QuickPeriod) => void
  setCustom: (range: DateRange) => void
  setComparison: (comparison: Exclude<DashboardComparison, 'custom'>) => void
  setCompareCustom: (range: DateRange) => void
  /** Everything at once, for a link that carries the sender's view. */
  setView: (view: PeriodView) => void
  /** Back to your default, compared with the period before. */
  reset: () => void
  /** Off your default: the menus end with Reset. */
  offDefault: boolean
} {
  const state = useSyncExternalStore(subscribe, read, () => SERVER_STATE)
  const fallback = useSyncExternalStore(subscribe, readDefault, () => FALLBACK_DEFAULT_PERIOD)
  const setPeriod = useCallback((period: QuickPeriod) => {
    const now = read()
    writePick({ ...now, period, comparison: comparisonFor(period, now.comparison) })
  }, [])
  const setCustom = useCallback((range: DateRange) => {
    const now = read()
    writePick({ ...now, period: 'custom', custom: ordered(range), comparison: comparisonFor('custom', now.comparison) })
  }, [])
  const setComparison = useCallback((comparison: Exclude<DashboardComparison, 'custom'>) => {
    const now = read()
    writePick({ ...now, comparison: comparisonFor(now.period, comparison) })
  }, [])
  const setCompareCustom = useCallback((range: DateRange) => {
    writePick({ ...read(), comparison: 'custom', compareCustom: ordered(range) })
  }, [])
  const setView = useCallback((view: PeriodView) => {
    const custom = view.custom ? ordered(view.custom) : null
    const compareCustom = view.compareCustom ? ordered(view.compareCustom) : null
    const period = view.period === 'custom' && !custom ? read().period : view.period
    const asked = view.comparison === 'custom' && !compareCustom ? 'previous' : view.comparison
    writePick({ period, custom, comparison: comparisonFor(period, asked), compareCustom })
  }, [])
  const reset = useCallback(() => {
    if (readPick() !== null) clearPick()
  }, [])
  const offDefault = state.period !== fallback || state.comparison !== 'previous'
  return { ...state, setPeriod, setCustom, setComparison, setCompareCustom, setView, reset, offDefault }
}

/** The period the dashboard opens on (Settings → Account). Changing it also resets this tab's pick to it. */
export function useDefaultPeriod(): { defaultPeriod: QuickPeriod; setDefaultPeriod: (period: QuickPeriod) => void } {
  const defaultPeriod = useSyncExternalStore(subscribe, readDefault, () => FALLBACK_DEFAULT_PERIOD)
  const setDefaultPeriod = useCallback((period: QuickPeriod) => {
    memoryDefault = period
    memoryPick = null
    try { window.localStorage.setItem(DEFAULT_KEY, period) } catch { /* in-memory only */ }
    try { window.sessionStorage.removeItem(PICK_KEY) } catch { /* in-memory only */ }
    notify()
  }, [])
  return { defaultPeriod, setDefaultPeriod }
}

function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** Days in a range, both ends inclusive. */
export function daysIn(range: DateRange): number {
  const [ys, ms, ds] = range.start.split('-').map(Number)
  const [ye, me, de] = range.end.split('-').map(Number)
  return Math.round((Date.UTC(ye, me - 1, de) - Date.UTC(ys, ms - 1, ds)) / 86_400_000) + 1
}

function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate()
}

/** The same days of the month before, cut at its last day (1 – 31 Mar → 1 – 28 Feb). */
export function previousMonthToDate(current: DateRange): DateRange {
  const [y, m] = current.start.split('-').map(Number)
  const year = m === 1 ? y - 1 : y
  const month = m === 1 ? 12 : m - 1
  const last = daysInMonth(year, month)
  const day = (iso: string) => String(Math.min(Number(iso.slice(8, 10)), last)).padStart(2, '0')
  const prefix = `${year}-${String(month).padStart(2, '0')}-`
  return { start: `${prefix}${day(current.start)}`, end: `${prefix}${day(current.end)}` }
}

/**
 * The dates a period covers, on the store calendar (`today` from `storeDate`, `until` from `dataUntil`), with the
 * comparison window: always the same number of days immediately before.
 * - 7, 30, 60, 90 days: rolling windows (the team rule in `rollingWindow`: pulled back to the last day with data).
 * - Today: today only, compared with yesterday. Not pulled back: past the cut it reads "no data yet" (`isPastData`).
 * - Month to date: the 1st to today, compared with the same days of last month.
 * - Custom: the chosen dates as they are, compared with the same number of days just before.
 */
export function periodWindow(period: DashboardPeriod, today: string, until: string | null, custom: DateRange | null = null): RollingWindow {
  if (period === 'today') {
    const yesterday = shiftDate(today, -1)
    return { start: today, end: today, previousStart: yesterday, previousEnd: yesterday, endsAtData: false }
  }
  if (period === 'mtd') {
    const start = `${today.slice(0, 8)}01`
    const previous = previousMonthToDate({ start, end: today })
    return { start, end: today, previousStart: previous.start, previousEnd: previous.end, endsAtData: false }
  }
  if (period === 'custom') {
    const range = custom ?? { start: shiftDate(today, -29), end: today }
    const length = daysIn(range)
    const previousEnd = shiftDate(range.start, -1)
    return { start: range.start, end: range.end, previousStart: shiftDate(previousEnd, -(length - 1)), previousEnd, endsAtData: false }
  }
  return rollingWindow(ROLLING_DAYS[period], today, until)
}

/** "Today", "Last 30 days", or a custom range as "12 Oct – 9 Nov". */
export function periodLabel(period: DashboardPeriod, custom: DateRange | null = null): string {
  if (period === 'custom' && custom) {
    return custom.start === custom.end ? formatStoreDate(custom.start) : `${formatStoreDate(custom.start)} – ${formatStoreDate(custom.end)}`
  }
  return PERIOD_OPTIONS.find(o => o.value === period)?.label ?? 'Today'
}
