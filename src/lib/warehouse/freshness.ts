import type { Workspace } from '@/lib/api/warehouse'

const LABELS: Record<string, string> = {
  store: 'Store',
  ads: 'Ads',
  attribution: 'Attribution',
  email_sms: 'Email & SMS',
  shipping: 'Shipping',
  returns: 'Returns',
  reviews: 'Reviews',
  surveys: 'Surveys',
  ab_testing: 'A/B tests',
  support: 'Support',
  site_analytics: 'Site analytics',
}

/** A category the map doesn't know yet reads as words, not a code: "site_analytics" → "Site analytics". */
function labelOf(category: string): string {
  if (LABELS[category]) return LABELS[category]
  const words = category.replace(/[_-]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export type SourceState = 'ready' | 'syncing' | 'failed'

export interface SourceFreshness {
  category: string
  label: string
  lastSyncedAt: string | null
  state: SourceState
}

/**
 * The sources feeding the workspace and when each last synced, for the header.
 * `not_applicable` categories are left out. So is a category that failed without ever syncing: today the
 * warehouse reports a category with no app behind it that way (A/B tests on a store without a testing tool),
 * and showing it would read as a broken store. Sahil's ask S1 fixes this on the back end.
 */
export function sourcesOf(workspace: Workspace): SourceFreshness[] {
  return workspace.categories
    .filter(c => c.status !== 'not_applicable')
    .filter(c => !(c.status === 'failed' && c.lastSyncedAt === null))
    .map(c => ({
      category: c.category,
      label: labelOf(c.category),
      lastSyncedAt: c.lastSyncedAt,
      state: c.status === 'failed' ? 'failed' : c.status === 'ready' ? 'ready' : 'syncing',
    }))
}

/** One state for the header dot: any failure wins, then any sync in progress. */
export function overallState(sources: SourceFreshness[]): SourceState {
  if (sources.some(s => s.state === 'failed')) return 'failed'
  if (sources.some(s => s.state === 'syncing')) return 'syncing'
  return 'ready'
}

/** A UTC instant as the store's calendar date, YYYY-MM-DD (the warehouse buckets days in the store's timezone). */
export function storeDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
}

/**
 * The last store-calendar day a category's data reaches: the day of its last sync, in the store's timezone.
 * The API answers `null` both for "nothing happened that day" and for "no data that day" (back-end ask S15), so
 * screens cut every series here and never draw the days after it as zero. Null means the category never synced
 * (or isn't on this workspace): there is no cut to make, and the API's own `unavailable` explains the gap.
 */
export function dataUntil(workspace: Workspace, category: string): string | null {
  const c = workspace.categories.find(x => x.category === category)
  return c?.lastSyncedAt ? storeDate(c.lastSyncedAt, workspace.timezone) : null
}

/** For a metric built from several sources: the earliest of their dates. Nulls (no cut) are ignored. */
export function earliestDate(dates: Array<string | null>): string | null {
  const known = dates.filter((d): d is string => d !== null).sort()
  return known[0] ?? null
}

/** A period that starts after the data ends has no data, whatever value the API returned for it. */
export function isPastData(periodStart: string, until: string | null): boolean {
  return until !== null && periodStart > until
}

function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

export interface RollingWindow {
  /** First day, inclusive (YYYY-MM-DD, store calendar). */
  start: string
  /** Last day, inclusive: today, or the last day with data when the source is behind. */
  end: string
  /** The same number of days immediately before, for the change figure. */
  previousStart: string
  previousEnd: string
  /** True when `end` was pulled back from today to the last day with data ("30 days to 9 Nov"). */
  endsAtData: boolean
}

/**
 * The team rule for rolling windows (7, 30, 90 days): when a source is behind, the window ends on its last day with
 * data and stays whole, so "Last 30 days" is always 30 days of data and the comparison is the 30 days before.
 * Label a pulled-back window "30 days to 9 Nov". Calendar windows (Today, month to date) are not rolling: they keep
 * their dates and show "No data yet" past the cut. `today` is the store-calendar date (see `storeDate`).
 */
export function rollingWindow(days: number, today: string, until: string | null): RollingWindow {
  const end = until !== null && until < today ? until : today
  const start = shiftDate(end, -(days - 1))
  const previousEnd = shiftDate(start, -1)
  return { start, end, previousStart: shiftDate(previousEnd, -(days - 1)), previousEnd, endsAtData: end !== today }
}

/** "9 Nov", for a "Data until 9 Nov" line under a chart or a scorecard week. */
export function formatStoreDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)))
}

/** "10 Nov, 8:00 am", in the store's timezone, since that is how the warehouse counts days. */
export function formatSyncedAt(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone,
  }).format(new Date(iso))
}
