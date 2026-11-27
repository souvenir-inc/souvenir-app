// The workspace's scorecards as one cached query, and the mutation that sets or removes one metric's
// target in them (API-Q-02, API-Q-09). The dashboard's health reads the same cache entry, so a saved
// target shows on the cards and in Needs attention without another request.

import { mutationOptions, queryOptions, type QueryClient } from '@tanstack/react-query'
import type { Scorecard, Warehouse } from '@/lib/api/warehouse'
import { queryKeys } from '@/lib/query-keys'
import { STALE_STATIC_MS } from '@/lib/query-policy'
import type { ScorecardRow } from './status'
import { planTargetWrite, restoreScorecard, withSaved, withScorecard } from './targets'

export const scorecardQueries = {
  /** `org` is orgScope(orgId) (API-Q-04). */
  list: (org: string, warehouse: Warehouse) =>
    queryOptions({
      queryKey: queryKeys.warehouse.scorecards(org, warehouse.id),
      queryFn: ({ signal }) => warehouse.scorecards(signal),
      staleTime: STALE_STATIC_MS,
    }),
}

export interface SaveTargetVars {
  metric: string
  /** The row to save; null removes the metric's target. */
  row: ScorecardRow | null
  /** The id the Targets scorecard gets if this save creates it (crypto.randomUUID()). */
  newId: string
}

interface SaveTargetContext {
  /** The scorecard the optimistic write touched, as it was (undefined: the write created it). */
  id: string
  previous: Scorecard | undefined
}

/**
 * Sets or removes one metric's target. Setting is optimistic (API-Q-10, Q-11): the cached scorecard
 * changes at once and only that scorecard goes back on failure. Removing a target is a delete of
 * shared data, so it waits for the server (API-Q-11). Either way the PUT is planned from a fresh read
 * of the scorecards, not the cache, so a row someone else added since the page loaded isn't dropped.
 */
export function saveTargetOptions(qc: QueryClient, org: string, warehouse: Warehouse, now: () => Date = () => new Date()) {
  const key = queryKeys.warehouse.scorecards(org, warehouse.id)
  return mutationOptions({
    mutationKey: [...key, 'target'],
    mutationFn: async ({ metric, row, newId }: SaveTargetVars): Promise<Scorecard | null> => {
      const fresh = await warehouse.scorecards()
      const write = planTargetWrite(fresh, metric, row, () => newId)
      return write ? warehouse.putScorecard(write.id, write.request) : null
    },
    onMutate: async ({ metric, row, newId }): Promise<SaveTargetContext | undefined> => {
      if (!row) return undefined
      await qc.cancelQueries({ queryKey: key, exact: true })
      const cached = qc.getQueryData<Scorecard[]>(key) ?? []
      const write = planTargetWrite(cached, metric, row, () => newId)
      if (!write) return undefined
      const previous = cached.find((card) => card.id === write.id)
      qc.setQueryData<Scorecard[]>(key, withScorecard(cached, write, now().toISOString()))
      return { id: write.id, previous }
    },
    onError: (_error, _vars, context) => {
      if (!context) return
      qc.setQueryData<Scorecard[]>(key, (cards) => (cards ? restoreScorecard(cards, context.id, context.previous) : cards))
    },
    onSuccess: (saved, _vars, context) => {
      if (!saved) return
      // The optimistic stand-in may sit under another id when another tab created Targets first.
      const stale = context && !context.previous ? context.id : undefined
      qc.setQueryData<Scorecard[]>(key, (cards) => withSaved(cards ?? [], saved, stale))
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key, exact: true })
    },
  })
}
