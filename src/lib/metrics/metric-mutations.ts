// Mutations for the metric library (API-Q-09), one per warehouse metric route the library writes to:
//
// - save (admins): PUT /metrics, the metric's next version, confirmed. Saving under a library metric's name makes it
//   this workspace's own definition (`overridden`).
// - propose (members): POST /proposals, a new metric or a change for an admin to confirm; a new one shows in the
//   library as proposed while it waits.
// - confirm (admins): POST /metrics/status.
// - delete a custom metric, or go back to Souvenir's definition of an adjusted one (admins): DELETE /metrics/{name}.
// - ask in words: POST /metrics/draft (nothing is kept until the drafted metric is saved or proposed).
//
// All pessimistic (API-Q-11): the warehouse checks a definition against its tables before it keeps it, so the
// screen shows progress and takes the catalog the server returns. A change to definitions makes every
// measurement of the warehouse stale, so those are invalidated (the dashboard's too).

import { mutationOptions, type QueryClient } from '@tanstack/react-query'
import type { CustomMetricRequest, MetricDraftRequest, MetricEntry, ProposalRequest, StatusRequest, Warehouse } from '@/lib/api/warehouse'
import { queryKeys } from '@/lib/query-keys'

function afterChange(qc: QueryClient, org: string, warehouse: Warehouse, catalog?: MetricEntry[]) {
  const key = queryKeys.warehouse.catalog(org, warehouse.id)
  if (catalog) qc.setQueryData(key, catalog)
  else void qc.invalidateQueries({ queryKey: key, exact: true })
  void qc.invalidateQueries({ queryKey: queryKeys.warehouse.measures(org, warehouse.id) })
}

/** Admins save a metric's next version: PUT /metrics answers with the whole catalog, which replaces the cache. */
export function putMetricOptions(qc: QueryClient, org: string, warehouse: Warehouse) {
  return mutationOptions({
    mutationKey: [...queryKeys.warehouse.catalog(org, warehouse.id), 'put'],
    mutationFn: (metric: CustomMetricRequest) => warehouse.putMetric(metric),
    onSuccess: catalog => afterChange(qc, org, warehouse, catalog),
  })
}

/** Members propose a new metric or a change; a new one joins the catalog as proposed. */
export function proposeOptions(qc: QueryClient, org: string, warehouse: Warehouse) {
  return mutationOptions({
    mutationKey: [...queryKeys.warehouse.proposals(org, warehouse.id), 'propose'],
    mutationFn: (request: ProposalRequest) => warehouse.propose(request),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.warehouse.proposals(org, warehouse.id) })
      void qc.invalidateQueries({ queryKey: queryKeys.warehouse.catalog(org, warehouse.id), exact: true })
    },
  })
}

/** Admins confirm, retire or bring back metrics: the whole catalog comes back. */
export function setStatusOptions(qc: QueryClient, org: string, warehouse: Warehouse) {
  return mutationOptions({
    mutationKey: [...queryKeys.warehouse.catalog(org, warehouse.id), 'status'],
    mutationFn: (request: StatusRequest) => warehouse.setStatus(request),
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
    mutationFn: (request: MetricDraftRequest) => warehouse.draftMetric(request),
  })
}
