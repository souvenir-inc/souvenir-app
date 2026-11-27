import { queryOptions } from '@tanstack/react-query'
import { Warehouse, type BoardStatus, type MeasureRequest } from '@/lib/api/warehouse'
import { queryKeys } from '@/lib/query-keys'
import { STALE_DEFAULT_MS, STALE_REALTIME_MS, STALE_STATIC_MS } from '@/lib/query-policy'
import type { Person } from '../tabs/board-state'
import type { BoardStore } from './board-store'

// Query options for what the dashboard reads from the warehouse (API-Q-02): components, prefetches
// and invalidation share these. Keys from query-keys.ts, org-scoped (API-Q-04); fresh-for from the
// policy tiers (API-Q-05). Retries are the client's default (shouldRetryQuery).

/** While an app syncs the status is read often, else once a minute; hidden tabs don't poll. */
export const SYNCING_POLL_MS = 5_000
/** Someone else's change to a board shows within a minute while the dashboard is open. */
export const BOARDS_POLL_MS = 60_000
export const STATUS_POLL_MS = 60_000

const syncing = (status: BoardStatus | undefined) =>
  !!status?.connections.some((c) => c.state === 'syncing' || c.state === 'slow' || c.state === 'first_sync')

export const warehouseQueries = {
  /** The organization's warehouses; the dashboard shows the first. */
  list: (org: string) =>
    queryOptions({
      queryKey: queryKeys.warehouse.list(org),
      queryFn: ({ signal }) => Warehouse.list(signal),
      staleTime: STALE_DEFAULT_MS,
    }),

  /** The metric catalog: changes only when someone adds or edits a metric. */
  catalog: (org: string, warehouse: Warehouse) =>
    queryOptions({
      queryKey: queryKeys.warehouse.catalog(org, warehouse.id),
      queryFn: ({ signal }) => warehouse.metrics(signal),
      staleTime: STALE_STATIC_MS,
    }),

  // Scorecards: scorecardQueries.list in lib/scorecard/scorecard-queries.ts (the same key).

  /**
   * One measurement. A request that isn't made (no comparison) still gets its own key, named after
   * its slot. Same dates with other metrics (a card added or removed): the series in hand stay drawn
   * while the new request runs, so other cards don't blink. New dates: no stand-in.
   */
  measure: (org: string, warehouse: Warehouse, slot: string, body: MeasureRequest | null, enabled = true) =>
    queryOptions({
      queryKey: queryKeys.warehouse.measure(org, warehouse.id, body ?? { off: slot }),
      queryFn: ({ signal }) => {
        if (!body) throw new Error(`measure ${slot} has no request`)
        return warehouse.measure(body, signal)
      },
      enabled: enabled && body !== null,
      staleTime: STALE_DEFAULT_MS,
      placeholderData: (previous, query) => {
        const was = query?.queryKey.at(-1) as Partial<MeasureRequest> | undefined
        return previous && body && was && was.start === body.start && was.end === body.end && was.grain === body.grain ? previous : undefined
      },
    }),

  /** The open board's sync status: often while anything syncs, else each minute. */
  status: (org: string, warehouse: Warehouse, boardId: string) =>
    queryOptions({
      queryKey: queryKeys.warehouse.status(org, warehouse.id, boardId),
      queryFn: ({ signal }) => warehouse.boardStatus(boardId, signal),
      staleTime: STALE_REALTIME_MS,
      refetchInterval: (query) => (syncing(query.state.data) ? SYNCING_POLL_MS : STATUS_POLL_MS),
    }),

  /** Each connection's sync state outside a board (its `metrics` are empty). */
  connectionStates: (org: string, warehouse: Warehouse) =>
    queryOptions({
      queryKey: queryKeys.warehouse.connections(org, warehouse.id),
      queryFn: ({ signal }) => warehouse.connectionStates(signal),
      staleTime: STALE_DEFAULT_MS,
    }),

  /** The Slack channels a board can go to; none listed means Slack isn't installed (SH-27). */
  slackChannels: (org: string) =>
    queryOptions({
      queryKey: queryKeys.warehouse.slackChannels(org),
      queryFn: ({ signal }) => Warehouse.slackChannels(signal),
      staleTime: STALE_DEFAULT_MS,
    }),

  /**
   * The viewer's boards as the server has them, read through the screen's BoardStore (one queue with
   * its writes). Refetched on focus and each minute, so other people's changes show; the viewer's
   * unsaved changes sit on top (tabs/board-layer.ts). Owners and avatars come from `people`, so the
   * query waits for the members (`enabled`).
   */
  boards: (org: string, warehouse: Warehouse, store: BoardStore, people: Map<string, Person>, enabled: boolean) =>
    queryOptions({
      queryKey: queryKeys.warehouse.boards(org, warehouse.id),
      queryFn: ({ signal }) => store.read(people, signal),
      enabled,
      staleTime: STALE_DEFAULT_MS,
      refetchOnWindowFocus: true,
      refetchInterval: BOARDS_POLL_MS,
      // A snapshot's `seq` counts this screen's own changes (its BoardStore): never reused by a later visit.
      gcTime: 0,
    }),
}
