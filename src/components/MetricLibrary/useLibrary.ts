'use client'

import { useMemo } from 'react'
import type { Measurement, MetricEntry } from '@/lib/api/warehouse'
import { dataUntilOf, groupByUntil, neverSynced, unitLookup, zeroFillRule, type UntilGroup } from '@/lib/metrics/library'
import { appsFor } from '@/lib/metrics/display'
import { formulaLookup, liveFormulas } from '@/lib/metrics/registry'
import { useSavedFormulas } from '@/lib/metrics/use-saved-formulas'
import { spanOf, type PeriodChoice } from '@/lib/metrics/windows'
import { useMeasurement, useMetricCatalog, useWorkspace } from '@/lib/warehouse/queries'

const NO_ENTRIES: MetricEntry[] = []

/** The workspace, its catalog and every formula we know, shared by the list, the metric page and the create flow. */
export function useLibrary() {
  const workspace = useWorkspace()
  const catalog = useMetricCatalog(workspace.data !== undefined)
  const saved = useSavedFormulas(workspace.data?.id)
  const entries = catalog.data ?? NO_ENTRIES

  const registry = useMemo(() => liveFormulas(saved, entries), [saved, entries])
  const lookup = useMemo(() => formulaLookup(entries, registry), [entries, registry])
  const unitOf = useMemo(() => unitLookup(entries), [entries])
  const byName = useMemo(() => new Map(entries.map(entry => [entry.name, entry])), [entries])
  const known = useMemo(() => new Set(entries.map(entry => entry.name)), [entries])
  const labelOf = useMemo(() => (name: string) => byName.get(name)?.label, [byName])
  const categoryOf = useMemo(() => (name: string) => byName.get(name)?.category, [byName])
  const data = workspace.data
  /** The last day these metrics (pass a whole tree's names) have data for; null when nothing cuts. */
  const untilOf = useMemo(() => (names: readonly string[]) => dataUntilOf(names, categoryOf, data), [categoryOf, data])
  /** These metrics (pass a whole tree's names) read a source that has never synced: no data yet. */
  const neverSyncedOf = useMemo(() => (names: readonly string[]) => neverSynced(names, categoryOf, data), [categoryOf, data])

  /** Built-in totals whose "no rows" reads as 0 for a period ending by their last sync (S15 fallback). */
  const fill = useMemo(() => zeroFillRule(entries, data), [entries, data])
  const isCustom = useMemo(() => (name: string) => byName.get(name)?.category === 'custom', [byName])
  const connectors = data?.connectors
  const appsOf = useMemo(() => (name: string) => appsFor(byName.get(name)?.category ?? '', connectors ?? []).join(', ') || undefined, [byName, connectors])

  return { workspace, catalog, entries, registry, lookup, unitOf, byName, known, labelOf, untilOf, neverSyncedOf, fill, isCustom, appsOf }
}

/**
 * Totals for some metrics over the dashboard period and the period before it: two requests, whatever the number
 * of metrics. `until` pulls a rolling period back to the day the data stops (see `periodWindow`). The keys only
 * depend on the names and dates, so the list, the page and the tree share the cache.
 */
export function useWindowTotals(names: string[], period: PeriodChoice, timeZone: string | undefined, enabled = true, until: string | null = null) {
  const sorted = useMemo(() => [...new Set(names)].sort(), [names])
  const span = spanOf(period, timeZone, until)
  const on = enabled && timeZone !== undefined && sorted.length > 0
  const now = useMeasurement({ metrics: sorted, start: span.start, end: span.end, grain: 'total' }, on)
  const before = useMeasurement({ metrics: sorted, start: span.previousStart, end: span.previousEnd, grain: 'total' }, on)
  return { current: now, previous: before, span }
}

/** Most workspaces have two or three distinct "data until" days (a stale store, fresh ads); more fold together. */
const MAX_GROUPS = 3

const EMPTY: string[] = []

function merged(parts: Array<Measurement | undefined>, groups: UntilGroup[], partial: boolean): Measurement | undefined {
  const used = parts.filter((part, index): part is Measurement => part !== undefined && groups[index] !== undefined)
  // Wait for every group, unless one failed: then show what came back rather than nothing.
  if (used.length === 0 || (used.length < groups.length && !partial)) return undefined
  return {
    ...used[0],
    periods: [{ start: used[0].periods[0]?.start ?? '', values: Object.assign({}, ...used.map(part => part.periods[0]?.values ?? {})) }],
    unavailable: Object.assign({}, ...used.map(part => part.unavailable)),
  }
}

/**
 * Window totals for a long list of metrics whose data stops on different days (the library list): one request
 * pair per "data until" day, each window ending on its own day, merged back into one measurement.
 */
export function useGroupedTotals(names: string[], period: PeriodChoice, timeZone: string | undefined, untilOf: (name: string) => string | null) {
  const groups = useMemo(() => groupByUntil(names, untilOf, MAX_GROUPS), [names, untilOf])
  const a = useWindowTotals(groups[0]?.names ?? EMPTY, period, timeZone, groups.length > 0, groups[0]?.until ?? null)
  const b = useWindowTotals(groups[1]?.names ?? EMPTY, period, timeZone, groups.length > 1, groups[1]?.until ?? null)
  const c = useWindowTotals(groups[2]?.names ?? EMPTY, period, timeZone, groups.length > 2, groups[2]?.until ?? null)
  const all = [a, b, c]
  const failed = all.some((t, index) => index < groups.length && t.current.isError)
  const current = merged(all.map(t => t.current.data), groups, failed)
  const previous = merged(all.map(t => t.previous.data), groups, failed)
  const untilByName = new Map(groups.flatMap(group => group.names.map(name => [name, group.until] as const)))
  const spanByName = new Map(groups.flatMap((group, index) => group.names.map(name => [name, all[index].span] as const)))
  return {
    current,
    previous,
    loading: current === undefined && !failed,
    isError: failed,
    refetch: () => all.forEach(t => { void t.current.refetch(); void t.previous.refetch() }),
    /** The day a metric's data stops, when it stops before today. */
    untilOf: (name: string) => untilByName.get(name) ?? null,
    /** The last day of the period a metric's number covers. */
    endOf: (name: string) => spanByName.get(name)?.end,
    /** The days a metric's number covers ({ start, end }, ended where its data stops), for its health. */
    windowOf: (name: string) => {
      const span = spanByName.get(name) ?? all[0].span
      return { start: span.start, end: span.end }
    },
  }
}
