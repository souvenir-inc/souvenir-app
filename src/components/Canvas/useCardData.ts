'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useOrgIdentity } from '@/context/org-context'
import type { MeasureRequest, Measurement } from '@/lib/api/warehouse'
import { orgScope, queryKeys } from '@/lib/query-keys'
import { useMeasurement } from '@/lib/warehouse/queries'
import type { BoardCard } from './board'
import { readCard, type CardData, type CardNeeds, type RangeKey } from './batching'

const IDLE: MeasureRequest = { metrics: [], start: '', end: '', grain: 'total' }

export interface CardDataState {
  data: CardData | null
  /** Something the card reads failed; `retry` asks again. */
  failed: boolean
  /** A request is in flight (first load, or the group grew and is being re-asked). */
  fetching: boolean
  retry: () => void
}

/**
 * A card's numbers. Each slot calls `useMeasurement` with its group's request from the board's plan, so
 * cards in one group share one query (React Query de-duplicates identical keys): one network call per
 * (range, grain), never one per card.
 *
 * When a card joins a group, the group's request changes and is asked again. Until it answers, a card reads
 * any cached measurement of the same range and grain that already holds its metric, so the board doesn't
 * blank out while it grows.
 */
export function useCardData(card: BoardCard, needs: CardNeeds, requests: ReadonlyMap<RangeKey, MeasureRequest>): CardDataState {
  const client = useQueryClient()
  const { orgId } = useOrgIdentity()
  const requestOf = (key: RangeKey | null) => (key ? requests.get(key) : undefined)

  const total = useMeasurement(requestOf(needs.total) ?? IDLE, requestOf(needs.total) !== undefined)
  const comparisonTotal = useMeasurement(requestOf(needs.comparisonTotal) ?? IDLE, requestOf(needs.comparisonTotal) !== undefined)
  const series = useMeasurement(requestOf(needs.series) ?? IDLE, requestOf(needs.series) !== undefined)
  const comparisonSeries = useMeasurement(requestOf(needs.comparisonSeries) ?? IDLE, requestOf(needs.comparisonSeries) !== undefined)
  const weeks = useMeasurement(requestOf(needs.weeks) ?? IDLE, requestOf(needs.weeks) !== undefined)

  const cached = (key: RangeKey | null): Measurement | undefined => {
    const request = requestOf(key)
    if (!request) return undefined
    const hits = client.getQueriesData<Measurement>({ queryKey: [...queryKeys.warehouse.all(orgScope(orgId)), 'measure'] })
    for (const [queryKey, data] of hits) {
      const asked = queryKey[3] as MeasureRequest | undefined
      if (data && asked && asked.start === request.start && asked.end === request.end && asked.grain === request.grain
        && asked.metrics.includes(card.metric)) return data
    }
    return undefined
  }

  const slots = [
    [needs.total, total], [needs.comparisonTotal, comparisonTotal], [needs.series, series],
    [needs.comparisonSeries, comparisonSeries], [needs.weeks, weeks],
  ] as const
  const results: Record<RangeKey, Measurement | undefined> = {}
  for (const [key, query] of slots) {
    if (key) results[key] = query.data ?? cached(key)
  }

  const active = slots.filter(([key]) => key !== null).map(([, query]) => query)
  return {
    data: readCard(card, needs, results),
    failed: active.some(q => q.isError && q.data === undefined),
    fetching: active.some(q => q.isFetching),
    retry: () => { for (const q of active) if (q.isError) void q.refetch() },
  }
}
