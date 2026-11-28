// What a failed target save or load says (API-ER-06, API-EM-01): what happened, then what to do.
// Branches on status only, never on the backend's text.

import { ApiError } from '@/lib/api/client'

export type TargetAction = 'save' | 'remove' | 'load'

/** The message for a failed target action on `label` ("Revenue"). */
export function targetErrorMessage(error: unknown, action: TargetAction, label: string): string {
  const what = `Couldn’t ${action} the target for ${label}.`
  const status = error instanceof ApiError ? error.status : undefined
  if (status === 0) return `${what} You’re offline or the connection dropped. Check your connection and try again.`
  if (status === 403) return `${what} You don’t have access to change targets in this workspace. Ask a workspace admin.`
  if (status === 404) return `${what} This workspace’s store may have been removed. Refresh to see the latest.`
  if (status === 409) return `${what} Targets were changed somewhere else. Refresh to see the latest version.`
  if (status === 422 || status === 400) return `${what} Check the target and tolerance and try again.`
  if (status === 429) return `${what} Too many requests. Try again in a moment.`
  return `${what} Try again, and contact support if it keeps happening.`
}

/** Whether trying the same thing again could work (API-EM-06). */
export function canRetry(error: unknown): boolean {
  return error instanceof ApiError ? error.retryable : true
}
