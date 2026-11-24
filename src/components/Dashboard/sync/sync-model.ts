// Sync rules as pure functions (docs-v2/dashboard/04-sync-rules.md). The warehouse decides each
// app's state (behind, failed, waiting on a reconnect…); these read it for the button, list, banners.

import type { ConnectionState } from '@/lib/api/warehouse'
import type { AppId } from '../types'

const MIN = 60_000
const HOUR = 60 * MIN

const time = (at: string | null) => (at === null ? null : new Date(at).getTime())

/** One app feeding the open board, as the warehouse reports it. */
export class AppSync {
  readonly id: AppId
  readonly name: string
  readonly slug: string
  readonly status: ConnectionState['state']
  /** What the provider said, when it failed or refused the sign-in. */
  readonly error: string | null
  /** The oldest of its feeds' last syncs; null until each has synced once. */
  readonly syncedAt: number | null
  readonly syncingSince: number | null
  /** When Sync does something again (SY-11). */
  readonly syncableAt: number | null
  /** The viewer owns the account, so Reconnect is theirs (SY-25). */
  readonly yours: boolean

  constructor(wire: ConnectionState) {
    this.id = wire.connectionId
    this.name = wire.name
    this.slug = wire.connectorSlug
    this.status = wire.state
    this.error = wire.error
    this.syncedAt = time(wire.lastSyncedAt)
    this.syncingSince = time(wire.syncingSince)
    this.syncableAt = time(wire.syncableAt)
    this.yours = wire.yours
  }

  get state(): AppState {
    switch (this.status) {
      case 'first_sync': return 'first'
      case 'syncing':
      case 'slow': return 'syncing'
      case 'failed':
      case 'reconnect': return 'failed'
      case 'behind': return 'behind'
      case 'up_to_date': return 'fresh'
    }
  }

  /** The provider refused the sign-in: only Reconnect helps. */
  get needsReconnect(): boolean {
    return this.status === 'reconnect'
  }

  /** A sync running much longer than usual (SY-31). */
  get slow(): boolean {
    return this.status === 'slow'
  }
}

export type AppState = 'fresh' | 'behind' | 'failed' | 'syncing' | 'first'

/** A sync this viewer started, for the banners and toasts it gets (SY-18, SY-29). */
export type SyncKind = 'refresh' | 'sync'

/** What the sync button shows (SY-2): worst state first; first syncs don't count. */
export type ButtonState = 'none' | 'offline' | 'failed' | 'behind' | 'syncing' | 'fresh'

type Apps = Record<AppId, AppSync>

const known = (ids: AppId[], apps: Apps) => ids.filter((id) => apps[id])

export function buttonState(ids: AppId[], apps: Apps, online: boolean): ButtonState {
  const here = known(ids, apps)
  if (!here.length) return 'none'
  if (!online) return 'offline'
  const states = here.map((id) => apps[id].state).filter((s) => s !== 'first')
  if (!states.length) return 'syncing'
  if (states.includes('failed')) return 'failed'
  if (states.includes('behind')) return 'behind'
  if (states.includes('syncing')) return 'syncing'
  return 'fresh'
}

/** "9:42 am" in the viewer's time zone. */
export function clock(at: number): string {
  return new Date(at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(/\s+/g, ' ').toLowerCase()
}

/** "Just now", "3 min ago", "3 h ago". */
export function ago(at: number, now: number): string {
  const min = Math.floor((now - at) / MIN)
  if (min < 1) return 'Just now'
  if (min < 60) return `${min} min ago`
  return `${Math.floor(min / 60)} h ago`
}

const oldest = (ids: AppId[], apps: Apps) => Math.min(...ids.map((id) => apps[id].syncedAt ?? Infinity))

const inState = (ids: AppId[], apps: Apps, state: AppState) => known(ids, apps).filter((id) => apps[id].state === state)

/** "9:42 am", or "its first sync" when nothing has landed. */
const since = (at: number) => (Number.isFinite(at) ? clock(at) : 'its first sync')

/** The sync button's hover (SY-3). */
export function hoverText(ids: AppId[], apps: Apps, now: number, online: boolean, offlineSince: number | null): string {
  switch (buttonState(ids, apps, online)) {
    case 'none': return 'No apps on this board yet'
    case 'offline': return `Offline • Data from ${clock(offlineSince ?? now)}`
    case 'failed': return `Sync failed • Data from ${since(oldest(inState(ids, apps, 'failed'), apps))}`
    case 'behind': return `Out of date • Data from ${since(oldest(inState(ids, apps, 'behind'), apps))}`
    case 'syncing': return 'Syncing…'
    case 'fresh': {
      const synced = known(ids, apps).filter((id) => apps[id].state !== 'first')
      return `Up to date • Synced ${ago(oldest(synced, apps), now).toLowerCase()}`
    }
  }
}

/**
 * Data sources order (SY-6): failed, then behind (longest first), then the apps the board uses most,
 * ties in workspace order (`rank`). `uses` counts the board's cards per app.
 */
export function sortApps(ids: AppId[], apps: Apps, uses: Partial<Record<AppId, number>>, rank: (id: AppId) => number): AppId[] {
  const level = (id: AppId) => ({ failed: 0, behind: 1 } as Partial<Record<AppState, number>>)[apps[id].state] ?? 2
  return known(ids, apps).sort((a, b) =>
    level(a) - level(b) ||
    (level(a) < 2 ? (apps[a].syncedAt ?? 0) - (apps[b].syncedAt ?? 0) : 0) ||
    (uses[b] ?? 0) - (uses[a] ?? 0) ||
    rank(a) - rank(b))
}

export interface FooterText { text: string; tone: 'muted' | 'behind' | 'failed' }

const apps1 = (n: number) => `${n} app${n === 1 ? '' : 's'}`

/** The summary right of Refresh (SY-8). */
export function footerText(ids: AppId[], apps: Apps, now: number, refreshRunning: boolean): FooterText {
  const counted = known(ids, apps).filter((id) => apps[id].state !== 'first')
  const syncing = inState(counted, apps, 'syncing')
  if (syncing.length) {
    if (syncing.some((id) => apps[id].slow)) {
      const started = Math.min(...syncing.map((id) => apps[id].syncingSince ?? now))
      return { text: `Syncing since ${clock(started)}`, tone: 'muted' }
    }
    if (refreshRunning && syncing.length === counted.length) return { text: 'Syncing…', tone: 'muted' }
    return { text: `Syncing ${apps1(syncing.length)}…`, tone: 'muted' }
  }
  const failed = inState(counted, apps, 'failed').length
  const behind = inState(counted, apps, 'behind').length
  if (failed && behind) return { text: `${failed} failed • ${behind} behind`, tone: 'failed' }
  if (failed) return { text: `${apps1(failed)} failed`, tone: 'failed' }
  if (behind) return { text: `${apps1(behind)} behind`, tone: 'behind' }
  if (!counted.length) return { text: '', tone: 'muted' }
  return { text: `Synced ${ago(oldest(counted, apps), now).toLowerCase()}`, tone: 'muted' }
}

export type BannerKind = 'failed' | 'behind' | 'syncing'

export interface Banner {
  kind: BannerKind
  /** Longest-standing first: the banner names the first (SY-17). */
  apps: AppId[]
  /** × hides a banner until this changes (SY-20). */
  key: string
  /** A syncing banner running long (SY-18). */
  long?: boolean
}

/** The board's banners (SY-14 – SY-18): red, then amber, then the grey one for a Sync this viewer started. */
export function banners(ids: AppId[], apps: Apps, started: Partial<Record<AppId, SyncKind>>): Banner[] {
  const byAge = (list: AppId[]) => [...list].sort((a, b) => (apps[a].syncedAt ?? 0) - (apps[b].syncedAt ?? 0))
  const out: Banner[] = []
  const failed = byAge(inState(ids, apps, 'failed'))
  const behind = byAge(inState(ids, apps, 'behind'))
  if (failed.length) out.push({ kind: 'failed', apps: failed, key: `failed:${failed.join(',')}` })
  if (behind.length) out.push({ kind: 'behind', apps: behind, key: `behind:${behind.join(',')}` })
  // Refresh and scheduled syncs don't show a banner; a Sync you pressed does.
  const syncing = inState(ids, apps, 'syncing').filter((id) => started[id] === 'sync')
  if (syncing.length) {
    const startedAt = Math.min(...syncing.map((id) => apps[id].syncingSince ?? 0))
    out.push({ kind: 'syncing', apps: syncing, key: `syncing:${syncing.join(',')}:${startedAt}`, long: syncing.some((id) => apps[id].slow) })
  }
  return out
}

/** "Meta Ads", "Shopify & Meta Ads", or "Meta Ads & 2 more apps" + the rest for the tooltip. */
export function appNames(names: string[]): { lead: string; more: string | null; rest: string } {
  if (names.length <= 2) return { lead: names.join(' & '), more: null, rest: '' }
  const rest = names.slice(1)
  return {
    lead: names[0],
    more: `${rest.length} more apps`,
    rest: rest.length === 2 ? rest.join(' & ') : `${rest.slice(0, -1).join(', ')} & ${rest[rest.length - 1]}`,
  }
}

/** Whole hours since the app last synced, for the one-app behind banner. */
export function hoursSince(at: number | null, now: number): number {
  return at == null ? 0 : Math.floor((now - at) / HOUR)
}
