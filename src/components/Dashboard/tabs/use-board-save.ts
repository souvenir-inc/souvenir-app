'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api/client'
import { logger } from '@/lib/logger'
import { CommitError, type BoardStore } from '../live/board-store'
import { SAVE_COPY, saveFailure } from '../board/errors'
import type { BoardsSnapshot, PendingBoards } from './board-layer'
import { boardMutations } from './board-mutations'
import type { DashboardState } from './board-state'

// Writes the viewer's changes to the warehouse (DASH-TR-03, TR-05): a moment after the last change
// (a drag is one write), at once when the page is hidden or left. A save is a mutation: its
// changes stay on screen as an optimistic layer until it lands; a refusal that trying again can't
// fix rolls them back to what the server has; a network failure is tried again, and the changes
// are kept until it lands.

/** How long after the last change the boards are written: long enough to fold a drag into one write. */
export const SAVE_DELAY_MS = 800

interface SaveOptions {
  store: BoardStore
  pending: PendingBoards
  queryKey: QueryKey
  /** The boards on screen now (for the open board, and to tell the two 409s apart). */
  latest: { readonly current: DashboardState }
  /** Metric names the catalog knows, as they are when a save starts. */
  measurable: { readonly current: Set<string> }
  /** The workspace's default board, which can't be made private (DASH-TR-26). */
  defaultBoard: string | null
}

export function useBoardSave({ store, pending, queryKey, latest, measurable, defaultBoard }: SaveOptions) {
  const queryClient = useQueryClient()
  /** The last save failed on the network: its changes still need writing. */
  const needsRetry = useRef(false)

  const save = useMutation({
    ...boardMutations.save(store, pending, () => latest.current.openId, () => measurable.current),
    // A read in flight mustn't land over the change being written (API-CC-04).
    onMutate: () => queryClient.cancelQueries({ queryKey }),
    onSuccess: (snapshot: BoardsSnapshot) => {
      needsRetry.current = false
      queryClient.setQueryData(queryKey, snapshot)
      toast.dismiss('dashboard-save')
    },
    onError: (error) => {
      const upTo = error instanceof CommitError ? error.upTo : pending.latest
      const cause = error instanceof CommitError ? error.cause : error
      logger.error('[dashboard] saving boards failed', {
        name: cause instanceof Error ? cause.name : typeof cause,
        status: cause instanceof ApiError ? cause.status : undefined,
        code: cause instanceof ApiError ? cause.code : undefined,
        requestId: cause instanceof ApiError ? cause.requestId : undefined,
      })
      const defaultBoardPrivate = !!defaultBoard && latest.current.boards[defaultBoard]?.general === 'none'
      const failure = saveFailure(cause, defaultBoardPrivate)
      const rollBack = () => pending.drop(upTo)
      const sticky = { id: 'dashboard-save', duration: Infinity }
      switch (failure.kind) {
        case 'gone': {
          // Everything else in the save was written; the boards move on without the gone ones.
          queryClient.setQueryData(queryKey, store.snapshot())
          rollBack()
          const copy = SAVE_COPY.gone(failure.many)
          toast.error(copy.title, { ...sticky, description: copy.description })
          return
        }
        case 'conflict':
          // Kept on screen (API-CC-02); the refetch below shows their change under it.
          toast.error(SAVE_COPY.conflict.title, {
            ...sticky,
            description: SAVE_COPY.conflict.description,
            action: { label: SAVE_COPY.conflict.action, onClick: () => { rollBack(); void queryClient.invalidateQueries({ queryKey }) } },
          })
          return
        case 'default-board':
          rollBack()
          toast.error(SAVE_COPY.defaultBoard.title, { ...sticky, description: SAVE_COPY.defaultBoard.description })
          return
        case 'forbidden':
          rollBack()
          toast.error(SAVE_COPY.forbidden.title, { ...sticky, description: SAVE_COPY.forbidden.description })
          return
        case 'refused':
          rollBack()
          toast.error(SAVE_COPY.refused.title, { ...sticky, description: SAVE_COPY.refused.description })
          return
        case 'retry':
          needsRetry.current = true
          toast.error(SAVE_COPY.retry.title, {
            ...sticky,
            description: SAVE_COPY.retry.description,
            action: { label: SAVE_COPY.retry.action, onClick: () => save.mutate() },
          })
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })
  const { mutate, isPending } = save

  // A change no save has started with: written a moment after the last one, one save at a time
  // (the save in flight takes every change made before it starts, retries included).
  const layer = useSyncExternalStore(pending.subscribe, pending.getSnapshot, pending.getSnapshot)
  const waiting = layer.entries.some((e) => e.seq > layer.attempted)
  useEffect(() => {
    if (!waiting || isPending) return
    const timer = window.setTimeout(() => mutate(), SAVE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [layer, waiting, isPending, mutate])

  // Hiding or leaving the page writes at once. Leaving the dashboard writes what's still waiting
  // (and what a failed save still owes), once; nothing when everything is saved, so signing out
  // doesn't send writes without a session. The mutation reports its own failure (logged, toast).
  useEffect(() => {
    const flush = () => { if (pending.unsent || needsRetry.current) mutate() }
    const onHide = () => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onHide)
      flush()
    }
  }, [pending, mutate])

  return { saving: isPending, retry: () => mutate() }
}
