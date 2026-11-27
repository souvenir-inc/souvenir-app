'use client'

import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/Skeleton'
import { listNames } from '@/components/Dashboard/format'
import { buildTree, namesIn, sizeOf, type MetricNode } from '@/lib/metrics/tree'
import { cn } from '@/lib/utils'
import { CalculationTree } from './CalculationTree'
import { FormulaEquation } from './FormulaEquation'
import { LoadFailed } from './MetricStates'
import { useTotals, type Library, type WindowRange } from './use-library'

const NOTHING: ReadonlyMap<string, number | null> = new Map()

export interface MetricCalculationProps {
  library: Library
  /** The metric's catalog name. */
  name: string
  range: WindowRange
  /** A tree to show instead of the metric's own (a proposal before it's saved). */
  tree?: MetricNode
}

/**
 * "How it's calculated" for one metric: the formula as one readable line of chips with the window's numbers, and
 * every step one click down. Two requests fill it, one for the window and one for the window before.
 */
export function MetricCalculation({ library, name, range, tree: given }: MetricCalculationProps) {
  const [steps, setSteps] = useState(false)
  const tree = given ?? buildTree(name, library.lookup)
  const names = namesIn(tree, library.known)
  const totals = useTotals(library, names, range, tree.body !== null)
  // Nothing to measure (a formula of numbers and unknown names): every line is worked out or missing, never loading.
  const current = names.length === 0 ? NOTHING : totals.current
  const previous = names.length === 0 ? NOTHING : totals.previous
  const failed = Boolean(totals.error) && current === undefined

  if (tree.body === null) {
    if (tree.stop === 'large') return <p className="m-0 text-body-sm text-[var(--neutral-600)]">This formula is too big to draw here.</p>
    const apps = library.appsOf(library.byName.get(name)?.category ?? '').map(app => app.name)
    return apps.length > 0 ? <p className="m-0 text-body-sm text-[var(--neutral-600)]">Counted from {listNames(apps)} data.</p> : null
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl bg-[var(--neutral-50)] p-4 shadow-[inset_0_0_0_1px_var(--neutral-200)]">
        {failed
          ? <LoadFailed error={totals.error} action="measure" onRetry={totals.retry} />
          : <FormulaEquation tree={tree} library={library} values={current} />}
      </div>
      {tree.body.type === 'operation' && !failed && (
        <>
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            aria-expanded={steps}
            leftIcon={<ChevronRight size={14} aria-hidden className={cn('transition-transform duration-fast', steps && 'rotate-90')} />}
            onClick={() => setSteps(!steps)}
          >
            {steps ? 'Hide the steps' : sizeOf(tree) > 4 ? 'Show every step' : 'Show where each number comes from'}
          </Button>
          {steps && (
            current === undefined
              ? <Skeleton height="96px" radius="12px" />
              : <CalculationTree tree={tree} library={library} current={current} previous={previous} unavailable={totals.unavailable} openDepth={3} />
          )}
        </>
      )}
    </div>
  )
}
