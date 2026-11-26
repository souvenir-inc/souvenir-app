import type { Workspace } from '@/lib/api/warehouse'
import { appsFor } from '@/lib/metrics/display'
import { sourcesOf } from './freshness'

/** Who may reconnect: known admin, known member, or not known yet (the role is still loading). */
export type ReconnectRole = 'admin' | 'member' | 'unknown'

/**
 * The board header's sync status (Figma "Header · Sync button (final, 18 Nov)"; requirements in the
 * header-sync chat's `sync-button-prd-handoff.md`). Pure, so every rule here is tested without React.
 *
 * Today's API reports status per data area ("ads"), not per app, so an area's state is given to every app
 * that feeds it (G9). The usual sync interval isn't reported either: apps sync about once a day, so an app is
 * "behind" after two days without a successful sync (the rule is twice the usual interval).
 */

export const USUAL_SYNC_INTERVAL_MS = 24 * 60 * 60_000
export const BEHIND_AFTER_MS = 2 * USUAL_SYNC_INTERVAL_MS
/** One minute between syncs of the same app, to protect the apps' API limits. */
export const SYNC_COOLDOWN_MS = 60_000
/** A sync running this long is "taking longer than usual". */
export const LONG_SYNC_MS = 10 * 60_000
/** A Reconnect is watched this long for the app to come back, then forgotten. */
export const RECONNECT_WATCH_MS = 30 * 60_000
/** A sync attempt stops after an hour (req. 8): what you started is forgotten then. */
export const SYNC_WATCH_MS = 60 * 60_000
/** The green "synced" banner hides after this long (paused while hovered). */
export const SYNCED_BANNER_MS = 4_000
/** Data sources shows this many rows, then scrolls. */
export const VISIBLE_ROWS = 5

export type AppState = 'failed' | 'behind' | 'syncing' | 'first_sync' | 'up_to_date'
/** The sync button's dot. `none` is a board with no cards; `offline` is grey. */
export type DotState = 'failed' | 'behind' | 'syncing' | 'up_to_date' | 'offline' | 'none'

export interface AppSync {
  /** "Shopify", "Meta Ads"; an area we can't name an app for keeps the area's name ("Ads"). */
  name: string
  /** The connector slug, when we know one (for its logo). */
  slug: string | null
  /** The warehouse areas this app feeds. */
  categories: string[]
  state: AppState
  /** The oldest successful sync among its areas; null if it never synced. */
  lastSyncedAt: string | null
}

/** A run of text with the app names marked, so the banner can set them in Medium. */
export interface Segment {
  text: string
  app?: boolean
  /** "2 more apps": underlined, and its hover lists these. */
  more?: string[]
  /** The part after a toast's "•": quieter. */
  muted?: boolean
}

export interface Banner {
  /** A problem (red, amber), or what you started: a sync running (grey) or done (green). */
  kind: 'failed' | 'behind' | 'syncing' | 'synced'
  apps: string[]
  segments: Segment[]
  /** Changes whenever what the banner is about changes; a closed banner comes back when it does. */
  signature: string
  /** For a grey or green banner: what you started (a Sync, or a Reconnect). */
  source?: 'sync' | 'reconnect'
}

const RANK: Record<AppState, number> = { failed: 0, behind: 1, syncing: 2, first_sync: 3, up_to_date: 4 }
const unsettledState = (a: AppSync) => a.state === 'syncing' || a.state === 'first_sync'

/** Every app on the workspace with its state, in Data sources order: failed, behind, syncing, up to date. */
export function appsOf(workspace: Workspace, now: number): AppSync[] {
  const apps = new Map<string, { name: string; slug: string | null; categories: string[]; synced: (string | null)[]; failed: boolean; syncing: boolean }>()
  const labels = new Map(sourcesOf(workspace).map(s => [s.category, s.label]))
  for (const category of workspace.categories) {
    if (category.status === 'not_applicable') continue
    const names = appsFor(category.category, workspace.connectors)
    // An area that failed without ever syncing is listed only when a connected app feeds it (a first sync that
    // failed). With no app behind it, it's an area this store doesn't have, and listing it would read as broken.
    if (category.status === 'failed' && category.lastSyncedAt === null && names.length === 0) continue
    const label = labels.get(category.category) ?? category.category
    for (const name of names.length > 0 ? names : [label]) {
      const app = apps.get(name) ?? { name, slug: slugOf(name, workspace.connectors), categories: [], synced: [], failed: false, syncing: false }
      app.categories.push(category.category)
      app.synced.push(category.lastSyncedAt)
      if (category.status === 'failed') app.failed = true
      else if (category.status !== 'ready') app.syncing = true
      apps.set(name, app)
    }
  }
  const list: AppSync[] = [...apps.values()].map(app => {
    const known = app.synced.filter((at): at is string => at !== null).sort()
    const lastSyncedAt = known[0] ?? null
    let state: AppState
    if (app.failed) state = 'failed'
    else if (lastSyncedAt === null) state = 'first_sync'
    else if (app.syncing) state = 'syncing'
    else if (now - Date.parse(lastSyncedAt) > BEHIND_AFTER_MS) state = 'behind'
    else state = 'up_to_date'
    return { name: app.name, slug: app.slug, categories: app.categories, state, lastSyncedAt }
  })
  // Stable within a state: the order the workspace lists them in (the board's own usage isn't reported yet).
  return list.map((app, i) => ({ app, i })).sort((a, b) => RANK[a.app.state] - RANK[b.app.state] || a.i - b.i).map(x => x.app)
}

const AREAS = ['store', 'ads', 'attribution', 'site_analytics', 'shipping', 'email_sms']

function nameOfSlug(slug: string): string | null {
  for (const area of AREAS) {
    const [name] = appsFor(area, [slug])
    if (name) return name
  }
  return null
}

function slugOf(name: string, connectors: readonly string[]): string | null {
  return connectors.find(slug => nameOfSlug(slug) === name) ?? null
}

/** The apps a card reads, from the areas its metric comes from. */
export function appsForCategories(apps: AppSync[], categories: readonly string[]): AppSync[] {
  return apps.filter(app => app.categories.some(c => categories.includes(c)))
}

/** The worst state among the apps: failed › behind › syncing › up to date. A first sync doesn't count. */
export function dotOf(apps: AppSync[], online: boolean): DotState {
  if (!online) return 'offline'
  if (apps.length === 0) return 'none'
  if (apps.some(a => a.state === 'failed')) return 'failed'
  if (apps.some(a => a.state === 'behind')) return 'behind'
  // Nothing has synced yet (a brand-new workspace): there's no time to show, only the first sync running.
  if (apps.some(a => a.state === 'syncing') || apps.every(a => a.state === 'first_sync')) return 'syncing'
  return 'up_to_date'
}

function oldest(apps: AppSync[]): string | null {
  return apps.map(a => a.lastSyncedAt).filter((at): at is string => at !== null).sort()[0] ?? null
}

/** "9:42 am" today, "13 Nov, 9:42 am" before today, in the viewer's time zone. */
export function formatClock(iso: string, now: number, timeZone?: string): string {
  const date = new Date(iso)
  const day = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
  const time = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone }).format(date).replace(/\s?([ap])m$/i, ' $1m').toLowerCase()
  if (day(date) === day(new Date(now))) return time
  const dm = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone }).format(date)
  return `${dm}, ${time}`
}

/** "just now", "3 min ago", "2 h ago", "3 d ago". */
export function formatAgo(iso: string, now: number): string {
  const minutes = Math.floor((now - Date.parse(iso)) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours} h ago`
  return `${Math.floor(hours / 24)} d ago`
}

/** "3 hours", "2 days": how long since an app last synced, for the behind banner. */
export function formatDuration(ms: number): string {
  const hours = Math.max(1, Math.floor(ms / (60 * 60_000)))
  if (hours < 48) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`
  const days = Math.floor(hours / 24)
  return `${days} days`
}

/** The sync button's hover: "State • Time". */
export function hoverOf(apps: AppSync[], online: boolean, now: number, timeZone?: string): string {
  const dot = dotOf(apps, online)
  const at = (list: AppSync[]) => {
    const t = oldest(list)
    return t ? formatClock(t, now, timeZone) : null
  }
  switch (dot) {
    case 'none': return 'No apps on this board yet'
    case 'offline': { const t = at(apps); return t ? `Offline • Data from ${t}` : 'Offline' }
    case 'failed': { const t = at(apps.filter(a => a.state === 'failed')); return t ? `Sync failed • Data from ${t}` : 'Sync failed' }
    case 'behind': { const t = at(apps.filter(a => a.state === 'behind')); return t ? `Out of date • Data from ${t}` : 'Out of date' }
    case 'syncing': return 'Syncing…'
    case 'up_to_date': { const t = oldest(apps); return t ? `Up to date • Synced ${formatAgo(t, now)}` : 'Up to date' }
  }
}

/** A card dot's hover. Null when the card's apps are fine. */
export function cardHoverOf(apps: AppSync[], now: number, timeZone?: string): { state: 'failed' | 'behind'; text: string } | null {
  const failed = apps.filter(a => a.state === 'failed')
  if (failed.length > 0) { const t = oldest(failed); return { state: 'failed', text: t ? `Sync failed • Data from ${formatClock(t, now, timeZone)}` : 'Sync failed' } }
  const behind = apps.filter(a => a.state === 'behind')
  if (behind.length > 0) { const t = oldest(behind); return { state: 'behind', text: t ? `Out of date • Data from ${formatClock(t, now, timeZone)}` : 'Out of date' } }
  return null
}

/**
 * A Data sources row's status: "2 min ago", "3 h ago", "Sync failed", "Syncing…", "Still syncing…" (a sync you
 * started, after 10 min; `startedAt` is when), "First sync…", "Just now".
 */
export function rowStatusOf(app: AppSync, now: number, startedAt?: number): string {
  switch (app.state) {
    case 'failed': return 'Sync failed'
    case 'syncing': return startedAt !== undefined && now - startedAt > LONG_SYNC_MS ? 'Still syncing…' : 'Syncing…'
    case 'first_sync': return 'First sync…'
    default: {
      if (!app.lastSyncedAt) return 'First sync…'
      const ago = formatAgo(app.lastSyncedAt, now)
      return ago === 'just now' ? 'Just now' : ago
    }
  }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Data sources' footer is a "Syncing …" line (it gets a spinner): nothing failed or behind, and an app syncs. */
export function footerSyncingOf(apps: AppSync[]): boolean {
  return !apps.some(a => a.state === 'failed' || a.state === 'behind') && apps.some(unsettledState)
}

/**
 * Data sources' footer: counts, never names. A sync you started that runs past 10 min says since when
 * ("Syncing since 9:58 am"); syncs the server started on its own don't report a start time yet.
 */
export function footerOf(apps: AppSync[], now: number, opts: { startedAt?: number; timeZone?: string } = {}): string {
  const failed = apps.filter(a => a.state === 'failed').length
  const behind = apps.filter(a => a.state === 'behind').length
  const syncing = apps.filter(unsettledState).length
  if (failed > 0 && behind > 0) return `${failed} failed • ${behind} behind`
  if (failed > 0) return `${plural(failed, 'app', 'apps')} failed`
  if (behind > 0) return `${plural(behind, 'app', 'apps')} behind`
  if (syncing > 0 && opts.startedAt !== undefined && now - opts.startedAt > LONG_SYNC_MS) {
    return `Syncing since ${formatClock(new Date(opts.startedAt).toISOString(), now, opts.timeZone)}`
  }
  if (syncing > 0) return `Syncing ${plural(syncing, 'app', 'apps')}…`
  const t = oldest(apps)
  if (!t) return ''
  const ago = formatAgo(t, now)
  return ago === 'just now' ? 'Synced just now' : `Synced ${ago}`
}

/** "Meta Ads", "Shopify & Meta Ads", "Meta Ads & 2 more apps": the app with the problem longest first. */
function namesSegments(apps: AppSync[]): Segment[] {
  const sorted = [...apps].sort((a, b) => (a.lastSyncedAt ?? '').localeCompare(b.lastSyncedAt ?? ''))
  if (sorted.length === 1) return [{ text: sorted[0].name, app: true }]
  if (sorted.length === 2) return [{ text: sorted[0].name, app: true }, { text: ' & ' }, { text: sorted[1].name, app: true }]
  const rest = sorted.slice(1).map(a => a.name)
  return [{ text: sorted[0].name, app: true }, { text: ' & ' }, { text: `${rest.length} more apps`, app: true, more: rest }]
}

/**
 * The board's banners: one per kind of problem, failed above behind, so never more than two.
 * Members can't reconnect, so their red banner says who can instead of offering the action.
 */
export function bannersOf(apps: AppSync[], opts: { role: ReconnectRole; now: number; timeZone?: string }): Banner[] {
  const banners: Banner[] = []
  const failed = apps.filter(a => a.state === 'failed')
  const behind = apps.filter(a => a.state === 'behind')
  // Each app's last sync is in the signature, so an app that recovers and later breaks again raises its banner
  // again, even on a board where it was closed before.
  const sig = (kind: string, list: AppSync[]) => `${kind}:${list.map(a => `${a.name}@${a.lastSyncedAt ?? ''}`).sort().join(',')}`
  // A member is told who can reconnect; until the role is known, nothing is said either way.
  const member = opts.role === 'member'
  if (failed.length > 0) {
    const segments = namesSegments(failed)
    if (failed.length === 1) {
      const t = failed[0].lastSyncedAt
      segments.push({ text: t ? ` sync failed. Showing data from ${formatClock(t, opts.now, opts.timeZone)}.` : ' sync failed.' })
      if (member) segments.push({ text: ' Only an admin can reconnect ' }, { text: failed[0].name, app: true }, { text: '.' })
    } else {
      segments.push({ text: ' failed to sync. Showing their last synced data.' })
      if (member) segments.push({ text: ' Only an admin can reconnect these apps.' })
    }
    banners.push({ kind: 'failed', apps: failed.map(a => a.name), segments, signature: sig('failed', failed) })
  }
  if (behind.length > 0) {
    const segments = namesSegments(behind)
    // One app: how long exactly. Several: the shortest of their gaps, "in over 2 days".
    const ages = behind.map(a => (a.lastSyncedAt ? opts.now - Date.parse(a.lastSyncedAt) : 0))
    const text = behind.length === 1
      ? ` hasn’t synced in ${formatDuration(ages[0])}. Some data may be out of date.`
      : ` haven’t synced in over ${formatDuration(Math.min(...ages))}. Some data may be out of date.`
    segments.push({ text })
    banners.push({ kind: 'behind', apps: behind.map(a => a.name), segments, signature: sig('behind', behind) })
  }
  return banners
}

/** The apps that failed after a refresh but hadn't before it: what the error toast names. */
export function newlyFailed(before: AppSync[], after: AppSync[]): AppSync[] {
  const was = new Set(before.filter(a => a.state === 'failed').map(a => a.name))
  return after.filter(a => a.state === 'failed' && !was.has(a.name))
}

/** The error toast's one line: "Meta Ads sync failed • Other apps synced". */
export function failureToastOf(failed: AppSync[], all: AppSync[]): Segment[] {
  const others = all.length > failed.length
  const names = namesSegments(failed)
  return [...names, { text: ' sync failed' }, ...(others ? [{ text: ' • Other apps synced', muted: true }] : [])]
}

/**
 * Something you started, shown on the board until it settles (req. 18, 21): a Sync from a banner or a row, or a
 * Reconnect (watched from the moment you leave for Connectors until the app comes back).
 */
export interface Activity {
  kind: 'sync' | 'reconnect'
  apps: string[]
  startedAt: number
  /** The request is still out. */
  pending: boolean
  /** Each app's last sync when you acted: "synced" means it moved on from this. */
  baseline: Record<string, string | null>
}

/** What you started, until it's forgotten: an hour for a sync (when an attempt stops, req. 8), half an hour for a
 * Reconnect. The cap holds even while a request is still out, so a hung request can't block the board for good. */
export function isLive(activity: Activity | null, now: number): activity is Activity {
  if (!activity) return false
  return now - activity.startedAt < (activity.kind === 'sync' ? SYNC_WATCH_MS : RECONNECT_WATCH_MS)
}

/** Each app's last sync right now, to keep as an activity's baseline. */
export function baselineOf(apps: AppSync[], names: string[]): Record<string, string | null> {
  return Object.fromEntries(names.map(name => [name, apps.find(a => a.name === name)?.lastSyncedAt ?? null]))
}

/**
 * The app synced after you acted: up to date, its last sync moved on from the one it had when you acted, and that
 * sync is from then or later (a minute's leeway for clocks). An older sync the board hadn't seen yet doesn't count.
 */
export function syncedAfter(app: AppSync, baseline: Record<string, string | null>, since: number): boolean {
  if (app.state !== 'up_to_date' || app.lastSyncedAt === null) return false
  const at = Date.parse(app.lastSyncedAt)
  const before = baseline[app.name] ?? null
  return (before === null || at > Date.parse(before)) && at >= since - 60_000
}

/** The apps an activity covers. A Reconnect leaves out the apps still failed: each app that comes back counts. */
function appsIn(activity: Activity, apps: AppSync[]): AppSync[] {
  const mine = apps.filter(a => activity.apps.includes(a.name))
  return activity.kind === 'reconnect' ? mine.filter(a => a.state !== 'failed') : mine
}

/** The apps an activity is still working on: all of them while the request is out, then those still syncing. */
export function busyAppsOf(activity: Activity | null, apps: AppSync[], now: number): string[] {
  if (!isLive(activity, now)) return []
  const mine = appsIn(activity, apps)
  if (activity.pending) return mine.map(a => a.name)
  return mine.filter(unsettledState).map(a => a.name)
}

/**
 * The banner for what you started:
 * - Sync: grey "Syncing Meta Ads. Cards using this app refresh when done." while it runs ("… is taking longer than
 *   usual." after 10 min), then green "Meta Ads synced just now. Data is up to date." once each app's last sync
 *   moved on from the one it had at the click. If it ends any other way, no banner of its own: the app's problem
 *   banner says how it stands.
 * - Reconnect: nothing for an app still failed (its red banner stays); for each app that came back, grey "Meta Ads
 *   reconnected. Syncing the latest data." and then green "Meta Ads reconnected and synced. Data is up to date.".
 */
export function activityBannerOf(activity: Activity | null, apps: AppSync[], now: number): Banner | null {
  if (!isLive(activity, now)) return null
  const mine = appsIn(activity, apps)
  if (mine.length === 0) return null
  const names = namesSegments(mine)
  const running = activity.pending || mine.some(unsettledState)
  const list = mine.map(a => a.name)
  // The apps are in it: closing one app's grey banner doesn't hide a later app's from the same Reconnect.
  const signature = `${activity.kind}:${activity.startedAt}:${list.join(',')}:${running ? 'running' : 'done'}`
  const fine = mine.every(a => syncedAfter(a, activity.baseline, activity.startedAt))
  const banner = (kind: 'syncing' | 'synced', segments: Segment[]): Banner => ({ kind, apps: list, segments, signature, source: activity.kind })
  if (activity.kind === 'reconnect') {
    if (running) return banner('syncing', [...names, { text: ' reconnected. Syncing the latest data.' }])
    return fine ? banner('synced', [...names, { text: ' reconnected and synced. Data is up to date.' }]) : null
  }
  const these = mine.length === 1 ? 'this app' : 'these apps'
  if (running) {
    return banner('syncing', now - activity.startedAt > LONG_SYNC_MS
      ? [...names, { text: ` ${mine.length === 1 ? 'is' : 'are'} taking longer than usual. Cards using ${these} refresh when done.` }]
      : [{ text: 'Syncing ' }, ...names, { text: `. Cards using ${these} refresh when done.` }])
  }
  return fine ? banner('synced', [...names, { text: ' synced just now. Data is up to date.' }]) : null
}

/**
 * The board's banners in order: red, then what you started, then amber. Offline there are none: the bar above the
 * window replaces them (req. 23).
 */
export function visibleBannersOf(online: boolean, problems: Banner[], mine: (Banner | null)[]): Banner[] {
  if (!online) return []
  const own = mine.filter((b): b is Banner => b !== null)
  return [...problems.filter(b => b.kind === 'failed'), ...own, ...problems.filter(b => b.kind === 'behind')]
}

/**
 * A problem banner stays closed while it covers no app beyond the ones closed with it, at the same last sync:
 * an app leaving it (synced, syncing, recovered) doesn't bring it back. It comes back when another app joins,
 * an app goes from behind to failed (another kind), or an app recovers and breaks again (a new last sync).
 * What you started is closed by its exact signature.
 */
export function isClosed(banner: Banner, closed: Iterable<string>): boolean {
  const split = (signature: string) => {
    const i = signature.indexOf(':')
    return { kind: signature.slice(0, i), entries: signature.slice(i + 1).split(',') }
  }
  const mine = split(banner.signature)
  for (const signature of closed) {
    if (signature === banner.signature) return true
    if (banner.kind !== 'failed' && banner.kind !== 'behind') continue
    const other = split(signature)
    if (other.kind === mine.kind && mine.entries.every(e => other.entries.includes(e))) return true
  }
  return false
}

/** Why a resting Sync or Refresh is greyed: "Synced just now" only when an app really synced. */
export function restHintOf(synced: boolean, verb: 'Sync' | 'Refresh'): string {
  return `${synced ? 'Synced' : 'Checked'} just now • ${verb} again in a minute`
}
