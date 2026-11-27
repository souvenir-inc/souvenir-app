'use client'

import { useQuery } from '@tanstack/react-query'
import { useOrgIdentity } from '@/context/org-context'
import type { MetricEntry, Unit, Warehouse } from '@/lib/api/warehouse'
import type { App } from '@/lib/metrics/library-table'
import { metricQueries } from '@/lib/metrics/metric-queries'
import { catalogLookup, valuesFrom, withFormula, type MeasuredValues, type MetricValue } from '@/lib/metrics/tree'
import { orgScope } from '@/lib/query-keys'
import { comparedWindow, isoDate, periodWindow, PERIODS, wallClock } from '@/components/Dashboard/period'
import { useCatalog } from '@/components/Dashboard/live/dashboard-data'
import { Apps } from '@/components/Dashboard/live/apps'
import { unavailableCopy } from '@/components/Dashboard/live/metrics'

// The library's view of one warehouse: its catalog (the dashboard's own query, so they share a cache) and what
// the screens derive from it. Lives with the feature's components because it reads the dashboard's hooks
// (SD-AR-06: hooks never import components).

const NO_ENTRIES: MetricEntry[] = []

export function useLibrary(warehouse: Warehouse) {
  const { orgId } = useOrgIdentity()
  const catalog = useCatalog(warehouse)
  const entries = catalog.data ?? NO_ENTRIES
  const byName = new Map(entries.map(entry => [entry.name, entry]))
  const apps = new Apps(warehouse.connections)
  return {
    warehouse,
    org: orgScope(orgId),
    catalog,
    entries,
    byName,
    known: new Set(byName.keys()) as ReadonlySet<string>,
    lookup: catalogLookup(entries),
    unitOf: (name: string) => byName.get(name)?.unit,
    labelOf: (name: string) => byName.get(name)?.label,
    /** The connected apps that fill an area, for a row's app column and a source line. */
    appsOf: (category: string): App[] => apps.feeding(category).flatMap(id => {
      const app = apps.get(id)
      return app ? [{ slug: app.slug, name: app.name }] : []
    }),
    /** The areas any connected app fills. */
    areas: new Set(warehouse.connections.flatMap(c => c.feeds.filter(f => f.status !== 'not_applicable').map(f => f.category))) as ReadonlySet<string>,
  }
}

export type Library = ReturnType<typeof useLibrary>

/**
 * The library as it would be with one more (or one changed) metric, before it is saved: its formula, unit and
 * label answer for its name. Its name is not `known`, so it is never measured or linked as itself.
 */
export function withProposal(library: Library, metric: { name: string; label: string; unit?: Unit; value: MetricValue }): Library {
  const known = new Set(library.known)
  known.delete(metric.name)
  return {
    ...library,
    known,
    lookup: withFormula(library.lookup, metric.name, metric.value),
    unitOf: name => (name === metric.name ? metric.unit : library.unitOf(name)),
    labelOf: name => (name === metric.name ? metric.label : library.labelOf(name)),
  }
}

export type WindowId = '7d' | '30d' | '90d'
export const WINDOW_IDS: readonly WindowId[] = ['7d', '30d', '90d']

export function windowLabel(id: WindowId): string {
  return PERIODS.find(period => period.id === id)?.label ?? id
}

const WINDOW_DAYS: ReadonlyMap<WindowId, number> = new Map([['7d', 7], ['30d', 30], ['90d', 90]])

/** What a window is compared with: "previous 30 days". */
export function againstOf(id: WindowId): string {
  return `previous ${WINDOW_DAYS.get(id) ?? 30} days`
}

/** A window's days on the store's clock, and the same number of days before it, as the warehouse takes them. */
export function windowRange(id: WindowId, timeZone: string) {
  const now = periodWindow(id, wallClock(timeZone))
  const before = comparedWindow(now, 'previous') ?? now
  return { start: isoDate(now.from), end: isoDate(now.to), previousStart: isoDate(before.from), previousEnd: isoDate(before.to) }
}

export type WindowRange = ReturnType<typeof windowRange>

export interface Totals {
  current: MeasuredValues | undefined
  previous: MeasuredValues | undefined
  /** Metric name → why the store can't measure it, in app copy (a phrase: "no connected app records it"). */
  unavailable: ReadonlyMap<string, string>
  loading: boolean
  error: unknown
  retry: () => void
}

/** Totals for some metrics over a window and the window before: two requests, whatever the number of metrics. */
export function useTotals(library: Library, names: readonly string[], range: WindowRange, enabled = true): Totals {
  const metrics = names.filter(name => library.known.has(name))
  const on = enabled && metrics.length > 0
  const now = useQuery({ ...metricQueries.measure(library.org, library.warehouse, { metrics, start: range.start, end: range.end, grain: 'total' }), enabled: on })
  const before = useQuery({ ...metricQueries.measure(library.org, library.warehouse, { metrics, start: range.previousStart, end: range.previousEnd, grain: 'total' }), enabled: on })
  // App copy by code; the warehouse's free-text `reason` never reaches the screen (API-ER-06, CORE-B-08).
  const unavailable = new Map(Object.entries(now.data?.unavailable ?? {}).map(([name, why]) => [name, unavailableCopy(why)]))
  return {
    current: now.data ? valuesFrom(now.data.periods[0]?.values) : undefined,
    previous: before.data ? valuesFrom(before.data.periods[0]?.values) : undefined,
    unavailable,
    loading: on && (now.isPending || before.isPending) && !now.isError && !before.isError,
    error: now.error ?? before.error,
    retry: () => { void now.refetch(); void before.refetch() },
  }
}
