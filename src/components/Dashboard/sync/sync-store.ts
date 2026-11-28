'use client'

// The open board's sync, as the parts of the screen read it. A small external store of UI state only
// (which syncs this viewer started, recent ends, dismissed banners, online/offline), so a sync carries
// on when you change boards (SY-30) and the offline bar above the app can read it (SY-33). The apps'
// states are not kept here: they are read from the board status query (warehouseQueries.status) at
// snapshot time (SD-ST-02); a new status settles the syncs this viewer started. Components read it
// through useSyncSnapshot / useSyncState (useSyncExternalStore), never directly (React Compiler).
// Refresh and Sync are mutations: sync/use-sync-actions.ts.

import { useEffect, useState, useSyncExternalStore } from 'react'
import { hashKey, type QueryClient, type QueryKey } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { BoardStatus, Warehouse } from '@/lib/api/warehouse'
import { ApiError } from '@/lib/api/client'
import { logger } from '@/lib/logger'
import { ORG_CONNECTORS_ROUTE } from '@/lib/routes'
import type { AppId } from '../types'
import { AppSync, type SyncKind } from './sync-model'

const BACK_ONLINE_MS = 3_000
/** A finished Sync is shown as a green banner on boards opened within this long (SY-19). */
const RECENT_MS = 10_000

/** A Sync that just ended well, for the green banner (SY-19). */
export interface Recent { id: number; apps: AppId[]; at: number }

/** How a sync this viewer started ended, for the toasts (SY-29, SY-30). */
export interface SyncEnd {
  kind: SyncKind
  ok: AppId[]
  failed: AppId[]
}

/** What this store keeps: UI state, nothing the server sent. */
interface UiState {
  /** When the snapshot was taken; the store ticks every 10 s while anyone listens. */
  now: number
  online: boolean
  offlineSince: number | null
  /** Set for 3 s after the connection comes back (SY-34). */
  backOnlineAt: number | null
  /** Syncs this viewer started that are still running. */
  started: Partial<Record<AppId, SyncKind>>
  recent: Recent[]
  /** Banners closed with ×, as `boardId|banner key` (SY-20). */
  dismissed: string[]
}

export interface SyncSnapshot extends UiState {
  /** The open board's apps, as its status query last said (read from the query cache, not copied). */
  apps: Record<AppId, AppSync>
}

/** The board this store reads the status of, and where that status lives in the query cache. */
export interface SyncTarget {
  client: QueryClient
  key: QueryKey
  warehouse: Warehouse
  boardId: string
}

const NO_APPS: Record<AppId, AppSync> = {}
const SERVER_UI: UiState = { now: 0, online: true, offlineSince: null, backOnlineAt: null, started: {}, recent: [], dismissed: [] }
const SERVER: SyncSnapshot = { ...SERVER_UI, apps: NO_APPS }

let ui: UiState = SERVER_UI
/** The UI state as of the last real change: the clock tick doesn't replace it (see useSyncState). */
let uiBase: UiState = SERVER_UI
let target: SyncTarget | null = null
let stopWatching: (() => void) | null = null
const listeners = new Set<() => void>()
const endListeners = new Set<(e: SyncEnd) => void>()
let recentId = 0

// ── Apps, from the status query ──────────────────────────────────────────────────

const appsByStatus = new WeakMap<BoardStatus, Record<AppId, AppSync>>()

function appsOf(status: BoardStatus | undefined): Record<AppId, AppSync> {
  if (!status) return NO_APPS
  let apps = appsByStatus.get(status)
  if (!apps) {
    apps = Object.fromEntries(status.connections.map((c) => [c.connectionId, new AppSync(c)]))
    appsByStatus.set(status, apps)
  }
  return apps
}

const currentStatus = () => (target ? target.client.getQueryData<BoardStatus>(target.key) : undefined)

/** A snapshot that keeps its identity until the UI state or the status changes (useSyncExternalStore needs that). */
function composer() {
  let lastUi: UiState | null = null
  let lastApps: Record<AppId, AppSync> | null = null
  let out: SyncSnapshot = SERVER
  return (state: UiState): SyncSnapshot => {
    const apps = appsOf(currentStatus())
    if (state !== lastUi || apps !== lastApps) {
      lastUi = state
      lastApps = apps
      out = { ...state, apps }
    }
    return out
  }
}
const withApps = composer()
const withAppsBase = composer()
const snapshot = () => withApps(ui)
const baseSnapshot = () => withAppsBase(uiBase)

// ── Changes ───────────────────────────────────────────────────────────────────────

const emit = () => listeners.forEach((l) => l())

function set(next: Partial<UiState>) {
  ui = { ...ui, ...next, now: Date.now() }
  uiBase = ui
  emit()
}

// The clock only moves "now" (relative times, cooldowns); it skips hidden tabs and catches up on return.
function tick() {
  if (document.hidden) return
  ui = { ...ui, now: Date.now() }
  emit()
}

let ticker: number | undefined
function subscribe(l: () => void) {
  listeners.add(l)
  ensureOnlineListener()
  if (ticker === undefined) {
    ticker = window.setInterval(tick, 10_000)
    document.addEventListener('visibilitychange', tick)
  }
  return () => {
    listeners.delete(l)
    if (!listeners.size) {
      window.clearInterval(ticker)
      ticker = undefined
      document.removeEventListener('visibilitychange', tick)
    }
  }
}

/** A slow clock for the board's own day and hour maths (Today's midnight, "hasn't synced in N hours"). */
export function useCoarseNow(everyMs = 5 * 60_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => { if (!document.hidden) setNow(Date.now()) }, everyMs)
    const onShow = () => { if (!document.hidden) setNow(Date.now()) }
    document.addEventListener('visibilitychange', onShow)
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', onShow) }
  }, [everyMs])
  return now
}

/** Every change, and the 10 s clock: for the small parts that show relative times. */
export function useSyncSnapshot(): SyncSnapshot {
  return useSyncExternalStore(subscribe, snapshot, () => SERVER)
}

/**
 * Real changes only, not the clock: for the board itself, so a tick doesn't re-render every card.
 * Its `now` is when the state last changed; pair it with a coarse clock for day or hour maths.
 */
export function useSyncState(): SyncSnapshot {
  return useSyncExternalStore(subscribe, baseSnapshot, () => SERVER)
}

/** The current state, for event handlers (render reads go through useSyncSnapshot). */
export function getSyncSnapshot(): SyncSnapshot {
  return snapshot()
}

/** The board the store reads, for the sync actions; null while a draft or nothing is open. */
export function getSyncTarget(): SyncTarget | null {
  return target
}

/** Hear how each sync you started ends (toasts, SY-29 / SY-30). */
export function onSyncEnd(l: (e: SyncEnd) => void): () => void {
  endListeners.add(l)
  return () => endListeners.delete(l)
}

/**
 * The board whose status this store shows. It watches that status in the query cache: each new
 * status settles the syncs this viewer started; the apps themselves are read from the cache.
 */
export function bindSync(next: SyncTarget | null) {
  const same = target && next
    ? target.client === next.client && hashKey(target.key) === hashKey(next.key) && target.warehouse.id === next.warehouse.id
    : target === next
  if (same) return
  stopWatching?.()
  stopWatching = null
  target = next
  if (next) {
    const hash = hashKey(next.key)
    let seen = currentStatus()
    stopWatching = next.client.getQueryCache().subscribe((event) => {
      if (event.query.queryHash !== hash) return
      const status = event.query.state.data as BoardStatus | undefined
      if (status === seen) return
      seen = status
      if (status) settle(status)
      else emit()
    })
    if (seen) {
      settle(seen)
      return
    }
  }
  emit()
}

/** Leaving the dashboard: what this visit started, finished or dismissed doesn't carry into the next (another warehouse, say). */
export function resetSyncStore() {
  bindSync(null)
  set({ started: {}, recent: [], dismissed: [] })
}

/** A new board status: the end of any sync this viewer started. */
function settle(status: BoardStatus) {
  const apps = appsOf(status)
  const started = { ...ui.started }
  const ended: Record<SyncKind, SyncEnd> = { refresh: { kind: 'refresh', ok: [], failed: [] }, sync: { kind: 'sync', ok: [], failed: [] } }
  for (const [id, kind] of Object.entries(started) as [AppId, SyncKind][]) {
    const app = apps[id]
    if (app?.state === 'syncing') continue
    delete started[id]
    if (app) ended[kind][app.state === 'failed' ? 'failed' : 'ok'].push(id)
  }
  const now = Date.now()
  const recent = ended.sync.ok.length
    ? [...ui.recent.filter((r) => now - r.at < RECENT_MS), { id: ++recentId, apps: ended.sync.ok, at: now }]
    : ui.recent
  set({ started, recent })
  for (const end of Object.values(ended)) if (end.ok.length || end.failed.length) endListeners.forEach((l) => l(end))
}

/** Syncs this viewer just started: their spinners turn until a status says they ended. */
export function markStarted(ids: AppId[], kind: SyncKind) {
  if (ids.length) set({ started: { ...ui.started, ...Object.fromEntries(ids.map((id) => [id, kind])) } })
}

/** Syncs the server refused: they mustn't leave a spinner turning. */
export function unmarkStarted(ids: AppId[]) {
  set({ started: Object.fromEntries(Object.entries(ui.started).filter(([id]) => !ids.includes(id as AppId))) })
}

// ── Online / offline (SY-33, SY-34) ────────────────────────────────────────────

let onlineListening = false
function ensureOnlineListener() {
  if (onlineListening || typeof window === 'undefined') return
  onlineListening = true
  const update = () => {
    const online = navigator.onLine
    if (online === ui.online) return
    if (online) {
      const at = Date.now()
      set({ online: true, offlineSince: null, backOnlineAt: at })
      window.setTimeout(() => { if (ui.backOnlineAt === at) set({ backOnlineAt: null }) }, BACK_ONLINE_MS)
    } else {
      set({ online: false, offlineSince: Date.now(), backOnlineAt: null })
    }
  }
  window.addEventListener('online', update)
  window.addEventListener('offline', update)
  update()
}

// ── Syncing ─────────────────────────────────────────────────────────────────────

/** Any sync running on the board (first syncs aside: Refresh stays on during them, SY-27). */
export function isBusy(s: SyncSnapshot): boolean {
  return Object.values(s.apps).some((a) => a.state === 'syncing')
}

/** A Refresh this viewer started is still running. */
export const refreshRunning = (s: SyncSnapshot) => Object.values(s.started).includes('refresh')

/** Why Refresh and Sync are greyed, or null when they can run (SY-9, SY-11, SY-12, SY-33). */
export function blockedReason(s: SyncSnapshot, now: number): 'offline' | 'busy' | 'cooldown' | null {
  if (!s.online) return 'offline'
  if (isBusy(s)) return 'busy'
  if (Object.values(s.apps).some((a) => a.syncableAt !== null && now < a.syncableAt)) return 'cooldown'
  return null
}

/** Behind, or a sync that failed for a reason other than the sign-in: syncing again may fix it (SY-16). */
export function syncable(s: SyncSnapshot, ids: AppId[]): AppId[] {
  return ids.filter((id) => s.apps[id]?.state === 'behind' || (s.apps[id]?.state === 'failed' && !s.apps[id]?.needsReconnect))
}

/** A Sync or Refresh the server didn't start: said in a toast, never an unhandled rejection. */
export function syncRefused(error: unknown) {
  const status = error instanceof ApiError ? error.status : 0
  logger.event('dashboard.sync_refused', { status })
  toast.error(status === 403 ? 'You don’t have access to sync this.' : 'Couldn’t start the sync. Try again in a moment.', { id: 'dashboard-sync' })
}

/**
 * Reconnect (SY-26): opens that app's account on the Connectors page with its reconnect already
 * started (`?open=<slug>&account=<id>&reconnect=1`). Given several apps, the first of the viewer's
 * own that needs signing in again.
 */
export function reconnectHref(id: AppId, from?: string): string {
  const a = snapshot().apps[id]
  if (!a) return ORG_CONNECTORS_ROUTE
  // `return`: the page to come back to once the sign-in ends (the board the person was on).
  const back = from ? `&return=${encodeURIComponent(from)}` : ''
  return `${ORG_CONNECTORS_ROUTE}?open=${encodeURIComponent(a.slug)}&account=${encodeURIComponent(a.id)}&reconnect=1${back}`
}

export function reconnect(ids: AppId[]) {
  const apps = snapshot().apps
  const id = ids.find((i) => apps[i]?.needsReconnect && apps[i]?.yours) ?? ids.find((i) => apps[i]?.yours)
  window.location.assign(id ? reconnectHref(id, `${window.location.pathname}${window.location.search}`) : ORG_CONNECTORS_ROUTE)
}

/** × on a banner: hidden on this board until its key changes (SY-20). */
export function dismissBanner(boardId: string, key: string) {
  set({ dismissed: [...ui.dismissed, `${boardId}|${key}`] })
}

export function dismissRecent(id: number) {
  set({ recent: ui.recent.filter((r) => r.id !== id) })
}
