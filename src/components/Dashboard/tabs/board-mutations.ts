import { mutationOptions } from '@tanstack/react-query'
import { CommitError, type BoardStore } from '../live/board-store'
import { isRetryable } from '../board/errors'
import type { PendingBoards } from './board-layer'

// The boards' save (API-Q-09); the boards query is `warehouseQueries.boards` (live/warehouse-queries.ts).

/** A save that failed on the network is tried again at 5 s, doubling up to a minute (DASH-TR-03). */
const SAVE_RETRY_MS = 5_000
const SAVE_RETRY_MAX_MS = 60_000
const SAVE_RETRIES = 4

export const boardMutations = {
  /**
   * Saves every change waiting in `pending`, replayed on the latest boards read; the store writes one
   * save at a time. Only failures worth trying again are retried (the feature's rule DASH-TR-03,
   * which API-Q-07's "no automatic mutation retries" defers to); each retry takes every change made since.
   */
  save: (store: BoardStore, pending: PendingBoards, openId: () => string, measurable: () => Set<string>) =>
    mutationOptions({
      mutationKey: ['dashboard', 'save-boards'],
      mutationFn: () => store.commit(pending, openId(), measurable()),
      retry: (failures, error) => failures < SAVE_RETRIES && error instanceof CommitError && isRetryable(error.cause),
      retryDelay: (attempt) => Math.min(SAVE_RETRY_MAX_MS, SAVE_RETRY_MS * 2 ** attempt),
    }),
}
