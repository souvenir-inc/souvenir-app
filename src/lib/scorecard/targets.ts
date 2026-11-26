// Targets and health: the scorecard as Dev defined it. A metric already has an actual for whatever period the
// dashboard header shows (today, 7, 30, 60, 90 days, a custom range); give it a target and the scorecard is done.
// Health says whether that actual is on track against the target for that period.
//
// The target setting:
// - Targets are set per week by default (the base period can be week, month, quarter or year).
// - "Work out the other periods" (on by default): type the weekly target and the rest follow. 100 orders a week
//   is 433 a month (× 52/12 ≈ 4.33), 1,300 a quarter and 5,200 a year. Off: set each period's target yourself.
// For the period on screen, health uses the target whose period is closest in length and scales it by days, so
// "Today" is a day's share of the week and "Last 30 days" is the monthly target scaled to 30 days. A rate (refund
// rate ≤ 4%) is never scaled: it is compared as it is.

import { z } from 'zod'
import type { MetricUnit } from '@/lib/api/warehouse'
import type { Colour, Direction, HistoryRule, ResolvedTarget, Verdict } from './model'
import { daysBetween, type StoreClock } from './periods'
import { compare, judgeHistory } from './status'
import { defaultDirection, isAdditive, minSampleFor, newId } from './template'

// ── The model ────────────────────────────────────────────────────────────────

export type TargetPeriod = 'week' | 'month' | 'quarter' | 'year'

export const TARGET_PERIODS: readonly TargetPeriod[] = ['week', 'month', 'quarter', 'year']

/** Weeks in each period, the way the targets are worked out from each other (a month is 52 ÷ 12 ≈ 4.33 weeks). */
export const WEEKS_IN: Record<TargetPeriod, number> = { week: 1, month: 52 / 12, quarter: 13, year: 52 }

/** Days in each period, for scaling a target to the days on screen. */
export const PERIOD_DAYS: Record<TargetPeriod, number> = { week: 7, month: 7 * 52 / 12, quarter: 91, year: 364 }

export const PERIOD_LABELS: Record<TargetPeriod, { noun: string; adjective: string; per: string }> = {
  week: { noun: 'week', adjective: 'Weekly', per: 'a week' },
  month: { noun: 'month', adjective: 'Monthly', per: 'a month' },
  quarter: { noun: 'quarter', adjective: 'Quarterly', per: 'a quarter' },
  year: { noun: 'year', adjective: 'Yearly', per: 'a year' },
}

export interface TargetSettings {
  /** The period targets are typed in. Weekly unless someone changes it. */
  base: TargetPeriod
  /** True: the other periods are worked out from the base. False: each period is set on its own. */
  derive: boolean
  /** The amber band as a share of the target: 0 is two colours (any miss is off target). */
  amberBand: number
}

// Three colours by default: green on target, orange when short by up to 10%, red past that (Dev, 13 Nov).
export const DEFAULT_TARGET_SETTINGS: TargetSettings = { base: 'week', derive: true, amberBand: 0.1 }

/** A target's number: one value (higher or lower is better) or a range to stay inside (ad spend on budget). */
export type TargetNumber = { value: number } | { low: number; high: number }

/** One metric's targets, by period. With "work out the other periods" on, only the base period is filled. */
export interface MetricTarget {
  id: string
  /** The library metric's name, its permanent key. */
  metric: string
  direction: Direction
  values: Partial<Record<TargetPeriod, TargetNumber>>
  setAt: string
}

export interface TargetBook {
  settings: TargetSettings
  /** At most one per metric. */
  targets: MetricTarget[]
}

export const EMPTY_BOOK: TargetBook = { settings: DEFAULT_TARGET_SETTINGS, targets: [] }

// ── Targets per period ───────────────────────────────────────────────────────

function scaleNumber(number: TargetNumber, factor: number): TargetNumber {
  return 'value' in number ? { value: number.value * factor } : { low: number.low * factor, high: number.high * factor }
}

export interface PeriodTarget {
  period: TargetPeriod
  number: TargetNumber
  /** True when worked out from another period rather than typed. */
  derived: boolean
  /** The period it was worked out from, when derived. */
  from?: TargetPeriod
}

/**
 * A metric's target for every period. Typed values are kept as they are. With "work out the other periods" on,
 * the rest come from the base period (or, if that's empty, the typed period nearest to it): a running total
 * scales by weeks, a rate keeps its value. With it off, untyped periods stay empty.
 */
export function targetsByPeriod(target: MetricTarget | null, settings: TargetSettings, additive: boolean): Record<TargetPeriod, PeriodTarget | null> {
  const result = { week: null, month: null, quarter: null, year: null } as Record<TargetPeriod, PeriodTarget | null>
  if (target === null) return result
  const typed = TARGET_PERIODS.filter(period => target.values[period] !== undefined)
  for (const period of typed) result[period] = { period, number: target.values[period]!, derived: false }
  if (!settings.derive || typed.length === 0) return result

  const source = target.values[settings.base] !== undefined ? settings.base : nearestTo(settings.base, typed)
  const from = target.values[source]!
  for (const period of TARGET_PERIODS) {
    if (period === source) continue
    // With working-out on, only the base is the person's number; every other period follows it.
    const factor = additive ? WEEKS_IN[period] / WEEKS_IN[source] : 1
    result[period] = { period, number: scaleNumber(from, factor), derived: true, from: source }
  }
  return result
}

/** The period nearest in length to a span of days, among `among`. */
function nearestToDays(days: number, among: readonly TargetPeriod[]): TargetPeriod {
  return [...among].sort((a, b) => Math.abs(PERIOD_DAYS[a] - days) - Math.abs(PERIOD_DAYS[b] - days))[0]
}

function nearestTo(period: TargetPeriod, among: readonly TargetPeriod[]): TargetPeriod {
  return nearestToDays(PERIOD_DAYS[period], among)
}

/** The period whose length is closest to a span of days: today and 7 days use the week, 30 and 60 the month, 90 the quarter. */
export function periodForDays(days: number): TargetPeriod {
  return nearestToDays(days, TARGET_PERIODS)
}

/** Which period's target the person edits while looking at `days`: the base with working-out on, else the nearest. */
export function editablePeriod(settings: TargetSettings, days: number): TargetPeriod {
  return settings.derive ? settings.base : periodForDays(days)
}

// ── Health ───────────────────────────────────────────────────────────────────

/** Why a metric has no health colour. Never a fake zero; each says what's missing. */
export type HealthGrey = 'no_target' | 'no_data' | 'no_data_yet' | 'unavailable' | 'too_small' | 'too_early'
export type HealthVerdict = Colour | HealthGrey

export interface Health {
  verdict: HealthVerdict
  /** The target for the period on screen: scaled by days for a running total, as set for a rate. */
  expected: ResolvedTarget | null
  /** The period target it came from (week, month…), and whether that was typed or worked out. */
  basis: PeriodTarget | null
  /** How far past (+) or short of (−) the expected value, as a share of it, signed so negative is bad. */
  gapPct: number | null
  /** Days the period covers; a fraction when it includes today (counted to the hour on the store's clock). */
  days: number
  additive: boolean
  /** "only 12 orders", for `too_small`; the API's reason for `unavailable`. */
  reason?: string
}

export interface HealthInput {
  metric: string
  unit: MetricUnit
  /** The metric's total for the window (null: no rows). */
  actual: number | null
  target: MetricTarget | null
  settings: TargetSettings
  /** The dates on screen, inclusive, already ended where the data stops (the header's window). */
  window: { start: string; end: string }
  clock: StoreClock
  /** Why the store can't measure it, from the measurement's `unavailable`. */
  unavailable?: string | null
  /** The last day the metric's sources have data (`dataUntil`); a window starting after it has no data yet. */
  dataUntil?: string | null
  /** The sample count for the window (orders, impressions), for rates. Omit when unknown. */
  sample?: number | null
}

/** A window with less than this many hours of today is too early to judge. */
const MIN_HOURS = 2

/** How many days a window covers: whole days, plus today's elapsed share when it runs through today. */
export function windowDays(window: { start: string; end: string }, clock: StoreClock): number {
  const whole = daysBetween(window.start, window.end) + 1
  return window.end >= clock.date ? whole - 1 + clock.secondsIntoDay / 86_400 : whole
}

function resolved(number: TargetNumber, direction: Direction): ResolvedTarget {
  if ('value' in number) return direction === 'range' ? { kind: 'range', low: number.value, high: number.value } : { kind: 'value', value: number.value }
  return { kind: 'range', low: Math.min(number.low, number.high), high: Math.max(number.low, number.high) }
}

/**
 * The target for the days on screen: the period target closest in length (falling back to the nearest one set),
 * scaled by days for a running total and as set for a rate.
 */
export function targetForWindow(target: MetricTarget | null, settings: TargetSettings, days: number, additive: boolean): { expected: ResolvedTarget; basis: PeriodTarget } | null {
  const periods = targetsByPeriod(target, settings, additive)
  const available = TARGET_PERIODS.filter(period => periods[period] !== null)
  if (target === null || available.length === 0) return null
  const wanted = periodForDays(days)
  const basis = periods[periods[wanted] ? wanted : nearestTo(wanted, available)]!
  const factor = additive ? days / PERIOD_DAYS[basis.period] : 1
  return { expected: resolved(scaleNumber(basis.number, factor), target.direction), basis }
}

/** Whether a metric is on track for the period on screen. Pure: the same answer for the same numbers. */
export function healthOf(input: HealthInput): Health {
  const additive = isAdditive(input.metric, input.unit)
  const days = windowDays(input.window, input.clock)
  const scaled = targetForWindow(input.target, input.settings, days, additive)
  const base = { expected: scaled?.expected ?? null, basis: scaled?.basis ?? null, days, additive }
  const grey = (verdict: HealthGrey, reason?: string): Health => ({ verdict, gapPct: null, reason, ...base })

  if (input.unavailable) return grey('unavailable', input.unavailable)
  if (input.dataUntil && input.window.start > input.dataUntil) return grey('no_data_yet')
  if (input.actual === null) return grey('no_data')
  if (scaled === null || input.target === null) return grey('no_target')
  if (days * 24 < MIN_HOURS) return grey('too_early')
  const guard = minSampleFor(input.metric)
  if (guard && input.sample !== undefined && (input.sample ?? 0) < guard.min) {
    return grey('too_small', `only ${new Intl.NumberFormat('en-US').format(input.sample ?? 0)} ${guard.metric}`)
  }

  const comparison = compare(input.actual, scaled.expected, input.target.direction, { kind: 'relative', amber: input.settings.amberBand })
  return { verdict: comparison.verdict, gapPct: comparison.gapPct, ...base }
}

// ── Editing the book ─────────────────────────────────────────────────────────

export function targetOf(book: TargetBook, metric: string): MetricTarget | null {
  return book.targets.find(target => target.metric === metric) ?? null
}

export type TargetEntry =
  | { kind: 'none' }
  | { kind: 'value'; value: number }
  | { kind: 'range'; low: number; high: number }

/**
 * The book after someone types a target for one period of a metric. With working-out on, typing the base period
 * replaces every typed value (the rest follow it). A range sets the direction to "stay in range"; a single number
 * keeps the metric's direction (or its default). Blank clears that period (and the whole target if nothing's left).
 */
export function withTarget(book: TargetBook, metric: string, period: TargetPeriod, entry: TargetEntry, now = new Date(), direction?: Direction): TargetBook {
  const others = book.targets.filter(target => target.metric !== metric)
  const previous = targetOf(book, metric)
  const kept = book.settings.derive && period === book.settings.base ? {} : { ...(previous?.values ?? {}) }
  delete kept[period]
  const values: MetricTarget['values'] = entry.kind === 'none'
    ? kept
    : { ...kept, [period]: entry.kind === 'range' ? { low: entry.low, high: entry.high } : { value: entry.value } }
  if (Object.keys(values).length === 0) return { ...book, targets: others }
  const keptDirection = direction ?? (previous && previous.direction !== 'range' ? previous.direction : defaultDirection(metric))
  const target: MetricTarget = {
    id: previous?.id ?? newId('target'),
    metric,
    direction: entry.kind === 'range' ? 'range' : keptDirection,
    values,
    setAt: now.toISOString(),
  }
  return { ...book, targets: [...others, target] }
}

/**
 * The book with one metric's whole target replaced: its condition and the numbers typed per period. With working
 * out on, pass one period (the one the person typed in); the rest follow from it. No numbers removes the target.
 */
export function replaceTarget(book: TargetBook, metric: string, direction: Direction, values: MetricTarget['values'], now = new Date()): TargetBook {
  const others = book.targets.filter(target => target.metric !== metric)
  const kept = Object.fromEntries(Object.entries(values).filter(([, number]) => number !== undefined)) as MetricTarget['values']
  if (Object.keys(kept).length === 0) return { ...book, targets: others }
  const previous = targetOf(book, metric)
  return { ...book, targets: [...others, { id: previous?.id ?? newId('target'), metric, direction, values: kept, setAt: now.toISOString() }] }
}

/** The book with a metric's direction changed (its numbers stay). */
export function withDirection(book: TargetBook, metric: string, direction: Direction): TargetBook {
  return { ...book, targets: book.targets.map(target => (target.metric === metric ? { ...target, direction } : target)) }
}

// ── Storage ──────────────────────────────────────────────────────────────────
// Until the back end saves targets (S2), they live in this browser, per workspace. Every read and write is
// guarded: blocked or full storage reads as "no targets" and a failed save says so.

const numberSchema = z.union([
  z.object({ value: z.number().finite() }),
  z.object({ low: z.number().finite(), high: z.number().finite() }),
])
const targetSchema = z.looseObject({
  id: z.string(),
  metric: z.string(),
  direction: z.enum(['higher', 'lower', 'range']),
  values: z.object({ week: numberSchema.optional(), month: numberSchema.optional(), quarter: numberSchema.optional(), year: numberSchema.optional() }),
  setAt: z.string(),
})
const settingsSchema = z.object({
  base: z.enum(['week', 'month', 'quarter', 'year']),
  derive: z.boolean(),
  amberBand: z.number().min(0).max(1),
})

const TARGETS_VERSION = 1

export function targetsKey(workspaceId: string): string {
  return `souvenir.targets.v${TARGETS_VERSION}.${workspaceId}`
}

export function parseBook(raw: string | null): TargetBook {
  if (raw === null) return EMPTY_BOOK
  let data: { settings?: unknown; targets?: unknown } | null
  try {
    data = JSON.parse(raw)
  } catch {
    return EMPTY_BOOK
  }
  const settings = settingsSchema.safeParse(data?.settings)
  const targets = Array.isArray(data?.targets)
    ? data.targets.flatMap(item => (targetSchema.safeParse(item).success ? [item as MetricTarget] : []))
    : []
  return { settings: settings.success ? settings.data : DEFAULT_TARGET_SETTINGS, targets }
}

/** A save that didn't stick. The message is safe to show. */
export class TargetSaveError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'TargetSaveError'
  }
}

export interface TargetStore {
  readonly location: 'device' | 'server'
  read(): Promise<TargetBook>
  write(book: TargetBook): Promise<TargetBook>
}

function browserStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/**
 * Targets typed on the earlier weekly scorecard (removed tonight) lived in its own store. Read them once so they
 * aren't lost: each row's current target becomes a weekly target with the same condition. Nothing is invented;
 * a row without a number is skipped.
 */
export function legacyTargets(storage: Pick<Storage, 'getItem'> | null, workspaceId: string, now = new Date()): MetricTarget[] {
  const found = new Map<string, MetricTarget>()
  const read = (version: number): unknown => {
    try {
      const raw = storage?.getItem(`souvenir.scorecards.v${version}.${workspaceId}`)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  }
  type LegacyTarget = { value?: unknown; low?: unknown; high?: unknown; setAt?: unknown; effectiveFrom?: unknown }
  type LegacyRow = { metric?: unknown; source?: { metric?: unknown }; direction?: unknown; target?: LegacyTarget | null; targets?: LegacyTarget[] }
  const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

  for (const version of [2, 1]) {
    const scorecards = (read(version) as { scorecards?: Array<{ rows?: LegacyRow[] }> } | null)?.scorecards
    if (!Array.isArray(scorecards)) continue
    for (const row of scorecards.flatMap(card => (Array.isArray(card?.rows) ? card.rows : []))) {
      const metric = typeof row?.source?.metric === 'string' ? row.source.metric : typeof row?.metric === 'string' ? row.metric : null
      if (metric === null || found.has(metric)) continue
      const targets = Array.isArray(row.targets) ? row.targets : row.target ? [row.target] : []
      const latest = [...targets].sort((a, b) => String(a?.setAt ?? a?.effectiveFrom ?? '').localeCompare(String(b?.setAt ?? b?.effectiveFrom ?? ''))).at(-1)
      if (!latest) continue
      const number: TargetNumber | null = isNumber(latest.low) && isNumber(latest.high)
        ? { low: latest.low, high: latest.high }
        : isNumber(latest.value) ? { value: latest.value } : null
      if (number === null) continue
      const direction: Direction = row.direction === 'lower' ? 'lower' : row.direction === 'range' || row.direction === 'within' ? 'range' : 'higher'
      found.set(metric, {
        id: newId('target'), metric, direction: 'low' in number ? 'range' : direction, values: { week: number },
        setAt: typeof latest.setAt === 'string' ? latest.setAt : now.toISOString(),
      })
    }
  }
  return [...found.values()]
}

/** Targets saved in this browser for one workspace. The seam the back end's targets API replaces. */
export function deviceTargets(workspaceId: string, storage: Storage | null = browserStorage()): TargetStore {
  const key = targetsKey(workspaceId)
  return {
    location: 'device',
    async read() {
      try {
        const raw = storage?.getItem(key) ?? null
        // First read on this device: carry over targets typed on the earlier weekly scorecard.
        if (raw === null) {
          const carried = legacyTargets(storage, workspaceId)
          return carried.length > 0 ? { ...EMPTY_BOOK, targets: carried } : EMPTY_BOOK
        }
        return parseBook(raw)
      } catch {
        return EMPTY_BOOK
      }
    },
    async write(book) {
      if (storage === null) throw new TargetSaveError("This browser isn't letting Souvenir save here. Check that site data is allowed.")
      try {
        storage.setItem(key, JSON.stringify({ version: TARGETS_VERSION, ...book }))
      } catch (error) {
        throw new TargetSaveError("Couldn't save the target on this device. The browser's storage may be full.", { cause: error })
      }
      return book
    },
  }
}

// ── Context badges: weeks off target running, and against its own history ───

export interface WeeklyContext {
  /** Closed weeks in a row, ending last week, that missed the weekly target. Grey weeks are skipped. */
  streak: number
  /** The last 4 closed weeks against the 4 before: "worse than usual" when amber or red. */
  history: { verdict: Verdict; change: number | null } | null
}

/**
 * A metric's context from its closed weekly values (oldest first; weeks the data cut reaches already null): how
 * many weeks running it missed its weekly target, and whether it's worse than its own recent normal. Pure.
 */
export function weeklyContext(values: (number | null)[], target: MetricTarget | null, settings: TargetSettings, metric: string, unit: MetricUnit): WeeklyContext {
  const additive = isAdditive(metric, unit)
  const direction = target?.direction ?? defaultDirection(metric)
  const history = judgeHistory(values, direction, HISTORY_RULE)
  const weekly = targetForWindow(target, settings, 7, additive)?.expected ?? null
  let streak = 0
  if (weekly) {
    for (let i = values.length - 1; i >= 0; i--) {
      const value = values[i]
      if (value === null) continue
      if (compare(value, weekly, direction, { kind: 'relative', amber: settings.amberBand }).verdict !== 'red') break
      streak++
    }
  }
  return { streak, history: history.verdict === 'no_history' ? null : { verdict: history.verdict, change: history.change } }
}

const HISTORY_RULE: HistoryRule = {
  id: 'history', type: 'history', effect: 'flag', enabled: true, method: 'pooled_change', compareTo: 'previous',
  periods: 4, noise: 0.05, alert: 0.10,
}
