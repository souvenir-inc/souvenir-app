// "How it's calculated": a metric's warehouse definition as a tree to draw, the metric names to measure so every
// node has a number, and the arithmetic for the in-between steps that have no name of their own.
//
// Root metrics are counted or summed straight from a table (an aggregate). Nested metrics combine other metrics
// with add, subtract, multiply and ratio. Definitions come from the catalog (`MetricEntry.value`), which is
// outside data: every walk here is bounded (JS-7) and every lookup by name goes through a Map (JS-1).

import type { Aggregate, Definition, Expression, Term } from '@/lib/api/warehouse-schemas'

export type MetricValue = Definition
export type Operator = Expression['op']
export type FormulaKind = 'root' | 'nested'

/** Deepest nesting of operations one formula may have before it is too deep to draw (JS-7). */
export const MAX_FORMULA_DEPTH = 32
/** Most operations, metrics and numbers one formula may hold before it is too big to draw (JS-10). */
export const MAX_FORMULA_SIZE = 400
/** Metrics expanded inside metrics, before the tree says "goes deeper". */
export const MAX_DEPTH = 8

export function isAggregate(value: MetricValue): value is Aggregate {
  return 'kind' in value
}

/** Root when it reads a table, nested when it combines metrics, null when the formula isn't known. */
export function kindOf(value: MetricValue | null | undefined): FormulaKind | null {
  if (value === null || value === undefined) return null
  return isAggregate(value) ? 'root' : 'nested'
}

/** The operands of an expression, in reading order. */
export function operandsOf(expression: Expression): Term[] {
  switch (expression.op) {
    case 'add':
    case 'multiply': return expression.terms
    case 'subtract': return [expression.left, expression.right]
    case 'ratio':    return [expression.numerator, expression.denominator]
  }
}

const OPERATORS: ReadonlySet<string> = new Set(['add', 'subtract', 'multiply', 'ratio'])

export function isAggregateShape(value: unknown): value is Aggregate {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (v.kind === 'sum' || v.kind === 'count')
    && typeof v.table === 'string' && typeof v.day === 'string'
    && (v.column === null || v.column === undefined || typeof v.column === 'string')
    && (v.where === null || v.where === undefined || typeof v.where === 'string')
}

/** The operands of something shaped like an expression, or null when it isn't one. */
function looseOperands(value: unknown): unknown[] | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  if (typeof v.op !== 'string' || !OPERATORS.has(v.op)) return null
  switch (v.op) {
    case 'add':
    case 'multiply': return Array.isArray(v.terms) && v.terms.length > 0 ? v.terms : null
    case 'subtract': return [v.left, v.right]
    default:         return [v.numerator, v.denominator]
  }
}

export type FormulaShape = 'ok' | 'invalid' | 'deep' | 'large'

/**
 * Whether a value is a formula we can draw, checked without recursion (JS-7): a well-formed aggregate or
 * expression, no deeper than MAX_FORMULA_DEPTH and no bigger than MAX_FORMULA_SIZE.
 */
export function formulaShape(value: unknown): FormulaShape {
  if (isAggregateShape(value)) return 'ok'
  if (looseOperands(value) === null) return 'invalid'
  const stack: Array<{ term: unknown; depth: number }> = [{ term: value, depth: 1 }]
  let size = 0
  while (stack.length > 0) {
    const { term, depth } = stack.pop()!
    size += 1
    if (size > MAX_FORMULA_SIZE) return 'large'
    if (typeof term === 'string') { if (term === '') return 'invalid'; continue }
    if (typeof term === 'number') { if (!Number.isFinite(term)) return 'invalid'; continue }
    // The contract has no inline aggregates, but a drafted formula might carry one; it draws as a source.
    if (isAggregateShape(term)) continue
    const operands = looseOperands(term)
    if (operands === null) return 'invalid'
    if (depth > MAX_FORMULA_DEPTH) return 'deep'
    for (const operand of operands) stack.push({ term: operand, depth: depth + 1 })
  }
  return 'ok'
}

/** A shape check for formulas from a response or a draft: one we can walk safely. */
export function isMetricValue(value: unknown): value is MetricValue {
  return formulaShape(value) === 'ok'
}

/**
 * Why a metric node stops: its formula isn't known, it already appears above itself, the tree is deep enough,
 * it was already expanded earlier in the tree ("shown above"), or its formula is too big to draw.
 */
export type StopReason = 'unknown' | 'cycle' | 'depth' | 'repeat' | 'large'

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
  aggregate: Aggregate
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

/** The formula for a metric name: the catalog's `value`, or a proposal's before it is saved. */
export type FormulaLookup = (name: string) => MetricValue | null | undefined

/** A lookup over the catalog: names are outside keys, so it is a Map (JS-1). */
export function catalogLookup(entries: ReadonlyArray<{ name: string; value: MetricValue }>): FormulaLookup {
  const formulas = new Map(entries.map(entry => [entry.name, entry.value]))
  return name => formulas.get(name)
}

/** The same lookup with one metric's formula swapped (a proposal, an edit before it is saved). */
export function withFormula(lookup: FormulaLookup, name: string, value: MetricValue): FormulaLookup {
  return n => (n === name ? value : lookup(n))
}

/**
 * Expands a metric into its calculation tree. Each metric it uses is expanded too when its formula is known,
 * down to the tables. Node ids are stable paths, for React keys and open/closed state.
 */
export function buildTree(name: string, lookup: FormulaLookup, maxDepth = MAX_DEPTH): MetricNode {
  return metricNode(name, 'm', lookup, [], maxDepth, new Set())
}

/** The tree for a formula that has no name yet, like a proposal before it's saved. */
export function buildTreeFromValue(name: string, value: MetricValue, lookup: FormulaLookup, maxDepth = MAX_DEPTH): MetricNode {
  return buildTree(name, withFormula(lookup, name, value), maxDepth)
}

type Expanded = Set<string>

function metricNode(name: string, id: string, lookup: FormulaLookup, above: readonly string[], maxDepth: number, expanded: Expanded): MetricNode {
  const raw = lookup(name)
  const shape = raw === null || raw === undefined ? 'invalid' : formulaShape(raw)
  const value = shape === 'ok' ? (raw as MetricValue) : null
  const kind = kindOf(value)
  if (above.includes(name)) return { type: 'metric', id, name, kind, body: null, stop: 'cycle' }
  if (shape === 'deep' || shape === 'large') return { type: 'metric', id, name, kind: null, body: null, stop: 'large' }
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

// Recursion below is bounded: formulaShape refused anything deeper than MAX_FORMULA_DEPTH, and metrics
// nest at most maxDepth times, so the stack stays under MAX_DEPTH × MAX_FORMULA_DEPTH frames.
function operationNode(expression: Expression, id: string, lookup: FormulaLookup, path: readonly string[], maxDepth: number, expanded: Expanded): OperationNode {
  return {
    type: 'operation',
    id,
    op: expression.op,
    children: operandsOf(expression).map((term, index) => termNode(term, `${id}.${index}`, lookup, path, maxDepth, expanded)),
  }
}

function termNode(term: Term, id: string, lookup: FormulaLookup, path: readonly string[], maxDepth: number, expanded: Expanded): CalcNode {
  if (typeof term === 'number') return { type: 'number', id, value: term }
  if (typeof term === 'string') return metricNode(term, id, lookup, path, maxDepth, expanded)
  const loose: unknown = term
  if (isAggregateShape(loose)) return { type: 'source', id, aggregate: loose }
  return operationNode(term, id, lookup, path, maxDepth, expanded)
}

/** Every metric name in the tree, root first, each once: one measurement request fills the whole tree. */
export function namesIn(tree: CalcNode, known?: ReadonlySet<string>): string[] {
  const names: string[] = []
  const stack: CalcNode[] = [tree]
  while (stack.length > 0) {
    const node = stack.pop()!
    if (node.type === 'metric') {
      // An unknown name would fail the whole request, so only measure what the catalog has.
      if (!names.includes(node.name) && (known === undefined || known.has(node.name))) names.push(node.name)
      if (node.body !== null) stack.push(node.body)
    } else if (node.type === 'operation') {
      for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i])
    }
  }
  return names
}

/** The metrics a formula uses directly, without expanding them. */
export function referencesOf(value: MetricValue): string[] {
  if (isAggregate(value) || !isMetricValue(value)) return []
  const names: string[] = []
  const stack: Term[] = [value]
  while (stack.length > 0) {
    const term = stack.pop()!
    if (typeof term === 'string') { if (!names.includes(term)) names.push(term) }
    else if (typeof term === 'object' && !isAggregateShape(term)) {
      const operands = operandsOf(term)
      for (let i = operands.length - 1; i >= 0; i--) stack.push(operands[i])
    }
  }
  return names
}

/** Measured totals by metric name. A Map, because the names come from the response (JS-1). */
export type MeasuredValues = ReadonlyMap<string, number | null>

/** A measurement period's values as a Map, reading only its own keys. */
export function valuesFrom(record: Readonly<Record<string, number | null>> | undefined): Map<string, number | null> {
  const values = new Map<string, number | null>()
  if (record === undefined) return values
  for (const [name, value] of Object.entries(record)) values.set(name, typeof value === 'number' && Number.isFinite(value) ? value : null)
  return values
}

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
      const measured = values.get(node.name)
      if (measured !== undefined && measured !== null) return measured
      return node.body === null ? null : evaluate(node.body, values)
    }
    case 'operation': {
      const parts: number[] = []
      for (const child of node.children) {
        const part = evaluate(child, values)
        if (part === null) return null
        parts.push(part)
      }
      switch (node.op) {
        case 'add':      return parts.reduce((sum, n) => sum + n, 0)
        case 'multiply': return parts.reduce((product, n) => product * n, 1)
        case 'subtract': return parts[0] - parts[1]
        case 'ratio':    return parts[1] === 0 ? null : parts[0] / parts[1]
      }
    }
  }
}

/** The number of nodes in a tree, for deciding whether to open it fully. */
export function sizeOf(node: CalcNode): number {
  let size = 0
  const stack: CalcNode[] = [node]
  while (stack.length > 0) {
    const next = stack.pop()!
    size += 1
    if (next.type === 'metric' && next.body !== null) stack.push(next.body)
    else if (next.type === 'operation') stack.push(...next.children)
  }
  return size
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

/** The warehouse expression an operation node stands for, to print it or reason about its unit. */
export function expressionOf(node: OperationNode): Expression {
  const terms = node.children.map(termOf)
  switch (node.op) {
    case 'add':      return { op: 'add', terms }
    case 'multiply': return { op: 'multiply', terms }
    case 'subtract': return { op: 'subtract', left: terms[0], right: terms[1] }
    case 'ratio':    return { op: 'ratio', numerator: terms[0], denominator: terms[1] }
  }
}

function termOf(node: CalcNode): Term {
  switch (node.type) {
    case 'number': return node.value
    case 'metric': return node.name
    case 'operation': return expressionOf(node)
    // An inline source has no term form; it stands in by its table name (only printing and units read this).
    case 'source': return node.aggregate.table
  }
}
