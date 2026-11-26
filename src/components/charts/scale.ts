// Pure geometry and descriptions for the chart kit: domains, sparkline paths, and the sentence a screen
// reader hears instead of a picture. No React here, so it's all unit-testable.

import { formatChartValue, type ValueFormat } from './format'

export type Series = ReadonlyArray<number | null | undefined>

function finite(values: Series): number[] {
  return values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
}

/** [min, max] across every series, nulls skipped; null when there's nothing to draw. */
export function extentOf(...series: Series[]): [number, number] | null {
  const all = series.flatMap(finite)
  if (all.length === 0) return null
  return [Math.min(...all), Math.max(...all)]
}

/**
 * A domain with breathing room so a line never kisses the edges. `zero` pins the baseline at 0 when every
 * value is positive (bars and money read wrong off a floating baseline). A flat series gets a band around it.
 * The padding never takes the axis below zero unless the data itself goes there: no "-$48.6k" under revenue.
 */
export function paddedDomain(extent: [number, number] | null, options: { zero?: boolean; pad?: number } = {}): [number, number] {
  const pad = options.pad ?? 0.08
  if (extent === null) return [0, 1]
  const floor = extent[0] >= 0 ? 0 : Number.NEGATIVE_INFINITY
  let [lo, hi] = extent
  if (options.zero) {
    lo = Math.min(0, lo)
    hi = Math.max(0, hi)
  }
  if (lo === hi) {
    const bump = lo === 0 ? 1 : Math.abs(lo) * 0.1
    return [Math.max(floor, options.zero && lo >= 0 ? 0 : lo - bump), hi + bump]
  }
  const span = hi - lo
  return [Math.max(floor, options.zero && lo >= 0 ? lo : lo - span * pad), hi + span * pad]
}

export interface SparkGeometry {
  /** One SVG path per unbroken run of values; a null breaks the line, it isn't drawn as zero. */
  lines: string[]
  /** Values with no neighbour on either side, drawn as dots so they don't vanish. */
  dots: Array<{ x: number; y: number }>
  /** The last drawn point, for the end marker. */
  last: { x: number; y: number } | null
  /** Closed area paths under each run, for the soft fill. */
  areas: string[]
}

const round = (n: number) => Math.round(n * 100) / 100

/**
 * Geometry for a sparkline in a `width` × `height` box with `inset` px kept clear top and bottom.
 * Points spread evenly; `count` lets two series of different lengths share one x scale.
 */
export function sparkGeometry(
  values: Series, domain: [number, number], width: number, height: number,
  options: { inset?: number; count?: number } = {},
): SparkGeometry {
  const inset = options.inset ?? 2
  const count = Math.max(options.count ?? values.length, 1)
  const [lo, hi] = domain
  const span = hi - lo || 1
  const x = (i: number) => round(count === 1 ? width / 2 : (i / (count - 1)) * width)
  const y = (v: number) => round(inset + (1 - (v - lo) / span) * (height - inset * 2))

  const runs: Array<Array<{ x: number; y: number }>> = []
  let run: Array<{ x: number; y: number }> = []
  values.forEach((v, i) => {
    if (typeof v === 'number' && Number.isFinite(v)) {
      run.push({ x: x(i), y: y(v) })
    } else if (run.length > 0) {
      runs.push(run)
      run = []
    }
  })
  if (run.length > 0) runs.push(run)

  const lines: string[] = []
  const areas: string[] = []
  const dots: Array<{ x: number; y: number }> = []
  for (const r of runs) {
    if (r.length === 1) {
      dots.push(r[0])
      continue
    }
    const d = r.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ')
    lines.push(d)
    areas.push(`${d} L${r[r.length - 1].x} ${height} L${r[0].x} ${height} Z`)
  }
  const lastRun = runs.at(-1)
  return { lines, dots, areas, last: lastRun ? lastRun[lastRun.length - 1] : null }
}

/**
 * What a chart says to a screen reader: "Revenue: 30 days, from $1.2k to $3.4k; low $900, high $5.1k."
 * `unitLabel` names the steps ("days", "weeks").
 */
export function describeSeries(label: string, values: Series, format: ValueFormat, unitLabel = 'points'): string {
  const known = finite(values)
  if (known.length === 0) return `${label}: no data in this period.`
  const first = values.find(v => typeof v === 'number' && Number.isFinite(v)) as number
  const last = [...values].reverse().find(v => typeof v === 'number' && Number.isFinite(v)) as number
  const lo = Math.min(...known)
  const hi = Math.max(...known)
  const f = (n: number) => formatChartValue(n, format)
  const gaps = values.length - known.length
  const gapNote = gaps > 0 ? ` ${gaps} with no data.` : ''
  return `${label}: ${values.length} ${unitLabel}, from ${f(first)} to ${f(last)}; low ${f(lo)}, high ${f(hi)}.${gapNote}`
}

/** Even tick values across a domain, at most `count`, for axes we draw ourselves. */
export function ticksFor(domain: [number, number], count = 3): number[] {
  const [lo, hi] = domain
  if (count < 2 || lo === hi) return [lo]
  const step = (hi - lo) / (count - 1)
  return Array.from({ length: count }, (_, i) => lo + step * i)
}

export interface DatedValue {
  /** ISO date the bucket starts on. */
  date: string
  value: number | null
}

/** One row of a trend chart: the current period's day, and the comparison period's day at the same position. */
export interface TrendPoint {
  date: string
  value: number | null
  comparison?: number | null
  comparisonDate?: string
}

/**
 * Lines the comparison period up under the current one by position: day 1 against day 1. The two windows
 * have the same length, so the faded line sits directly behind the one it's compared with.
 */
export function alignComparison(current: ReadonlyArray<DatedValue>, previous?: ReadonlyArray<DatedValue>): TrendPoint[] {
  return current.map((point, i) => {
    const before = previous?.[i]
    return before
      ? { date: point.date, value: point.value, comparison: before.value, comparisonDate: before.date }
      : { date: point.date, value: point.value }
  })
}

export type TargetDirection = 'higher' | 'lower'
export type TargetStatus = 'on' | 'near' | 'off'

/**
 * Where a value sits against a target: on it, near it (within `tolerance`, a fraction of the target), or off.
 * A display default only; the scorecard's own status rules can override what a bullet shows.
 */
export function targetStatus(value: number, target: number, direction: TargetDirection, tolerance = 0.05): TargetStatus {
  const gap = direction === 'higher' ? target - value : value - target
  if (gap <= 0) return 'on'
  return gap <= Math.abs(target) * tolerance ? 'near' : 'off'
}

/**
 * Round axis ticks covering a range: a "nice" step (1, 2, 2.5 or 5 × 10ⁿ) and the ends on a step, so an axis reads
 * $0 / $150 / $300 rather than 0 / 150 / 306.9. `count` is the most ticks wanted. A flat or empty range gets one step.
 */
export function niceTicks(lo: number, hi: number, count = 4): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1]
  if (hi < lo) [lo, hi] = [hi, lo]
  if (hi === lo) hi = lo === 0 ? 1 : lo + Math.abs(lo) * 0.1
  const raw = (hi - lo) / Math.max(1, count - 1)
  const power = 10 ** Math.floor(Math.log10(raw))
  const span = (step: number) => {
    const start = Math.floor(lo / step + 1e-9) * step
    const end = Math.ceil(hi / step - 1e-9) * step
    return { start, end, n: Math.round((end - start) / step) + 1 }
  }
  // The smallest round step that needs at most one tick more than asked for.
  const step = [1, 2, 2.5, 5, 10, 20].map(m => m * power).find(s => span(s).n <= count + 1) ?? 20 * power
  const { start, n } = span(step)
  return Array.from({ length: n }, (_, i) => Number((start + i * step).toPrecision(12)))
}

/** A target as a chart gets it: at least `low`, at most `high`, or between the two. */
export interface TargetBand {
  low?: number | null
  high?: number | null
}

/** Whether a value meets a target band (null when there's no target or no value to judge). */
export function meetsTarget(value: number | null | undefined, target: TargetBand | null | undefined): boolean | null {
  if (value === null || value === undefined || !target) return null
  const low = typeof target.low === 'number' ? target.low : null
  const high = typeof target.high === 'number' ? target.high : null
  if (low === null && high === null) return null
  return (low === null || value >= low) && (high === null || value <= high)
}
