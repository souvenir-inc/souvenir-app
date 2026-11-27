// Old against new, before saving: a metric's number now next to what a new formula would give, worked out from
// real measured inputs (nothing is written to the warehouse to preview it). Also what else moves: custom metrics
// built on this one, worked out again with the new formula in place.

import type { Expression } from '@/lib/api/warehouse-schemas'
import { buildTree, buildTreeFromValue, evaluate, namesIn, withFormula, type CalcNode, type FormulaLookup, type MeasuredValues, type MetricNode } from './tree'

/** The tree a new formula makes, with the metric's own name pointing at its new formula. */
export function proposedTree(name: string, value: Expression, lookup: FormulaLookup): MetricNode {
  return buildTreeFromValue(name, value, lookup)
}

/**
 * Names to measure for the comparison: the metric being compared against (its number now) and every input of
 * the new formula. When the new formula is a new metric, pass the original as `baseName`.
 */
export function compareNames(name: string, tree: MetricNode, known: ReadonlySet<string>, baseName = name): string[] {
  const inputs = namesIn(tree, known).filter(n => n !== name)
  return [...new Set([...(known.has(baseName) ? [baseName] : []), ...inputs])]
}

export interface Comparison {
  now: number | null
  after: number | null
}

/** The measured values without some names, so those are worked out from their parts instead. */
function without(values: MeasuredValues, names: Iterable<string>): Map<string, number | null> {
  const out = new Map(values)
  for (const name of names) out.delete(name)
  return out
}

/**
 * The number now and with the new formula, from one set of measured totals. "Now" is the base metric's measured
 * value; "after" is the new tree worked out from its inputs, never from the metric's own (old) number.
 */
export function compareValues(name: string, tree: MetricNode, values: MeasuredValues, baseName = name): Comparison {
  return { now: values.get(baseName) ?? null, after: evaluate(tree, without(values, [name])) }
}

export interface Impact {
  name: string
  now: number | null
  after: number | null
}

/** The metric names on the path from the top of a tree down to `name`, including both ends. */
function namesAbove(tree: MetricNode, name: string): string[] {
  const found = new Set<string>()
  const stack: Array<{ node: CalcNode; path: readonly string[] }> = [{ node: tree, path: [] }]
  while (stack.length > 0) {
    const { node, path } = stack.pop()!
    if (node.type === 'metric') {
      const here = [...path, node.name]
      if (node.name === name) here.forEach(n => found.add(n))
      if (node.body) stack.push({ node: node.body, path: here })
    } else if (node.type === 'operation') {
      for (const child of node.children) stack.push({ node: child, path })
    }
  }
  return [...found]
}

/**
 * Custom metrics that use this one, and their number with the new formula in place. Their own measured number
 * is "now"; "after" rebuilds their tree with this metric's new formula and works it out from measured inputs.
 */
export function impactOf(users: readonly string[], name: string, value: Expression, lookup: FormulaLookup, values: MeasuredValues): Impact[] {
  const swapped = withFormula(lookup, name, value)
  return users.map(user => {
    const tree = buildTree(user, swapped)
    // Anything that sits above the edited metric would carry its old number: work those out again.
    return { name: user, now: values.get(user) ?? null, after: evaluate(tree, without(values, namesAbove(tree, name))) }
  })
}

/** Every name needed to work out the impact, so it rides in the same request as the comparison. */
export function impactNames(users: readonly string[], name: string, value: Expression, lookup: FormulaLookup, known: ReadonlySet<string>): string[] {
  const swapped = withFormula(lookup, name, value)
  return [...new Set(users.flatMap(user => namesIn(buildTree(user, swapped), known)))]
}
