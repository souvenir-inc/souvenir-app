'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { deviceBenchmarks, type BenchmarkBand, type BenchmarkEdits } from './benchmarks'
import type { Direction } from './model'
import {
  deviceTargets, EMPTY_BOOK, replaceTarget, TargetSaveError, targetOf, withDirection, withTarget,
  type MetricTarget, type TargetBook, type TargetEntry, type TargetPeriod, type TargetSettings,
} from './targets'

export const targetsQueryKey = (workspaceId: string) => ['scorecard', workspaceId, 'targets'] as const

/**
 * This workspace's targets and the target setting (what a target is per; weekly by default). `save` writes through
 * the store and shows at once; a failed save rolls back, tells the person why, and throws.
 */
export function useTargets(workspaceId: string | null | undefined) {
  const client = useQueryClient()
  const store = workspaceId ? deviceTargets(workspaceId) : null
  const key = targetsQueryKey(workspaceId ?? '')

  const query = useQuery({
    queryKey: key,
    queryFn: async () => (store ? store.read() : EMPTY_BOOK),
    enabled: store !== null,
    staleTime: Infinity,
    gcTime: Infinity,
  })

  const mutation = useMutation({
    mutationFn: async (book: TargetBook) => {
      if (store === null) throw new TargetSaveError('No store workspace yet')
      return store.write(book)
    },
    onMutate: book => {
      const before = client.getQueryData<TargetBook>(key)
      client.setQueryData(key, book)
      return { before }
    },
    onError: (error, _book, context) => {
      if (context?.before) client.setQueryData(key, context.before)
      toast.error(error instanceof Error ? error.message : "Couldn't save the target")
    },
  })

  const book = query.data ?? EMPTY_BOOK
  return {
    book,
    settings: book.settings,
    isLoading: query.isLoading,
    location: store?.location ?? 'device',
    targetOf: (metric: string) => targetOf(book, metric),
    /** Sets one period's target for a metric (with working-out on, the base period's). */
    setTarget: (metric: string, period: TargetPeriod, entry: TargetEntry, direction?: Direction) =>
      mutation.mutateAsync(withTarget(book, metric, period, entry, new Date(), direction)),
    setDirection: (metric: string, direction: Direction) => mutation.mutateAsync(withDirection(book, metric, direction)),
    /** Replaces a metric's whole target (condition and numbers per period); no numbers removes it. */
    saveTarget: (metric: string, direction: Direction, values: MetricTarget['values']) =>
      mutation.mutateAsync(replaceTarget(book, metric, direction, values)),
    setSettings: (settings: Partial<TargetSettings>) => mutation.mutateAsync({ ...book, settings: { ...book.settings, ...settings } }),
  }
}

export const benchmarksQueryKey = (workspaceId: string) => ['scorecard', workspaceId, 'benchmarks'] as const

/** This workspace's benchmark edits (saved on this device) and a way to change or reset one. */
export function useBenchmarkEdits(workspaceId: string | null | undefined) {
  const client = useQueryClient()
  const store = workspaceId ? deviceBenchmarks(workspaceId) : null
  const key = benchmarksQueryKey(workspaceId ?? '')
  const query = useQuery({ queryKey: key, queryFn: async () => store?.read() ?? {}, enabled: store !== null, staleTime: Infinity, gcTime: Infinity })
  const mutation = useMutation({
    mutationFn: async (edits: BenchmarkEdits) => {
      if (store === null) throw new Error('No store workspace yet')
      return store.write(edits)
    },
    onMutate: edits => {
      const before = client.getQueryData<BenchmarkEdits>(key)
      client.setQueryData(key, edits)
      return { before }
    },
    onError: (error, _edits, context) => {
      if (context?.before) client.setQueryData(key, context.before)
      toast.error(error instanceof Error ? error.message : "Couldn't save the benchmark")
    },
  })
  const edits = query.data ?? {}
  return {
    edits,
    /** Sets this workspace's own band for a metric; null goes back to the researched default. */
    setBand: (metric: string, band: BenchmarkBand | null, reason?: string) => {
      const next = { ...edits }
      if (band === null) delete next[metric]
      else next[metric] = { band, reason, setAt: new Date().toISOString() }
      return mutation.mutateAsync(next)
    },
  }
}
