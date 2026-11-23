// Sync rules as pure functions (docs-v2/dashboard/04-sync-rules.md). No React, no timers: the
// store (sync-store.ts) owns time and calls these to read the state.

import type { MetricSource } from '../types'
import { APP_ORDER, SOURCE_NAMES } from '../sources'

export type AppId = MetricSource

const MIN = 60_000
const HOUR = 60 * MIN

/** Behind = no sync in over twice the usual interval (1 h in the dummy data). */
export const BEHIND_AFTER = 2 * HOUR
/** A sync running this long says "Still syncing…" (SY-31). */
export const STILL_SYNCING_AFTER = 10 * MIN
/** …and stops after this long; the app goes back to its last state (SY-31). */
export const GIVE_UP_AFTER = HOUR
/** One minute between syncs (SY-11). */
export const COOLDOWN = MIN

export type SyncKind = 'refresh' | 'sync' | 'reconnect' | 'first'

export interface AppSync {
  /** When it last synced successfully; null before its first sync. */
  syncedAt: number | null
  /** Its last sync failed; numbers are from `syncedAt`. */
  failed: boolean
  syncing: { startedAt: number; kind: SyncKind } | null
}

export type AppState = 'fresh' | 'behind' | 'failed' | 'syncing' | 'first'

export function appState(a: AppSync, now: number): AppState {
  if (a.syncing) return a.syncing.kind === 'first' ? 'first' : 'syncing'
  if (a.failed) return 'failed'
  if (a.syncedAt != null && now - a.syncedAt > BEHIND_AFTER) return 'behind'
  return 'fresh'
}

/** What the sync button shows (SY-2): worst state first; first syncs don't count. */
export type ButtonState = 'none' | 'offline' | 'failed' | 'behind' | 'syncing' | 'fresh'

export function buttonState(ids: AppId[], apps: Record<AppId, AppSync>, now: number, online: boolean): ButtonState {
  if (!ids.length) return 'none'
  if (!online) return 'offline'
  const states = ids.map((id) => appState(apps[id], now)).filter((s) => s !== 'first')
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

const oldest = (ids: AppId[], apps: Record<AppId, AppSync>) =>
  Math.min(...ids.map((id) => apps[id].syncedAt ?? Infinity))

const inState = (ids: AppId[], apps: Record<AppId, AppSync>, now: number, state: AppState) =>
  ids.filter((id) => appState(apps[id], now) === state)

/** The sync button's hover (SY-3). */
export function hoverText(ids: AppId[], apps: Record<AppId, AppSync>, now: number, online: boolean, offlineSince: number | null): string {
  const state = buttonState(ids, apps, now, online)
  switch (state) {
    case 'none': return 'No apps on this board yet'
    case 'offline': return `Offline • Data from ${clock(offlineSince ?? now)}`
    case 'failed': return `Sync failed • Data from ${clock(oldest(inState(ids, apps, now, 'failed'), apps))}`
    case 'behind': return `Out of date • Data from ${clock(oldest(inState(ids, apps, now, 'behind'), apps))}`
    case 'syncing': return 'Syncing…'
    case 'fresh': {
      const synced = ids.filter((id) => appState(apps[id], now) !== 'first')
      return `Up to date • Synced ${ago(oldest(synced, apps), now).toLowerCase()}`
    }
  }
}

/**
 * Data sources order (SY-6): failed, then behind (longest first), then the apps the board uses most
 * (ties in the workspace's order).
 * `uses` counts the board's cards per app.
 */
export function sortApps(ids: AppId[], apps: Record<AppId, AppSync>, now: number, uses: Partial<Record<AppId, number>>): AppId[] {
  const rank = (id: AppId) => ({ failed: 0, behind: 1 } as Partial<Record<AppState, number>>)[appState(apps[id], now)] ?? 2
  return [...ids].sort((a, b) =>
    rank(a) - rank(b) ||
    (rank(a) < 2 ? (apps[a].syncedAt ?? 0) - (apps[b].syncedAt ?? 0) : 0) ||
    (uses[b] ?? 0) - (uses[a] ?? 0) ||
    APP_ORDER.indexOf(a) - APP_ORDER.indexOf(b))
}

export interface FooterText { text: string; tone: 'muted' | 'behind' | 'failed' }

const apps1 = (n: number) => `${n} app${n === 1 ? '' : 's'}`

/** The summary right of Refresh (SY-8). */
export function footerText(ids: AppId[], apps: Record<AppId, AppSync>, now: number, refreshRunning: boolean): FooterText {
  const counted = ids.filter((id) => appState(apps[id], now) !== 'first')
  const syncing = inState(counted, apps, now, 'syncing')
  if (syncing.length) {
    const started = Math.min(...syncing.map((id) => apps[id].syncing!.startedAt))
    if (now - started >= STILL_SYNCING_AFTER) return { text: `Syncing since ${clock(started)}`, tone: 'muted' }
    if (refreshRunning && syncing.length === counted.length) return { text: 'Syncing…', tone: 'muted' }
    return { text: `Syncing ${apps1(syncing.length)}…`, tone: 'muted' }
  }
  const failed = inState(counted, apps, now, 'failed').length
  const behind = inState(counted, apps, now, 'behind').length
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
  /** Syncing banners: after Reconnect, or running long (SY-18). */
  reconnect?: boolean
  long?: boolean
}

/** The board's banners (SY-14 – SY-18): red, then amber, then the grey syncing one. */
export function banners(ids: AppId[], apps: Record<AppId, AppSync>, now: number): Banner[] {
  const byAge = (list: AppId[]) => [...list].sort((a, b) => (apps[a].syncedAt ?? 0) - (apps[b].syncedAt ?? 0))
  const out: Banner[] = []
  const failed = byAge(inState(ids, apps, now, 'failed'))
  const behind = byAge(inState(ids, apps, now, 'behind'))
  if (failed.length) out.push({ kind: 'failed', apps: failed, key: `failed:${failed.join(',')}` })
  if (behind.length) out.push({ kind: 'behind', apps: behind, key: `behind:${behind.join(',')}` })
  // Refresh and first syncs don't show a banner; Sync and Reconnect do.
  const syncing = ids.filter((id) => apps[id].syncing && (apps[id].syncing!.kind === 'sync' || apps[id].syncing!.kind === 'reconnect'))
  if (syncing.length) {
    const started = Math.min(...syncing.map((id) => apps[id].syncing!.startedAt))
    out.push({
      kind: 'syncing',
      apps: syncing,
      key: `syncing:${syncing.join(',')}:${started}`,
      reconnect: syncing.some((id) => apps[id].syncing!.kind === 'reconnect'),
      long: now - started >= STILL_SYNCING_AFTER,
    })
  }
  return out
}

/** "Meta Ads", "Shopify & Meta Ads", or "Meta Ads & 2 more apps" + the rest for the tooltip. */
export function appNames(ids: AppId[]): { lead: string; more: string | null; rest: string } {
  const names = ids.map((id) => SOURCE_NAMES[id])
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
