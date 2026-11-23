'use client'

// The workspace's sync state: a small external store, so a sync carries on when you change boards
// (SY-30) and the offline bar above the whole app can read it (SY-33). Components read it through
// useSyncSnapshot (useSyncExternalStore), never directly (React Compiler).
//
// Stand-in until the back end exists: syncs are timers. A sync takes SYNC_MS; `?sync=<scenario>`
// starts in a drawn state (04-sync-rules.md §9).

import { useSyncExternalStore } from 'react'
import { APP_ORDER } from '../sources'
import { COOLDOWN, GIVE_UP_AFTER, appState, type AppId, type AppSync, type SyncKind } from './sync-model'

export const SYNC_MS = 2_500
const FIRST_SYNC_MS = 6_000
const BACK_ONLINE_MS = 3_000
/** A finished Sync is shown as a green banner on boards opened within this long (SY-19). */
const RECENT_MS = 10_000

const MIN = 60_000
const HOUR = 60 * MIN

export const ALL_APPS: AppId[] = APP_ORDER

/** A Sync or Reconnect that just ended well, for the green banner (SY-19). */
export interface Recent { id: number; apps: AppId[]; kind: 'sync' | 'reconnect'; at: number }

/** How a sync ended, for the toasts (SY-29, SY-30). */
export interface SyncEnd {
  kind: Exclude<SyncKind, 'first'>
  ok: AppId[]
  failed: AppId[]
  /** The board it was started on (Sync / Reconnect). */
  startedOn: string | null
}

export interface SyncSnapshot {
  /** When the snapshot was taken; the store ticks every 10 s while anyone listens. */
  now: number
  apps: Record<AppId, AppSync>
  online: boolean
  offlineSince: number | null
  /** Set for 3 s after the connection comes back (SY-34). */
  backOnlineAt: number | null
  refreshRunning: boolean
  /** Refresh and Sync wait until then (SY-11). */
  cooldownUntil: number
  recent: Recent[]
  isAdmin: boolean
  /** Banners closed with ×, as `boardId|banner key` (SY-20). */
  dismissed: string[]
  /** Apps that aren't connected, and Connect's progress (06 AC-8, AC-9). Connected apps aren't listed. */
  connections: Partial<Record<AppId, Connection>>
}

/** An app's connection while it isn't simply connected: off, connecting, just connected, failed. */
export type Connection = 'off' | 'connecting' | 'connected' | 'failed'

/** Apps not connected in the dummy workspace (as drawn in the Add cards picker). */
const NOT_CONNECTED: AppId[] = ['google-analytics', 'zendesk']
const CONNECT_MS = 2_500
/** A just-connected app's first sync (stand-in). */
const FIRST_SYNC_AFTER_CONNECT_MS = 30_000

// Minutes since each app last synced, all up to date (Figma "Up to date · many apps").
const FRESH_MINUTES: Record<AppId, number> = {
  shopify: 2, meta: 3, 'google-ads': 3, tiktok: 4, 'google-analytics': 4, pinterest: 5,
  stripe: 6, paypal: 6, zendesk: 8, reddit: 9, hubspot: 11, shipstation: 0,
}

function freshApps(now: number): Record<AppId, AppSync> {
  const apps = Object.fromEntries(ALL_APPS.map((id) => [id, { syncedAt: now - FRESH_MINUTES[id] * MIN, failed: false, syncing: null }])) as Record<AppId, AppSync>
  // ShipStation was connected this morning and its first sync is still running (05 CR-22: the
  // Contribution margin board's Shipping cost reads "No data yet").
  apps.shipstation = { syncedAt: null, failed: false, syncing: { startedAt: now - 2 * HOUR, kind: 'first' } }
  for (const id of NOT_CONNECTED) apps[id] = { syncedAt: null, failed: false, syncing: null }
  return apps
}

const offApps = () => Object.fromEntries(NOT_CONNECTED.map((id) => [id, 'off'])) as Partial<Record<AppId, Connection>>

/** Whether an app is connected (just-connected counts). */
export const isConnected = (s: SyncSnapshot, id: AppId) => {
  const c = s.connections[id]
  return c === undefined || c === 'connected'
}

let failConnectOnce = false

/**
 * Connect an app from the picker (06 AC-9). Stand-in: no sign-in window; it connects after 2.5 s
 * (or fails once with `?connect=fail`), then runs its first sync.
 */
export function connectApp(id: AppId) {
  const c = snap.connections[id]
  if (c !== 'off' && c !== 'failed') return
  set({ connections: { ...snap.connections, [id]: 'connecting' } })
  window.setTimeout(() => {
    if (failConnectOnce) {
      failConnectOnce = false
      set({ connections: { ...snap.connections, [id]: 'failed' } })
      return
    }
    const startedAt = Date.now()
    set({ connections: { ...snap.connections, [id]: 'connected' }, apps: { ...snap.apps, [id]: { syncedAt: null, failed: false, syncing: { startedAt, kind: 'first' } } } })
    window.setTimeout(() => {
      if (snap.apps[id].syncing?.startedAt === startedAt) setApp(id, { syncedAt: Date.now(), syncing: null })
    }, FIRST_SYNC_AFTER_CONNECT_MS)
  }, CONNECT_MS)
}

function initial(now: number): SyncSnapshot {
  return { now, apps: freshApps(now), online: true, offlineSince: null, backOnlineAt: null, refreshRunning: false, cooldownUntil: 0, recent: [], isAdmin: true, dismissed: [], connections: offApps() }
}

// The server render and the first client render share this snapshot; the times in it only show
// on hover or in Data sources, after hydration.
const SERVER = initial(Date.now())
let snap: SyncSnapshot = SERVER
const listeners = new Set<() => void>()
const endListeners = new Set<(e: SyncEnd) => void>()
let seededWith: string | null = null
const failNext = new Set<AppId>()
let recentId = 0

function set(next: Partial<SyncSnapshot>) {
  snap = { ...snap, ...next, now: Date.now() }
  listeners.forEach((l) => l())
}
const setApp = (id: AppId, patch: Partial<AppSync>) => set({ apps: { ...snap.apps, [id]: { ...snap.apps[id], ...patch } } })

let ticker: number | undefined
function subscribe(l: () => void) {
  listeners.add(l)
  ensureOnlineListener()
  ticker ??= window.setInterval(() => set({}), 10_000)
  return () => {
    listeners.delete(l)
    if (!listeners.size) { window.clearInterval(ticker); ticker = undefined }
  }
}

export function useSyncSnapshot(): SyncSnapshot {
  return useSyncExternalStore(subscribe, () => snap, () => SERVER)
}

/** The current state, for event handlers (render reads go through useSyncSnapshot). */
export function getSyncSnapshot(): SyncSnapshot {
  return snap
}

/** Hear how each sync ends (toasts, SY-29 / SY-30). */
export function onSyncEnd(l: (e: SyncEnd) => void): () => void {
  endListeners.add(l)
  return () => endListeners.delete(l)
}

// ── Online / offline (SY-33, SY-34) ────────────────────────────────────────────

let onlineListening = false
function ensureOnlineListener() {
  if (onlineListening || typeof window === 'undefined') return
  onlineListening = true
  const update = () => {
    const online = navigator.onLine
    if (online === snap.online) return
    if (online) {
      const at = Date.now()
      set({ online: true, offlineSince: null, backOnlineAt: at })
      window.setTimeout(() => { if (snap.backOnlineAt === at) set({ backOnlineAt: null }) }, BACK_ONLINE_MS)
    } else {
      set({ online: false, offlineSince: Date.now(), backOnlineAt: null })
    }
  }
  window.addEventListener('online', update)
  window.addEventListener('offline', update)
  update()
}

// ── Syncing ─────────────────────────────────────────────────────────────────────

/** Any sync running (first syncs aside: Refresh stays on during them, SY-27). */
export function isBusy(s: SyncSnapshot): boolean {
  return s.refreshRunning || Object.values(s.apps).some((a) => a.syncing && a.syncing.kind !== 'first')
}

/** Why Refresh and Sync are greyed, or null when they can run (SY-9, SY-11, SY-12, SY-33). */
export function blockedReason(s: SyncSnapshot, now: number): 'offline' | 'busy' | 'cooldown' | null {
  if (!s.online) return 'offline'
  if (isBusy(s)) return 'busy'
  if (now < s.cooldownUntil) return 'cooldown'
  return null
}

function finish(ids: AppId[], kind: Exclude<SyncKind, 'first'>, startedOn: string | null) {
  const now = Date.now()
  const ok: AppId[] = []
  const failed: AppId[] = []
  const apps = { ...snap.apps }
  for (const id of ids) {
    if (!apps[id].syncing) continue // stopped meanwhile (SY-31)
    if (failNext.has(id)) {
      failNext.delete(id)
      apps[id] = { ...apps[id], failed: true, syncing: null }
      failed.push(id)
    } else {
      apps[id] = { syncedAt: now, failed: false, syncing: null }
      ok.push(id)
    }
  }
  const recent = (kind === 'sync' || kind === 'reconnect') && ok.length
    ? [...snap.recent.filter((r) => now - r.at < RECENT_MS), { id: ++recentId, apps: ok, kind, at: now }]
    : snap.recent
  set({ apps, refreshRunning: kind === 'refresh' ? false : snap.refreshRunning, cooldownUntil: now + COOLDOWN, recent })
  const end: SyncEnd = { kind, ok, failed, startedOn }
  endListeners.forEach((l) => l(end))
}

function start(ids: AppId[], kind: Exclude<SyncKind, 'first'>, startedOn: string | null) {
  const startedAt = Date.now()
  const apps = { ...snap.apps }
  for (const id of ids) apps[id] = { ...apps[id], syncing: { startedAt, kind } }
  set({ apps, refreshRunning: kind === 'refresh' || snap.refreshRunning })
  window.setTimeout(() => finish(ids, kind, startedOn), SYNC_MS)
}

/** Refresh: every app in the workspace, skipping apps to reconnect and first syncs (SY-9, SY-32). */
export function refreshAll(): boolean {
  if (blockedReason(snap, Date.now())) return false
  const ids = ALL_APPS.filter((id) => {
    const a = snap.apps[id]
    return !a.failed && !a.syncing && isConnected(snap, id)
  })
  if (!ids.length) return false
  start(ids, 'refresh', null)
  return true
}

/** Sync on a banner or a row: only the given apps that are behind (SY-16). */
export function syncApps(ids: AppId[], boardId: string): boolean {
  const now = Date.now()
  if (blockedReason(snap, now)) return false
  const behind = ids.filter((id) => appState(snap.apps[id], now) === 'behind')
  if (!behind.length) return false
  start(behind, 'sync', boardId)
  return true
}

/**
 * Reconnect (SY-26). Stand-in: the Connectors hand-off and sign-in aren't built, so this goes
 * straight to "back on the board, syncing".
 */
export function reconnectApps(ids: AppId[], boardId: string): boolean {
  if (!snap.isAdmin || !snap.online || isBusy(snap)) return false
  const failed = ids.filter((id) => snap.apps[id].failed)
  if (!failed.length) return false
  start(failed, 'reconnect', boardId)
  return true
}

/** × on a banner: hidden on this board until its key changes (SY-20). */
export function dismissBanner(boardId: string, key: string) {
  set({ dismissed: [...snap.dismissed, `${boardId}|${key}`] })
}

export function dismissRecent(id: number) {
  set({ recent: snap.recent.filter((r) => r.id !== id) })
}

// ── Scenarios (stand-in, 04-sync-rules.md §9) ──────────────────────────────────

const SCENARIOS: Record<string, (now: number, apps: Record<AppId, AppSync>) => void> = {
  behind: (now, a) => { a.meta.syncedAt = now - 3 * HOUR - 5 * MIN },
  behind2: (now, a) => { a.shopify.syncedAt = now - 3 * HOUR; a.meta.syncedAt = now - 2 * HOUR - 30 * MIN },
  behind3: (now, a) => { a.meta.syncedAt = now - 4 * HOUR; a['google-ads'].syncedAt = now - 3 * HOUR - 10 * MIN; a.tiktok.syncedAt = now - 3 * HOUR },
  failed: (now, a) => { a.meta = { syncedAt: now - 5 * HOUR, failed: true, syncing: null } },
  failed3: (now, a) => {
    a.meta = { syncedAt: now - 5 * HOUR, failed: true, syncing: null }
    a['google-ads'] = { syncedAt: now - 4 * HOUR, failed: true, syncing: null }
    a.tiktok = { syncedAt: now - 4 * HOUR + 20 * MIN, failed: true, syncing: null }
  },
  both: (now, a) => { a.meta = { syncedAt: now - 5 * HOUR, failed: true, syncing: null }; a.shopify.syncedAt = now - 3 * HOUR - 5 * MIN },
  slow: (now, a) => { a.meta = { syncedAt: now - 3 * HOUR, failed: false, syncing: { startedAt: now - 25 * MIN, kind: 'sync' } } },
  // Meta Ads last synced yesterday: on Today its cards read a dash (05 CR-26).
  yesterday: (now, a) => { const midnight = new Date(now); midnight.setHours(0, 0, 0, 0); a.meta.syncedAt = midnight.getTime() - 3 * HOUR },
  first: (now, a) => { a.meta = { syncedAt: null, failed: false, syncing: { startedAt: now, kind: 'first' } } },
}

/** Start in a drawn state. Runs once per distinct query; a plain /dashboard keeps what's running. */
export function seedFromQuery(params: { sync: string | null; fail: string | null; role: string | null; connect?: string | null }) {
  failConnectOnce = params.connect === 'fail'
  const key = `${params.sync ?? ''}|${params.fail ?? ''}|${params.role ?? ''}`
  if (seededWith === key || (seededWith !== null && key === '||')) return
  seededWith = key
  const now = Date.now()
  const apps = freshApps(now)
  SCENARIOS[params.sync ?? '']?.(now, apps)
  failNext.clear()
  for (const id of (params.fail ?? '').split(',')) if ((ALL_APPS as string[]).includes(id)) failNext.add(id as AppId)
  set({ apps, refreshRunning: false, cooldownUntil: 0, recent: [], isAdmin: params.role !== 'member', dismissed: [], connections: offApps() })
  if (params.sync === 'first') window.setTimeout(() => setApp('meta', { syncedAt: Date.now(), syncing: null }), FIRST_SYNC_MS)
  if (params.sync === 'slow') {
    // The attempt stops an hour after it started; the app goes back to behind (SY-31).
    const started = apps.meta.syncing!.startedAt
    window.setTimeout(() => { if (snap.apps.meta.syncing?.startedAt === started) setApp('meta', { syncing: null }) }, GIVE_UP_AFTER - (now - started))
  }
}
