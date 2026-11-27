'use client'

import { useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { Skeleton } from '@/components/Skeleton'
import { IconButton } from '@/components/ui/button'
import { TextLink } from '@/components/ui/link'
import { changeOf, describeSource, OPERATOR_SYMBOLS, OPERATOR_WORDS } from '@/lib/metrics/display'
import { printFormula } from '@/lib/metrics/formula'
import { evaluate, expressionOf, flatOperands, type CalcNode, type MeasuredValues, type MetricNode, type Operator, type SourceNode } from '@/lib/metrics/tree'
import { displayOfNode } from '@/lib/metrics/units'
import { DASHBOARD_METRIC_ROUTE } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { ChangeText, KindTag } from './bits'
import { formatDisplay } from './format'
import type { Library } from './use-library'

export interface CalculationTreeProps {
  tree: MetricNode
  library: Library
  /** Totals for the window, by metric name; undefined while loading. */
  current: MeasuredValues | undefined
  previous: MeasuredValues | undefined
  /** Metric name → why the store can't measure it. */
  unavailable: ReadonlyMap<string, string>
  /** Levels open at first; deeper metrics open on click. */
  openDepth?: number
}

/**
 * "How it's calculated", step by step: the metric at the top, what it's made of below, each line with its number
 * for the window and its move against the one before. Lines read the way the formula does: Revenue, then ÷ Ad
 * spend. Chains of the same sign read as one list: Gross sales, − Discounts, − Refunds.
 */
export function CalculationTree(props: CalculationTreeProps) {
  return (
    <ul className="m-0 flex list-none flex-col p-0" aria-label="How it's calculated, step by step">
      <TreeNode {...props} node={props.tree} depth={0} op={null} />
    </ul>
  )
}

function nodeLabel(node: CalcNode, library: Library): string {
  switch (node.type) {
    case 'metric': return library.labelOf(node.name) ?? node.name
    case 'number': return formatDisplay(node.value, 'number')
    case 'source': return describeSource(node.aggregate).sentence
    case 'operation': return printFormula(expressionOf(node), { pretty: true, labelOf: library.labelOf })
  }
}

const STOP_NOTES: ReadonlyMap<string, string> = new Map([
  ['repeat', 'Shown above'], ['cycle', 'Uses itself'], ['depth', 'Open it to see further down'], ['large', 'Too big to show here'],
])

function TreeNode({ node, depth, op, ...props }: CalculationTreeProps & { node: CalcNode; depth: number; op: Operator | null }) {
  const { library, current, previous, unavailable } = props
  const [open, setOpen] = useState(depth < (props.openDepth ?? 2))

  if (node.type === 'source') return <li className="py-1"><SourceBlock node={node} app={undefined} /></li>

  const isRoot = depth === 0
  const display = displayOfNode(node, library.unitOf, library.lookup)
  const missing = node.type === 'metric' ? unavailable.get(node.name) : undefined
  const value = current === undefined ? undefined : evaluate(node, current)
  const before = previous === undefined ? null : evaluate(node, previous)
  const operation = node.type === 'metric' && node.body?.type === 'operation' ? node.body : node.type === 'operation' ? node : null
  const source = node.type === 'metric' && node.body?.type === 'source' ? node.body : null
  const label = nodeLabel(node, library)
  const canLink = node.type === 'metric' && !isRoot && library.known.has(node.name)
  // A ratio over nothing has no answer: say which side is empty rather than leave a bare dash.
  const emptyDenominator = operation?.op === 'ratio' && current !== undefined && evaluate(operation.children[1], current) === 0
    ? nodeLabel(operation.children[1], library)
    : null
  const stop = node.type === 'metric' && node.stop ? STOP_NOTES.get(node.stop) : undefined
  const appName = node.type === 'metric' ? library.appsOf(library.byName.get(node.name)?.category ?? '')[0]?.name : undefined

  return (
    <li className={cn('flex flex-col', !isRoot && 'border-0 border-l border-solid border-[var(--neutral-200)] pl-4')} data-muted={missing !== undefined ? '' : undefined}>
      <div className="flex items-start gap-2 py-1.5">
        <span className="w-4 shrink-0 text-center text-body text-[var(--neutral-500)]" aria-hidden>{op ? OPERATOR_SYMBOLS.get(op) : ''}</span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {op && <span className="sr-only">{OPERATOR_WORDS.get(op)}</span>}
            {operation && !isRoot && (
              <IconButton
                variant="ghost"
                size="xs"
                aria-expanded={open}
                aria-label={`${open ? 'Hide' : 'Show'} what ${label} is made of`}
                icon={<ChevronRight size={14} aria-hidden className={cn('transition-transform duration-fast', open && 'rotate-90')} />}
                onClick={() => setOpen(!open)}
              />
            )}
            <span className={cn('text-body', isRoot ? 'font-medium text-[var(--neutral-900)]' : 'text-[var(--neutral-800)]')}>
              {canLink ? <TextLink href={DASHBOARD_METRIC_ROUTE(node.name)}>{label}</TextLink> : label}
            </span>
            {node.type === 'metric' && !isRoot && <KindTag kind={node.kind} />}
          </div>
          {operation && node.type === 'metric' && (
            <span className="text-small text-[var(--neutral-500)]">= {printFormula(expressionOf(operation), { pretty: true, labelOf: library.labelOf })}</span>
          )}
          {stop && <span className="text-small text-[var(--neutral-500)]">{stop}</span>}
          {emptyDenominator !== null && <span className="text-small text-[var(--neutral-500)]">{emptyDenominator} is 0 in this period, so there’s no ratio yet</span>}
          {missing !== undefined && <span className="text-small text-[var(--neutral-500)]">Can’t measure: {missing}</span>}
          {source && <SourceBlock node={source} app={appName} />}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          {node.type === 'number' ? null : value === undefined
            ? <Skeleton width={64} height="18px" />
            : (
              <>
                <strong className="text-body font-medium text-[var(--neutral-900)]">{formatDisplay(value, display)}</strong>
                <ChangeText change={changeOf(value, before, display)} />
              </>
            )}
        </div>
      </div>
      {operation && (open || isRoot) && (
        <ul className="m-0 flex list-none flex-col p-0 pl-2">
          {flatOperands(operation).map(item => (
            <TreeNode key={item.node.id} {...props} node={item.node} depth={depth + 1} op={item.op} />
          ))}
        </ul>
      )}
    </li>
  )
}

function SourceBlock({ node, app }: { node: SourceNode; app: string | undefined }) {
  const source = describeSource(node.aggregate, app)
  const line = (term: string, text: ReactNode) => (
    <div className="flex gap-2 text-small"><dt className="w-20 shrink-0 text-[var(--neutral-500)]">{term}</dt><dd className="m-0 text-[var(--neutral-800)]">{text}</dd></div>
  )
  return (
    <dl className="m-0 mt-1 flex flex-col gap-0.5 rounded-md bg-[var(--neutral-50)] p-2">
      {line('Reads', source.headline)}
      {line('Counted on', `${source.day}, in the store’s time zone`)}
      {line('Only rows', source.rule === null ? 'Every row counts' : source.rule === 'filtered' ? <code className="text-code [font-family:var(--font-code)]">{source.ruleRaw}</code> : source.rule)}
    </dl>
  )
}
