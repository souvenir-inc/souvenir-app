'use client'

import { Skeleton } from '@/components/Skeleton'
import { TextLink } from '@/components/ui/link'
import type { MetricEntry } from '@/lib/api/warehouse'
import { changeOf, type Change } from '@/lib/metrics/display'
import { inputsFor, MAX_CANDIDATES, pickAvailable } from '@/lib/metrics/inputs'
import { isMetricValue, referencesOf } from '@/lib/metrics/tree'
import { displayOfMetric } from '@/lib/metrics/units'
import { DASHBOARD_METRIC_ROUTE } from '@/lib/routes'
import { ChangeText } from './bits'
import { formatDisplay } from './format'
import { LoadFailed } from './MetricStates'
import { useTotals, type Library, type WindowRange } from './use-library'

/** Biggest move first, so the input that moved most leads; ones with no comparison go last. */
function size(change: Change | null): number {
  if (change === null || change.direction === 'flat') return -1
  return change.magnitude
}

/**
 * What moved it (the test app's diagnose view, here on the metric page): the metric's inputs for the window
 * against the window before, biggest move first, so you can see which one moved. Its own formula's metrics come
 * first; a library metric counted from a table uses the numbers that usually move it.
 */
export function WhatMovedIt({ library, entry, range, against }: { library: Library; entry: MetricEntry; range: WindowRange; against: string }) {
  const candidates = inputsFor(entry.name, {
    formulaInputs: isMetricValue(entry.value) ? referencesOf(entry.value) : [],
    catalog: library.byName,
    areas: library.areas,
    max: MAX_CANDIDATES,
  })
  const totals = useTotals(library, candidates, range)

  if (candidates.length === 0) return <p className="m-0 text-body-sm text-[var(--neutral-600)]">Nothing else this store measures feeds {entry.label} yet.</p>
  if (totals.error && !totals.current) return <LoadFailed error={totals.error} action="measure" onRetry={totals.retry} />
  if (!totals.current) return <div role="status" aria-label="Loading what moved it" className="grid grid-cols-2 gap-3 md:grid-cols-4">{[0, 1, 2, 3].map(i => <Skeleton key={i} height="72px" radius="12px" />)}</div>

  const current = totals.current
  const inputs = pickAvailable(candidates, new Set(totals.unavailable.keys())).map(name => {
    const display = displayOfMetric(library.unitOf(name), library.lookup(name) ?? null, library.unitOf)
    const now = current.get(name) ?? null
    return { name, display, now, change: changeOf(now, totals.previous?.get(name), display) }
  }).sort((a, b) => size(b.change) - size(a.change))

  if (inputs.length === 0) return <p className="m-0 text-body-sm text-[var(--neutral-600)]">This store can’t measure what feeds {entry.label} yet.</p>

  return (
    <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-4" aria-label={`What moved ${entry.label}`}>
      {inputs.map(input => (
        <li key={input.name} className="flex flex-col gap-1 rounded-xl p-3 shadow-[inset_0_0_0_1px_var(--neutral-200)]">
          <TextLink href={DASHBOARD_METRIC_ROUTE(input.name)} variant="subtle" className="text-small">{library.labelOf(input.name) ?? input.name}</TextLink>
          <span className="text-heading-sm text-[var(--neutral-900)]">{formatDisplay(input.now, input.display)}</span>
          <ChangeText change={input.change} against={against} />
        </li>
      ))}
    </ul>
  )
}
