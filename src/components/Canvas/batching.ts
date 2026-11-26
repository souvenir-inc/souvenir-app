// Request batching: a board asks the warehouse once per (range, grain), never once per card.
//
// Each card needs a few measurements (its total, the comparison's total, the series its chart draws).
// planMeasurements folds every card's needs into one request per distinct (start, end, grain), with the
// union of the metrics that need it. Cards that share a window share every request; a card that only
// differs in its comparison still shares the current-period requests.

import type { Grain, MeasureRequest, Measurement } from '@/lib/api/warehouse'
import { isPastData } from '@/lib/warehouse/freshness'
import type { DatedValue } from '@/components/charts/scale'
import { effectiveWindow, type BoardCard } from './board'
import { addDays, daysBetween, eachDay, weeklyRangeFor, windowFor, type CardWindow, type ComparisonId, type DateRange, type WindowId } from './windows'

export type RangeKey = string

export function rangeKey(range: DateRange, grain: Grain): RangeKey {
  return `${range.start}..${range.end}/${grain}`
}

/** The request keys one card reads from. */
export interface CardNeeds {
  window: CardWindow
  /** Null when the window is entirely after the source's last data day. */
  total: RangeKey | null
  comparisonTotal: RangeKey | null
  series: RangeKey | null
  comparisonSeries: RangeKey | null
  weeks: RangeKey | null
  /** The range behind `weeks`, to mark the unfinished last week. */
  weeksRange: DateRange | null
}

export interface MeasurePlan {
  /** One request per distinct (range, grain), metrics sorted, in key order so it's stable across renders. */
  requests: Array<{ key: RangeKey; request: MeasureRequest }>
  byCard: Record<string, CardNeeds>
}

/** The last day of data for a metric's source, or null for no cut (see freshness.ts `dataUntil`). */
export type UntilOf = (metric: string) => string | null

/** What one card needs, as request keys, plus the requests themselves. Nothing after the cut is asked for. */
export function needsOf(
  card: BoardCard, today: string, until: string | null = null, period: WindowId = '30d', custom: DateRange | null = null,
  comparison: ComparisonId = 'previous', compareCustom: DateRange | null = null,
): { needs: CardNeeds; ranges: Array<{ key: RangeKey; range: DateRange; grain: Grain }> } {
  // One period and one comparison for the whole board: what the header shows.
  const window = windowFor(effectiveWindow(card, period), comparison, today, until, custom, compareCustom)
  const ranges: Array<{ key: RangeKey; range: DateRange; grain: Grain }> = []
  const want = (range: DateRange | null, grain: Grain): RangeKey | null => {
    if (!range) return null
    const key = rangeKey(range, grain)
    ranges.push({ key, range, grain })
    return key
  }
  const total = want(window.measured, 'total')
  const comparisonTotal = want(window.measuredComparison, 'total')
  // A metric card can be stretched into a chart at any moment, so it always has its series and the comparison's
  // (shared with every other card on the same window, so it costs at most one request per window).
  const draws = card.kind === 'number' || card.kind === 'trend'
  const series = draws ? want(window.seriesMeasured, window.grain) : null
  const comparisonSeries = draws ? want(window.seriesComparisonMeasured, window.grain) : null
  const weeksRange = card.kind === 'weekly' ? weeklyRangeFor(window) : null
  const weeks = want(weeksRange, 'week')
  return { needs: { window, total, comparisonTotal, series, comparisonSeries, weeks, weeksRange }, ranges }
}

/**
 * `period` (and `custom`, for a custom range) is the period on screen, and `comparison` (with `compareCustom`, for days
 * of your own) what every card compares it with.
 */
export function planMeasurements(
  cards: ReadonlyArray<BoardCard>, today: string, untilOf: UntilOf = () => null, period: WindowId = '30d',
  custom: DateRange | null = null, comparison: ComparisonId = 'previous', compareCustom: DateRange | null = null,
): MeasurePlan {
  const groups = new Map<RangeKey, { range: DateRange; grain: Grain; metrics: Set<string> }>()
  const byCard: Record<string, CardNeeds> = {}
  for (const card of cards) {
    const { needs, ranges } = needsOf(card, today, untilOf(card.metric), period, custom, comparison, compareCustom)
    byCard[card.id] = needs
    for (const { key, range, grain } of ranges) {
      const group = groups.get(key) ?? { range, grain, metrics: new Set<string>() }
      group.metrics.add(card.metric)
      groups.set(key, group)
    }
  }
  const requests = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, g]) => ({
      key,
      request: { metrics: [...g.metrics].sort(), start: g.range.start, end: g.range.end, grain: g.grain },
    }))
  return { requests, byCard }
}

/**
 * Adds metrics to one planned request (by key), so a question the screen needs answered anyway (which of these can
 * the store measure?) rides on a request the cards already make, instead of costing one of its own.
 */
export function withExtraMetrics(plan: MeasurePlan, key: RangeKey, metrics: readonly string[]): MeasurePlan {
  return {
    ...plan,
    requests: plan.requests.map(r => (r.key === key
      ? { key, request: { ...r.request, metrics: [...new Set([...r.request.metrics, ...metrics])].sort() } }
      : r)),
  }
}

// ── Reading a card's numbers back out of the batched results ──────────────────────────────────────────

export interface WeekValue {
  start: string
  value: number | null
  /** The week runs past the window's end, so it isn't finished. */
  partial: boolean
}

export interface CardData {
  value: number | null
  /** The comparison's total; null with no comparison or no rows. */
  previous: number | null
  /** Why the store can't measure this metric, when it can't. */
  unavailable: string | null
  series: DatedValue[] | null
  comparisonSeries: DatedValue[] | null
  weeks: WeekValue[] | null
}

export type Results = Readonly<Record<RangeKey, Measurement | undefined>>

function totalOf(m: Measurement | undefined, metric: string): number | null {
  return m?.periods[0]?.values[metric] ?? null
}

/**
 * A daily series with one point per day of the range the card shows, whether or not the API sent a period
 * for it. Days after `until` (the last day of data) are null: nothing measured, never zero.
 */
function dailyOf(m: Measurement | undefined, metric: string, range: DateRange, until: string | null): DatedValue[] | null {
  if (!m) return null
  const byDay = new Map(m.periods.map(p => [p.start, p.values[metric] ?? null]))
  return eachDay(range).map(date => ({ date, value: isPastData(date, until) ? null : byDay.get(date) ?? null }))
}

function weeklyOf(m: Measurement | undefined, metric: string, range: DateRange): WeekValue[] | null {
  if (!m) return null
  return m.periods
    .filter(p => !isPastData(p.start, range.end))
    .map(p => ({ start: p.start, value: p.values[metric] ?? null, partial: addDays(p.start, 6) > range.end }))
}

function seriesOf(m: Measurement | undefined, metric: string, range: DateRange, grain: Grain, until: string | null): DatedValue[] | null {
  if (!m) return null
  return grain === 'day'
    ? dailyOf(m, metric, range, until)
    : m.periods.map(p => ({ date: p.start, value: isPastData(p.start, until) ? null : p.values[metric] ?? null }))
}

/** The comparison's last day with data, lined up with the current cut: same number of days in. */
function comparisonUntil(window: CardWindow): string | null {
  return window.seriesComparisonMeasured && window.seriesComparison && window.seriesComparisonMeasured.end !== window.seriesComparison.end
    ? window.seriesComparisonMeasured.end
    : null
}

/**
 * The card's numbers, or null while its headline total hasn't arrived. Charts may still be loading. A window
 * entirely after the source's last data day reads as no data, without asking the warehouse.
 */
export function readCard(card: BoardCard, needs: CardNeeds, results: Results): CardData | null {
  const { window } = needs
  const total = needs.total ? results[needs.total] : undefined
  if (needs.total && !total) return null
  const series = needs.series ? results[needs.series] : undefined
  return {
    value: totalOf(total, card.metric),
    previous: needs.comparisonTotal ? totalOf(results[needs.comparisonTotal], card.metric) : null,
    unavailable: total?.unavailable[card.metric] ?? series?.unavailable[card.metric] ?? null,
    series: needs.series ? seriesOf(series, card.metric, window.series, window.grain, window.cut) : null,
    comparisonSeries: needs.comparisonSeries && window.seriesComparison
      ? seriesOf(results[needs.comparisonSeries], card.metric, window.seriesComparison, window.grain, comparisonUntil(window))
      : null,
    weeks: needs.weeks && needs.weeksRange ? weeklyOf(results[needs.weeks], card.metric, needs.weeksRange) : null,
  }
}

/** Change against the comparison in percent units; null when there's nothing to compare against. */
export function changeOf(value: number | null, previous: number | null): number | null {
  if (value === null || previous === null || previous === 0) return null
  return ((value - previous) / Math.abs(previous)) * 100
}

const daysOf = (range: DateRange | null) => (range ? daysBetween(range.start, range.end) : 0)

/**
 * The comparison's figure as the change reads it: with a comparison of another length (`window.perDay`), a total
 * (`additive`) becomes its per-day average; rates and averages are compared as they are.
 */
export function comparedValue(data: CardData, window: CardWindow, additive: boolean): number | null {
  if (data.previous === null || !window.perDay || !additive) return data.previous
  const days = daysOf(window.measuredComparison)
  return days > 0 ? data.previous / days : null
}

/** The change a card shows, in percent units: per-day averages when the two windows differ in length. */
export function cardChange(data: CardData, window: CardWindow, additive: boolean): number | null {
  if (!window.perDay || !additive) return changeOf(data.value, data.previous)
  const days = daysOf(window.measured)
  return changeOf(data.value === null || days === 0 ? null : data.value / days, comparedValue(data, window, additive))
}
