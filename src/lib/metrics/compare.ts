// Old against new, before saving: a metric's number now next to what a new formula would give, worked out from
// real measured inputs (decision: nested formulas only tonight; roots and rules need S11). Also what else moves:
// custom metrics built on this one, recomputed with the new formula.

import type { MetricExpression, Period } from '@/lib/api/warehouse'
import { buildTree, buildTreeFromValue, evaluate, namesIn, type CalcNode, type FormulaLookup, type MeasuredValues, type MetricNode } from './tree'

/** The tree a new formula makes, with the metric's own name still pointing at its new formula. */
export function proposedTree(name: string, value: MetricExpression, lookup: FormulaLookup): MetricNode {
  return buildTreeFromValue(name, value, lookup)
}

/**
 * Names to measure for the comparison: the metric itself (its number now) and every input of the new formula.
 * When the new formula is saved under another name ("try your own" on a built-in), pass the original in `extra`.
 */
export function compareNames(name: string, tree: MetricNode, known: ReadonlySet<string>, extra: readonly string[] = []): string[] {
  const inputs = namesIn(tree, known).filter(n => n !== name)
  return [...new Set([...(known.has(name) ? [name] : []), ...inputs, ...extra])]
}

export interface Comparison {
  now: number | null
  after: number | null
}

/**
 * The number now and with the new formula, from one set of measured totals. "Now" is the metric's measured
 * value; "after" is the new tree worked out from its inputs, never from the metric's own (old) number.
 */
export function compareValues(name: string, tree: MetricNode, values: MeasuredValues, baseName = name): Comparison {
  const withoutSelf: Record<string, number | null | undefined> = { ...values }
  delete withoutSelf[name]
  return { now: values[baseName] ?? null, after: evaluate(tree, withoutSelf) }
}

export interface ComparePoint {
  date: string
  /** The new formula's number. */
  value: number | null
  /** The number now, under the current definition. */
  comparison: number | null
  comparisonDate: string
}

/** The two lines, period by period. Periods after `until` (a failed source's last good day) have no data. */
export function compareSeries(periods: readonly Period[], name: string, tree: MetricNode, until?: string | null, baseName = name): ComparePoint[] {
  return periods.map(period => {
    const cut = until !== undefined && until !== null && period.start > until
    const { now, after } = compareValues(name, tree, period.values, baseName)
    return { date: period.start, value: cut ? null : after, comparison: cut ? null : now, comparisonDate: period.start }
  })
}

export interface Impact {
  name: string
  now: number | null
  after: number | null
}

/**
 * Custom metrics that use this one, and their number with the new formula in place. Their own measured number
 * is "now"; "after" rebuilds their tree with this metric's new formula and works it out from measured inputs.
 */
export function impactOf(users: readonly string[], name: string, value: MetricExpression, lookup: FormulaLookup, values: MeasuredValues): Impact[] {
  const swapped: FormulaLookup = n => (n === name ? value : lookup(n))
  return users.map(user => {
    const tree = buildTree(user, swapped)
    const inputs: Record<string, number | null | undefined> = { ...values }
    // Anything that sits above the edited metric would carry its old number: work those out again.
    for (const n of namesAbove(tree, name)) delete inputs[n]
    return { name: user, now: values[user] ?? null, after: evaluate(tree, inputs) }
  })
}

/** The metric names on the path from the top of a tree down to `name`, including both ends. */
function namesAbove(tree: MetricNode, name: string): string[] {
  const found: string[] = []
  const visit = (node: CalcNode, path: string[]): void => {
    if (node.type === 'metric') {
      const here = [...path, node.name]
      if (node.name === name) here.forEach(n => { if (!found.includes(n)) found.push(n) })
      if (node.body) visit(node.body, here)
    } else if (node.type === 'operation') {
      for (const child of node.children) visit(child, path)
    }
  }
  visit(tree, [])
  return found
}

/** Every name needed to work out the impact, so it rides in the same request as the comparison. */
export function impactNames(users: readonly string[], name: string, value: MetricExpression, lookup: FormulaLookup, known: ReadonlySet<string>): string[] {
  const swapped: FormulaLookup = n => (n === name ? value : lookup(n))
  return [...new Set(users.flatMap(user => namesIn(buildTree(user, swapped), known)))]
}
