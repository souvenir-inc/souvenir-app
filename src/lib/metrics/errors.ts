// How a failed metrics call turns into words (API-ER-06, 08): the codes and statuses the metric endpoints return,
// then the status-level catalogue. Never the server's text: a 422 from PUT /metrics carries the warehouse's own
// check ("unknown metric nope"), which names internals.

import { ZodError } from 'zod'
import { ApiError } from '@/lib/api/client'
import { getFriendlyHttpErrorText } from '@/lib/http-errors'

export type MetricAction = 'load' | 'save' | 'confirm' | 'delete' | 'reset' | 'draft' | 'measure'

/** The warehouse isn't turned on for the workspace, or the viewer may not use it. */
export function isPermissionDenied(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403
}

/** The viewer has no workspace (404 "Join an organization first") or the warehouse is gone. */
export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404
}

/** Whether trying again can help: network blips, timeouts, 408, 429 and 5xx; a malformed answer too. */
export function isRetryable(error: unknown): boolean {
  if (error instanceof ApiError) return error.retryable
  // A response that didn't match its schema, or a fetch that never reached the server.
  return error instanceof ZodError || error instanceof TypeError
}

const ACTION_FAILED: ReadonlyMap<MetricAction, string> = new Map([
  ['load', 'Couldn’t load your metrics.'],
  ['save', 'Couldn’t save the metric.'],
  ['confirm', 'Couldn’t confirm the metric.'],
  ['delete', 'Couldn’t delete the metric.'],
  ['reset', 'Couldn’t go back to Souvenir’s definition.'],
  ['draft', 'Souvenir didn’t answer.'],
  ['measure', 'Couldn’t work out the numbers.'],
])

/** One sentence that says what happened and what to do next, for a toast or an inline error. */
export function metricErrorMessage(error: unknown, action: MetricAction): string {
  const failed = ACTION_FAILED.get(action) ?? 'That didn’t work.'
  if (error instanceof ZodError) return `${failed} Try again, and contact support if it keeps happening.`
  if (!(error instanceof ApiError)) return `${failed} Check your connection and try again.`
  switch (error.status) {
    case 403:
      return 'Metrics aren’t turned on for this workspace. Ask a workspace admin about access.'
    case 404:
      return action === 'load' ? 'This workspace has no store connected yet. Connect your store to see its metrics.' : `${failed} It may have been deleted. Refresh to see the latest.`
    case 409:
      return action === 'delete'
        ? 'Couldn’t delete the metric: another metric, a board or a scorecard still uses it. Remove it from there first.'
        : `${failed} It was changed somewhere else. Refresh to see the latest.`
    case 422:
      return action === 'save' || action === 'confirm'
        ? `${failed} The warehouse couldn’t work it out from this store’s data. Check the metrics it uses and try again.`
        : `${failed} Check the details and try again.`
    case 429:
      return error.retryAfterSeconds
        ? `Too many requests. Try again in ${Math.ceil(error.retryAfterSeconds)} seconds.`
        : 'Too many requests. Wait a moment and try again.'
    default:
      break
  }
  if (error.status >= 500 || error.status === 0) return `${failed} Try again, and contact support if it keeps happening.`
  return getFriendlyHttpErrorText(error.status)
}
