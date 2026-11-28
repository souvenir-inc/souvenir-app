import { mutationOptions, type QueryClient } from '@tanstack/react-query'
import type { BoardStatus, ConnectionState, Warehouse } from '@/lib/api/warehouse'
import { queryKeys } from '@/lib/query-keys'

// Mutations the dashboard sends to the warehouse (API-Q-09). Not optimistic: the server says which
// apps it started, and its answer goes straight into the board status cache (API-Q-11). No retries.

export interface RefreshVars { warehouse: Warehouse; boardId: string }
export interface SyncVars { warehouse: Warehouse; boardId: string; ids: string[] }
export interface SlackPostVars {
  warehouse: Warehouse
  boardId: string
  /** Drawn when the post is sent, so a picture that can't be drawn fails the post like a refused upload. */
  picture: () => Promise<Blob>
  filename: string
  channelId: string
  text: string
}

/**
 * What the screen does around a sync, on the mutation itself so it runs even when the button that
 * started it has gone (a banner that turned into the syncing one).
 */
export interface SyncEvents {
  /** These connections are syncing because of this viewer. */
  started?: (ids: string[]) => void
  /** The server refused; `ids` are those marked as started for it. */
  refused?: (ids: string[], error: unknown) => void
}

export const syncMutationKey = (org: string) => [...queryKeys.warehouse.all(org), 'sync'] as const

const running = (status: BoardStatus) => status.connections.filter((c) => c.state === 'syncing' || c.state === 'slow').map((c) => c.connectionId)

/** A connection's own sync answer doesn't name the board's metrics; it keeps the ones the board status gave. */
export function mergeConnections(status: BoardStatus, states: ConnectionState[]): BoardStatus {
  const byId = new Map(states.map((s) => [s.connectionId, s]))
  return {
    ...status,
    connections: status.connections.map((c) => {
      const next = byId.get(c.connectionId)
      return next ? { ...next, metrics: c.metrics } : c
    }),
  }
}

/** Refresh: every app on the board; the status it answers with is the board's status. */
export function refreshBoardOptions(qc: QueryClient, org: string, on: SyncEvents = {}) {
  return mutationOptions({
    mutationKey: syncMutationKey(org),
    mutationFn: ({ warehouse, boardId }: RefreshVars) => warehouse.refreshBoard(boardId),
    onSuccess: (status, { warehouse, boardId }) => {
      qc.setQueryData(queryKeys.warehouse.status(org, warehouse.id, boardId), status)
      on.started?.(running(status))
    },
    onError: (error) => on.refused?.([], error),
  })
}

/** Sync on a banner or a row: the given apps; their new states go into the board's status. */
export function syncConnectionsOptions(qc: QueryClient, org: string, on: SyncEvents = {}) {
  return mutationOptions({
    mutationKey: syncMutationKey(org),
    mutationFn: ({ warehouse, ids }: SyncVars) => Promise.all(ids.map((id) => warehouse.syncConnection(id))),
    onMutate: ({ ids }) => { on.started?.(ids) },
    onSuccess: (states, { warehouse, boardId }) => {
      qc.setQueryData<BoardStatus>(queryKeys.warehouse.status(org, warehouse.id, boardId), (old) => (old ? mergeConnections(old, states) : old))
      void qc.invalidateQueries({ queryKey: queryKeys.warehouse.connections(org, warehouse.id), exact: true })
    },
    onError: (error, { ids }) => on.refused?.(ids, error),
  })
}

/** The board's picture into a Slack channel. */
export function postBoardToSlackOptions(org: string) {
  return mutationOptions({
    mutationKey: [...queryKeys.warehouse.all(org), 'slack-post'],
    mutationFn: async ({ warehouse, boardId, picture, filename, channelId, text }: SlackPostVars) =>
      warehouse.postToSlack(boardId, await picture(), filename, channelId, text),
  })
}
