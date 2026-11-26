// Benchmarks: is this number normal for stores like this one? Rules from Scope 1 (scope/benchmarks.md):
// - Every band carries its source, date, sample and how sure we are (Known, Known (excerpt), Inferred).
// - With a target, the target decides on track or off. With no target, a metric outside its healthy band is
//   flagged: red past the red-flag line, orange outside healthy (Dev, 13 Nov: "show the ones which are not
//   performing well"; this overrides Scope 1's "a benchmark is never the row's colour" for untargeted metrics).
// - Only compare like with like: a band whose definition doesn't match ours is shown for reference, not judged.
// - Bands are editable per workspace (saved on this device until the back end has them); the default stays visible.
// Absolute numbers (revenue, orders, ad spend) have no generic benchmark: they depend on the store's size.

import { z } from 'zod'
import type { Direction } from './model'
import { BENCHMARK_DATA } from './benchmark-data'

export type Evidence = 'Known' | 'Known (excerpt)' | 'Inferred'

export interface BenchmarkSource {
  publisher: string
  title: string
  url?: string
  date?: string
  sample?: string
  evidence: Evidence
}

/** A healthy range and, optionally, red-flag lines, in the metric's own units (rates as fractions). */
export interface BenchmarkBand {
  healthy: { low?: number; high?: number }
  redFlag?: { below?: number; above?: number }
}

export interface Benchmark {
  metric: string
  direction: Direction
  band: BenchmarkBand
  /** Bands for a vertical, where a good source exists. */
  verticals?: Record<string, BenchmarkBand>
  sources: BenchmarkSource[]
  /** How well the source's definition matches ours. A mismatch is shown but never judged. */
  match: 'exact' | 'approximate' | 'mismatch'
  matchNote?: string
  confidence: 'high' | 'medium' | 'low'
  /** One plain sentence a founder would read. */
  note: string
}

/** Why a metric has no generic benchmark. */
export const NO_BENCHMARK_REASON: Record<string, string> = {
  revenue: 'Revenue depends on the size of the store, so there’s no fair number to compare with. Your own history and plan are the benchmark.',
  orders: 'Orders depend on the size of the store, so there’s no fair number to compare with. Your own history and plan are the benchmark.',
  ad_spend: 'Spend is a choice that depends on the store’s size and plan, not something with a normal range. Judge it by what it returns (MER, CPA).',
  new_customers: 'New customers depend on the size of the store. The share of orders from new customers is the comparable number.',
}

/**
 * Other names a benchmarked metric goes by: the catalog's built-in is `cpa` ("Blended CPA"), and the metric
 * library's template saves the same formula as `blended_cpa`.
 */
const BENCHMARK_ALIASES: Record<string, string> = { blended_cpa: 'cpa' }

export function benchmarkOf(metric: string): Benchmark | null {
  const key = BENCHMARK_ALIASES[metric] ?? metric
  return BENCHMARK_DATA.find(benchmark => benchmark.metric === key) ?? null
}

// ── Judging a value against a band ───────────────────────────────────────────

export type BenchmarkVerdict = 'inside' | 'near' | 'outside' | 'not_judged'

/**
 * Inside the healthy range; near (outside it, but not past a red-flag line); outside (past a red-flag line, or
 * outside the range when there's no line). A definition mismatch, or no value, is not judged.
 */
export function judgeBenchmark(value: number | null, band: BenchmarkBand, match: Benchmark['match']): BenchmarkVerdict {
  if (value === null || match === 'mismatch') return 'not_judged'
  const { low, high } = band.healthy
  const inside = (low === undefined || value >= low) && (high === undefined || value <= high)
  if (inside) return 'inside'
  const flag = band.redFlag
  if (!flag || (flag.below === undefined && flag.above === undefined)) return 'outside'
  const past = (flag.below !== undefined && value < flag.below) || (flag.above !== undefined && value > flag.above)
  return past ? 'outside' : 'near'
}

// ── Flagging: the metrics not performing well ───────────────────────────────

export type FlagLevel = 'red' | 'amber'

export interface BenchmarkFlag {
  /** Red: past the red-flag line. Amber: outside the healthy range, not past a red-flag line. */
  level: FlagLevel
  /** Which side of the healthy range the value fell. */
  side: 'below' | 'above'
  band: BenchmarkBand
  /** The workspace's own band, not the researched one. */
  edited: boolean
}

/**
 * Whether a metric's value is outside its benchmark, for the period on screen. Null when it's inside, has no
 * benchmark, has a band measured differently from ours (not judged), or has no value (no data yet).
 */
export function benchmarkFlagDetail(metric: string, value: number | null | undefined, edits: BenchmarkEdits): BenchmarkFlag | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null
  const inForce = bandFor(metric, edits)
  if (!inForce) return null
  if (!inForce.edited && benchmarkOf(metric)?.match === 'mismatch') return null
  const { low, high } = inForce.band.healthy
  const side = low !== undefined && value < low ? 'below' : high !== undefined && value > high ? 'above' : null
  if (side === null) return null
  const line = inForce.band.redFlag
  const past = (line?.below !== undefined && value < line.below) || (line?.above !== undefined && value > line.above)
  return { level: past ? 'red' : 'amber', side, band: inForce.band, edited: inForce.edited }
}

/** 'red' (past the red-flag line), 'amber' (outside healthy, not past red), or null. */
export function benchmarkFlag(metric: string, value: number | null | undefined, edits: BenchmarkEdits): FlagLevel | null {
  return benchmarkFlagDetail(metric, value, edits)?.level ?? null
}

/** The pill's words: "Red flag", "Below healthy", "Above healthy". */
export function flagLabel(flag: Pick<BenchmarkFlag, 'level' | 'side'>): string {
  if (flag.level === 'red') return 'Red flag'
  return flag.side === 'below' ? 'Below healthy' : 'Above healthy'
}

// ── Workspace edits ──────────────────────────────────────────────────────────

export interface BenchmarkEdit {
  band: BenchmarkBand
  /** Why it was changed, in the person's words; optional. */
  reason?: string
  setAt: string
}

export type BenchmarkEdits = Record<string, BenchmarkEdit>

const numberish = z.number().finite().optional()
const bandSchema = z.object({
  healthy: z.object({ low: numberish, high: numberish }),
  redFlag: z.object({ below: numberish, above: numberish }).optional(),
})
const editsSchema = z.record(z.string(), z.object({ band: bandSchema, reason: z.string().optional(), setAt: z.string() }))

export function benchmarksKey(workspaceId: string): string {
  return `souvenir.benchmarks.v1.${workspaceId}`
}

export function parseEdits(raw: string | null): BenchmarkEdits {
  if (raw === null) return {}
  try {
    const parsed = editsSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : {}
  } catch {
    return {}
  }
}

/** The band in force for a metric: this workspace's edit, else the researched default. */
export function bandFor(metric: string, edits: BenchmarkEdits): { band: BenchmarkBand; edited: boolean } | null {
  const edit = edits[metric]
  if (edit) return { band: edit.band, edited: true }
  const benchmark = benchmarkOf(metric)
  return benchmark ? { band: benchmark.band, edited: false } : null
}

function browserStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/** Benchmark edits saved in this browser for one workspace. Reads never throw; a failed save throws a message. */
export function deviceBenchmarks(workspaceId: string, storage: Storage | null = browserStorage()) {
  const key = benchmarksKey(workspaceId)
  return {
    read(): BenchmarkEdits {
      try {
        return parseEdits(storage?.getItem(key) ?? null)
      } catch {
        return {}
      }
    },
    write(edits: BenchmarkEdits): BenchmarkEdits {
      if (storage === null) throw new Error("This browser isn't letting Souvenir save here. Check that site data is allowed.")
      try {
        storage.setItem(key, JSON.stringify(edits))
      } catch {
        throw new Error("Couldn't save the benchmark on this device. The browser's storage may be full.")
      }
      return edits
    },
  }
}
