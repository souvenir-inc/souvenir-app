'use client'

import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useOrgIdentity } from '@/context/org-context'
import { Warehouse, type MeasureRequest, type Measurement } from '@/lib/api/warehouse'
import { onAnyLinkResult } from '@/lib/connectorProvider'
import { orgScope, queryKeys } from '@/lib/query-keys'
import { chartWindow, comparedWindow, isoDate, periodWindow, wallClock, type Window } from '../period'
import { bindSync, setStatus, useSyncState } from '../sync/sync-store'
import { Apps } from './apps'
import { Metrics, weeksWindow } from './metrics'

const MINUTE = 60_000
const SYNCING_POLL_MS = 5_000

/** The open warehouse, its apps and its metrics as the open board's dates read them. */
export class DashboardData {
  /** `today`: the store's day (wallClock), for windows, exports and the date picker. */
  constructor(readonly warehouse: Warehouse, readonly apps: Apps, readonly metrics: Metrics, readonly today: Date) {}

  private namesCache: Set<string> | undefined
  /** Metric names this warehouse can put on a board (worked out once per data). */
  get names(): Set<string> {
    return (this.namesCache ??= new Set(this.metrics.all.map((m) => m.id)))
  }
}

const DataContext = createContext<DashboardData | null>(null)

export const DashboardDataProvider = DataContext.Provider

export function useDashboardData(): DashboardData {
  const data = useContext(DataContext)
  if (!data) throw new Error('useDashboardData needs a DashboardDataProvider')
  return data
}

/** The organization's warehouses; the dashboard shows the first. */
export function useWarehouses() {
  const { orgId, orgIdReady } = useOrgIdentity()
  return useQuery({
    queryKey: queryKeys.warehouse.list(orgScope(orgId)),
    queryFn: ({ signal }) => Warehouse.list(signal),
    enabled: orgIdReady,
    staleTime: MINUTE,
  })
}

/** The warehouse's metric catalog; the one query both the screen and the open board read. */
export function useCatalog(warehouse: Warehouse) {
  const { orgId } = useOrgIdentity()
  return useQuery({
    queryKey: queryKeys.warehouse.catalog(orgScope(orgId), warehouse.id),
    queryFn: ({ signal }) => warehouse.metrics(signal),
    staleTime: 5 * MINUTE,
  })
}

/** Today on the store's clock, moved on at the store's midnight so a board left open overnight reads the new day. */
function useToday(timeZone: string): Date {
  const [today, setToday] = useState(() => wallClock(timeZone))
  useEffect(() => {
    // How long until the store's next midnight, on its own clock (plus a second to be past it).
    const next = new Date(today)
    next.setHours(24, 0, 1, 0)
    const timer = setTimeout(() => setToday(wallClock(timeZone)), next.getTime() - wallClock(timeZone).getTime())
    return () => clearTimeout(timer)
  }, [today, timeZone])
  return today
}

/** The board on screen: its dates, and the metrics its cards read. */
export interface OpenBoard {
  id: string
  period: string
  compare: string
  metricIds: string[]
}

const request = (metrics: string[], w: Window, grain: MeasureRequest['grain']): MeasureRequest =>
  ({ metrics, start: isoDate(w.from), end: isoDate(w.to), grain })

/**
 * Everything the board on screen reads: the catalog and scorecards, then five measurements for its
 * dates (the period's totals and the comparison's for every metric; by day and by week for its own).
 */
export function useLiveDashboard(warehouse: Warehouse, open: OpenBoard) {
  const { orgId } = useOrgIdentity()
  const org = orgScope(orgId)
  const today = useToday(warehouse.timezone)
  const catalog = useCatalog(warehouse)
  const scorecards = useQuery({
    queryKey: queryKeys.warehouse.scorecards(org, warehouse.id),
    queryFn: ({ signal }) => warehouse.scorecards(signal),
    staleTime: 5 * MINUTE,
  })
  const names = new Set(catalog.data?.map((e) => e.name) ?? [])
  const onBoard = [...new Set(open.metricIds.map(Metrics.base))].filter((id) => names.has(id)).sort()
  const period = periodWindow(open.period, today)
  const chart = chartWindow(open.period, today)
  const before = comparedWindow(period, open.compare)
  const chartBefore = comparedWindow(chart, open.compare)
  // A request that isn't made (no comparison) still gets its own key, named after its slot.
  // The totals ask for every metric (metrics: []), so they start with the catalog, not after it;
  // the board's own series need the catalog to know which of its metrics exist.
  // Same dates, different cards (a card added or removed): the series already in hand stay drawn while
  // the new request runs, so the other cards don't blink. New dates: no stand-in, the cards shimmer.
  const measure = (slot: string, body: MeasureRequest | null, enabled = true) => ({
    queryKey: queryKeys.warehouse.measure(org, warehouse.id, body ?? { off: slot }),
    queryFn: ({ signal }: { signal: AbortSignal }) => warehouse.measure(body!, signal),
    enabled: enabled && body !== null && (body.metrics.length === 0 || catalog.isSuccess),
    staleTime: MINUTE,
    placeholderData: (previous: Measurement | undefined, query: { queryKey: readonly unknown[] } | undefined) => {
      const was = query?.queryKey.at(-1) as Partial<MeasureRequest> | undefined
      return previous && body && was && was.start === body.start && was.end === body.end && was.grain === body.grain ? previous : undefined
    },
  })
  const total = useQuery(measure('total', request([], period, 'total')))
  const totalBefore = useQuery(measure('totalBefore', before && request([], before, 'total')))
  const daily = useQuery(measure('daily', request(onBoard, chart, 'day'), onBoard.length > 0))
  const dailyBefore = useQuery(measure('dailyBefore', chartBefore && request(onBoard, chartBefore, 'day'), onBoard.length > 0))
  const weekly = useQuery(measure('weekly', request(onBoard, weeksWindow(today), 'week'), onBoard.length > 0))

  // A sync that finished (anyone's, any app) or an app connected in any tab: the numbers re-read.
  useRefreshOnNewData(warehouse)

  const apps = new Apps(warehouse.connections)
  // Cards draw once the catalog is in; scorecards only add health, so they don't hold the board back.
  const data = catalog.data
    ? new DashboardData(warehouse, apps, new Metrics({
        catalog: catalog.data, scorecards: scorecards.data ?? [], apps,
        total: total.data, totalBefore: totalBefore.data, daily: daily.data, dailyBefore: dailyBefore.data, weekly: weekly.data,
        chart, chartBefore, compare: open.compare, today,
      }), today)
    : null
  // A failure only counts while there is nothing to show: a background refetch that fails keeps the
  // numbers already on screen (CR-20).
  const lost = (q: { isError: boolean; data: unknown }) => q.isError && q.data === undefined
  const series = [daily, dailyBefore, weekly]
  const queries = [catalog, scorecards, total, totalBefore, ...series]
  const shown = new Set(Object.keys(daily.data?.periods[0]?.values ?? {}))
  return {
    data,
    /** The board can't draw at all: its metric catalog didn't load. */
    failed: lost(catalog),
    /** The cards' numbers are on their way: names show, the figures shimmer (CR-19). */
    measuring: total.isLoading || totalBefore.isLoading,
    /** The numbers couldn't be read: each card says so, with Try again (CR-20). */
    numbersFailed: lost(total) || lost(totalBefore),
    /** This card's chart is on its way: its own data isn't in yet (a new card on the same dates, or new dates). */
    chartLoading: (metricId: string) =>
      series.some((q) => q.isLoading) || (daily.isPlaceholderData && !shown.has(Metrics.base(metricId))),
    /** The charts couldn't be read; the numbers can still show. */
    chartsFailed: series.some(lost),
    retry: () => queries.filter((q) => q.isError).forEach((q) => { void q.refetch() }),
  }
}

/**
 * Re-reads what the dashboard shows when there is new data to read: an app's sync finished (its last
 * sync time moved), or an app was connected or reconnected (in this tab or another, or since the
 * window was last in front). Without this, a card stayed on what it read before the sync.
 */
function useRefreshOnNewData(warehouse: Warehouse) {
  const queryClient = useQueryClient()
  const { orgId } = useOrgIdentity()
  const org = orgScope(orgId)
  const sync = useSyncState()
  const synced = Object.values(sync.apps).map((a) => `${a.id}:${a.syncedAt ?? ''}:${a.state}`).sort().join('|')
  const seen = useRef<string | null>(null)
  useEffect(() => {
    const before = seen.current
    seen.current = synced
    // The first status of a board isn't news; a later change in when an app last synced is.
    if (before === null || before === '' || before === synced) return
    void queryClient.invalidateQueries({ queryKey: queryKeys.warehouse.one(org, warehouse.id) })
    void queryClient.invalidateQueries({ queryKey: queryKeys.warehouse.list(org) })
  }, [synced, queryClient, org, warehouse.id])
  useEffect(() => {
    const reread = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.warehouse.list(org) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.warehouse.one(org, warehouse.id) })
    }
    const stop = onAnyLinkResult(() => reread())
    // Back from the Connectors page in another tab: what's connected may have changed.
    const onFocus = () => { void queryClient.invalidateQueries({ queryKey: queryKeys.warehouse.list(org) }) }
    window.addEventListener('focus', onFocus)
    return () => { stop(); window.removeEventListener('focus', onFocus) }
  }, [queryClient, org, warehouse.id])
}

/** The open board's sync status, polled into the sync store: often while anything syncs, else each minute. */
export function useBoardStatus(warehouse: Warehouse, boardId: string, saved: boolean) {
  const { orgId } = useOrgIdentity()
  useEffect(() => {
    bindSync(saved ? { warehouse, boardId } : null)
  }, [warehouse, boardId, saved])
  const status = useQuery({
    queryKey: queryKeys.warehouse.status(orgScope(orgId), warehouse.id, boardId),
    queryFn: ({ signal }) => warehouse.boardStatus(boardId, signal),
    enabled: saved,
    refetchInterval: (query) => (query.state.data?.connections.some((c) => c.state === 'syncing' || c.state === 'slow' || c.state === 'first_sync') ? SYNCING_POLL_MS : MINUTE),
  })
  useEffect(() => {
    if (status.data) setStatus(boardId, status.data)
  }, [boardId, status.data])
}
