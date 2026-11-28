// How a metric's number reads: its catalog unit for a named metric, and for an in-between step of a formula, the
// unit worked out from what it combines (money over a count is money; a share of the same unit is a percent).

import type { Expression, Term, Unit } from '@/lib/api/warehouse-schemas'
import { expressionOf, isAggregate, isAggregateShape, isMetricValue, operandsOf, type CalcNode, type FormulaLookup, type MetricValue } from './tree'

/** How a node's number reads: the catalog's units, and `number` for a plain number or a mix with no unit. */
export type DisplayUnit = 'money' | 'count' | 'percent' | 'ratio' | 'number'

export type UnitLookup = (name: string) => Unit | undefined

const SPEND = /(^|_)(spend|cost|costs|cogs)($|_)/

/** A ratio over spend ("revenue per ad dollar") reads as a multiple, 3.20, not 320%. */
export function isSpendName(name: string): boolean {
  return name.length <= 64 && SPEND.test(name)
}

function fromUnit(unit: Unit | undefined): DisplayUnit {
  return unit ?? 'number'
}

/** How a named metric's number reads: its catalog unit, else worked out from its formula. */
export function displayOfMetric(unit: Unit | undefined, value: MetricValue | null, unitOf: UnitLookup): DisplayUnit {
  if (unit !== undefined) return unit
  if (value === null || !isMetricValue(value)) return 'number'
  if (isAggregate(value)) return value.kind === 'count' ? 'count' : 'money'
  return expressionDisplay(value, unitOf)
}

function termDisplay(term: Term, unitOf: UnitLookup): DisplayUnit {
  if (typeof term === 'number') return 'number'
  if (typeof term === 'string') return fromUnit(unitOf(term))
  const loose: unknown = term
  if (isAggregateShape(loose)) return loose.kind === 'count' ? 'count' : 'money'
  return expressionDisplay(term, unitOf)
}

function ratioDisplay(top: DisplayUnit, bottom: DisplayUnit, denominator: Term): DisplayUnit {
  if (bottom === 'number') return top
  if (top === bottom) {
    if (typeof denominator === 'string' && isSpendName(denominator)) return 'ratio'
    return top === 'money' || top === 'count' ? 'percent' : 'number'
  }
  if (top === 'money' && bottom === 'count') return 'money'
  return 'number'
}

// Bounded: called on formulas that passed formulaShape (≤ MAX_FORMULA_DEPTH levels).
function expressionDisplay(expression: Expression, unitOf: UnitLookup): DisplayUnit {
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
      const nonRate = units.filter(unit => unit !== 'percent' && unit !== 'ratio')
      return nonRate.length === 1 ? nonRate[0] : 'number'
    }
    case 'ratio':
      return ratioDisplay(termDisplay(expression.numerator, unitOf), termDisplay(expression.denominator, unitOf), expression.denominator)
  }
}

/** How any node's number reads: a named metric by its unit, an in-between step from what it combines. */
export function displayOfNode(node: CalcNode, unitOf: UnitLookup, lookup: FormulaLookup): DisplayUnit {
  switch (node.type) {
    case 'number': return 'number'
    case 'source': return node.aggregate.kind === 'count' ? 'count' : 'money'
    case 'metric': return displayOfMetric(unitOf(node.name), lookup(node.name) ?? null, unitOf)
    case 'operation': return expressionDisplay(expressionOf(node), unitOf)
  }
}

/** The catalog unit a new metric's formula suggests. */
export function unitForDisplay(display: DisplayUnit): Unit {
  return display === 'number' ? 'ratio' : display
}
