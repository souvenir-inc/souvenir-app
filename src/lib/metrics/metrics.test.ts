import { describe, expect, it } from 'vitest'
import type { MetricAggregate, MetricEntry, MetricExpression, MetricUnit } from '@/lib/api/warehouse'
import { appsFor, categoryName, categoryOrder, changeOf, columnWords, describeSource, formatDisplay, ruleWords } from './display'
import { closestName, completionsAt, metricNameOf, parseFormula, printFormula } from './formula'
import {
  forgetFormula, formulaLookup, formulaSource, liveFormulas, parseRegistry, readRaw, readRegistry,
  registryKey, rememberFormula, type KeyValueStore,
} from './registry'
import { categoriesIn, countsOf, dataUntilOf, entryFlags, filterRows, groupByUntil, isFiltered, libraryRows, mentionedMetrics, neverSynced, NO_FILTER, originLabel, sectionsOf, zeroFillRule } from './library'
import { absorbTyping, checkPieces, exactWord, isOperatorChar, pieceAt, resolveWord, type Piece, pieceForChar, pieceForWord, piecesFromText, piecesFromValue, suggestMetrics, textOf } from './tokens'
import { metricFromTemplate, TEMPLATES, templatesFor, templateValue } from './templates'
import {
  buildTree, buildTreeFromValue, displayOfMetric, displayOfNode, evaluate, fillMissingTotals, flatOperands, isAdditive, isMetricValue, kindOf, namesIn,
  referencesOf, sizeOf, type FormulaLookup, type MetricNode, type MetricValue, type OperationNode,
} from './tree'
import type { DashboardPeriod } from '@/lib/warehouse/period'
import { afterData, againstOf, againstPhrase, endOf, periodPhrase, isWindowId, previousRangeOf, rangeOf, spanLabel, spanOf, storeToday, weeksRange, windowLabel } from './windows'
import { compareNames, compareSeries, compareValues, impactNames, impactOf, proposedTree } from './compare'

const ORDERS_REVENUE: MetricAggregate = { kind: 'sum', table: 'orders', column: 'total', day: 'placed_at', where: 'cancelled_at is null' }
const ORDER_COUNT: MetricAggregate = { kind: 'count', table: 'orders', column: null, day: 'placed_at', where: null }
const MER: MetricExpression = { op: 'ratio', numerator: 'revenue', denominator: 'ad_spend' }

const UNITS: Record<string, MetricUnit> = {
  revenue: 'money', ad_spend: 'money', orders: 'count', refunds: 'money', new_customers: 'count',
  refund_rate: 'ratio', mer: 'ratio', platform_roas: 'ratio', net_sales: 'money', shipping_revenue: 'money',
  message_attributed_revenue: 'money', profit_per_order: 'money',
}
const unitOf = (name: string) => UNITS[name]

function lookupOf(formulas: Record<string, MetricValue>): FormulaLookup {
  return name => formulas[name] ?? null
}

function entry(name: string, category = 'store', unit: MetricUnit = 'money'): MetricEntry {
  return { name, label: name, unit, description: '', category }
}

class MemoryStore implements KeyValueStore {
  data = new Map<string, string>()
  getItem(key: string) { return this.data.get(key) ?? null }
  setItem(key: string, value: string) { this.data.set(key, value) }
  removeItem(key: string) { this.data.delete(key) }
}

class BrokenStore implements KeyValueStore {
  getItem(): string | null { throw new Error('denied') }
  setItem(): void { throw new Error('quota') }
  removeItem(): void { throw new Error('denied') }
}

describe('kindOf', () => {
  it('calls a table read root and a combination nested', () => {
    expect(kindOf(ORDERS_REVENUE)).toBe('root')
    expect(kindOf(ORDER_COUNT)).toBe('root')
    expect(kindOf(MER)).toBe('nested')
  })
  it('has no kind without a formula', () => {
    expect(kindOf(null)).toBeNull()
    expect(kindOf(undefined)).toBeNull()
  })
})

describe('isMetricValue', () => {
  it('accepts every shape the contract describes', () => {
    expect(isMetricValue(ORDERS_REVENUE)).toBe(true)
    expect(isMetricValue(ORDER_COUNT)).toBe(true)
    expect(isMetricValue(MER)).toBe(true)
    expect(isMetricValue({ op: 'add', terms: ['a', 2, { op: 'subtract', left: 'b', right: 'c' }] })).toBe(true)
    expect(isMetricValue({ op: 'multiply', terms: ['net_sales', 0.3] })).toBe(true)
  })
  it('rejects anything else', () => {
    expect(isMetricValue(null)).toBe(false)
    expect(isMetricValue('revenue')).toBe(false)
    expect(isMetricValue({ op: 'divide', left: 'a', right: 'b' })).toBe(false)
    expect(isMetricValue({ op: 'add', terms: [] })).toBe(false)
    expect(isMetricValue({ op: 'ratio', numerator: 'a' })).toBe(false)
    expect(isMetricValue({ kind: 'avg', table: 'orders', column: 'total', day: 'placed_at', where: null })).toBe(false)
    expect(isMetricValue({ op: 'add', terms: ['a', Number.NaN] })).toBe(false)
  })
})

describe('buildTree', () => {
  it('stops at a built-in whose formula is not known, without guessing', () => {
    const tree = buildTree('revenue', lookupOf({}))
    expect(tree).toEqual({ type: 'metric', id: 'm', name: 'revenue', kind: null, body: null, stop: 'unknown' })
  })

  it('expands a root metric into its source', () => {
    const tree = buildTree('revenue', lookupOf({ revenue: ORDERS_REVENUE }))
    expect(tree.kind).toBe('root')
    expect(tree.body).toEqual({ type: 'source', id: 'm.s', aggregate: ORDERS_REVENUE })
  })

  it('expands a nested metric into an operation over metric leaves', () => {
    const tree = buildTree('mer', lookupOf({ mer: MER }))
    expect(tree.kind).toBe('nested')
    const body = tree.body as OperationNode
    expect(body.op).toBe('ratio')
    expect(body.children.map(child => child.type === 'metric' && child.name)).toEqual(['revenue', 'ad_spend'])
    expect(body.children.map(child => child.id)).toEqual(['m.f.0', 'm.f.1'])
  })

  it('expands custom metrics used inside other custom metrics, down to their tables', () => {
    const tree = buildTree('mer_after_refunds', lookupOf({
      mer_after_refunds: { op: 'ratio', numerator: 'net', denominator: 'ad_spend' },
      net: { op: 'subtract', left: 'revenue', right: 'refunds' },
      revenue: ORDERS_REVENUE,
    }))
    const net = (tree.body as OperationNode).children[0] as MetricNode
    expect(net.kind).toBe('nested')
    const revenue = (net.body as OperationNode).children[0] as MetricNode
    expect(revenue.kind).toBe('root')
    expect(revenue.body?.type).toBe('source')
    const refunds = (net.body as OperationNode).children[1] as MetricNode
    expect(refunds.stop).toBe('unknown')
  })

  it('keeps numbers and nested expressions as their own nodes', () => {
    const tree = buildTree('x', lookupOf({ x: { op: 'multiply', terms: [{ op: 'subtract', left: 'revenue', right: 'refunds' }, 0.3] } }))
    const body = tree.body as OperationNode
    expect(body.children[0].type).toBe('operation')
    expect(body.children[1]).toEqual({ type: 'number', id: 'm.f.1', value: 0.3 })
  })

  it('breaks a cycle instead of looping', () => {
    const tree = buildTree('a', lookupOf({ a: { op: 'add', terms: ['b', 1] }, b: { op: 'add', terms: ['a', 1] } }))
    const b = (tree.body as OperationNode).children[0] as MetricNode
    const a = (b.body as OperationNode).children[0] as MetricNode
    expect(a.stop).toBe('cycle')
    expect(a.body).toBeNull()
  })

  it('expands a metric used twice only the first time', () => {
    const tree = buildTree('cm3', lookupOf({
      cm3: { op: 'subtract', left: 'cm1', right: 'revenue' },
      cm1: { op: 'subtract', left: 'revenue', right: 'cogs' },
      revenue: ORDERS_REVENUE,
    }))
    const cm1 = (tree.body as OperationNode).children[0] as MetricNode
    const firstRevenue = (cm1.body as OperationNode).children[0] as MetricNode
    const secondRevenue = (tree.body as OperationNode).children[1] as MetricNode
    expect(firstRevenue.body?.type).toBe('source')
    expect(secondRevenue).toMatchObject({ kind: 'root', body: null, stop: 'repeat' })
    expect(namesIn(tree)).toEqual(['cm3', 'cm1', 'revenue', 'cogs'])
  })

  it('stops at the depth limit', () => {
    const chain: Record<string, MetricValue> = {}
    for (let i = 0; i < 20; i++) chain[`m${i}`] = { op: 'add', terms: [`m${i + 1}`, 1] }
    const tree = buildTree('m0', lookupOf(chain), 3)
    let node: MetricNode = tree
    let depth = 0
    while (node.body !== null) { node = (node.body as OperationNode).children[0] as MetricNode; depth++ }
    expect(depth).toBe(3)
    expect(node.stop).toBe('depth')
  })

  it('ignores a malformed stored formula', () => {
    const tree = buildTree('x', (() => ({ op: 'divide' })) as unknown as FormulaLookup)
    expect(tree.stop).toBe('unknown')
  })

  it('builds a tree for an unsaved proposal', () => {
    const tree = buildTreeFromValue('mer', MER, lookupOf({ revenue: ORDERS_REVENUE }))
    expect(tree.kind).toBe('nested')
    const revenue = (tree.body as OperationNode).children[0] as MetricNode
    expect(revenue.kind).toBe('root')
  })
})

describe('namesIn', () => {
  const tree = buildTree('mer_after_refunds', lookupOf({
    mer_after_refunds: { op: 'ratio', numerator: { op: 'subtract', left: 'revenue', right: 'refunds' }, denominator: 'ad_spend' },
  }))
  it('lists every metric once, root first, for one measurement', () => {
    expect(namesIn(tree)).toEqual(['mer_after_refunds', 'revenue', 'refunds', 'ad_spend'])
  })
  it('leaves out names the catalog does not have, so one unknown name cannot fail the request', () => {
    expect(namesIn(tree, new Set(['revenue', 'ad_spend']))).toEqual(['revenue', 'ad_spend'])
  })
  it('lists a repeated metric once', () => {
    const twice = buildTree('x', lookupOf({ x: { op: 'add', terms: ['revenue', { op: 'multiply', terms: ['revenue', 2] }] } }))
    expect(namesIn(twice)).toEqual(['x', 'revenue'])
  })
})

describe('referencesOf', () => {
  it('lists the metrics a formula uses directly', () => {
    expect(referencesOf(MER)).toEqual(['revenue', 'ad_spend'])
    expect(referencesOf({ op: 'add', terms: ['a', { op: 'ratio', numerator: 'b', denominator: 'a' }, 3] })).toEqual(['a', 'b'])
    expect(referencesOf(ORDERS_REVENUE)).toEqual([])
  })
})

describe('evaluate', () => {
  const tree = buildTree('x', lookupOf({ x: { op: 'ratio', numerator: { op: 'subtract', left: 'revenue', right: 'refunds' }, denominator: 'orders' } }))
  const inner = (tree.body as OperationNode).children[0]

  it('prefers the measured number for a named metric', () => {
    expect(evaluate(tree, { x: 42, revenue: 1000, refunds: 100, orders: 10 })).toBe(42)
  })
  it('works out in-between steps from their parts', () => {
    expect(evaluate(inner, { revenue: 1000, refunds: 100 })).toBe(900)
    expect(evaluate(tree, { revenue: 1000, refunds: 100, orders: 10 })).toBe(90)
  })
  it('keeps missing data missing instead of treating it as zero', () => {
    expect(evaluate(inner, { revenue: 1000, refunds: null })).toBeNull()
    expect(evaluate(tree, {})).toBeNull()
  })
  it('has no answer for a division by zero', () => {
    expect(evaluate(tree, { revenue: 1000, refunds: 100, orders: 0 })).toBeNull()
  })
  it('adds and multiplies every term', () => {
    const sum = buildTree('s', lookupOf({ s: { op: 'add', terms: ['a', 'b', 2] } }))
    expect(evaluate(sum, { a: 1, b: 2 })).toBe(5)
    const product = buildTree('p', lookupOf({ p: { op: 'multiply', terms: ['a', 'b', 0.5] } }))
    expect(evaluate(product, { a: 4, b: 3 })).toBe(6)
  })
})

describe('display units', () => {
  const none = lookupOf({})
  it('reads a ratio over spend as a multiple', () => {
    expect(displayOfMetric('mer', 'ratio', MER, unitOf)).toBe('multiple')
    expect(displayOfMetric('platform_roas', 'ratio', null, unitOf)).toBe('multiple')
  })
  it('reads other ratios as a percent', () => {
    expect(displayOfMetric('refund_rate', 'ratio', null, unitOf)).toBe('percent')
    expect(displayOfMetric('ad_spend_share', 'ratio', { op: 'ratio', numerator: 'ad_spend', denominator: 'revenue' }, unitOf)).toBe('percent')
  })
  it('reads money over a count as money', () => {
    const tree = buildTree('cpa', lookupOf({ cpa: { op: 'ratio', numerator: 'ad_spend', denominator: 'orders' } }))
    expect(displayOfNode(tree.body!, unitOf, none)).toBe('money')
  })
  it('carries a unit through subtraction and scaling', () => {
    const tree = buildTree('x', lookupOf({ x: { op: 'multiply', terms: [{ op: 'subtract', left: 'revenue', right: 'refunds' }, 0.3] } }))
    expect(displayOfNode(tree.body!, unitOf, none)).toBe('money')
    expect(displayOfNode((tree.body as OperationNode).children[1], unitOf, none)).toBe('number')
  })
  it('reads a source by what it does', () => {
    expect(displayOfNode({ type: 'source', id: 's', aggregate: ORDER_COUNT }, unitOf, none)).toBe('count')
    expect(displayOfNode({ type: 'source', id: 's', aggregate: ORDERS_REVENUE }, unitOf, none)).toBe('money')
  })
})

describe('sizeOf', () => {
  it('counts every node', () => {
    expect(sizeOf(buildTree('mer', lookupOf({ mer: MER })))).toBe(4)
  })
})

describe('printFormula', () => {
  it('prints the typing form', () => {
    expect(printFormula(MER)).toBe('revenue / ad_spend')
    expect(printFormula({ op: 'multiply', terms: ['net_sales', 0.3] })).toBe('net_sales * 0.3')
    expect(printFormula({ op: 'add', terms: ['a', 'b', 'c'] })).toBe('a + b + c')
  })
  it('prints the reading form with labels', () => {
    const labels: Record<string, string> = { revenue: 'Revenue', ad_spend: 'Ad spend' }
    expect(printFormula(MER, { pretty: true, labelOf: name => labels[name] })).toBe('Revenue ÷ Ad spend')
    expect(printFormula({ op: 'subtract', left: 'revenue', right: 'other' }, { pretty: true, labelOf: name => labels[name] })).toBe('Revenue − other')
  })
  it('brackets only where the order of operations needs it', () => {
    expect(printFormula({ op: 'ratio', numerator: { op: 'subtract', left: 'revenue', right: 'refunds' }, denominator: 'orders' }))
      .toBe('(revenue - refunds) / orders')
    expect(printFormula({ op: 'subtract', left: 'a', right: { op: 'add', terms: ['b', 'c'] } })).toBe('a - (b + c)')
    expect(printFormula({ op: 'subtract', left: { op: 'subtract', left: 'a', right: 'b' }, right: 'c' })).toBe('a - b - c')
    expect(printFormula({ op: 'ratio', numerator: 'a', denominator: { op: 'multiply', terms: ['b', 'c'] } })).toBe('a / (b * c)')
    expect(printFormula({ op: 'ratio', numerator: { op: 'multiply', terms: ['a', 'b'] }, denominator: 'c' })).toBe('a * b / c')
    expect(printFormula({ op: 'add', terms: [{ op: 'ratio', numerator: 'a', denominator: 'b' }, 1] })).toBe('a / b + 1')
  })
  it('prints table reads', () => {
    expect(printFormula(ORDERS_REVENUE)).toBe('sum(orders.total where cancelled_at is null)')
    expect(printFormula(ORDER_COUNT)).toBe('count(orders)')
  })
})

describe('parseFormula', () => {
  const known = ['revenue', 'ad_spend', 'refunds', 'orders', 'net_sales', 'new_customers']

  const ok = (text: string) => {
    const result = parseFormula(text, { known })
    if (!result.ok) throw new Error(result.error.message)
    return result
  }
  const fail = (text: string, options = {}) => {
    const result = parseFormula(text, { known, ...options })
    if (result.ok) throw new Error(`parsed ${text}`)
    return result.error
  }

  it('reads a ratio', () => {
    expect(ok('revenue / ad_spend')).toEqual({ ok: true, value: MER, names: ['revenue', 'ad_spend'] })
  })
  it('follows the order of operations and brackets', () => {
    expect(ok('revenue - refunds / orders').value).toEqual({ op: 'subtract', left: 'revenue', right: { op: 'ratio', numerator: 'refunds', denominator: 'orders' } })
    expect(ok('(revenue - refunds) / orders').value).toEqual({ op: 'ratio', numerator: { op: 'subtract', left: 'revenue', right: 'refunds' }, denominator: 'orders' })
  })
  it('flattens chains of the same operation', () => {
    expect(ok('revenue + refunds + orders').value).toEqual({ op: 'add', terms: ['revenue', 'refunds', 'orders'] })
    expect(ok('net_sales * 0.3 * 2').value).toEqual({ op: 'multiply', terms: ['net_sales', 0.3, 2] })
  })
  it('accepts the signs people write and percentages', () => {
    expect(ok('Revenue ÷ Ad_Spend').value).toEqual(MER)
    expect(ok('net_sales × 30%').value).toEqual({ op: 'multiply', terms: ['net_sales', 0.3] })
    expect(ok('net_sales x 2').value).toEqual({ op: 'multiply', terms: ['net_sales', 2] })
    expect(ok('revenue − refunds').value).toEqual({ op: 'subtract', left: 'revenue', right: 'refunds' })
    expect(ok('revenue * -1').value).toEqual({ op: 'multiply', terms: ['revenue', -1] })
  })
  it('round-trips what it prints', () => {
    for (const text of ['revenue / ad_spend', '(revenue - refunds) / orders', 'revenue - (refunds + orders)', 'revenue / (ad_spend * 2)', 'net_sales * 0.3 + revenue']) {
      expect(printFormula(ok(text).value)).toBe(text)
    }
  })
  it('says which name it does not know, and what was meant', () => {
    const error = fail('revnue / ad_spend')
    expect(error.message).toBe('No metric called revnue. Did you mean revenue?')
    expect([error.start, error.end]).toEqual([0, 6])
    expect(fail('banana / orders').message).toBe('No metric called banana.')
  })
  it('explains every other mistake in plain words', () => {
    expect(fail('').message).toMatch(/Type a formula/)
    expect(fail('revenue /').message).toMatch(/ends early/)
    expect(fail('(revenue - refunds / orders').message).toBe('Close the bracket.')
    expect(fail('revenue) / orders').message).toMatch(/closing bracket/)
    expect(fail('revenue orders').message).toMatch(/Expected \+ − × or ÷ before orders/)
    expect(fail('revenue / 0').message).toBe('Dividing by 0 has no answer.')
    expect(fail('42').message).toMatch(/number on its own/)
    expect(fail('revenue').message).toMatch(/just revenue/)
    expect(fail('revenue ^ 2').message).toMatch(/“\^” isn't part of a formula/)
    expect(fail('sum(orders.total)').message).toMatch(/Ask for it in the chat/)
    expect(fail('mer * 2', { known: [...known, 'mer'], self: 'mer' }).message).toMatch(/built from itself/)
  })
  it('accepts any name when no catalog is given', () => {
    const result = parseFormula('anything / else')
    expect(result.ok).toBe(true)
  })
})

describe('closestName and completions', () => {
  it('finds a near name and nothing far', () => {
    expect(closestName('ad_spnd', ['ad_spend', 'revenue'])).toBe('ad_spend')
    expect(closestName('zzz', ['ad_spend', 'revenue'])).toBeNull()
  })
  it('completes the word at the caret, starts-with first', () => {
    const names = ['revenue', 'net_revenue', 'refunds', 'refund_rate', 'orders']
    expect(completionsAt('ref', 3, names)).toEqual({ start: 0, end: 3, prefix: 'ref', names: ['refunds', 'refund_rate'] })
    expect(completionsAt('net_sales / reve', 16, names)?.names).toEqual(['revenue', 'net_revenue'])
    expect(completionsAt('revenue / ', 10, names)).toBeNull()
    expect(completionsAt('revenue', 7, names)?.names).toEqual(['net_revenue'])
  })
})

describe('registry', () => {
  it('remembers, reads and forgets a formula per workspace', () => {
    const store = new MemoryStore()
    expect(rememberFormula('ws1', 'mer', MER, store, new Date('2026-11-12T12:00:00Z'))).toBe(true)
    expect(readRegistry('ws1', store)).toEqual({ mer: { value: MER, savedAt: '2026-11-12T12:00:00.000Z' } })
    expect(readRegistry('ws2', store)).toEqual({})
    expect(forgetFormula('ws1', 'mer', store)).toBe(true)
    expect(readRegistry('ws1', store)).toEqual({})
    expect(store.data.has(registryKey('ws1'))).toBe(false)
  })
  it('keeps other formulas when adding one', () => {
    const store = new MemoryStore()
    rememberFormula('ws1', 'mer', MER, store)
    rememberFormula('ws1', 'cpa', { op: 'ratio', numerator: 'ad_spend', denominator: 'orders' }, store)
    expect(Object.keys(readRegistry('ws1', store))).toEqual(['mer', 'cpa'])
  })
  it('survives storage that throws or is missing', () => {
    expect(rememberFormula('ws1', 'mer', MER, new BrokenStore())).toBe(false)
    expect(readRegistry('ws1', new BrokenStore())).toEqual({})
    expect(readRaw('ws1', new BrokenStore())).toBeNull()
    expect(forgetFormula('ws1', 'mer', new BrokenStore())).toBe(true)
    expect(rememberFormula('ws1', 'mer', MER, null)).toBe(false)
    expect(readRegistry('ws1', null)).toEqual({})
  })
  it('refuses to store something that is not a formula', () => {
    const store = new MemoryStore()
    expect(rememberFormula('ws1', 'x', { op: 'nope' } as unknown as MetricValue, store)).toBe(false)
  })
  it('drops corrupt or invalid entries when reading', () => {
    expect(parseRegistry('not json')).toEqual({})
    expect(parseRegistry('[]')).toEqual({})
    expect(parseRegistry(JSON.stringify({ good: { value: MER, savedAt: 'x' }, bad: { value: { op: 'nope' } }, worse: 3 })))
      .toEqual({ good: { value: MER, savedAt: 'x' } })
  })
  it('ignores formulas for metrics no longer in the catalog', () => {
    const registry = parseRegistry(JSON.stringify({ mer: { value: MER, savedAt: '' }, gone: { value: MER, savedAt: '' } }))
    expect(Object.keys(liveFormulas(registry, [entry('mer', 'custom')]))).toEqual(['mer'])
  })
})

describe('formulaLookup', () => {
  const registry = parseRegistry(JSON.stringify({ mer: { value: MER, savedAt: '' }, revenue: { value: ORDERS_REVENUE, savedAt: '' } }))
  const catalog = [entry('revenue'), entry('ad_spend', 'ads'), entry('mer', 'custom', 'ratio')]

  it('reads a custom metric from the registry', () => {
    expect(formulaLookup(catalog, registry)('mer')).toEqual(MER)
    expect(formulaSource(catalog[2], registry)).toBe('this-browser')
  })
  it('never gives a built-in a formula the catalog doesn’t send', () => {
    expect(formulaLookup(catalog, registry)('revenue')).toBeNull()
    expect(formulaSource(catalog[0], registry)).toBeNull()
  })
  it('prefers a formula the catalog returns (S3)', () => {
    const withValue = [{ ...entry('revenue'), value: ORDERS_REVENUE } as MetricEntry, ...catalog.slice(1)]
    expect(formulaLookup(withValue, registry)('revenue')).toEqual(ORDERS_REVENUE)
    expect(formulaSource(withValue[0], registry)).toBe('catalog')
  })
  it('takes an unsaved proposal first', () => {
    const proposal: MetricExpression = { op: 'ratio', numerator: 'revenue', denominator: 'orders' }
    expect(formulaLookup(catalog, registry, { mer: proposal })('mer')).toEqual(proposal)
  })
})

describe('templates', () => {
  const catalog = ['revenue', 'ad_spend', 'orders', 'new_customers', 'net_sales', 'shipping_revenue', 'message_attributed_revenue', 'discounts'].map(name => entry(name))

  it('parses every template formula', () => {
    for (const template of TEMPLATES) expect(() => templateValue(template)).not.toThrow()
  })
  it('offers average discount per order as discounts / orders, read as money', () => {
    const template = TEMPLATES.find(t => t.id === 'avg_discount_per_order')!
    const metric = metricFromTemplate(template)
    expect(metric).toMatchObject({ name: 'avg_discount_per_order', unit: 'money', value: { op: 'ratio', numerator: 'discounts', denominator: 'orders' } })
    const units: Record<string, MetricUnit> = { discounts: 'money', orders: 'count' }
    expect(displayOfMetric(metric.name, metric.unit, metric.value, name => units[name])).toBe('money')
    expect(templatesFor(catalog).find(o => o.template.id === 'avg_discount_per_order')?.status).toEqual({ state: 'ready' })
  })
  it('offers MER as revenue / ad_spend', () => {
    const mer = metricFromTemplate(TEMPLATES.find(t => t.id === 'mer')!)
    expect(mer).toMatchObject({ name: 'mer', unit: 'ratio', value: MER })
  })
  it('judges each template against the catalog', () => {
    const status = Object.fromEntries(templatesFor(catalog).map(option => [option.template.id, option.status.state]))
    expect(status).toMatchObject({ mer: 'ready', ncac: 'ready', blended_cpa: 'ready', cm1: 'blocked', cm2: 'blocked', cm3: 'blocked' })
  })
  it('says contribution margin needs product cost', () => {
    const cm1 = templatesFor(catalog).find(option => option.template.id === 'cm1')!
    expect(cm1.status).toEqual({ state: 'blocked', reason: 'Needs product cost, which no connected app sends yet.' })
  })
  it('notices a template already in the library, a missing input and data the store cannot measure', () => {
    const options = templatesFor([...catalog.filter(e => e.name !== 'new_customers'), entry('mer', 'custom')], { orders: 'no connection fills orders' })
    const byId = Object.fromEntries(options.map(option => [option.template.id, option.status]))
    expect(byId.mer).toEqual({ state: 'exists', name: 'mer' })
    expect(byId.ncac).toEqual({ state: 'missing', inputs: ['new_customers'] })
    expect(byId.blended_cpa).toEqual({ state: 'no-data', reason: 'orders: no connection fills orders' })
  })
  it('uses names the warehouse accepts', () => {
    for (const template of TEMPLATES) expect(template.name).toMatch(/^[a-z][a-z0-9_]{0,63}$/)
  })
})

describe('display', () => {
  it('formats each unit', () => {
    expect(formatDisplay(48210.4, 'money')).toBe('$48.2k')
    expect(formatDisplay(48210.4, 'money', { exact: true })).toBe('$48,210')
    expect(formatDisplay(2140, 'count')).toBe('2,140')
    expect(formatDisplay(0.034, 'percent')).toBe('3.40%')
    expect(formatDisplay(0.25, 'percent')).toBe('25.0%')
    expect(formatDisplay(3.2, 'multiple')).toBe('3.20x')
    expect(formatDisplay(0.333333, 'number')).toBe('0.33')
  })
  it('shows missing data as a dash', () => {
    expect(formatDisplay(null, 'money')).toBe('—')
    expect(formatDisplay(Number.POSITIVE_INFINITY, 'count')).toBe('—')
  })
  it('names and orders categories', () => {
    expect(categoryName('email_sms')).toBe('Email & SMS')
    expect(categoryName('loyalty_points')).toBe('Loyalty Points')
    expect(categoryOrder(['custom', 'zeta', 'ads', 'store', 'alpha'])).toEqual(['store', 'ads', 'custom', 'alpha', 'zeta'])
  })
})

describe('windows', () => {
  const now = new Date('2026-11-12T03:30:00Z')
  it('ends today on the store’s clock', () => {
    expect(storeToday('America/Chicago', now)).toBe('2026-11-11')
    expect(storeToday('Asia/Kolkata', now)).toBe('2026-11-12')
    expect(storeToday('Not/AZone', now)).toBe('2026-11-12')
  })
  it('counts the window’s days inclusively and the one before it', () => {
    expect(rangeOf('7d', 'America/Chicago', now)).toEqual({ start: '2026-11-05', end: '2026-11-11' })
    expect(previousRangeOf('7d', 'America/Chicago', now)).toEqual({ start: '2026-10-29', end: '2026-11-04' })
    expect(rangeOf('30d', 'UTC', now)).toEqual({ start: '2026-10-14', end: '2026-11-12' })
  })
  it('knows its window ids', () => {
    expect(isWindowId('90d')).toBe(true)
    expect(isWindowId('1y')).toBe(false)
  })
})

describe('changeOf', () => {
  it('moves money and counts in percent', () => {
    expect(changeOf(110, 100, 'money')).toEqual({ direction: 'up', text: '10.0%', spoken: 'up 10.0%' })
    expect(changeOf(90, 100, 'count')?.direction).toBe('down')
    expect(changeOf(5, 0, 'money')).toBeNull()
  })
  it('moves a percentage in points and a multiple in x', () => {
    expect(changeOf(0.024, 0.02, 'percent')?.text).toBe('0.4 pts')
    expect(changeOf(2.8, 3.2, 'multiple')).toEqual({ direction: 'down', text: '0.40x', spoken: 'down 0.40x' })
  })
  it('has no change without both numbers, and reads tiny moves as flat', () => {
    expect(changeOf(null, 1, 'money')).toBeNull()
    expect(changeOf(1, undefined, 'money')).toBeNull()
    expect(changeOf(100.01, 100, 'money')?.direction).toBe('flat')
  })
})

describe('describeSource and appsFor', () => {
  it('says what a root reads, in plain words', () => {
    expect(describeSource(ORDERS_REVENUE, 'Shopify')).toEqual({
      headline: 'Order total from Shopify orders', table: 'Shopify orders', column: 'order total', day: 'order date',
      rule: 'not cancelled', ruleRaw: 'cancelled_at is null', sentence: 'Order total from Shopify orders, not cancelled, by order date',
    })
    expect(describeSource({ ...ORDER_COUNT, where: 'cancelled_at is null' }, 'Shopify').sentence).toBe('Counted from Shopify orders, not cancelled, by order date')
    expect(describeSource(ORDER_COUNT)).toMatchObject({ headline: 'Orders', rule: null, sentence: 'Counted from orders, by order date' })
  })
  it('puts fields and filters in plain words, never raw names', () => {
    expect(columnWords('placed_at')).toBe('order date')
    expect(columnWords('fulfilled_at')).toBe('date fulfilled')
    expect(columnWords('shipping_lines')).toBe('shipping lines')
    expect(ruleWords('cancelled_at is null')).toBe('not cancelled')
    expect(ruleWords('refunded_at IS NOT NULL')).toBe('refunded')
    expect(ruleWords("source_name <> 'wholesale'")).toBe('filtered')
    expect(ruleWords(null)).toBeNull()
  })
  it('names the apps feeding an area', () => {
    expect(appsFor('store', ['shopify_app', 'metaads'])).toEqual(['Shopify'])
    expect(appsFor('ads', ['shopify_app', 'metaads'])).toEqual(['Meta Ads'])
    expect(appsFor('reviews', ['shopify_app'])).toEqual([])
    const connectors = ['shopify', 'triple-whale', 'microsoft_clarity', 'shiphero']
    expect(appsFor('ads', connectors)).toEqual(['Triple Whale'])
    expect(appsFor('attribution', connectors)).toEqual(['Triple Whale'])
    expect(appsFor('site_analytics', connectors)).toEqual(['Microsoft Clarity'])
    expect(appsFor('shipping', connectors)).toEqual(['ShipHero'])
    expect(categoryName('site_analytics')).toBe('Site analytics')
  })
})

describe('library', () => {
  const catalog: MetricEntry[] = [
    { name: 'revenue', label: 'Revenue', unit: 'money', description: 'What customers paid', category: 'store' },
    { name: 'ad_spend', label: 'Ad spend', unit: 'money', description: 'Spend on Meta', category: 'ads' },
    { name: 'mer', label: 'MER', unit: 'ratio', description: 'Revenue per ad dollar', category: 'custom' },
    { name: 'stars', label: 'Average rating', unit: 'count', description: 'Review stars', category: 'reviews' },
  ]
  const measurement = (values: Record<string, number | null>, unavailable: Record<string, string> = {}) => ({
    grain: 'total' as const, start: '2026-10-14', end: '2026-11-12', timezone: 'UTC',
    periods: [{ start: '2026-10-14', values }], unavailable,
  })
  const rows = libraryRows(catalog, lookupOf({ mer: MER }), measurement({ revenue: 1000, ad_spend: 250, mer: 4 }, { stars: 'no app sends reviews' }), measurement({ revenue: 800, ad_spend: 200, mer: 4 }))

  it('knows each metric’s origin, kind, display and numbers', () => {
    const mer = rows.find(row => row.name === 'mer')!
    expect(mer).toMatchObject({ origin: 'custom', kind: 'nested', display: 'multiple', value: 4, previous: 4, unavailable: null })
    const revenue = rows.find(row => row.name === 'revenue')!
    expect(revenue).toMatchObject({ origin: 'builtin', kind: null, display: 'money', value: 1000, previous: 800 })
    expect(rows.find(row => row.name === 'stars')!.unavailable).toBe('no app sends reviews')
  })
  it('searches label, name, description and area, every word', () => {
    expect(filterRows(rows, { ...NO_FILTER, query: 'ad dollar' }).map(row => row.name)).toEqual(['mer'])
    expect(filterRows(rows, { ...NO_FILTER, query: 'ad_spend' }).map(row => row.name)).toEqual(['ad_spend'])
    expect(filterRows(rows, { ...NO_FILTER, query: 'ads meta' }).map(row => row.name)).toEqual(['ad_spend'])
    expect(filterRows(rows, { ...NO_FILTER, query: 'zzz' })).toEqual([])
  })
  it('filters by area, origin and kind', () => {
    expect(filterRows(rows, { ...NO_FILTER, category: 'store' }).map(row => row.name)).toEqual(['revenue'])
    expect(filterRows(rows, { ...NO_FILTER, origin: 'custom' }).map(row => row.name)).toEqual(['mer'])
    expect(filterRows(rows, { ...NO_FILTER, kind: 'nested' }).map(row => row.name)).toEqual(['mer'])
    expect(filterRows(rows, { ...NO_FILTER, kind: 'root' })).toEqual([])
    expect(isFiltered(NO_FILTER)).toBe(false)
    expect(isFiltered({ ...NO_FILTER, query: ' x ' })).toBe(true)
  })
  it('groups by area with custom after the built-ins and what can’t be measured last', () => {
    expect(sectionsOf(rows).map(section => [section.id, section.rows.map(row => row.name)])).toEqual([
      ['store', ['revenue']], ['ads', ['ad_spend']], ['custom', ['mer']], ['unavailable', ['stars']],
    ])
    expect(categoriesIn(rows).map(option => option.id)).toEqual(['store', 'ads', 'reviews', 'custom'])
    expect(countsOf(rows)).toEqual({ total: 4, custom: 1, root: 0, nested: 1 })
  })
})

describe('metricNameOf', () => {
  it('turns a label into a name the warehouse accepts', () => {
    expect(metricNameOf('Shipping share of revenue')).toBe('shipping_share_of_revenue')
    expect(metricNameOf('  MER (blended) ')).toBe('mer_blended')
    expect(metricNameOf('3 day revenue')).toBe('m_3_day_revenue')
    expect(metricNameOf('!!!')).toBe('')
    expect(metricNameOf('a'.repeat(80))).toHaveLength(64)
  })
})

describe('windows that stop where the data stops', () => {
  const now = new Date('2026-11-12T12:00:00Z')
  it('ends on the day the data stops when that is before today', () => {
    expect(endOf('UTC', '2026-11-09', now)).toBe('2026-11-09')
    expect(endOf('UTC', '2026-11-12', now)).toBe('2026-11-12')
    expect(endOf('UTC', null, now)).toBe('2026-11-12')
  })
  it('keeps the window whole and the one before it the same length', () => {
    expect(rangeOf('7d', 'UTC', now, '2026-11-09')).toEqual({ start: '2026-11-03', end: '2026-11-09' })
    expect(previousRangeOf('7d', 'UTC', now, '2026-11-09')).toEqual({ start: '2026-10-27', end: '2026-11-02' })
    expect(weeksRange(2, 'UTC', now, '2026-11-09')).toEqual({ start: '2026-11-02', end: '2026-11-09' })
  })
  it('says so in the label', () => {
    expect(windowLabel('30d', '2026-11-09', '2026-11-12')).toBe('30 days to 9 Nov')
    expect(windowLabel('30d', '2026-11-12', '2026-11-12')).toBe('Last 30 days')
  })
})

describe('formula pieces', () => {
  const entries: MetricEntry[] = [
    { name: 'revenue', label: 'Revenue', unit: 'money', description: '', category: 'store' },
    { name: 'net_revenue', label: 'Net revenue', unit: 'money', description: '', category: 'store' },
    { name: 'revenue_per_customer', label: 'Revenue per customer', unit: 'money', description: '', category: 'store' },
    { name: 'ad_spend', label: 'Ad spend', unit: 'money', description: '', category: 'ads' },
    { name: 'refund_rate', label: 'Refund rate', unit: 'ratio', description: '', category: 'store' },
  ]
  it('prints pieces as the text the parser reads, and finds a piece from an error range', () => {
    const pieces = piecesFromText('(revenue - refunds) / orders')
    expect(pieces.map(p => p.kind)).toEqual(['paren', 'metric', 'op', 'metric', 'paren', 'op', 'metric'])
    const { text, spans } = textOf(pieces)
    expect(text).toBe('(revenue - refunds) / orders')
    expect(pieceAt(spans, 11, 18)).toBe(3)
    expect(pieceAt(spans, 99, 99)).toBeNull()
  })
  it('reads a saved formula back into pieces', () => {
    expect(piecesFromValue(MER)).toEqual([{ kind: 'metric', name: 'revenue' }, { kind: 'op', op: '/' }, { kind: 'metric', name: 'ad_spend' }])
    expect(textOf(piecesFromText('net_sales × 30%')).text).toBe('net_sales * 30%')
  })
  it('turns typed words and signs into pieces', () => {
    expect(pieceForWord('0.3')).toEqual({ kind: 'number', text: '0.3' })
    expect(pieceForWord('Ad Spend')).toEqual({ kind: 'metric', name: 'ad_spend' })
    expect(pieceForWord('  ')).toBeNull()
    expect(pieceForChar('÷')).toEqual({ kind: 'op', op: '/' })
    expect(pieceForChar('(')).toEqual({ kind: 'paren', paren: '(' })
    expect(pieceForChar('a')).toBeNull()
    expect(isOperatorChar('×')).toBe(true)
  })
  it('suggests metrics by label or name, plain ones first', () => {
    expect(suggestMetrics('rev', entries).map(s => s.name)).toEqual(['revenue', 'revenue_per_customer', 'net_revenue'])
    expect(suggestMetrics('ad sp', entries).map(s => s.name)).toEqual(['ad_spend'])
    expect(suggestMetrics('rate', entries).map(s => s.name)).toEqual(['refund_rate'])
    expect(suggestMetrics('', entries)).toEqual([])
    expect(suggestMetrics('rev', entries, 8, 'revenue').map(s => s.name)).not.toContain('revenue')
  })
  it('round-trips through the parser', () => {
    const parsed = parseFormula(textOf(piecesFromText('revenue / ad_spend')).text)
    expect(parsed.ok && parsed.value).toEqual(MER)
  })
})

describe('weeksRange', () => {
  it('starts on a Monday, whole weeks back', () => {
    // 12 Nov 2026 is a Thursday.
    expect(weeksRange(1, 'UTC', new Date('2026-11-12T12:00:00Z'))).toEqual({ start: '2026-11-09', end: '2026-11-12' })
    expect(weeksRange(13, 'UTC', new Date('2026-11-12T12:00:00Z'))).toEqual({ start: '2026-08-17', end: '2026-11-12' })
    expect(weeksRange(1, 'UTC', new Date('2026-11-09T12:00:00Z'))).toEqual({ start: '2026-11-09', end: '2026-11-09' })
  })
})

describe('old against new', () => {
  const net: MetricExpression = { op: 'subtract', left: 'gross_sales', right: 'discounts' }
  const known = new Set(['net_sales', 'gross_sales', 'discounts', 'refunds', 'net_margin', 'orders'])

  it('measures the metric now and the new formula’s inputs in one list', () => {
    const tree = proposedTree('net_sales', net, lookupOf({}))
    expect(compareNames('net_sales', tree, known)).toEqual(['net_sales', 'gross_sales', 'discounts'])
    expect(compareNames('net_sales_ours', proposedTree('net_sales_ours', net, lookupOf({})), known, ['net_sales'])).toEqual(['gross_sales', 'discounts', 'net_sales'])
  })
  it('works out the new number from its inputs, never from the old number', () => {
    const tree = proposedTree('net_sales', net, lookupOf({}))
    expect(compareValues('net_sales', tree, { net_sales: 900, gross_sales: 1000, discounts: 50 })).toEqual({ now: 900, after: 950 })
  })
  it('draws two lines and stops them after a failed sync', () => {
    const tree = proposedTree('net_sales', net, lookupOf({}))
    const periods = [
      { start: '2026-11-02', values: { net_sales: 90, gross_sales: 100, discounts: 5 } },
      { start: '2026-11-09', values: { net_sales: 10, gross_sales: 12, discounts: 1 } },
    ]
    expect(compareSeries(periods, 'net_sales', tree, '2026-11-08')).toEqual([
      { date: '2026-11-02', value: 95, comparison: 90, comparisonDate: '2026-11-02' },
      { date: '2026-11-09', value: null, comparison: null, comparisonDate: '2026-11-09' },
    ])
  })
  it('shows what else moves', () => {
    const lookup = lookupOf({ net_margin: { op: 'ratio', numerator: 'net_sales', denominator: 'orders' }, net_sales: { op: 'subtract', left: 'gross_sales', right: 'refunds' } })
    const values = { net_margin: 9, net_sales: 900, gross_sales: 1000, refunds: 100, discounts: 50, orders: 100 }
    expect(impactNames(['net_margin'], 'net_sales', net, lookup, known)).toEqual(['net_margin', 'net_sales', 'gross_sales', 'discounts', 'orders'])
    expect(impactOf(['net_margin'], 'net_sales', net, lookup, values)).toEqual([{ name: 'net_margin', now: 9, after: 9.5 }])
  })
})

describe('trying a formula against a built-in', () => {
  it('compares a new name against the original metric', () => {
    const tree = proposedTree('net_sales_ours', { op: 'subtract', left: 'gross_sales', right: 'discounts' }, lookupOf({}))
    expect(compareValues('net_sales_ours', tree, { net_sales: 900, gross_sales: 1000, discounts: 50 }, 'net_sales')).toEqual({ now: 900, after: 950 })
  })
})

describe('checkPieces', () => {
  it('rings the piece the parser complains about', () => {
    const pieces = piecesFromText('revenue / revnue')
    const check = checkPieces(pieces, ['revenue', 'ad_spend'])
    expect(check.text).toBe('revenue / revnue')
    expect(check.result?.ok).toBe(false)
    expect(check.errorAt).toBe(2)
  })
  it('is quiet while empty and passes a good formula', () => {
    expect(checkPieces([], ['revenue'])).toEqual({ text: '', result: null, errorAt: null, incomplete: false })
    const unfinished = checkPieces(piecesFromText('revenue -'), ['revenue'])
    expect(unfinished.incomplete).toBe(true)
    expect(unfinished.errorAt).toBeNull()
    expect(checkPieces(piecesFromText('revenue / ad_spend'), ['revenue', 'ad_spend']).result).toEqual({ ok: true, value: MER, names: ['revenue', 'ad_spend'] })
  })
})

describe('where the data stops', () => {
  const workspace = {
    id: 'w', name: 'Store', slug: 'store', timezone: 'America/Chicago', connectors: ['shopify_app', 'metaads'],
    categories: [
      { category: 'ads', status: 'ready', lastSyncedAt: '2026-11-12T10:20:00Z' },
      { category: 'ab_testing', status: 'failed', lastSyncedAt: null },
      { category: 'store', status: 'failed', lastSyncedAt: '2026-11-10T03:15:00Z' },
    ],
  }
  const categories: Record<string, string> = { revenue: 'store', ad_spend: 'ads', mer: 'custom', test_wins: 'ab_testing' }
  const categoryOf = (name: string) => categories[name]

  it('stops a nested metric where its first root stops', () => {
    expect(dataUntilOf(['mer', 'revenue', 'ad_spend'], categoryOf, workspace)).toBe('2026-11-09')
    expect(dataUntilOf(['ad_spend'], categoryOf, workspace)).toBe('2026-11-12')
    expect(dataUntilOf(['mer', 'test_wins'], categoryOf, workspace)).toBeNull()
    expect(dataUntilOf(['revenue'], categoryOf, undefined)).toBeNull()
  })
  it('groups metrics by their last day, earliest first, no cut last', () => {
    const until: Record<string, string | null> = { a: '2026-11-09', b: null, c: '2026-11-12', d: '2026-11-09' }
    expect(groupByUntil(['a', 'b', 'c', 'd'], n => until[n], 4)).toEqual([
      { until: '2026-11-09', names: ['a', 'd'] }, { until: '2026-11-12', names: ['c'] }, { until: null, names: ['b'] },
    ])
  })
  it('folds extra groups into the earliest of them', () => {
    const until: Record<string, string | null> = { a: '2026-11-01', b: '2026-11-05', c: '2026-11-03', d: null }
    expect(groupByUntil(['a', 'b', 'c', 'd'], n => until[n], 2)).toEqual([
      { until: '2026-11-01', names: ['a'] }, { until: '2026-11-03', names: ['c', 'b', 'd'] },
    ])
  })
})

describe('totals with no rows', () => {
  it('tells totals from rates', () => {
    expect(isAdditive('refunds', 'money')).toBe(true)
    expect(isAdditive('orders', 'count')).toBe(true)
    expect(isAdditive('aov', 'money')).toBe(false)
    expect(isAdditive('revenue_per_customer', 'money')).toBe(false)
    expect(isAdditive('platform_cpa', 'money')).toBe(false)
    expect(isAdditive('reach', 'count')).toBe(false)
    expect(isAdditive('refund_rate', 'ratio')).toBe(false)
  })
  it('reads a missing total as 0 and says which', () => {
    const { values, filled } = fillMissingTotals({ refunds: null, aov: null, revenue: 10 }, name => name !== 'aov')
    expect(values).toEqual({ refunds: 0, aov: null, revenue: 10 })
    expect([...filled]).toEqual(['refunds'])
  })
  it('only fills built-in totals whose source has synced', () => {
    const workspace = {
      id: 'w', name: 'S', slug: 's', timezone: 'UTC', connectors: [],
      categories: [{ category: 'store', status: 'failed', lastSyncedAt: '2026-11-10T03:15:00Z' }, { category: 'reviews', status: 'building', lastSyncedAt: null }],
    }
    const catalog: MetricEntry[] = [
      { name: 'refunds', label: 'Refunds', unit: 'money', description: '', category: 'store' },
      { name: 'aov', label: 'AOV', unit: 'money', description: '', category: 'store' },
      { name: 'review_count', label: 'Reviews', unit: 'count', description: '', category: 'reviews' },
      { name: 'mine', label: 'Mine', unit: 'money', description: '', category: 'custom' },
    ]
    const fill = zeroFillRule(catalog, workspace)
    expect(['refunds', 'aov', 'review_count', 'mine', 'unknown'].map(name => fill(name))).toEqual([true, false, false, false, false])
  })
  it('keeps a total missing for a period that runs past the last sync', () => {
    const workspace = { id: 'w', name: 'S', slug: 's', timezone: 'UTC', connectors: [], categories: [{ category: 'store', status: 'failed', lastSyncedAt: '2026-11-10T03:15:00Z' }] }
    const fill = zeroFillRule([{ name: 'refunds', label: 'Refunds', unit: 'money', description: '', category: 'store' }], workspace)
    expect(fill('refunds', '2026-11-10')).toBe(true)
    expect(fill('refunds', '2026-11-09')).toBe(true)
    expect(fill('refunds', '2026-11-12')).toBe(false)
  })
  it('works a nested metric out from its parts when the warehouse gives no number', () => {
    const tree = buildTree('net', lookupOf({ net: { op: 'subtract', left: 'revenue', right: 'refunds' } }))
    expect(evaluate(tree, { net: null, revenue: 100, refunds: 0 })).toBe(100)
    expect(evaluate(tree, { net: 90, revenue: 100, refunds: 0 })).toBe(90)
  })
})

describe('typing into the formula box', () => {
  const entries: MetricEntry[] = [
    { name: 'gross_sales', label: 'Gross sales', unit: 'money', description: '', category: 'store' },
    { name: 'discounts', label: 'Discounts', unit: 'money', description: '', category: 'store' },
    { name: 'discount_rate', label: 'Discount rate', unit: 'ratio', description: '', category: 'store' },
    { name: 'refunds', label: 'Refunds', unit: 'money', description: '', category: 'store' },
    { name: 'refund_rate', label: 'Refund rate', unit: 'ratio', description: '', category: 'store' },
    { name: 'net_sales', label: 'Net sales', unit: 'money', description: '', category: 'store' },
    { name: 'orders', label: 'Orders', unit: 'count', description: '', category: 'store' },
  ]
  const metric = (name: string) => ({ kind: 'metric', name })
  const op = (o: string) => ({ kind: 'op', op: o })

  it('keeps a typed minus as a sign and the word after it as the word being typed (bug A)', () => {
    expect(absorbTyping(' - disc', entries)).toEqual({ added: [op('-')], rest: 'disc' })
    expect(absorbTyping(' - refu', entries)).toEqual({ added: [op('-')], rest: 'refu' })
  })
  it('turns a whole typed formula of labels into pills (bug B)', () => {
    const { added, rest } = absorbTyping('Gross sales - Discounts - Refunds', entries)
    expect(added).toEqual([metric('gross_sales'), op('-'), metric('discounts'), op('-')])
    expect(rest).toBe('Refunds')
    expect(exactWord(rest, entries)).toEqual(metric('refunds'))
    const all = [...added, exactWord(rest, entries)!] as Piece[]
    const check = checkPieces(all, entries.map(e => e.name), 'net_sales_ours')
    expect(check.result?.ok).toBe(true)
    expect(check.text).toBe('gross_sales - discounts - refunds')
  })
  it('turns a whole typed formula of names into pills (bug B)', () => {
    const { added, rest } = absorbTyping('gross_sales - discounts - refunds', entries)
    expect(added).toEqual([metric('gross_sales'), op('-'), metric('discounts'), op('-')])
    expect(exactWord(rest, entries)).toEqual(metric('refunds'))
  })
  it('works one key at a time too', () => {
    let pieces: Piece[] = []
    let draft = ''
    for (const key of 'Gross sales - Discounts - Refunds') {
      const { added, rest } = absorbTyping(draft + key, entries)
      pieces = [...pieces, ...added]
      draft = rest
    }
    expect(pieces).toEqual([metric('gross_sales'), op('-'), metric('discounts'), op('-')])
    expect(draft).toBe('Refunds')
  })
  it('handles brackets, signs written as symbols, numbers and a paste', () => {
    expect(absorbTyping('(gross_sales − refunds) ÷ orders', entries)).toEqual({
      added: [{ kind: 'paren', paren: '(' }, metric('gross_sales'), op('-'), metric('refunds'), { kind: 'paren', paren: ')' }, op('/')],
      rest: 'orders',
    })
    expect(absorbTyping('net_sales * 0.9 ', entries)).toEqual({ added: [metric('net_sales'), op('*'), { kind: 'number', text: '0.9' }], rest: '' })
  })
  it('picks the exact label over a longer one, and the best match for a partial word', () => {
    expect(resolveWord('Discounts', entries)).toEqual(metric('discounts'))
    expect(resolveWord('disc', entries)).toEqual(metric('discounts'))
    expect(resolveWord('refu', entries)).toEqual(metric('refunds'))
    expect(exactWord('disc', entries)).toBeNull()
    expect(exactWord('0.9', entries)).toEqual({ kind: 'number', text: '0.9' })
  })
})

describe('the header period', () => {
  const now = new Date('2026-11-12T12:00:00Z')
  const choose = (period: DashboardPeriod, custom: { start: string; end: string } | null = null) => ({ period, custom })
  it('turns the period into dates: rolling, today or custom', () => {
    expect(spanOf(choose('30d'), 'UTC', '2026-11-09', now)).toMatchObject({ start: '2026-10-11', end: '2026-11-09', endsAtData: true })
    expect(spanOf(choose('7d'), 'UTC', null, now)).toMatchObject({ start: '2026-11-06', end: '2026-11-12', endsAtData: false })
    expect(spanOf(choose('today'), 'UTC', '2026-11-09', now)).toMatchObject({ start: '2026-11-12', end: '2026-11-12', previousStart: '2026-11-11' })
    expect(spanOf(choose('custom', { start: '2026-10-01', end: '2026-10-10' }), 'UTC', null, now)).toMatchObject({ start: '2026-10-01', end: '2026-10-10', previousStart: '2026-09-21', previousEnd: '2026-09-30' })
  })
  it('names it and what it is compared with', () => {
    expect(spanLabel(choose('30d'), { end: '2026-11-09', endsAtData: true })).toBe('30 days to 9 Nov')
    expect(spanLabel(choose('60d'), { end: '2026-11-12', endsAtData: false })).toBe('Last 60 days')
    expect(spanLabel(choose('today'), { end: '2026-11-12', endsAtData: false })).toBe('Today')
    expect(spanLabel(choose('custom', { start: '2026-10-01', end: '2026-10-10' }), { end: '2026-10-10', endsAtData: false })).toBe('1 Oct – 10 Oct')
    expect(againstOf(choose('7d'))).toBe('previous 7 days')
    expect(againstOf(choose('today'))).toBe('yesterday')
    expect(againstOf(choose('custom', { start: '2026-10-01', end: '2026-10-10' }))).toBe('previous 10 days')
  })
})

describe('mentionedMetrics', () => {
  const catalog: MetricEntry[] = [
    { name: 'mer', label: 'MER', unit: 'ratio', description: '', category: 'blended' },
    { name: 'revenue', label: 'Revenue', unit: 'money', description: '', category: 'store' },
    { name: 'ad_spend', label: 'Ad spend', unit: 'money', description: '', category: 'ads' },
    { name: 'merch_sales', label: 'Merch sales', unit: 'money', description: '', category: 'store' },
  ]
  it('finds the metric a reply says already exists', () => {
    expect(mentionedMetrics('This is already available as MER: store revenue per dollar of ad spend.', catalog).map(e => e.name)).toEqual(['mer'])
    expect(mentionedMetrics('You can already use ad_spend and Revenue for that.', catalog).map(e => e.name)).toEqual(['ad_spend', 'revenue'])
  })
  it('offers nothing for an ordinary reply or a partial word', () => {
    expect(mentionedMetrics('Which ad platforms should MER include?', catalog)).toEqual([])
    expect(mentionedMetrics('Already have MERCH stuff', catalog)).toEqual([])
  })
})

describe('the catalog’s formulas and flags (S3, S5)', () => {
  const withFlags = (name: string, category: string, flags: Record<string, unknown> = {}) => ({ ...entry(name, category), ...flags }) as MetricEntry
  it('reads a built-in’s formula from the catalog and builds its tree', () => {
    const catalog = [
      { ...entry('aov'), value: { op: 'ratio', numerator: 'revenue', denominator: 'orders' } } as MetricEntry,
      { ...entry('revenue'), value: ORDERS_REVENUE } as MetricEntry,
      entry('orders', 'store', 'count'),
    ]
    const tree = buildTree('aov', formulaLookup(catalog, {}))
    expect(tree.kind).toBe('nested')
    expect(namesIn(tree)).toEqual(['aov', 'revenue', 'orders'])
    expect(formulaSource(catalog[0], {})).toBe('catalog')
  })
  it('names whose definition it is', () => {
    expect(originLabel(withFlags('revenue', 'store', { createdBy: null, verified: true }))).toBe('Built in')
    expect(originLabel(withFlags('net_sales', 'store', { overridden: true }))).toBe('Adjusted by your organization')
    expect(originLabel(withFlags('my_metric', 'custom', { createdBy: 'user_1' }))).toBe('Custom')
    expect(entryFlags(entry('revenue'))).toEqual({ overridden: false, createdBy: null, verified: null })
  })
  it('says a metric reading a never-synced source has no data yet', () => {
    const workspace = {
      id: 'w', name: 'S', slug: 's', timezone: 'UTC', connectors: [],
      categories: [
        { category: 'store', status: 'ready', lastSyncedAt: '2026-11-10T03:15:00Z' },
        { category: 'shipping', status: 'building', lastSyncedAt: null },
        { category: 'reviews', status: 'not_applicable', lastSyncedAt: null },
      ],
    }
    const categories: Record<string, string> = { shipping_margin: 'shipping', shipping_cost: 'shipping', revenue: 'store', stars: 'reviews', mine: 'custom' }
    const categoryOf = (name: string) => categories[name]
    expect(neverSynced(['shipping_margin', 'revenue', 'shipping_cost'], categoryOf, workspace)).toBe(true)
    expect(neverSynced(['revenue'], categoryOf, workspace)).toBe(false)
    expect(neverSynced(['stars', 'mine'], categoryOf, workspace)).toBe(false)
    expect(neverSynced(['revenue'], categoryOf, undefined)).toBe(false)
  })
})

describe('flatOperands', () => {
  const ops = (value: MetricValue) => flatOperands((buildTree('x', lookupOf({ x: value })).body as OperationNode))
    .map(item => [item.op, item.node.type === 'metric' ? item.node.name : item.node.type])
  it('reads same-sign chains as one list', () => {
    expect(ops({ op: 'subtract', left: { op: 'subtract', left: 'a', right: 'b' }, right: 'c' })).toEqual([[null, 'a'], ['subtract', 'b'], ['subtract', 'c']])
    expect(ops({ op: 'add', terms: ['a', { op: 'add', terms: ['b', 'c'] }] })).toEqual([[null, 'a'], ['add', 'b'], ['add', 'c']])
  })
  it('keeps a bracket that changes the answer as a group', () => {
    expect(ops({ op: 'subtract', left: 'a', right: { op: 'subtract', left: 'b', right: 'c' } })).toEqual([[null, 'a'], ['subtract', 'operation']])
    expect(ops(MER)).toEqual([[null, 'revenue'], ['ratio', 'ad_spend']])
  })
})

describe('periods in a sentence', () => {
  const choose = (period: DashboardPeriod, custom: { start: string; end: string } | null = null) => ({ period, custom })
  it('reads naturally for every period', () => {
    expect(periodPhrase(choose('today'), { end: '2026-11-12', endsAtData: false })).toBe('today')
    expect(againstPhrase(choose('today'))).toBe('yesterday')
    expect(periodPhrase(choose('30d'), { end: '2026-11-12', endsAtData: false })).toBe('the last 30 days')
    expect(periodPhrase(choose('30d'), { end: '2026-11-06', endsAtData: true })).toBe('the 30 days to 6 Nov')
    expect(againstPhrase(choose('30d'))).toBe('the previous 30 days')
    expect(periodPhrase(choose('custom', { start: '2026-10-01', end: '2026-10-10' }), { end: '2026-10-10', endsAtData: false })).toBe('1 Oct – 10 Oct')
  })
  it('knows when the whole period comes after the data stops', () => {
    expect(afterData({ start: '2026-11-12' }, '2026-11-04')).toBe(true)
    expect(afterData({ start: '2026-11-04' }, '2026-11-04')).toBe(false)
    expect(afterData({ start: '2026-10-14' }, '2026-11-04')).toBe(false)
    expect(afterData({ start: '2026-11-12' }, null)).toBe(false)
  })
})
