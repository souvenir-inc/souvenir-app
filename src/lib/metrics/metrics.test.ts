import { describe, expect, it } from 'vitest'
import type { Aggregate, Expression, MetricEntry, Unit } from '@/lib/api/warehouse-schemas'
import { mentionedMetrics, originOf, usersOf } from './catalog'
import { compareNames, compareValues, impactNames, impactOf, proposedTree } from './compare'
import { categoryName, categoryOrder, changeOf, columnWords, describeSource, ruleWords } from './display'
import { closestName, isMetricName, metricNameOf, parseFormula, printFormula } from './formula'
import { inputsFor, pickAvailable } from './inputs'
import { metricFromTemplate, TEMPLATES, templatesFor, templateValue } from './templates'
import {
  absorbTyping, checkPieces, exactWord, isOperatorChar, pieceAt, pieceForChar, pieceForWord, piecesFromText, piecesFromValue,
  resolveWord, suggestMetrics, textOf, type Piece,
} from './tokens'
import { buildTree, buildTreeFromValue, catalogLookup, evaluate, flatOperands, formulaShape, isMetricValue, kindOf, namesIn, referencesOf, sizeOf, valuesFrom, type FormulaLookup, type MetricNode, type MetricValue, type OperationNode } from './tree'
import { displayOfMetric, displayOfNode } from './units'

const ORDERS_REVENUE: Aggregate = { kind: 'sum', table: 'orders', column: 'total', day: 'placed_at', where: 'cancelled_at is null' }
const ORDER_COUNT: Aggregate = { kind: 'count', table: 'orders', column: null, day: 'placed_at', where: null }
const MER: Expression = { op: 'ratio', numerator: 'revenue', denominator: 'ad_spend' }

const UNITS = new Map<string, Unit>([
  ['revenue', 'money'], ['ad_spend', 'money'], ['orders', 'count'], ['refunds', 'money'], ['new_customers', 'count'],
  ['refund_rate', 'percent'], ['mer', 'ratio'], ['net_sales', 'money'], ['discounts', 'money'],
])
const unitOf = (name: string) => UNITS.get(name)

function lookupOf(formulas: Record<string, MetricValue>): FormulaLookup {
  const map = new Map(Object.entries(formulas))
  return name => map.get(name) ?? null
}

const values = (record: Record<string, number | null>) => new Map(Object.entries(record))

function entry(name: string, overrides: Partial<MetricEntry> = {}): MetricEntry {
  return {
    name, label: name, unit: 'money', description: '', category: 'store', value: ORDER_COUNT,
    overridden: false, createdBy: null, status: 'confirmed', version: 1, updatedBy: null, updatedAt: null, confirmedBy: null, confirmedAt: null, replacement: null, reason: null, ...overrides,
  }
}

describe('kindOf and the formula shape check', () => {
  it('calls a table read root, a combination nested, and nothing without a formula', () => {
    expect(kindOf(ORDERS_REVENUE)).toBe('root')
    expect(kindOf(MER)).toBe('nested')
    expect(kindOf(null)).toBeNull()
  })

  it('accepts every shape the contract describes and rejects anything else', () => {
    expect(isMetricValue(ORDERS_REVENUE)).toBe(true)
    expect(isMetricValue({ op: 'add', terms: ['a', 1, { op: 'subtract', left: 'b', right: 2 }] })).toBe(true)
    expect(isMetricValue({ op: 'divide', left: 'a', right: 'b' })).toBe(false)
    expect(isMetricValue({ op: 'add', terms: [] })).toBe(false)
    expect(isMetricValue({ op: 'add', terms: ['a', Number.NaN] })).toBe(false)
    expect(isMetricValue('revenue')).toBe(false)
  })

  it('refuses a formula nested too deep or too big to draw, without recursing', () => {
    let deep: Expression = { op: 'add', terms: ['a', 1] }
    for (let i = 0; i < 50_000; i++) deep = { op: 'add', terms: [deep, 1] }
    expect(formulaShape(deep)).toBe('deep')
    expect(formulaShape({ op: 'add', terms: Array.from({ length: 1000 }, (_, i) => `m${i}`) })).toBe('large')
    expect(buildTree('x', () => deep).stop).toBe('large')
  })
})

describe('buildTree', () => {
  it('stops at a metric whose formula is not known, without guessing', () => {
    expect(buildTree('revenue', lookupOf({}))).toEqual({ type: 'metric', id: 'm', name: 'revenue', kind: null, body: null, stop: 'unknown' })
  })

  it('expands a root metric into its source and a nested one into an operation', () => {
    expect(buildTree('revenue', lookupOf({ revenue: ORDERS_REVENUE })).body).toEqual({ type: 'source', id: 'm.s', aggregate: ORDERS_REVENUE })
    const body = buildTree('mer', lookupOf({ mer: MER })).body as OperationNode
    expect(body.op).toBe('ratio')
    expect(body.children.map(child => child.id)).toEqual(['m.f.0', 'm.f.1'])
  })

  it('expands metrics used inside other metrics, down to their tables', () => {
    const tree = buildTree('mer_after_refunds', lookupOf({
      mer_after_refunds: { op: 'ratio', numerator: 'net', denominator: 'ad_spend' },
      net: { op: 'subtract', left: 'revenue', right: 'refunds' },
      revenue: ORDERS_REVENUE,
    }))
    const net = (tree.body as OperationNode).children[0] as MetricNode
    const revenue = (net.body as OperationNode).children[0] as MetricNode
    expect(revenue.body?.type).toBe('source')
  })

  it('breaks a cycle instead of looping', () => {
    const tree = buildTree('a', lookupOf({ a: { op: 'add', terms: ['b', 1] }, b: { op: 'add', terms: ['a', 1] } }))
    const b = (tree.body as OperationNode).children[0] as MetricNode
    const a = (b.body as OperationNode).children[0] as MetricNode
    expect(a.stop).toBe('cycle')
  })

  it('expands a metric used twice only the first time', () => {
    const tree = buildTree('cm3', lookupOf({
      cm3: { op: 'subtract', left: 'cm1', right: 'revenue' },
      cm1: { op: 'subtract', left: 'revenue', right: 'cogs' },
      revenue: ORDERS_REVENUE,
    }))
    expect(((tree.body as OperationNode).children[1] as MetricNode).stop).toBe('repeat')
    expect(namesIn(tree)).toEqual(['cm3', 'cm1', 'revenue', 'cogs'])
  })

  it('stops at the depth limit', () => {
    const chain: Record<string, MetricValue> = {}
    for (let i = 0; i < 20; i++) chain[`m${i}`] = { op: 'add', terms: [`m${i + 1}`, 1] }
    let node: MetricNode = buildTree('m0', lookupOf(chain), 3)
    let depth = 0
    while (node.body !== null) { node = (node.body as OperationNode).children[0] as MetricNode; depth++ }
    expect([depth, node.stop]).toEqual([3, 'depth'])
  })

  it('ignores a malformed formula and builds one for an unsaved proposal', () => {
    expect(buildTree('x', (() => ({ op: 'divide' })) as unknown as FormulaLookup).stop).toBe('unknown')
    expect(buildTreeFromValue('mer', MER, lookupOf({ revenue: ORDERS_REVENUE })).kind).toBe('nested')
  })

  it('reads the catalog through a Map, so __proto__ or constructor never find a formula', () => {
    const lookup = catalogLookup([{ name: 'revenue', value: ORDERS_REVENUE }])
    expect(lookup('constructor')).toBeUndefined()
    expect(lookup('__proto__')).toBeUndefined()
    expect(buildTree('constructor', lookup).stop).toBe('unknown')
  })
})

describe('namesIn and referencesOf', () => {
  const tree = buildTree('x', lookupOf({ x: { op: 'ratio', numerator: { op: 'subtract', left: 'revenue', right: 'refunds' }, denominator: 'ad_spend' } }))

  it('lists every metric once, root first, for one measurement', () => {
    expect(namesIn(tree)).toEqual(['x', 'revenue', 'refunds', 'ad_spend'])
  })

  it('leaves out names the catalog does not have', () => {
    expect(namesIn(tree, new Set(['revenue', 'ad_spend']))).toEqual(['revenue', 'ad_spend'])
  })

  it('lists the metrics a formula uses directly', () => {
    expect(referencesOf(MER)).toEqual(['revenue', 'ad_spend'])
    expect(referencesOf({ op: 'add', terms: ['a', { op: 'ratio', numerator: 'b', denominator: 'a' }, 3] })).toEqual(['a', 'b'])
    expect(referencesOf(ORDERS_REVENUE)).toEqual([])
  })
})

describe('evaluate', () => {
  const tree = buildTree('x', lookupOf({ x: { op: 'ratio', numerator: { op: 'subtract', left: 'revenue', right: 'refunds' }, denominator: 'orders' } }))
  const inner = (tree.body as OperationNode).children[0]

  it('prefers the measured number for a named metric and works out in-between steps', () => {
    expect(evaluate(tree, values({ x: 42, revenue: 1000, refunds: 100, orders: 10 }))).toBe(42)
    expect(evaluate(inner, values({ revenue: 1000, refunds: 100 }))).toBe(900)
    expect(evaluate(tree, values({ revenue: 1000, refunds: 100, orders: 10 }))).toBe(90)
  })

  it('keeps missing data missing and has no answer for a division by zero', () => {
    expect(evaluate(inner, values({ revenue: 1000, refunds: null }))).toBeNull()
    expect(evaluate(tree, values({ revenue: 1000, refunds: 100, orders: 0 }))).toBeNull()
  })

  it('reads only the response’s own keys, so constructor is never a number', () => {
    const parsed = valuesFrom(JSON.parse('{"__proto__": 5, "revenue": 10}') as Record<string, number | null>)
    expect(parsed.get('constructor')).toBeUndefined()
    expect(evaluate(buildTree('constructor', lookupOf({})), parsed)).toBeNull()
  })
})

describe('display units', () => {
  const none = lookupOf({})

  it('takes a named metric’s unit from the catalog', () => {
    expect(displayOfMetric('ratio', MER, unitOf)).toBe('ratio')
    expect(displayOfMetric('percent', null, unitOf)).toBe('percent')
  })

  it('works out an in-between step from what it combines', () => {
    const cpa = buildTree('cpa', lookupOf({ cpa: { op: 'ratio', numerator: 'ad_spend', denominator: 'orders' } }))
    expect(displayOfNode(cpa.body!, unitOf, none)).toBe('money')
    const share = buildTree('s', lookupOf({ s: { op: 'ratio', numerator: 'refunds', denominator: 'revenue' } }))
    expect(displayOfNode(share.body!, unitOf, none)).toBe('percent')
    expect(displayOfNode(buildTree('m', lookupOf({ m: MER })).body!, unitOf, none)).toBe('ratio')
    expect(displayOfNode({ type: 'source', id: 's', aggregate: ORDER_COUNT }, unitOf, none)).toBe('count')
  })

  it('counts every node', () => {
    expect(sizeOf(buildTree('mer', lookupOf({ mer: MER })))).toBe(4)
  })
})

describe('printFormula', () => {
  it('prints the typing form and the reading form', () => {
    expect(printFormula(MER)).toBe('revenue / ad_spend')
    expect(printFormula({ op: 'add', terms: ['a', 'b', 'c'] })).toBe('a + b + c')
    const labels = new Map([['revenue', 'Revenue'], ['ad_spend', 'Ad spend']])
    expect(printFormula(MER, { pretty: true, labelOf: name => labels.get(name) })).toBe('Revenue ÷ Ad spend')
  })

  it('brackets only where the order of operations needs it', () => {
    expect(printFormula({ op: 'ratio', numerator: { op: 'subtract', left: 'revenue', right: 'refunds' }, denominator: 'orders' })).toBe('(revenue - refunds) / orders')
    expect(printFormula({ op: 'subtract', left: 'a', right: { op: 'add', terms: ['b', 'c'] } })).toBe('a - (b + c)')
    expect(printFormula({ op: 'subtract', left: { op: 'subtract', left: 'a', right: 'b' }, right: 'c' })).toBe('a - b - c')
    expect(printFormula({ op: 'ratio', numerator: 'a', denominator: { op: 'multiply', terms: ['b', 'c'] } })).toBe('a / (b * c)')
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

  it('follows the order of operations, brackets and chains', () => {
    expect(ok('revenue / ad_spend')).toEqual({ ok: true, value: MER, names: ['revenue', 'ad_spend'] })
    expect(ok('revenue - refunds / orders').value).toEqual({ op: 'subtract', left: 'revenue', right: { op: 'ratio', numerator: 'refunds', denominator: 'orders' } })
    expect(ok('revenue + refunds + orders').value).toEqual({ op: 'add', terms: ['revenue', 'refunds', 'orders'] })
    expect(ok('(net_sales * 2) * 3').value).toEqual({ op: 'multiply', terms: [{ op: 'multiply', terms: ['net_sales', 2] }, 3] })
  })

  it('accepts the signs people write and percentages', () => {
    expect(ok('Revenue ÷ Ad_Spend').value).toEqual(MER)
    expect(ok('net_sales × 30%').value).toEqual({ op: 'multiply', terms: ['net_sales', 0.3] })
    expect(ok('net_sales x 2').value).toEqual({ op: 'multiply', terms: ['net_sales', 2] })
    expect(ok('revenue * -1').value).toEqual({ op: 'multiply', terms: ['revenue', -1] })
  })

  it('round-trips what it prints', () => {
    for (const text of ['revenue / ad_spend', '(revenue - refunds) / orders', 'revenue - (refunds + orders)', 'revenue / (ad_spend * 2)', 'net_sales * 0.3 + revenue']) {
      expect(printFormula(ok(text).value)).toBe(text)
    }
  })

  it('says which name it does not know, and what was meant', () => {
    const error = fail('revnue / ad_spend')
    expect(error).toEqual({ message: 'No metric called revnue. Did you mean revenue?', start: 0, end: 6 })
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
    expect(fail('revenue ^ 2').message).toMatch(/“\^” isn't part of a formula/)
    expect(fail('sum(orders.total)').message).toMatch(/Ask for it in the chat/)
    expect(fail('revenue * 2', { self: 'revenue' }).message).toMatch(/built from itself/)
    expect(fail(`revenue * ${'9'.repeat(400)}`).message).toBe('That number is too big.')
  })

  it('finds a near name and nothing far', () => {
    expect(closestName('ad_spnd', ['ad_spend', 'revenue'])).toBe('ad_spend')
    expect(closestName('zzz', ['ad_spend', 'revenue'])).toBeNull()
  })
})

describe('metric names', () => {
  it('turns a label into a name the warehouse accepts', () => {
    expect(metricNameOf('Shipping share of revenue')).toBe('shipping_share_of_revenue')
    expect(metricNameOf('  MER (blended) ')).toBe('mer_blended')
    expect(metricNameOf('3 day revenue')).toBe('m_3_day_revenue')
    expect(metricNameOf('!!!')).toBe('')
    expect(metricNameOf('a'.repeat(80))).toHaveLength(64)
    expect(isMetricName(metricNameOf('Ad spend (all) / week'))).toBe(true)
    expect(isMetricName('__proto__')).toBe(false)
  })
})

describe('formula pieces', () => {
  const entries = [
    entry('revenue', { label: 'Revenue' }), entry('net_revenue', { label: 'Net revenue' }),
    entry('revenue_per_customer', { label: 'Revenue per customer' }), entry('ad_spend', { label: 'Ad spend', category: 'ads' }),
    entry('refund_rate', { label: 'Refund rate', unit: 'percent' }), entry('gross_sales', { label: 'Gross sales' }),
    entry('discounts', { label: 'Discounts' }), entry('refunds', { label: 'Refunds' }), entry('orders', { label: 'Orders', unit: 'count' }),
  ]
  const metric = (name: string) => ({ kind: 'metric', name })
  const op = (o: string) => ({ kind: 'op', op: o })

  it('prints pieces as the text the parser reads, and finds a piece from an error range', () => {
    const pieces = piecesFromText('(revenue - refunds) / orders')
    const { text, spans } = textOf(pieces)
    expect(text).toBe('(revenue - refunds) / orders')
    expect(pieceAt(spans, 11, 18)).toBe(3)
    expect(pieceAt(spans, 99, 99)).toBeNull()
    expect(piecesFromValue(MER)).toEqual([metric('revenue'), op('/'), metric('ad_spend')])
  })

  it('turns typed words and signs into pieces', () => {
    expect(pieceForWord('0.3')).toEqual({ kind: 'number', text: '0.3' })
    expect(pieceForWord('Ad Spend')).toEqual(metric('ad_spend'))
    expect(pieceForChar('÷')).toEqual(op('/'))
    expect(pieceForChar('a')).toBeNull()
    expect(isOperatorChar('×')).toBe(true)
    expect(isOperatorChar('constructor')).toBe(false)
  })

  it('suggests metrics by label or name, plain ones first', () => {
    expect(suggestMetrics('rev', entries).map(s => s.name)).toEqual(['revenue', 'revenue_per_customer', 'net_revenue'])
    expect(suggestMetrics('ad sp', entries).map(s => s.name)).toEqual(['ad_spend'])
    expect(suggestMetrics('rev', entries, 8, 'revenue').map(s => s.name)).not.toContain('revenue')
  })

  it('rings the piece the parser complains about, and is quiet while unfinished', () => {
    const check = checkPieces(piecesFromText('revenue / revnue'), ['revenue', 'ad_spend'])
    expect(check.errorAt).toBe(2)
    const unfinished = checkPieces(piecesFromText('revenue -'), ['revenue'])
    expect([unfinished.incomplete, unfinished.errorAt]).toEqual([true, null])
  })

  it('turns a whole typed formula of labels into pills, one key at a time or pasted', () => {
    expect(absorbTyping('Gross sales - Discounts - Refunds', entries)).toEqual({ added: [metric('gross_sales'), op('-'), metric('discounts'), op('-')], rest: 'Refunds' })
    let pieces: Piece[] = []
    let draft = ''
    for (const key of 'Gross sales - Discounts - Refunds') {
      const { added, rest } = absorbTyping(draft + key, entries)
      pieces = [...pieces, ...added]
      draft = rest
    }
    expect(pieces).toEqual([metric('gross_sales'), op('-'), metric('discounts'), op('-')])
    expect(exactWord(draft, entries)).toEqual(metric('refunds'))
    expect(absorbTyping('revenue * 0.9 ', entries)).toEqual({ added: [metric('revenue'), op('*'), { kind: 'number', text: '0.9' }], rest: '' })
  })

  it('picks the exact label over a longer one, and the best match for a partial word', () => {
    expect(resolveWord('Discounts', entries)).toEqual(metric('discounts'))
    expect(resolveWord('disc', entries)).toEqual(metric('discounts'))
    expect(exactWord('disc', entries)).toBeNull()
  })
})

describe('flatOperands', () => {
  const ops = (value: MetricValue) => flatOperands((buildTree('x', lookupOf({ x: value })).body as OperationNode))
    .map(item => [item.op, item.node.type === 'metric' ? item.node.name : item.node.type])

  it('reads same-sign chains as one list and keeps a bracket that changes the answer', () => {
    expect(ops({ op: 'subtract', left: { op: 'subtract', left: 'a', right: 'b' }, right: 'c' })).toEqual([[null, 'a'], ['subtract', 'b'], ['subtract', 'c']])
    expect(ops({ op: 'subtract', left: 'a', right: { op: 'subtract', left: 'b', right: 'c' } })).toEqual([[null, 'a'], ['subtract', 'operation']])
  })
})

describe('old against new', () => {
  const net: Expression = { op: 'subtract', left: 'gross_sales', right: 'discounts' }
  const known = new Set(['net_sales', 'gross_sales', 'discounts', 'refunds', 'net_margin', 'orders'])

  it('measures the metric now and the new formula’s inputs in one list', () => {
    expect(compareNames('net_sales', proposedTree('net_sales', net, lookupOf({})), known)).toEqual(['net_sales', 'gross_sales', 'discounts'])
  })

  it('works out the new number from its inputs, never from the old number', () => {
    const tree = proposedTree('net_sales', net, lookupOf({}))
    expect(compareValues('net_sales', tree, values({ net_sales: 900, gross_sales: 1000, discounts: 50 }))).toEqual({ now: 900, after: 950 })
  })

  it('shows what else moves', () => {
    const lookup = lookupOf({ net_margin: { op: 'ratio', numerator: 'net_sales', denominator: 'orders' }, net_sales: { op: 'subtract', left: 'gross_sales', right: 'refunds' } })
    const measured = values({ net_margin: 9, net_sales: 900, gross_sales: 1000, refunds: 100, discounts: 50, orders: 100 })
    expect(impactNames(['net_margin'], 'net_sales', net, lookup, known)).toEqual(['net_margin', 'net_sales', 'gross_sales', 'discounts', 'orders'])
    expect(impactOf(['net_margin'], 'net_sales', net, lookup, measured)).toEqual([{ name: 'net_margin', now: 9, after: 9.5 }])
  })
})

describe('templates', () => {
  const catalog = ['revenue', 'ad_spend', 'orders', 'new_customers', 'net_sales', 'shipping_revenue', 'message_attributed_revenue', 'discounts'].map(name => entry(name))

  it('parses every template formula under a name the warehouse accepts', () => {
    for (const template of TEMPLATES) {
      expect(templateValue(template)).not.toBeNull()
      expect(isMetricName(template.name)).toBe(true)
    }
  })

  it('offers MER as revenue / ad_spend, unconfirmed', () => {
    expect(metricFromTemplate(TEMPLATES.find(t => t.id === 'mer')!)).toEqual({ name: 'mer', label: expect.any(String), unit: 'ratio', description: expect.any(String), value: MER })
  })

  it('notices a template already in the library, a missing input and data the store cannot measure', () => {
    const options = templatesFor([...catalog.filter(e => e.name !== 'new_customers'), entry('mer', { category: 'custom' })], new Set(['orders']))
    const byId = new Map(options.map(option => [option.template.id, option.status]))
    expect(byId.get('mer')).toEqual({ state: 'exists', name: 'mer' })
    expect(byId.get('ncac')).toEqual({ state: 'missing', inputs: ['new_customers'] })
    expect(byId.get('blended_cpa')).toEqual({ state: 'no-data', input: 'orders' })
    expect(byId.get('cm1')).toEqual({ state: 'blocked', reason: 'Needs product cost, which no connected app sends yet.' })
  })
})

describe('changeOf and plain words', () => {
  it('moves money in percent, a percentage in points and a ratio in its own units', () => {
    expect(changeOf(110, 100, 'money')).toEqual({ direction: 'up', magnitude: 10, measure: 'percent' })
    expect(changeOf(5, 0, 'money')).toBeNull()
    expect(changeOf(0.024, 0.02, 'percent')).toMatchObject({ direction: 'up', measure: 'points' })
    expect(changeOf(2.8, 3.2, 'ratio')?.direction).toBe('down')
    expect(changeOf(100.01, 100, 'money')?.direction).toBe('flat')
    expect(changeOf(null, 1, 'money')).toBeNull()
  })

  it('says what a root reads, in plain words', () => {
    expect(describeSource(ORDERS_REVENUE, 'Shopify')).toEqual({
      headline: 'Order total from Shopify orders', table: 'Shopify orders', column: 'order total', day: 'order date',
      rule: 'not cancelled', ruleRaw: 'cancelled_at is null', sentence: 'Order total from Shopify orders, not cancelled, by order date',
    })
    expect(columnWords('fulfilled_at')).toBe('date fulfilled')
    expect(columnWords('constructor')).toBe('constructor')
    expect(ruleWords('refunded_at IS NOT NULL')).toBe('refunded')
    expect(ruleWords("source_name <> 'wholesale'")).toBe('filtered')
  })

  it('names and orders areas, including ones it has never seen', () => {
    expect(categoryName('email_sms')).toBe('Email & SMS')
    expect(categoryName('__proto__')).toBe('Proto')
    expect(categoryName('loyalty_points')).toBe('Loyalty points')
    expect(categoryOrder(['custom', 'zeta', 'store', 'ads'])).toEqual(['store', 'ads', 'custom', 'zeta'])
  })
})

describe('the catalog', () => {
  const catalog = [
    entry('mer', { label: 'MER', unit: 'ratio', category: 'blended', value: MER }),
    entry('revenue', { label: 'Revenue', value: ORDERS_REVENUE, overridden: true }),
    entry('ad_spend', { label: 'Ad spend', category: 'ads' }),
    entry('roas_custom', { category: 'custom', value: { op: 'ratio', numerator: 'mer', denominator: 2 }, status: 'proposed' }),
  ]

  it('names whose definition it is', () => {
    expect(catalog.map(originOf)).toEqual(['builtin', 'adjusted', 'builtin', 'custom'])
  })

  it('finds the metrics built on one', () => {
    expect(usersOf('mer', catalog).map(e => e.name)).toEqual(['roas_custom'])
  })

  it('finds the metric a reply says already exists, and nothing in a partial word', () => {
    expect(mentionedMetrics('This is already available as MER: store revenue per dollar of ad spend.', catalog).map(e => e.name)).toEqual(['mer'])
    expect(mentionedMetrics('You can already use ad_spend and Revenue for that.', catalog).map(e => e.name)).toEqual(['ad_spend', 'revenue'])
    expect(mentionedMetrics('Already have MERCH stuff', catalog)).toEqual([])
    expect(mentionedMetrics('Which ad platforms should MER include?', catalog)).toEqual([])
  })
})

describe('what moved it', () => {
  const catalog = new Map([
    ['revenue', { name: 'revenue', category: 'store' }], ['orders', { name: 'orders', category: 'store' }],
    ['aov', { name: 'aov', category: 'store' }], ['clicks', { name: 'clicks', category: 'ads' }],
    ['my_ratio', { name: 'my_ratio', category: 'custom' }],
  ])

  it('lists a formula’s own inputs first, then the usual ones, from connected areas only', () => {
    expect(inputsFor('revenue', { catalog, areas: new Set(['store']) })).toEqual(['orders', 'aov'])
    expect(inputsFor('x', { formulaInputs: ['my_ratio', 'clicks', 'revenue'], catalog, areas: new Set(['store']) })).toEqual(['my_ratio', 'revenue'])
    expect(inputsFor('constructor', { catalog, areas: new Set(['store']) })).toEqual([])
  })

  it('skips inputs the store can’t measure once the warehouse says so', () => {
    expect(pickAvailable(['a', 'b', 'c', 'd', 'e'], new Set(['b']))).toEqual(['a', 'c', 'd', 'e'])
    expect(pickAvailable(['a', 'b', 'c', 'd', 'e'], undefined)).toEqual(['a', 'b', 'c', 'd'])
  })
})
