'use client'

import { Fragment, type ReactNode } from 'react'
import { TextLink } from '@/components/ui/link'
import { describeSource, OPERATOR_SYMBOLS } from '@/lib/metrics/display'
import { evaluate, flatOperands, type CalcNode, type MeasuredValues, type MetricNode, type SourceNode } from '@/lib/metrics/tree'
import { displayOfNode } from '@/lib/metrics/units'
import { DASHBOARD_METRIC_ROUTE } from '@/lib/routes'
import { formatDisplay } from './format'
import type { Library } from './use-library'

const CHIP = 'inline-flex items-center rounded-md bg-[var(--neutral-100)] px-2 py-0.5 text-body-sm text-[var(--neutral-900)] shadow-[inset_0_0_0_1px_var(--neutral-200)]'
const SYMBOL = 'px-1 text-body text-[var(--neutral-500)]'
const WORD = 'px-1 text-body-sm text-[var(--neutral-500)]'

export interface FormulaEquationProps {
  tree: MetricNode
  library: Library
  /** Totals for the period; undefined while loading. */
  values: MeasuredValues | undefined
}

/**
 * A formula as one line you can read: `[Average order value] = [Revenue] ÷ [Orders]`, each metric a chip with its
 * number for the period under it. A metric counted from a table reads as a sentence:
 * `[Orders] = count of [Shopify orders] where [not cancelled] by [order date, store time]`.
 */
export function FormulaEquation({ tree, library, values }: FormulaEquationProps) {
  const { labelOf } = library
  if (tree.body === null) return null
  const valueOf = (node: CalcNode) => (values === undefined ? ' ' : formatDisplay(evaluate(node, values), displayOfNode(node, library.unitOf, library.lookup)))

  const term = (chip: ReactNode, value: string) => (
    <span className="inline-flex flex-col items-start gap-0.5">
      {chip}
      <span className="pl-2 text-small text-[var(--neutral-500)]">{value}</span>
    </span>
  )

  const metricChip = (node: MetricNode, isResult = false): ReactNode => {
    const label = labelOf(node.name) ?? node.name
    const linked = !isResult && library.known.has(node.name)
    const chip = linked
      ? <TextLink href={DASHBOARD_METRIC_ROUTE(node.name)} variant="standalone" className={CHIP}>{label}</TextLink>
      : <span className={CHIP}>{label}</span>
    return term(chip, valueOf(node))
  }

  const operand = (node: CalcNode): ReactNode => {
    switch (node.type) {
      case 'metric': return metricChip(node)
      case 'number': return term(<span className="px-1 text-body text-[var(--neutral-900)]">{formatDisplay(node.value, 'number')}</span>, ' ')
      case 'source': return <SourceSentence node={node} app={undefined} />
      case 'operation':
        return (
          <>
            <span className={SYMBOL} aria-hidden>(</span>
            {flatOperands(node).map(item => (
              <Fragment key={item.node.id}>
                {item.op && <span className={SYMBOL}>{OPERATOR_SYMBOLS.get(item.op)}</span>}
                {operand(item.node)}
              </Fragment>
            ))}
            <span className={SYMBOL} aria-hidden>)</span>
          </>
        )
    }
  }

  const app = library.appsOf(library.byName.get(tree.name)?.category ?? '')[0]?.name
  return (
    <div className="flex flex-wrap items-start gap-y-2" role="group" aria-label={`How ${labelOf(tree.name) ?? tree.name} is calculated`}>
      {metricChip(tree, true)}
      <span className={SYMBOL}>=</span>
      {tree.body.type === 'source'
        ? <SourceSentence node={tree.body} app={app} />
        : flatOperands(tree.body).map(item => (
          <Fragment key={item.node.id}>
            {item.op && <span className={SYMBOL}>{OPERATOR_SYMBOLS.get(item.op)}</span>}
            {operand(item.node)}
          </Fragment>
        ))}
    </div>
  )
}

/** "count of [Shopify orders] where [not cancelled] by [order date, store time]", in plain words. */
function SourceSentence({ node, app }: { node: SourceNode; app: string | undefined }) {
  const source = describeSource(node.aggregate, app)
  const chip = (text: string) => <span className={CHIP}>{text}</span>
  return (
    <>
      {source.column
        ? <><span className={WORD}>sum of</span>{chip(source.column)}<span className={WORD}>in</span>{chip(source.table)}</>
        : <><span className={WORD}>count of</span>{chip(source.table)}</>}
      {source.rule && <><span className={WORD}>where</span>{chip(source.rule)}</>}
      <span className={WORD}>by</span>
      {chip(`${source.day}, store time`)}
    </>
  )
}
