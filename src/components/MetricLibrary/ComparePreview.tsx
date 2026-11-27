'use client'

import { ArrowRight } from 'lucide-react'
import { Skeleton } from '@/components/Skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { Expression } from '@/lib/api/warehouse'
import { usersOf } from '@/lib/metrics/catalog'
import { compareNames, compareValues, impactNames, impactOf, proposedTree } from '@/lib/metrics/compare'
import { changeOf } from '@/lib/metrics/display'
import { displayOfMetric } from '@/lib/metrics/units'
import { ChangeText } from './bits'
import { CalculationTree } from './CalculationTree'
import { formatDisplay } from './format'
import { LoadFailed } from './MetricStates'
import { useTotals, withProposal, windowLabel, type Library, type WindowId, type WindowRange } from './use-library'

export interface ComparePreviewProps {
  library: Library
  /** The name the new formula is saved under: the metric's own when editing or adjusting. */
  name: string
  /** What the new one is called. */
  label: string
  /** The metric whose number today it is compared against. */
  baseName: string
  value: Expression
  windowId: WindowId
  range: WindowRange
}

/**
 * Old against new before anything is saved: the metric's number now, the number the new formula gives and the
 * change, for the window and from real measured inputs (nothing is written to the warehouse), then the custom
 * metrics that would move with it and the new formula step by step.
 */
export function ComparePreview({ library, name, label, baseName, value, windowId, range }: ComparePreviewProps) {
  const base = library.byName.get(baseName)
  const proposal = withProposal(library, { name, label, unit: base?.unit, value })
  const tree = proposedTree(name, value, library.lookup)
  // Only a change under the metric's own name moves the metrics built on it.
  const users = name === baseName ? usersOf(baseName, library.entries).map(entry => entry.name) : []
  const names = [...new Set([...compareNames(name, tree, library.known, baseName), ...impactNames(users, baseName, value, library.lookup, library.known)])]
  const totals = useTotals(library, names, range)
  const display = displayOfMetric(base?.unit, value, library.unitOf)
  const comparison = totals.current ? compareValues(name, tree, totals.current, baseName) : null
  const impact = totals.current ? impactOf(users, baseName, value, library.lookup, totals.current) : []
  const baseLabel = base?.label ?? baseName
  const editing = name === baseName
  const change = comparison ? changeOf(comparison.after, comparison.now, display) : null
  const withoutSelf = (values: ReadonlyMap<string, number | null> | undefined) => {
    if (!values) return values
    const out = new Map(values)
    out.delete(name)
    return out
  }

  if (totals.error && !totals.current) return <LoadFailed error={totals.error} action="measure" onRetry={totals.retry} />

  const cell = (title: string, figure: string | null) => (
    <div className="flex min-w-[120px] flex-col gap-1">
      <span className="text-small text-[var(--neutral-500)]">{title}</span>
      {figure === null ? <Skeleton width={110} height="28px" /> : <span className="text-heading-sm text-[var(--neutral-900)]">{figure}</span>}
    </div>
  )

  return (
    <section className="flex flex-col gap-4 rounded-xl p-4 shadow-[inset_0_0_0_1px_var(--neutral-200)]" aria-label="Before you save">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="m-0 text-body font-medium text-[var(--neutral-900)]">{editing ? 'Before you save' : `Souvenir’s ${baseLabel} beside yours`}</h3>
        <span className="text-small text-[var(--neutral-500)]">{windowLabel(windowId)}</span>
      </div>
      <div className="flex flex-wrap items-end gap-4" aria-live="polite">
        {cell(editing ? 'Now' : `Souvenir’s ${baseLabel}`, comparison ? formatDisplay(comparison.now, display) : null)}
        <ArrowRight size={18} aria-hidden className="mb-1.5 text-[var(--neutral-400)]" />
        {cell(editing ? 'With the new formula' : label, comparison ? formatDisplay(comparison.after, display) : null)}
        <div className="flex flex-col gap-1">
          <span className="text-small text-[var(--neutral-500)]">Difference</span>
          {comparison ? (change ? <ChangeText change={change} /> : <span className="text-small text-[var(--neutral-500)]">—</span>) : <Skeleton width={70} height="18px" />}
        </div>
      </div>

      {impact.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="m-0 text-body-sm font-medium text-[var(--neutral-800)]">Also moves</h4>
          <Table aria-label="Metrics that also move">
            <TableHeader>
              <TableRow><TableHead>Metric</TableHead><TableHead align="end">Now</TableHead><TableHead align="end">After</TableHead><TableHead align="end">Change</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {impact.map(row => {
                const unit = displayOfMetric(library.unitOf(row.name), library.lookup(row.name) ?? null, library.unitOf)
                return (
                  <TableRow key={row.name}>
                    <TableCell>{library.labelOf(row.name) ?? row.name}</TableCell>
                    <TableCell align="end">{formatDisplay(row.now, unit)}</TableCell>
                    <TableCell align="end">{formatDisplay(row.after, unit)}</TableCell>
                    <TableCell align="end"><ChangeText change={changeOf(row.after, row.now, unit)} /></TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h4 className="m-0 text-body-sm font-medium text-[var(--neutral-800)]">How {editing ? 'the new formula' : 'yours'} is calculated</h4>
        <CalculationTree
          tree={tree}
          library={proposal}
          current={withoutSelf(totals.current)}
          previous={withoutSelf(totals.previous)}
          unavailable={totals.unavailable}
          openDepth={3}
        />
      </div>
    </section>
  )
}
