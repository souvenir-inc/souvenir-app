import { ApiError } from '@/lib/api/client'
import { BoardsGoneError } from '../live/board-store'

export { ACTION_COPY, LOAD_COPY, SAVE_COPY } from './copy'

// How a dashboard failure is read (API-ER-02): branch on status and error class, never on the
// backend's words. The words are in copy.ts (API-EM-09). (Both belong in src/lib/dashboard/ once
// the feature has a lib folder.)

/** Worth trying again: network failures, timeouts, 408, 429 and 5xx (API-ER-03). */
export function isRetryable(error: unknown): boolean {
  if (error instanceof ApiError) return error.retryable
  // fetch() rejects with a TypeError when the network fails.
  return error instanceof TypeError
}

// ── Loading the screen ─────────────────────────────────────────────────────────

/** Why the dashboard couldn't load, as the screen shows it. */
export type LoadFailure =
  | { kind: 'not-enabled' }
  | { kind: 'no-access' }
  | { kind: 'failed'; retryable: boolean }

/**
 * Every warehouse route refuses with 403 when the organization's warehouse is off; that is the only
 * 403 a read gets, so it means "not turned on" unless the org record says the warehouse is on (then
 * the viewer was refused). 404 is "not in an organization" or a warehouse that isn't theirs.
 * The backend sends no code to tell these apart (backend ticket).
 */
export function loadFailure(error: unknown, warehouseEnabled: boolean | null): LoadFailure {
  if (error instanceof ApiError && error.status === 403) return warehouseEnabled === true ? { kind: 'no-access' } : { kind: 'not-enabled' }
  if (error instanceof ApiError && error.status === 404) return { kind: 'no-access' }
  return { kind: 'failed', retryable: isRetryable(error) }
}

// ── Saving boards (DASH-TR-03) ─────────────────────────────────────────────────

/** How a refused save is handled: kept on screen, rolled back, or tried again. */
export type SaveFailure =
  | { kind: 'gone'; many: boolean }
  | { kind: 'conflict' }
  | { kind: 'default-board' }
  | { kind: 'forbidden' }
  | { kind: 'refused' }
  | { kind: 'retry' }

/**
 * `defaultBoardPrivate`: the save made the workspace's default board private. The warehouse refuses
 * that with 409 and no code, the same status as a version conflict, so the state that was saved
 * tells them apart (backend ticket: a code for each 409).
 */
export function saveFailure(error: unknown, defaultBoardPrivate: boolean): SaveFailure {
  if (error instanceof BoardsGoneError) return { kind: 'gone', many: error.ids.length > 1 }
  if (isRetryable(error)) return { kind: 'retry' }
  if (error instanceof ApiError && error.status === 409) return defaultBoardPrivate ? { kind: 'default-board' } : { kind: 'conflict' }
  if (error instanceof ApiError && error.status === 403) return { kind: 'forbidden' }
  return { kind: 'refused' }
}
