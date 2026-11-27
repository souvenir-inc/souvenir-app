// Query options for the metric library (API-Q-02). The catalog itself is the dashboard's one query
// (`useCatalog` in components/Dashboard/live/dashboard-data.tsx, key `queryKeys.warehouse.catalog`), so the
// library, the dashboard and the metric window share one cache. Totals for a metric page or a preview are
// measurements under `queryKeys.warehouse.measure`, which the dashboard shares when the request is the same.

import { queryOptions } from '@tanstack/react-query'
import type { MeasureRequest, Warehouse } from '@/lib/api/warehouse'
import { STALE_DEFAULT_MS } from '@/lib/query-policy'
import { queryKeys } from '@/lib/query-keys'

/** Most metrics one measurement asks for: a long tree or a big template list never becomes a huge request. */
export const MAX_MEASURED = 60

export const metricQueries = {
  /** Totals (or days, weeks) for some metrics over some dates. Names are sorted so equal requests share a key. */
  measure: (org: string, warehouse: Warehouse, request: MeasureRequest) => {
    const body: MeasureRequest = { ...request, metrics: [...new Set(request.metrics)].sort().slice(0, MAX_MEASURED) }
    return queryOptions({
      queryKey: queryKeys.warehouse.measure(org, warehouse.id, body),
      queryFn: ({ signal }) => warehouse.measure(body, signal),
      staleTime: 2 * STALE_DEFAULT_MS,
    })
  },
}
