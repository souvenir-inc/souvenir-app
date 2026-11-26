// "How it's calculated": a metric's warehouse `value` as a tree to draw, the metric names to measure so every
// node has a live number, and the arithmetic for the in-between steps that have no name of their own.
//
// Root metrics are counted or summed straight from a table. Nested metrics are built from other metrics with
// add, subtract, multiply and ratio. A metric whose formula we don't know (every built-in until the catalog
// returns formulas, ask S3) is a leaf: we never guess what it is made of.

import type { MetricAggregate, MetricExpression, MetricTerm, MetricUnit } from '@/lib/api/warehouse'

export type MetricValue = MetricAggregate | MetricExpression
export type Operator = MetricExpression['op']
export type FormulaKind = 'root' | 'nested'

export function isAggregate(value: MetricValue): value is MetricAggregate {
  return 'kind' in value
}

/** Root when it reads a table, nested when it combines metrics, null when the formula isn't known. */
export function kindOf(value: MetricValue | null | undefined): FormulaKind | null {
  if (value === null || value === undefined) return null
  return isAggregate(value) ? 'root' : 'nested'
}

const OPERATORS: ReadonlySet<string> = new Set(['add', 'subtract', 'multiply', 'ratio'])

function isTerm(term: unknown): term is MetricTerm {
  if (typeof term === 'string') return term !== ''
  if (typeof term === 'number') return Number.isFinite(term)
  return isExpression(term)
}

function isExpression(value: unknown): value is MetricExpression {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  if (typeof v.op !== 'string' || !OPERATORS.has(v.op)) return false
  switch (v.op) {
    case 'add':
    case 'multiply': return Array.isArray(v.terms) && v.terms.length > 0 && v.terms.every(isTerm)
    case 'subtract': return isTerm(v.left) && isTerm(v.right)
    default:         return isTerm(v.numerator) && isTerm(v.denominator)
  }
}

function isAggregateShape(value: unknown): value is MetricAggregate {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (v.kind === 'sum' || v.kind === 'count')
    && typeof v.table === 'string' && typeof v.day === 'string'
    && (v.column === null || v.column === undefined || typeof v.column === 'string')
    && (v.where === null || v.where === undefined || typeof v.where === 'string')
}

/** A shape check for formulas read back from storage or a response we didn't validate ourselves. */
export function isMetricValue(value: unknown): value is MetricValue {
  return isAggregateShape(value) || isExpression(value)
}

/** The operands of an expression, in reading order. */
export function operandsOf(expression: MetricExpression): MetricTerm[] {
  switch (expression.op) {
    case 'add':
    case 'multiply': return expression.terms
    case 'subtract': return [expression.left, expression.right]
    case 'ratio':    return [expression.numerator, expression.denominator]
  }
}

/**
 * Why a metric node stops: its formula isn't known, it already appears above itself, the tree is deep enough,
 * or it was already expanded earlier in the tree ("shown above").
 */
export type StopReason = 'unknown' | 'cycle' | 'depth' | 'repeat'

export interface MetricNode {
  type: 'metric'
  id: string
  name: string
  kind: FormulaKind | null
  body: SourceNode | OperationNode | null
  stop: StopReason | null
}

/** Where a root metric's rows come from: a table, a column (for a sum), the field that puts a row on a day, a filter. */
export interface SourceNode {
  type: 'source'
  id: string
  aggregate: MetricAggregate
}

export interface OperationNode {
  type: 'operation'
  id: string
  op: Operator
  children: CalcNode[]
}

export interface NumberNode {
  type: 'number'
  id: string
  value: number
}

export type CalcNode = MetricNode | SourceNode | OperationNode | NumberNode

/** The formula for a metric name, from wherever formulas live (the catalog once S3 lands, our registry until then). */
export type FormulaLookup = (name: string) => MetricValue | null | undefined

export const MAX_DEPTH = 8

/**
 * Expands a metric into its calculation tree. Each metric it uses is expanded too when its formula is known,
 * down to the tables. Node ids are stable paths, for React keys and open/closed state.
 */
export function buildTree(name: string, lookup: FormulaLookup, maxDepth = MAX_DEPTH): MetricNode {
  return metricNode(name, 'm', lookup, [], maxDepth, new Set())
}

/** The tree for a formula that has no name yet, like a proposal before it's saved. */
export function buildTreeFromValue(name: string, value: MetricValue, lookup: FormulaLookup, maxDepth = MAX_DEPTH): MetricNode {
  return metricNode(name, 'm', n => (n === name ? value : lookup(n)), [], maxDepth, new Set())
}

/** Shared while one tree is built: the metrics already expanded, so a second use reads "shown above". */
type Expanded = Set<string>

function metricNode(name: string, id: string, lookup: FormulaLookup, above: string[], maxDepth: number, expanded: Expanded): MetricNode {
  const value = safeLookup(lookup, name)
  const kind = kindOf(value)
  if (above.includes(name)) return { type: 'metric', id, name, kind, body: null, stop: 'cycle' }
  if (value === null) return { type: 'metric', id, name, kind: null, body: null, stop: 'unknown' }
  if (expanded.has(name)) return { type: 'metric', id, name, kind, body: null, stop: 'repeat' }
  if (above.length >= maxDepth) return { type: 'metric', id, name, kind, body: null, stop: 'depth' }
  expanded.add(name)
  const path = [...above, name]
  const body = isAggregate(value)
    ? { type: 'source' as const, id: `${id}.s`, aggregate: value }
    : operationNode(value, `${id}.f`, lookup, path, maxDepth, expanded)
  return { type: 'metric', id, name, kind, body, stop: null }
}

function safeLookup(lookup: FormulaLookup, name: string): MetricValue | null {
  const value = lookup(name)
  return value !== null && value !== undefined && isMetricValue(value) ? value : null
}

function operationNode(expression: MetricExpression, id: string, lookup: FormulaLookup, path: string[], maxDepth: number, expanded: Expanded): OperationNode {
  return {
    type: 'operation',
    id,
    op: expression.op,
    children: operandsOf(expression).map((term, index) => termNode(term, `${id}.${index}`, lookup, path, maxDepth, expanded)),
  }
}

function termNode(term: MetricTerm, id: string, lookup: FormulaLookup, path: string[], maxDepth: number, expanded: Expanded): CalcNode {
  if (typeof term === 'number') return { type: 'number', id, value: term }
  if (typeof term === 'string') return metricNode(term, id, lookup, path, maxDepth, expanded)
  // The contract has no inline aggregates, but a drafted formula might carry one; draw it as a source.
  const loose: unknown = term
  if (isAggregateShape(loose)) return { type: 'source', id, aggregate: loose }
  return operationNode(term, id, lookup, path, maxDepth, expanded)
}

/** Every metric name in the tree, root first, each once: one measurement request fills the whole tree. */
export function namesIn(tree: CalcNode, known?: ReadonlySet<string>): string[] {
  const names: string[] = []
  const visit = (node: CalcNode) => {
    if (node.type === 'metric') {
      // An unknown name would fail the whole request with a 422, so only measure what the catalog has.
      if (!names.includes(node.name) && (known === undefined || known.has(node.name))) names.push(node.name)
      if (node.body !== null) visit(node.body)
    } else if (node.type === 'operation') {
      node.children.forEach(visit)
    }
  }
  visit(tree)
  return names
}

/** The metrics a formula uses directly, without expanding them. */
export function referencesOf(value: MetricValue): string[] {
  if (isAggregate(value)) return []
  const names: string[] = []
  const visit = (term: MetricTerm) => {
    if (typeof term === 'string') { if (!names.includes(term)) names.push(term) }
    else if (typeof term === 'object') operandsOf(term).forEach(visit)
  }
  visit(value)
  return names
}

export type MeasuredValues = Readonly<Record<string, number | null | undefined>>

/**
 * A node's number for the period. A named metric uses its measured value; an in-between step with no name of its
 * own (the "revenue − refunds" inside "(revenue − refunds) ÷ orders") is worked out from its parts. Values must
 * be totals for the period: a ratio of totals is the period's ratio. Missing data stays missing, never zero.
 */
export function evaluate(node: CalcNode, values: MeasuredValues): number | null {
  switch (node.type) {
    case 'number': return node.value
    case 'source': return null
    case 'metric': {
      const measured = values[node.name]
      if (measured !== undefined && measured !== null) return measured
      // No number from the warehouse: work it out from its parts when we know them, else it's missing.
      return node.body === null ? null : evaluate(node.body, values)
    }
    case 'operation': {
      const parts = node.children.map(child => evaluate(child, values))
      if (parts.some(part => part === null)) return null
      const numbers = parts as number[]
      switch (node.op) {
        case 'add':      return numbers.reduce((sum, n) => sum + n, 0)
        case 'multiply': return numbers.reduce((product, n) => product * n, 1)
        case 'subtract': return numbers[0] - numbers[1]
        case 'ratio':    return numbers[1] === 0 ? null : numbers[0] / numbers[1]
      }
    }
  }
}

/** Money and count metrics that are rates or averages, not totals: "no rows" for these is no number, never 0. */
const NON_ADDITIVE = /^(aov|cpc|cpm|ctr|frequency|reach)$|(^|_)(per|rate|avg|average|roas|cpa|share|ratio)(_|$)/

/** A total (a sum or a count) rather than a rate or an average, judged from its unit and name. */
export function isAdditive(name: string, unit: MetricUnit | undefined): boolean {
  return (unit === 'money' || unit === 'count') && !NON_ADDITIVE.test(name)
}

/**
 * Reads "no rows" as 0 for totals on days their source has synced. The warehouse returns null both for "nothing
 * happened" and for "no data" (ask S15); once windows end where the data stops, a total with no rows is 0: no
 * refunds this month is $0 of refunds. Rates and averages stay missing. Returns the names it filled, for a note.
 */
export function fillMissingTotals(values: MeasuredValues, shouldFill: (name: string) => boolean): { values: Record<string, number | null | undefined>; filled: Set<string> } {
  const out: Record<string, number | null | undefined> = { ...values }
  const filled = new Set<string>()
  for (const [name, value] of Object.entries(values)) {
    if (value === null && shouldFill(name)) { out[name] = 0; filled.add(name) }
  }
  return { values: out, filled }
}

/** How a node's number reads: the catalog's three units, split so a ratio can read as a percent or a multiple. */
export type DisplayUnit = 'money' | 'count' | 'percent' | 'multiple' | 'number'

const SPEND = /(^|_)(spend|cost|costs|cogs)($|_)/
const MULTIPLE = /(^|_)(roas|mer)$/

/** A ratio over spend ("revenue per ad dollar") reads as a multiple, 3.2x, not 320%. */
export function isSpendName(name: string): boolean {
  return SPEND.test(name)
}

export type UnitLookup = (name: string) => MetricUnit | undefined

function fromUnit(unit: MetricUnit | undefined): DisplayUnit {
  if (unit === 'money') return 'money'
  if (unit === 'count') return 'count'
  if (unit === 'ratio') return 'percent'
  return 'number'
}

/** How a named metric's number reads, from its catalog unit, refined by its formula when we know it. */
export function displayOfMetric(name: string, unit: MetricUnit | undefined, value: MetricValue | null, unitOf: UnitLookup): DisplayUnit {
  if (unit === 'ratio' && MULTIPLE.test(name)) return 'multiple'
  if (unit === 'ratio' && value !== null && !isAggregate(value) && value.op === 'ratio') {
    const shape = ratioDisplay(termDisplay(value.numerator, unitOf), termDisplay(value.denominator, unitOf), value.denominator)
    if (shape === 'multiple') return 'multiple'
  }
  return fromUnit(unit)
}

function termDisplay(term: MetricTerm, unitOf: UnitLookup): DisplayUnit {
  if (typeof term === 'number') return 'number'
  if (typeof term === 'string') return MULTIPLE.test(term) && unitOf(term) === 'ratio' ? 'multiple' : fromUnit(unitOf(term))
  const loose: unknown = term
  if (isAggregateShape(loose)) return loose.kind === 'count' ? 'count' : 'money'
  return expressionDisplay(term, unitOf)
}

function ratioDisplay(top: DisplayUnit, bottom: DisplayUnit, denominator: MetricTerm): DisplayUnit {
  if (bottom === 'number') return top
  if (top === bottom) {
    if (typeof denominator === 'string' && isSpendName(denominator)) return 'multiple'
    return top === 'money' || top === 'count' ? 'percent' : 'number'
  }
  if (top === 'money' && bottom === 'count') return 'money'
  return 'number'
}

function expressionDisplay(expression: MetricExpression, unitOf: UnitLookup): DisplayUnit {
  switch (expression.op) {
    case 'add':
    case 'subtract': {
      const units = operandsOf(expression).map(term => termDisplay(term, unitOf))
      return units.find(unit => unit !== 'number') ?? 'number'
    }
    case 'multiply': {
      const units = expression.terms.map(term => termDisplay(term, unitOf)).filter(unit => unit !== 'number')
      if (units.length === 0) return 'number'
      if (units.length === 1) return units[0]
      // money × a rate is still money; anything else multiplied together has no everyday unit.
      const nonRate = units.filter(unit => unit !== 'percent' && unit !== 'multiple')
      return nonRate.length === 1 ? nonRate[0] : 'number'
    }
    case 'ratio':
      return ratioDisplay(termDisplay(expression.numerator, unitOf), termDisplay(expression.denominator, unitOf), expression.denominator)
  }
}

/** How an in-between node's number reads, worked out from what it combines. */
export function displayOfNode(node: CalcNode, unitOf: UnitLookup, lookup: FormulaLookup): DisplayUnit {
  switch (node.type) {
    case 'number': return 'number'
    case 'source': return node.aggregate.kind === 'count' ? 'count' : 'money'
    case 'metric': return displayOfMetric(node.name, unitOf(node.name), safeLookup(lookup, node.name), unitOf)
    case 'operation': return expressionDisplay(expressionOf(node), unitOf)
  }
}

/** Rebuilds the warehouse expression an operation node came from, for unit reasoning. */
function expressionOf(node: OperationNode): MetricExpression {
  const terms = node.children.map(termOf)
  switch (node.op) {
    case 'add':      return { op: 'add', terms }
    case 'multiply': return { op: 'multiply', terms }
    case 'subtract': return { op: 'subtract', left: terms[0], right: terms[1] }
    case 'ratio':    return { op: 'ratio', numerator: terms[0], denominator: terms[1] }
  }
}

function termOf(node: CalcNode): MetricTerm {
  switch (node.type) {
    case 'number': return node.value
    case 'metric': return node.name
    case 'operation': return expressionOf(node)
    // An inline source has no term form; it reads as money or count through its own node.
    case 'source': return node.aggregate as unknown as MetricExpression
  }
}

/** The number of nodes in a tree, for deciding whether to open it fully. */
export function sizeOf(node: CalcNode): number {
  if (node.type === 'metric') return 1 + (node.body === null ? 0 : sizeOf(node.body))
  if (node.type === 'operation') return 1 + node.children.reduce((sum, child) => sum + sizeOf(child), 0)
  return 1
}

/**
 * The parts of an operation as one reads them, each with the sign in front of it. Same-sign chains flatten, since
 * they read the same: (a − b) − c is a − b − c, and a + (b + c) is a + b + c. A bracket that changes the answer
 * stays a group.
 */
export function flatOperands(node: OperationNode): Array<{ node: CalcNode; op: Operator | null }> {
  const out: Array<{ node: CalcNode; op: Operator | null }> = []
  if (node.op === 'subtract') {
    const [left, right] = node.children
    if (left.type === 'operation' && left.op === 'subtract') out.push(...flatOperands(left))
    else out.push({ node: left, op: null })
    out.push({ node: right, op: 'subtract' })
    return out
  }
  if (node.op === 'add' || node.op === 'multiply') {
    node.children.forEach((child, index) => {
      if (child.type === 'operation' && child.op === node.op) {
        flatOperands(child).forEach((item, inner) => out.push({ node: item.node, op: index === 0 && inner === 0 ? null : node.op }))
      } else {
        out.push({ node: child, op: index === 0 ? null : node.op })
      }
    })
    return out
  }
  return node.children.map((child, index) => ({ node: child, op: index === 0 ? null : node.op }))
}
