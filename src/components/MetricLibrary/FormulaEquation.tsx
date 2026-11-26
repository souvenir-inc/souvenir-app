'use client'

import { Fragment, type ReactNode } from 'react'
import Link from 'next/link'
import { describeSource, formatDisplay, OPERATOR_SYMBOLS } from '@/lib/metrics/display'
import {
  displayOfMetric, displayOfNode, evaluate, flatOperands,
  type CalcNode, type FormulaLookup, type MeasuredValues, type MetricNode, type SourceNode, type UnitLookup,
} from '@/lib/metrics/tree'
import { dashboardMetricRoute } from '@/lib/routes'
import styles from './MetricLibrary.module.css'

export interface FormulaEquationProps {
  tree: MetricNode
  lookup: FormulaLookup
  unitOf: UnitLookup
  labelOf: (name: string) => string | undefined
  /** Totals for the period (missing totals already read as 0 where they should be); undefined while loading. */
  values: MeasuredValues | undefined
  /** The apps feeding a metric's area, for a table chip: "Shopify". */
  appsOf: (name: string) => string | undefined
  /** Opens another metric in place (the metric window); without it, a chip links to the metric's page. */
  onOpen?: (name: string) => void
}

/**
 * A formula as one line you can read: `[Average order value] = [Revenue] ÷ [Orders]`, each metric a chip with
 * its number for the period under it. A metric counted from a table reads as a sentence:
 * `[Orders] = count of [Shopify › orders] where [cancelled_at is null] by [Placed at, store time]`.
 */
export function FormulaEquation({ tree, lookup, unitOf, labelOf, values, appsOf, onOpen }: FormulaEquationProps) {
  if (tree.body === null) return null
  const unitFor = (node: CalcNode) => (node.type === 'metric'
    ? displayOfMetric(node.name, unitOf(node.name), lookup(node.name) ?? null, unitOf)
    : displayOfNode(node, unitOf, lookup))
  const valueOf = (node: CalcNode) => (values === undefined ? undefined : formatDisplay(evaluate(node, values), unitFor(node)))

  const metricChip = (node: MetricNode, isResult = false): ReactNode => {
    const label = labelOf(node.name) ?? node.name
    const chip = isResult
      ? <span className={styles.eqChip} data-result="">{label}</span>
      : onOpen
        ? <button type="button" className={styles.eqChip} onClick={() => onOpen(node.name)}>{label}</button>
        : <Link href={dashboardMetricRoute(node.name)} className={styles.eqChip}>{label}</Link>
    return (
      <span className={styles.eqTerm}>
        {chip}
        <span className={styles.eqValue}>{valueOf(node) ?? ' '}</span>
      </span>
    )
  }

  const operand = (node: CalcNode): ReactNode => {
    switch (node.type) {
      case 'metric': return metricChip(node)
      case 'number': return <span className={styles.eqTerm}><span className={styles.eqNumber}>{formatDisplay(node.value, 'number')}</span><span className={styles.eqValue}>{' '}</span></span>
      case 'source': return <SourceSentence node={node} app={undefined} />
      case 'operation':
        return (
          <>
            <span className={styles.eqSymbol} aria-hidden>(</span>
            {flatOperands(node).map(item => (
              <Fragment key={item.node.id}>
                {item.op && <span className={styles.eqSymbol}>{OPERATOR_SYMBOLS[item.op]}</span>}
                {operand(item.node)}
              </Fragment>
            ))}
            <span className={styles.eqSymbol} aria-hidden>)</span>
          </>
        )
    }
  }

  return (
    <div className={styles.equation} role="group" aria-label={`How ${labelOf(tree.name) ?? tree.name} is calculated`}>
      {metricChip(tree, true)}
      <span className={styles.eqSymbol}>=</span>
      {tree.body.type === 'source'
        ? <SourceSentence node={tree.body} app={appsOf(tree.name)} />
        : flatOperands(tree.body).map(item => (
          <Fragment key={item.node.id}>
            {item.op && <span className={styles.eqSymbol}>{OPERATOR_SYMBOLS[item.op]}</span>}
            {operand(item.node)}
          </Fragment>
        ))}
    </div>
  )
}

/** "count of [Shopify orders] where [not cancelled] by [order date, store time]", in plain words. */
function SourceSentence({ node, app }: { node: SourceNode; app: string | undefined }) {
  const source = describeSource(node.aggregate, app)
  const chip = (text: string, kind: 'source' | 'rule') => (
    <span className={styles.eqTerm}><span className={styles.eqChip} data-source={kind === 'source' ? '' : undefined} data-rule={kind === 'rule' ? '' : undefined}>{text}</span><span className={styles.eqValue}>{'\u00a0'}</span></span>
  )
  return (
    <>
      {source.column
        ? <><span className={styles.eqWord}>sum of</span>{chip(source.column, 'source')}<span className={styles.eqWord}>in</span>{chip(source.table, 'source')}</>
        : <><span className={styles.eqWord}>count of</span>{chip(source.table, 'source')}</>}
      {source.rule && <><span className={styles.eqWord}>where</span>{chip(source.rule, 'rule')}</>}
      <span className={styles.eqWord}>by</span>
      {chip(`${source.day}, store time`, 'source')}
    </>
  )
}
