import { describe, expect, it } from 'vitest'
import type { Expression, Term } from '@/lib/api/warehouse-schemas'
import { MAX_FORMULA_LENGTH, MAX_NESTING, parseFormula, printFormula } from './formula'
import { absorbTyping, checkPieces, piecesFromText, suggestMetrics } from './tokens'
import { buildTree, catalogLookup, evaluate, isMetricValue, valuesFrom } from './tree'

// Property-style checks of the formula parser without a new dependency (TEST-TQ-01..03): a seeded generator
// (fixed seeds, reproducible), many cases each. The parser reads what a person types, so it must never throw,
// must read back what it prints, and must stay fast and bounded on hostile text.

/** mulberry32: a small seeded PRNG, so a failing case can be replayed from its seed. */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const NAMES = ['revenue', 'ad_spend', 'orders', 'refunds', 'net_sales', '__proto__', 'constructor', 'to_string', 'x1']
const ALPHABET = [...'abcxyz_019 .%()+-*/×÷−–^$\u0000‮́é漢😀\n\t', 'revenue', 'constructor', '__proto__', 'sum(', 'count(']

function pick<T>(next: () => number, list: readonly T[]): T {
  return list[Math.floor(next() * list.length)]
}

/** A random expression over NAMES and small numbers, at most `depth` levels deep. */
function expression(next: () => number, depth: number): Expression {
  const term = (): Term => (depth <= 1 || next() < 0.5
    ? (next() < 0.7 ? pick(next, NAMES) : Math.round(next() * 1000) / 10 + 1)
    : expression(next, depth - 1))
  const op = pick(next, ['add', 'subtract', 'multiply', 'ratio'] as const)
  switch (op) {
    case 'add': return { op, terms: Array.from({ length: 2 + Math.floor(next() * 3) }, term) }
    case 'multiply': return { op, terms: Array.from({ length: 2 + Math.floor(next() * 3) }, term) }
    case 'subtract': return { op, left: term(), right: term() }
    case 'ratio': return { op, numerator: term(), denominator: term() }
  }
}

function randomText(next: () => number, length: number): string {
  return Array.from({ length }, () => pick(next, ALPHABET)).join('')
}

function elapsed(run: () => void): number {
  const start = performance.now()
  run()
  return performance.now() - start
}

describe('parseFormula, property style', () => {
  it('never throws on any text, and every failure points inside the text', () => {
    for (let seed = 1; seed <= 400; seed++) {
      const next = rng(seed)
      const text = randomText(next, Math.floor(next() * 120))
      const result = parseFormula(text, next() < 0.5 ? { known: NAMES } : {})
      if (!result.ok) {
        expect(result.error.start).toBeGreaterThanOrEqual(0)
        expect(result.error.end).toBeLessThanOrEqual(Math.max(text.length, MAX_FORMULA_LENGTH))
      }
    }
  })

  it('reads back exactly what it prints', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const printed = printFormula(expression(rng(seed), 5))
      const parsed = parseFormula(printed)
      expect(parsed.ok, `seed ${seed}: ${printed}`).toBe(true)
      if (parsed.ok) expect(printFormula(parsed.value)).toBe(printed)
    }
  })

  it('gives back formulas the warehouse and the tree can take', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const parsed = parseFormula(printFormula(expression(rng(seed), 4)))
      if (!parsed.ok) continue
      expect(isMetricValue(parsed.value)).toBe(true)
      const tree = buildTree('proposal', catalogLookup([{ name: 'proposal', value: parsed.value }]))
      expect(() => evaluate(tree, valuesFrom({ revenue: 1, orders: 2 }))).not.toThrow()
    }
  })

  it('refuses bracket nesting past the limit instead of overflowing the stack', () => {
    const deep = `${'('.repeat(MAX_NESTING + 1)}revenue${')'.repeat(MAX_NESTING + 1)} / orders`
    expect(parseFormula(deep)).toMatchObject({ ok: false, error: { message: expect.stringMatching(/Too many brackets/) } })
    const fine = `${'('.repeat(MAX_NESTING)}revenue${')'.repeat(MAX_NESTING)} / orders`
    expect(parseFormula(fine).ok).toBe(true)
    const huge = `${'('.repeat(100_000)}revenue`
    expect(parseFormula(huge).ok).toBe(false)
  })

  it('refuses text over the length cap before reading it', () => {
    const long = Array.from({ length: 2000 }, () => 'revenue').join(' + ')
    const result = parseFormula(long)
    expect(result).toMatchObject({ ok: false, error: { message: expect.stringMatching(/too long/) } })
    expect(parseFormula(`${'a+'.repeat(250)}a`)).toMatchObject({ ok: false, error: { message: expect.stringMatching(/too long/) } })
  })

  it('treats __proto__, constructor and toString as plain names, never as built-in properties', () => {
    for (const name of ['__proto__', 'constructor', 'tostring', 'hasownproperty']) {
      expect(parseFormula(`${name} / orders`, { known: ['orders'] })).toMatchObject({ ok: false, error: { message: `No metric called ${name}.` } })
      expect(parseFormula(`${name} / orders`).ok).toBe(true)
    }
    expect(Object.prototype).not.toHaveProperty('polluted')
  })

  it('stays fast on 10,000 characters of hostile text (RG-10)', () => {
    const cases = [
      'revenue'.repeat(1500),
      `${'_'.repeat(9999)}!`,
      `${'1'.repeat(9999)}x`,
      `${'('.repeat(5000)}${')'.repeat(5000)}`,
      `${'revenue -'.repeat(1100)}`,
      `sum${' '.repeat(9990)}(`,
    ]
    for (const text of cases) {
      expect(elapsed(() => parseFormula(text))).toBeLessThan(50)
      expect(elapsed(() => checkPieces(piecesFromText(text), NAMES))).toBeLessThan(50)
      expect(elapsed(() => absorbTyping(text, []))).toBeLessThan(50)
      expect(elapsed(() => suggestMetrics(text, []))).toBeLessThan(50)
    }
  })
})
