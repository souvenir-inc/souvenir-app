// Mutations for the metric library (API-Q-09). Every change goes to the warehouse's metric endpoints:
//
// - create, edit a formula, your own version of a library metric: PUT /metrics. Saving under a library metric's
//   name makes it this workspace's own definition (`overridden`); saving without `verified: true` leaves it
//   proposed until someone confirms it.
// - confirm: PUT /metrics with the entry's own fields and `verified: true`.
// - delete a custom metric, or go back to Souvenir's definition of an adjusted one: DELETE /metrics/{name}.
// - ask in words: POST /metrics/draft (nothing is kept until the proposed metric is put).
//
// All pessimistic (API-Q-11): the warehouse checks a definition against its tables before it keeps it, so the
// screen shows progress and takes the catalog the server returns. A change to definitions makes every
// measurement of the warehouse stale, so those are invalidated (the dashboard's too).

import { mutationOptions, type QueryClient } from '@tanstack/react-query'
import type { CustomMetric, DraftMessage, MetricEntry, Warehouse } from '@/lib/api/warehouse'
import { queryKeys } from '@/lib/query-keys'

function afterChange(qc: QueryClient, org: string, warehouse: Warehouse, catalog?: MetricEntry[]) {
  const key = queryKeys.warehouse.catalog(org, warehouse.id)
  if (catalog) qc.setQueryData(key, catalog)
  else void qc.invalidateQueries({ queryKey: key, exact: true })
  void qc.invalidateQueries({ queryKey: queryKeys.warehouse.measures(org, warehouse.id) })
}

/** Add, change, adjust or confirm a metric: PUT /metrics answers with the whole catalog, which replaces the cache. */
export function putMetricOptions(qc: QueryClient, org: string, warehouse: Warehouse) {
  return mutationOptions({
    mutationKey: [...queryKeys.warehouse.catalog(org, warehouse.id), 'put'],
    mutationFn: (metric: CustomMetric) => warehouse.putMetric(metric),
    onSuccess: catalog => afterChange(qc, org, warehouse, catalog),
  })
}

/** Delete a custom metric, or drop the workspace's own definition of a library metric. */
export function deleteMetricOptions(qc: QueryClient, org: string, warehouse: Warehouse) {
  return mutationOptions({
    mutationKey: [...queryKeys.warehouse.catalog(org, warehouse.id), 'delete'],
    mutationFn: (name: string) => warehouse.deleteMetric(name),
    onSuccess: () => afterChange(qc, org, warehouse),
  })
}

/** One turn of the "describe it" conversation. Reads only; nothing to invalidate. */
export function draftMetricOptions(org: string, warehouse: Warehouse) {
  return mutationOptions({
    mutationKey: [...queryKeys.warehouse.one(org, warehouse.id), 'metric-draft'],
    mutationFn: (messages: DraftMessage[]) => warehouse.draftMetric(messages),
  })
}
