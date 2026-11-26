'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Skeleton } from '@/components/Skeleton'
import type { MetricExpression, MetricTerm } from '@/lib/api/warehouse'
import { changeOf, describeSource, formatDisplay, OPERATOR_SYMBOLS } from '@/lib/metrics/display'
import { printFormula } from '@/lib/metrics/formula'
import {
  displayOfMetric, displayOfNode, evaluate, fillMissingTotals, flatOperands,
  type CalcNode, type DisplayUnit, type FormulaLookup, type MeasuredValues, type MetricNode, type Operator,
  type OperationNode, type SourceNode, type UnitLookup,
} from '@/lib/metrics/tree'
import { dashboardMetricRoute } from '@/lib/routes'
import { ChangeText, KindTag } from './bits'
import styles from './MetricLibrary.module.css'

export interface CalculationTreeProps {
  tree: MetricNode
  lookup: FormulaLookup
  unitOf: UnitLookup
  labelOf: (name: string) => string | undefined
  /** Totals for the window, keyed by metric name; undefined while loading. */
  current: MeasuredValues | undefined
  previous: MeasuredValues | undefined
  /** Metric name → why the store can't measure it. */
  unavailable: Readonly<Record<string, string>>
  /** Names that have their own page (in the catalog). */
  linkable: ReadonlySet<string>
  /** The area's apps, for a root's source line: "Shopify". */
  sourceOf?: (name: string) => string | undefined
  /** The root's own display, when the caller knows better (catalog unit). */
  rootDisplay?: DisplayUnit
  /** Levels open at first; deeper metrics open on click. */
  openDepth?: number
  /** Whether a name is one of the organization's custom metrics. */
  isCustom?: (name: string) => boolean
  /** Totals that read "no rows" as 0 (see `fillMissingTotals`); those lines say so. */
  fill?: (name: string) => boolean
  /** Words for the comparison in screen-reader text: "previous 30 days". */
  against?: string
}

interface TreeContext extends CalculationTreeProps {
  /** Names whose missing total was read as 0 in the current window. */
  filled: ReadonlySet<string>
}

/**
 * "How it's calculated": the metric at the top, what it's made of below, each line with its number for the
 * window and its move against the one before. Lines read top to bottom the way the formula does: Revenue, then
 * ÷ Ad spend. Chains of the same sign read as one list: Gross sales, − Discounts, − Refunds.
 */
export function CalculationTree(props: CalculationTreeProps) {
  const fill = props.fill ?? (() => false)
  const current = props.current === undefined ? undefined : fillMissingTotals(props.current, fill)
  const previous = props.previous === undefined ? undefined : fillMissingTotals(props.previous, fill).values
  const context: TreeContext = { ...props, current: current?.values, previous, filled: current?.filled ?? new Set() }
  return (
    <ul className={styles.tree} aria-label="How it's calculated">
      <TreeNode context={context} node={props.tree} depth={0} op={null} />
    </ul>
  )
}

interface TreeNodeProps {
  context: TreeContext
  node: CalcNode
  depth: number
  /** The operator in front of this line, for every operand after the first. */
  op: Operator | null
}

const OPERATOR_WORDS: Record<Operator, string> = { add: 'plus', subtract: 'minus', multiply: 'times', ratio: 'divided by' }

function nodeLabel(node: CalcNode, labelOf: (name: string) => string | undefined): string {
  switch (node.type) {
    case 'metric': return labelOf(node.name) ?? node.name
    case 'number': return new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 }).format(node.value)
    case 'source': return describeSource(node.aggregate).sentence
    case 'operation': return printFormula(expressionOf(node), { pretty: true, labelOf })
  }
}

function displayOf(node: CalcNode, unitOf: UnitLookup, lookup: FormulaLookup): DisplayUnit {
  if (node.type === 'metric') return displayOfMetric(node.name, unitOf(node.name), lookup(node.name) ?? null, unitOf)
  return displayOfNode(node, unitOf, lookup)
}

function TreeNode({ context, node, depth, op }: TreeNodeProps) {
  const { labelOf, current, previous, unavailable, linkable, lookup, unitOf, filled } = context
  const [open, setOpen] = useState(depth < (context.openDepth ?? 2))

  if (node.type === 'source') {
    return <li className={styles.treeNode}><SourceBlock node={node} app={undefined} /></li>
  }

  const isRoot = depth === 0
  const display = isRoot && context.rootDisplay ? context.rootDisplay : displayOf(node, unitOf, lookup)
  const missing = node.type === 'metric' ? unavailable[node.name] : undefined
  const value = current === undefined ? undefined : evaluate(node, current)
  const before = previous === undefined ? null : evaluate(node, previous)
  const change = value === undefined ? null : changeOf(value, before, display)
  const operation = node.type === 'metric' && node.body?.type === 'operation' ? node.body : node.type === 'operation' ? node : null
  const source = node.type === 'metric' && node.body?.type === 'source' ? node.body : null
  const label = nodeLabel(node, labelOf)
  const canLink = node.type === 'metric' && !isRoot && linkable.has(node.name)
  const zeroed = node.type === 'metric' && filled.has(node.name)
  // A ratio over nothing has no answer: say which side is empty rather than leave a bare dash.
  const emptyDenominator = operation?.op === 'ratio' && current !== undefined && evaluate(operation.children[1], current) === 0
    ? nodeLabel(operation.children[1], labelOf)
    : null

  return (
    <li className={`${styles.treeNode}${isRoot ? ` ${styles.treeRoot}` : ''}`} data-muted={missing !== undefined ? '' : undefined}>
      <div className={styles.treeRow}>
        <span className={styles.treeOp} aria-hidden>{op ? OPERATOR_SYMBOLS[op] : ''}</span>

        <div className={styles.treeMain}>
          <div className={styles.treeTitle}>
            {op && <span className="sr-only">{OPERATOR_WORDS[op]}</span>}
            {operation && !isRoot && (
              <button type="button" className={styles.treeToggle} aria-expanded={open} aria-label={`${open ? 'Hide' : 'Show'} what ${label} is made of`} onClick={() => setOpen(!open)}>
                <ChevronRight size={14} strokeWidth={1.75} aria-hidden />
              </button>
            )}
            <span className={styles.treeLabel}>
              {canLink ? <Link className={styles.treeLink} href={dashboardMetricRoute(node.name)}>{label}</Link> : label}
            </span>
            {node.type === 'metric' && !isRoot && <KindTag kind={node.kind} />}
          </div>
          {operation && node.type === 'metric' && (
            <span className={styles.treeFormula}>= {printFormula(expressionOf(operation), { pretty: true, labelOf })}</span>
          )}
          {node.type === 'metric' && <StopNote node={node} linkable={linkable.has(node.name)} />}
          {zeroed && <span className={styles.treeNote}>No rows in this period, so 0</span>}
          {emptyDenominator !== null && <span className={styles.treeNote}>{emptyDenominator} is 0 in this period, so there&apos;s no ratio yet</span>}
          {missing !== undefined && <span className={styles.treeNote}>Can&apos;t measure: {missing}</span>}
          {source && <SourceBlock node={source} app={context.sourceOf?.(node.type === 'metric' ? node.name : '')} />}
        </div>

        <div className={styles.treeValue}>
          {node.type === 'number'
            ? null
            : value === undefined
              ? <Skeleton width={64} height="18px" />
              : (
                <>
                  <strong>{formatDisplay(value, display)}</strong>
                  <ChangeText change={change} />
                </>
              )}
        </div>
      </div>

      {operation && (open || isRoot) && (
        <ul className={styles.treeChildren}>
          {flatOperands(operation).map(item => (
            <TreeNode key={item.node.id} context={context} node={item.node} depth={depth + 1} op={item.op} />
          ))}
        </ul>
      )}
    </li>
  )
}

function StopNote({ node, linkable }: { node: MetricNode; linkable: boolean }) {
  switch (node.stop) {
    case 'unknown':
      // The root's own "formula not known" is explained above the tree, not on its line.
      return null
    case 'repeat':
      return <span className={styles.treeNote}>Shown above</span>
    case 'cycle':
      return <span className={styles.treeNote}>Uses itself</span>
    case 'depth':
      return <span className={styles.treeNote}>{linkable ? 'Open it to see further down' : 'Goes deeper'}</span>
    default:
      return null
  }
}

function SourceBlock({ node, app }: { node: SourceNode; app: string | undefined }) {
  const source = describeSource(node.aggregate, app)
  return (
    <div className={styles.source}>
      <div className={styles.sourceLine}><span>Reads</span><span>{source.headline}</span></div>
      <div className={styles.sourceLine}><span>Counted on</span><span>{source.day}, in the store&apos;s time zone</span></div>
      <div className={styles.sourceLine}>
        <span>Only rows</span>
        {/* A filter we can't put in words shows the condition itself here, in the detailed steps only. */}
        <span>{source.rule === null ? 'Every row counts' : source.rule === 'filtered' ? <code className={styles.code}>{source.ruleRaw}</code> : source.rule}</span>
      </div>
    </div>
  )
}

/** The expression an operation node stands for, to print it. */
function expressionOf(node: OperationNode): MetricExpression {
  const terms = node.children.map(termOf)
  switch (node.op) {
    case 'add': return { op: 'add', terms }
    case 'multiply': return { op: 'multiply', terms }
    case 'subtract': return { op: 'subtract', left: terms[0], right: terms[1] }
    case 'ratio': return { op: 'ratio', numerator: terms[0], denominator: terms[1] }
  }
}

function termOf(node: CalcNode): MetricTerm {
  switch (node.type) {
    case 'number': return node.value
    case 'metric': return node.name
    case 'operation': return expressionOf(node)
    case 'source': return node.aggregate as unknown as MetricExpression
  }
}
