'use client'

import { useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query'
import { useOrgIdentity } from '@/context/org-context'
import { orgScope } from '@/lib/query-keys'
import { refreshBoardOptions, syncConnectionsOptions, syncMutationKey, type SyncEvents } from '../live/warehouse-mutations'
import type { AppId } from '../types'
import { blockedReason, getSyncSnapshot, getSyncTarget, markStarted, syncRefused, syncable, unmarkStarted } from './sync-store'

// Refresh and Sync as mutations (API-Q-09). The store only learns which syncs this viewer started;
// the server's answer goes into the board status query, which the store reads.

const refreshEvents: SyncEvents = {
  started: (ids) => markStarted(ids, 'refresh'),
  refused: (_ids, error) => syncRefused(error),
}

const syncEvents: SyncEvents = {
  started: (ids) => markStarted(ids, 'sync'),
  // A refused sync mustn't leave its spinner turning, and says why.
  refused: (ids, error) => { unmarkStarted(ids); syncRefused(error) },
}

/** A Refresh or Sync request is on its way (any button): another click sends nothing (API-Q-14). */
export function useSyncPending(): boolean {
  const { orgId } = useOrgIdentity()
  return useIsMutating({ mutationKey: syncMutationKey(orgScope(orgId)) }) > 0
}

/** Refresh: every app on the board, skipping apps to reconnect and first syncs (SY-9, SY-32). */
export function useRefreshAll(): () => void {
  const qc = useQueryClient()
  const { orgId } = useOrgIdentity()
  const pending = useSyncPending()
  const mutation = useMutation(refreshBoardOptions(qc, orgScope(orgId), refreshEvents))
  return () => {
    const target = getSyncTarget()
    if (!target || pending || blockedReason(getSyncSnapshot(), Date.now())) return
    mutation.mutate({ warehouse: target.warehouse, boardId: target.boardId })
  }
}

/** Sync on a banner or a row: only the given apps that are behind, or failed for a reason a sync can fix (SY-16). */
export function useSyncApps(): (ids: AppId[]) => void {
  const qc = useQueryClient()
  const { orgId } = useOrgIdentity()
  const pending = useSyncPending()
  const mutation = useMutation(syncConnectionsOptions(qc, orgScope(orgId), syncEvents))
  return (ids) => {
    const target = getSyncTarget()
    const s = getSyncSnapshot()
    if (!target || pending || blockedReason(s, Date.now())) return
    const behind = syncable(s, ids)
    if (behind.length) mutation.mutate({ warehouse: target.warehouse, boardId: target.boardId, ids: behind })
  }
}
