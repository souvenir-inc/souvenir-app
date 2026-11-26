// The status engine: the one place a scorecard decides red, amber or green (scope §5.9 `judge`, §6).
// Pure functions, no React, no fetching, so it can move to the back end for alerts and the AI later.
//
// Tonight's rules: against target (status), against its own history (flag), duration (flag), trend (flag, off
// in the weekly template) and the pace chip on the running period. Benchmark and combined are typed and skipped.

import type {
  Band, Colour, Direction, DurationRule, Flag, Grey, HistoryResult, HistoryRule, ISODate, PaceResult, PacingRule,
  ResolvedTarget, Row, RowJudgement, RowResult, RuleResult, Target, TargetRule, TrendRule, Verdict,
} from './model'
import { addDays, daysBetween } from './periods'

/** Absorbs float error at band edges, so 95.00000000001% of a target isn't red. */
const EPSILON = 1e-9
/** History needs this share of its periods with data on each side (3 of 4). */
const HISTORY_COVERAGE = 0.75
/** When a row has no status rule that can judge, the grey it shows, most useful first (scope §6.2). */
const GREY_ORDER: Grey[] = ['unavailable', 'before_data', 'no_data', 'too_small', 'no_target', 'in_progress', 'no_history']

const SEVERITY: Record<Colour, number> = { green: 0, amber: 1, red: 2 }

export function isColour(verdict: Verdict): verdict is Colour {
  return verdict === 'green' || verdict === 'amber' || verdict === 'red'
}

export function worst(a: Colour, b: Colour): Colour {
  return SEVERITY[a] >= SEVERITY[b] ? a : b
}

function atLeast(verdict: Verdict, level: 'amber' | 'red'): boolean {
  return isColour(verdict) && SEVERITY[verdict] >= SEVERITY[level]
}

// ── Targets ──────────────────────────────────────────────────────────────────

/** The target in force for a period: the newest whose start is on or before the period's start. */
export function targetInForce(targets: Target[], period: ISODate): Target | null {
  let best: Target | null = null
  for (const target of targets) {
    if (target.effectiveFrom > period) continue
    if (best === null || target.effectiveFrom > best.effectiveFrom || (target.effectiveFrom === best.effectiveFrom && target.setAt > best.setAt)) {
      best = target
    }
  }
  return best
}

/** A target as numbers for one period, or null when tonight's build can't resolve its kind. */
export function resolveTarget(target: Target | null, period: ISODate, direction: Direction): ResolvedTarget | null {
  if (target === null) return null
  switch (target.kind) {
    case 'fixed': {
      if (target.low !== undefined && target.high !== undefined) {
        return { kind: 'range', low: Math.min(target.low, target.high), high: Math.max(target.low, target.high) }
      }
      if (target.value === undefined) return null
      return direction === 'range' ? { kind: 'range', low: target.value, high: target.value } : { kind: 'value', value: target.value }
    }
    case 'schedule': {
      const value = target.schedule[period]
      return value === undefined ? null : { kind: 'value', value }
    }
    case 'path':
      return { kind: 'value', value: target.value }
    default:
      return null // relative and benchmark targets land in the pilot
  }
}

/** Scales a target to a share of its period (week to date). */
export function prorate(target: ResolvedTarget, share: number): ResolvedTarget {
  return target.kind === 'value'
    ? { kind: 'value', value: target.value * share }
    : { kind: 'range', low: target.low * share, high: target.high * share }
}

// ── Against target ───────────────────────────────────────────────────────────

export interface Comparison {
  verdict: Colour
  /** actual − reference, signed so negative is bad. */
  gap: number
  gapPct: number | null
  reference: number | { low: number; high: number }
}

function bandWidth(band: Band, reference: number): number {
  if (band.kind === 'relative') return Math.abs(reference) * band.amber
  if (band.kind === 'absolute') return band.amber
  return 0
}

/**
 * One value against a resolved target. Higher-is-better: green on or past it, amber within the band below, red
 * beyond. Lower-is-better mirrors it. Range: green inside, amber within the band of the nearer edge. Band `lines`
 * puts amber between the target and an explicit red-flag line. A band of 0 is two colours: any miss is red.
 */
export function compare(actual: number, target: ResolvedTarget, direction: Direction, band: Band): Comparison {
  if (direction === 'range') {
    const low = target.kind === 'range' ? target.low : target.value
    const high = target.kind === 'range' ? target.high : target.value
    const reference = target.kind === 'range' ? { low, high } : low
    if (actual >= low - Math.abs(low) * EPSILON && actual <= high + Math.abs(high) * EPSILON) {
      return { verdict: 'green', gap: 0, gapPct: 0, reference }
    }
    const below = actual < low
    const edge = below ? low : high
    const off = Math.abs(actual - edge)
    const width = band.kind === 'lines'
      ? (below ? (band.redBelow === undefined ? 0 : low - band.redBelow) : (band.redAbove === undefined ? 0 : band.redAbove - high))
      : bandWidth(band, edge)
    return {
      verdict: width > 0 && off <= width + Math.abs(edge) * EPSILON ? 'amber' : 'red',
      gap: -off,
      gapPct: edge === 0 ? null : -off / Math.abs(edge),
      reference,
    }
  }

  const value = target.kind === 'value' ? target.value : direction === 'lower' ? target.high : target.low
  const gap = direction === 'higher' ? actual - value : value - actual
  const slack = Math.abs(value) * EPSILON
  let verdict: Colour
  if (gap >= -slack) verdict = 'green'
  else if (band.kind === 'lines') {
    const line = direction === 'higher' ? band.redBelow : band.redAbove
    const past = line === undefined || (direction === 'higher' ? actual < line : actual > line)
    verdict = past ? 'red' : 'amber'
  } else {
    const width = bandWidth(band, value)
    verdict = width > 0 && gap >= -width - slack ? 'amber' : 'red'
  }
  return { verdict, gap, gapPct: value === 0 ? null : gap / Math.abs(value), reference: value }
}

// ── Against its own history ──────────────────────────────────────────────────

function meanOf(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null)
  return present.length === 0 ? null : present.reduce((sum, v) => sum + v, 0) / present.length
}

function countPresent(values: (number | null)[]): number {
  return values.filter(v => v !== null).length
}

/**
 * Pooled change (scope §6.3): the last `periods` closed periods against the `periods` before. `pooled` carries
 * each side measured as one total (so rates are recomputed, not averaged); without it the weekly values are
 * averaged. Each side needs three in four periods with data, else `no_history`. Worse by `noise` up to `alert`
 * is amber, by `alert` or more red; anything else is neutral, noting "better than usual" past `alert`.
 */
export function judgeHistory(
  closed: (number | null)[],
  direction: Direction,
  rule: HistoryRule,
  pooled: { recent: number | null; earlier: number | null } | null = null,
): HistoryResult {
  const recentValues = closed.slice(-rule.periods)
  const earlierValues = closed.slice(-2 * rule.periods, -rule.periods)
  const recent = pooled ? pooled.recent : meanOf(recentValues)
  const earlier = pooled ? pooled.earlier : meanOf(earlierValues)
  const needed = Math.max(1, Math.ceil(rule.periods * HISTORY_COVERAGE))
  const base = { ruleId: rule.id, type: 'history' as const, actual: recent, reference: earlier, recent, earlier }
  const blank: HistoryResult = { ...base, verdict: 'no_history', gap: null, gapPct: null, change: null, explain: 'not_enough_history' }

  if (recent === null || earlier === null || countPresent(recentValues) < needed || countPresent(earlierValues) < needed) return blank
  if (earlier === 0) {
    return recent === 0 ? { ...base, verdict: 'neutral', gap: 0, gapPct: 0, change: 0, explain: 'steady' } : blank
  }

  const change = (recent - earlier) / Math.abs(earlier)
  // Signed so negative is bad. A range has no better way to move, so any move counts against it.
  const good = direction === 'higher' ? change : direction === 'lower' ? -change : -Math.abs(change)
  const result = (verdict: Verdict, explain: string): HistoryResult => ({
    ...base, verdict, gap: good * Math.abs(earlier), gapPct: good, change, explain,
  })
  if (good <= -rule.alert + EPSILON) return result('red', 'worse_than_history')
  if (good <= -rule.noise + EPSILON) return result('amber', 'slightly_worse_than_history')
  if (good >= rule.alert - EPSILON) return result('neutral', 'better_than_history')
  return result('neutral', 'steady')
}

// ── Duration and trend ───────────────────────────────────────────────────────

/**
 * Closed periods in a row, ending with the latest judged one, whose verdict is at least `level`. Grey periods are
 * skipped (a week with too few orders neither counts nor breaks the run), except `unavailable`, which breaks it.
 */
export function streakOf(verdicts: Verdict[], level: 'amber' | 'red'): number {
  let streak = 0
  for (let i = verdicts.length - 1; i >= 0; i--) {
    const verdict = verdicts[i]
    if (verdict === 'unavailable') break
    if (!isColour(verdict)) continue
    if (!atLeast(verdict, level)) break
    streak++
  }
  return streak
}

/** `periods` closed periods in a row each moving the bad way, by `minMove` or more in all. */
export function adverseTrend(values: (number | null)[], direction: Direction, rule: TrendRule): boolean {
  if (direction === 'range') return false
  const run = values.slice(-(rule.periods + 1))
  if (run.length < rule.periods + 1 || run.some(v => v === null)) return false
  const points = run as number[]
  const bad = (from: number, to: number) => (direction === 'higher' ? to < from : to > from)
  for (let i = 1; i < points.length; i++) if (!bad(points[i - 1], points[i])) return false
  if (points[0] === 0) return false
  return Math.abs(points[points.length - 1] - points[0]) / Math.abs(points[0]) >= rule.minMove - EPSILON
}

// ── A whole row ──────────────────────────────────────────────────────────────

export interface SeriesPoint {
  start: ISODate
  value: number | null
  /** The sample guard's count for the period (orders, impressions). */
  sample: number | null
}

export interface CurrentPoint extends SeriesPoint {
  /** Whole days of the period that have ended on the store's clock (today excluded). */
  completedDays: number
  periodDays: number
}

export interface RowSeries {
  /** Closed periods, oldest first. */
  closed: SeriesPoint[]
  current: CurrentPoint | null
  /** The history rule's two sides, each measured as one total. */
  pooled?: { recent: number | null; earlier: number | null } | null
}

export interface JudgeContext {
  /** Why the store can't measure this row's metric (the API's reason, or "not created yet"). */
  unavailable: string | null
  /** True when the metric is a running total (revenue, orders, spend): a running period's target is pro-rated. */
  additive: boolean
  /**
   * The last store-calendar day the row's source has data (`dataUntil` in warehouse/freshness). The API answers
   * null both for "nothing happened" and "no data", so nothing after this day is judged. Null: no cut.
   */
  dataUntil?: ISODate | null
}

/** Where the data cut falls against a period: not inside it, inside it (partial), or before it (no data yet). */
export type Cut = 'none' | 'partial' | 'past'

export const NO_DATA_YET = 'no data yet'

export function cutOf(start: ISODate, periodDays: number, until: ISODate | null | undefined): Cut {
  if (!until) return 'none'
  if (start > until) return 'past'
  return until < addDays(start, periodDays - 1) ? 'partial' : 'none'
}

type AnyRule = Row['rules'][number]

function enabledRules<T extends AnyRule['type']>(row: Row, type: T): Extract<AnyRule, { type: T }>[] {
  return row.rules.filter((rule): rule is Extract<AnyRule, { type: T }> => rule.type === type && rule.enabled)
}

function pickGrey(verdicts: Verdict[]): Grey {
  return GREY_ORDER.find(grey => verdicts.includes(grey)) ?? 'no_data'
}

function onlyN(row: Row, sample: number | null): string {
  const metric = row.minSample?.metric ?? ''
  return `only ${new Intl.NumberFormat('en-US').format(sample ?? 0)} ${metric.replaceAll('_', ' ')}`
}

/** One closed period. Order (scope §6.2): can it be measured, is there a value, is the sample big enough, then the status rules. */
export function judgeCell(row: Row, point: SeriesPoint, context: JudgeContext, beforeData = false, periodDays = 7): RowResult {
  const target = resolveTarget(targetInForce(row.targets, point.start), point.start, row.direction)
  const cut = cutOf(point.start, periodDays, context.dataUntil)
  const result = (verdict: Verdict, rules: RuleResult[] = [], reason?: string): RowResult => ({
    rowId: row.id, period: point.start, value: cut === 'past' ? null : point.value, verdict, reason, provisional: false, target, rules, flags: [],
    ...(cut !== 'none' && context.dataUntil ? { dataUntil: context.dataUntil } : {}),
  })

  if (context.unavailable !== null) return result('unavailable', [], context.unavailable)
  if (cut === 'past') return result('no_data', [], NO_DATA_YET)
  if (beforeData) return result('before_data')
  // The source stopped part-way through this week: show what's there as partial, never judge it.
  if (cut === 'partial') return result(point.value === null ? 'no_data' : 'in_progress')
  if (point.value === null) return result('no_data')
  if (row.minSample && (point.sample ?? 0) < row.minSample.min) return result('too_small', [], onlyN(row, point.sample))
  const actual = point.value

  const rules = enabledRules(row, 'target').map((rule: TargetRule): RuleResult => {
    const reference: ResolvedTarget | null = rule.line !== undefined ? { kind: 'value', value: rule.line } : target
    if (reference === null) {
      return { ruleId: rule.id, type: 'target', verdict: 'no_target', actual, reference: null, gap: null, gapPct: null, explain: 'no_target' }
    }
    const comparison = compare(actual, reference, row.direction, rule.band)
    return {
      ruleId: rule.id, type: 'target', verdict: comparison.verdict, actual, reference: comparison.reference,
      gap: comparison.gap, gapPct: comparison.gapPct, explain: comparison.verdict === 'green' ? 'met_target' : 'missed_target',
    }
  })

  const statusIds = new Set(row.rules.filter(rule => rule.effect === 'status').map(rule => rule.id))
  const judged = rules.filter(rule => statusIds.has(rule.ruleId))
  const colours = judged.map(rule => rule.verdict).filter(isColour)
  if (colours.length > 0) return result(colours.reduce(worst), rules)
  return result(judged.length > 0 ? pickGrey(judged.map(rule => rule.verdict)) : 'no_target', rules)
}

/**
 * The running period: the value so far against where the target says it should be by now (pro-rated by completed
 * days for a running total, the full target for a rate). Never a filled colour unless a pacing rule is a status rule.
 */
export function judgePace(row: Row, point: CurrentPoint, context: JudgeContext): PaceResult {
  const pacing = enabledRules(row, 'pacing')[0] as PacingRule | undefined
  const targetRule = enabledRules(row, 'target')[0]
  const band: Band = pacing?.band ?? targetRule?.band ?? { kind: 'relative', amber: 0 }
  const target = resolveTarget(targetInForce(row.targets, point.start), point.start, row.direction)
  const share = point.periodDays > 0 ? Math.min(1, point.completedDays / point.periodDays) : 0
  const base = { period: point.start, value: point.value, completedDays: point.completedDays, periodDays: point.periodDays }
  const expected = target === null ? null : context.additive ? prorate(target, share) : target
  const blank = (verdict: Verdict): PaceResult => ({ ...base, expected, gapPct: null, verdict, flag: null })

  if (context.unavailable !== null) return blank('unavailable')
  const until = context.dataUntil
  if (until && point.start > until) return { ...blank('no_data'), value: null, dataUntil: until }
  // The data stops before the days that have finished: what's there is partial and isn't paced.
  if (until && daysBetween(point.start, until) + 1 < point.completedDays) return { ...blank('in_progress'), dataUntil: until }
  if (point.completedDays < 1 || point.value === null || expected === null) return blank('in_progress')
  if (row.minSample && (point.sample ?? 0) < row.minSample.min) return blank('in_progress')

  const comparison = compare(point.value, expected, row.direction, band)
  const behind = comparison.verdict !== 'green'
  const flag = behind ? 'behind_pace' : comparison.gap > 0 && row.direction !== 'range' ? 'ahead_of_pace' : null
  return {
    ...base,
    expected,
    gapPct: comparison.gapPct,
    verdict: pacing?.effect === 'status' ? comparison.verdict : 'in_progress',
    flag,
  }
}

/** Leading weeks before the metric's first value are before the store's data, not empty weeks. */
function beforeDataMask(closed: SeriesPoint[]): boolean[] {
  const first = closed.findIndex(point => point.value !== null)
  return closed.map((_, i) => first > 0 && i < first)
}

/**
 * Everything for one row (scope `judge`): each closed period, the running one, history, duration and trend, the
 * row's verdict (its last closed period, worst of the status rules) and its flags.
 */
export function judgeRow(row: Row, series: RowSeries, context: JudgeContext): RowJudgement {
  const mask = beforeDataMask(series.closed)
  const cells = series.closed.map((point, i) => judgeCell(row, point, context, mask[i]))
  // Weeks the data cut reaches can't be compared with the past: leave them out, and the pooled totals with them.
  const usable = series.closed.map(point => (cutOf(point.start, 7, context.dataUntil) === 'none' ? point.value : null))
  const cutReached = series.closed.some(point => cutOf(point.start, 7, context.dataUntil) !== 'none')
  const current = series.current ? judgePace(row, series.current, context) : null
  const flags: Flag[] = []

  const historyRule: HistoryRule | undefined = enabledRules(row, 'history')[0]
  const history = historyRule && context.unavailable === null
    ? judgeHistory(usable, row.direction, historyRule, cutReached ? null : series.pooled ?? null)
    : null
  if (history?.verdict === 'amber' || history?.verdict === 'red') flags.push('worse_than_history')
  if (history?.explain === 'better_than_history') flags.push('better_than_history')

  const latest = cells.at(-1)
  let verdict: Verdict = latest?.verdict ?? (context.unavailable !== null ? 'unavailable' : 'no_data')
  if (historyRule?.effect === 'status' && history && isColour(history.verdict)) {
    verdict = isColour(verdict) ? worst(verdict, history.verdict) : history.verdict
  }

  const durationRule: DurationRule | undefined = enabledRules(row, 'duration')[0]
  let streak = 0
  if (durationRule) {
    streak = streakOf(cells.map(cell => cell.verdict), durationRule.atLeast)
    if (streak >= durationRule.periods) {
      flags.push(durationRule.atLeast === 'red' ? 'red_streak' : 'amber_streak')
      if (durationRule.raiseTo && isColour(verdict)) verdict = worst(verdict, durationRule.raiseTo)
    }
  }

  const trendRule: TrendRule | undefined = enabledRules(row, 'trend')[0]
  if (trendRule && context.unavailable === null && adverseTrend(usable, row.direction, trendRule)) {
    flags.push('trend_adverse')
  }

  if (current?.flag) flags.push(current.flag)

  return { cells, current, verdict, reason: latest?.reason ?? context.unavailable ?? undefined, flags, history, streak }
}

export function isRed(judgement: RowJudgement): boolean {
  return judgement.verdict === 'red'
}

/** The target rule's result in a closed cell, for the gap shown on a red. */
export function targetResultOf(cell: RowResult | null | undefined): RuleResult | null {
  return cell?.rules.find(rule => rule.type === 'target') ?? null
}
