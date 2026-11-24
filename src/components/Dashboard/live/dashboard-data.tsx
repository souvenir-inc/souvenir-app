'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useOrgIdentity } from '@/context/org-context'
import { Warehouse, type MeasureRequest } from '@/lib/api/warehouse'
import { orgScope, queryKeys } from '@/lib/query-keys'
import { chartWindow, comparedWindow, isoDate, periodWindow, wallClock, type Window } from '../period'
import { bindSync, setStatus } from '../sync/sync-store'
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
  const measure = (slot: string, body: MeasureRequest | null, enabled = true) => ({
    queryKey: queryKeys.warehouse.measure(org, warehouse.id, body ?? { off: slot }),
    queryFn: ({ signal }: { signal: AbortSignal }) => warehouse.measure(body!, signal),
    enabled: enabled && body !== null && (body.metrics.length === 0 || catalog.isSuccess),
    staleTime: MINUTE,
  })
  const total = useQuery(measure('total', request([], period, 'total')))
  const totalBefore = useQuery(measure('totalBefore', before && request([], before, 'total')))
  const daily = useQuery(measure('daily', request(onBoard, chart, 'day'), onBoard.length > 0))
  const dailyBefore = useQuery(measure('dailyBefore', chartBefore && request(onBoard, chartBefore, 'day'), onBoard.length > 0))
  const weekly = useQuery(measure('weekly', request(onBoard, weeksWindow(today), 'week'), onBoard.length > 0))

  const apps = new Apps(warehouse.connections)
  const data = catalog.data && scorecards.data
    ? new DashboardData(warehouse, apps, new Metrics({
        catalog: catalog.data, scorecards: scorecards.data, apps,
        total: total.data, totalBefore: totalBefore.data, daily: daily.data, dailyBefore: dailyBefore.data, weekly: weekly.data,
        chart, chartBefore, compare: open.compare, today,
      }), today)
    : null
  const queries = [catalog, scorecards, total, totalBefore, daily, dailyBefore, weekly]
  return {
    data,
    /** The numbers are still on their way. */
    measuring: queries.some((q) => q.isLoading),
    failed: queries.some((q) => q.isError),
    retry: () => queries.filter((q) => q.isError).forEach((q) => q.refetch()),
  }
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
