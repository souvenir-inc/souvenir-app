import { describe, expect, it } from 'vitest'

import { BENCHMARK_DATA } from './benchmark-data'
import {
  bandFor, benchmarkFlag, benchmarkFlagDetail, benchmarkOf, benchmarksKey, deviceBenchmarks, flagLabel, judgeBenchmark, NO_BENCHMARK_REASON, parseEdits,
  type BenchmarkBand,
} from './benchmarks'

const ceiling: BenchmarkBand = { healthy: { high: 0.05 }, redFlag: { above: 0.10 } }
const floor: BenchmarkBand = { healthy: { low: 3 }, redFlag: { below: 2.5 } }
const range: BenchmarkBand = { healthy: { low: 0.01, high: 0.03 } }

describe('judging a value against a band', () => {
  it('a ceiling: inside, near (short of the red flag), outside', () => {
    expect(judgeBenchmark(0.03, ceiling, 'exact')).toBe('inside')
    expect(judgeBenchmark(0.07, ceiling, 'exact')).toBe('near')
    expect(judgeBenchmark(0.12, ceiling, 'exact')).toBe('outside')
  })

  it('a floor and a range', () => {
    expect(judgeBenchmark(3.4, floor, 'approximate')).toBe('inside')
    expect(judgeBenchmark(2.7, floor, 'approximate')).toBe('near')
    expect(judgeBenchmark(2.1, floor, 'approximate')).toBe('outside')
    expect(judgeBenchmark(0.02, range, 'exact')).toBe('inside')
    expect(judgeBenchmark(0.04, range, 'exact')).toBe('outside')
  })

  it('never judges a definition that doesn’t match ours, or a missing value', () => {
    expect(judgeBenchmark(0.2, ceiling, 'mismatch')).toBe('not_judged')
    expect(judgeBenchmark(null, ceiling, 'exact')).toBe('not_judged')
  })
})

describe('workspace edits', () => {
  it('an edit wins over the default, and garbage reads as no edits', () => {
    const edits = { refund_rate: { band: ceiling, setAt: '2026-11-12T10:00:00Z' } }
    expect(bandFor('refund_rate', edits)).toEqual({ band: ceiling, edited: true })
    expect(parseEdits('{nope')).toEqual({})
    expect(parseEdits(JSON.stringify({ x: { band: 'bad' } }))).toEqual({})
    expect(parseEdits(JSON.stringify(edits))).toEqual(edits)
  })

  it('saves per workspace on this device', () => {
    const data = new Map<string, string>()
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v) } } as unknown as Storage
    const store = deviceBenchmarks('ws-1', storage)
    store.write({ aov: { band: floor, setAt: '2026-11-12T10:00:00Z' } })
    expect(store.read().aov.band).toEqual(floor)
    expect(deviceBenchmarks('ws-2', storage).read()).toEqual({})
    expect(benchmarksKey('ws-1')).toBe('souvenir.benchmarks.v1.ws-1')
    expect(() => deviceBenchmarks('ws-1', null).write({})).toThrow(/site data/)
  })
})

describe('the researched data', () => {
  it('every band is sourced, in fraction units for rates, and coherent', () => {
    for (const benchmark of BENCHMARK_DATA) {
      expect(benchmark.sources.length, benchmark.metric).toBeGreaterThan(0)
      const { low, high } = benchmark.band.healthy
      expect(low !== undefined || high !== undefined, benchmark.metric).toBe(true)
      if (low !== undefined && high !== undefined) expect(low, benchmark.metric).toBeLessThanOrEqual(high)
      expect(benchmark.note.length, benchmark.metric).toBeGreaterThan(10)
    }
  })

  it('absolute numbers say why there is no benchmark', () => {
    for (const metric of ['revenue', 'orders', 'ad_spend']) {
      expect(NO_BENCHMARK_REASON[metric]).toBeTruthy()
      expect(BENCHMARK_DATA.some(b => b.metric === metric)).toBe(false)
    }
  })
})

describe('reference-only bands', () => {
  it('MER and ad-spend share are shown for reference, never judged, because ours counts Meta spend only', async () => {
    const { benchmarkOf } = await import('./benchmarks')
    for (const metric of ['mer', 'ad_spend_share']) {
      const benchmark = benchmarkOf(metric)!
      expect(benchmark.match, metric).toBe('mismatch')
      expect(judgeBenchmark(9.5, benchmark.band, benchmark.match)).toBe('not_judged')
    }
  })
})

describe('flagging a metric that is not performing well', () => {
  it('red past the red-flag line, amber outside healthy, nothing inside', () => {
    const edits = { refund_rate: { band: ceiling, setAt: '2026-11-13T10:00:00Z' }, aov: { band: floor, setAt: '2026-11-13T10:00:00Z' } }
    expect(benchmarkFlag('refund_rate', 0.03, edits)).toBeNull()
    expect(benchmarkFlag('refund_rate', 0.07, edits)).toBe('amber')
    expect(benchmarkFlag('refund_rate', 0.12, edits)).toBe('red')
    expect(benchmarkFlagDetail('aov', 2.7, edits)).toMatchObject({ level: 'amber', side: 'below', edited: true })
    expect(benchmarkFlag('aov', 2.1, edits)).toBe('red')
  })

  it('a band with no red-flag line only ever flags amber', () => {
    const edits = { ctr: { band: range, setAt: '2026-11-13T10:00:00Z' } }
    expect(benchmarkFlagDetail('ctr', 0.05, edits)).toMatchObject({ level: 'amber', side: 'above' })
  })

  it('no flag without a value, a benchmark, or a like-for-like definition', () => {
    expect(benchmarkFlag('refund_rate', null, {})).toBeNull()
    expect(benchmarkFlag('revenue', 1, {})).toBeNull()
    expect(benchmarkFlag('mer', 0.5, {})).toBeNull()
  })

  it('names the flag the way the pill reads', () => {
    expect(flagLabel({ level: 'red', side: 'above' })).toBe('Red flag')
    expect(flagLabel({ level: 'amber', side: 'below' })).toBe('Below healthy')
    expect(flagLabel({ level: 'amber', side: 'above' })).toBe('Above healthy')
  })

  it('finds the CPA benchmark by the catalog name and the template name', () => {
    expect(benchmarkOf('cpa')?.metric).toBe('cpa')
    expect(benchmarkOf('blended_cpa')).toBe(benchmarkOf('cpa'))
    expect(BENCHMARK_DATA.some(b => b.metric === 'blended_cpa')).toBe(false)
  })
})

