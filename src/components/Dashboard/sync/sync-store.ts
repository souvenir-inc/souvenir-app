'use client'

// The open board's sync: a small external store, so a sync carries on when you change boards (SY-30)
// and the offline bar above the app can read it (SY-33). The warehouse's board status feeds it
// (live/use-live-dashboard.ts); Refresh and Sync go to the warehouse. Components read it through
// useSyncSnapshot (useSyncExternalStore), never directly (React Compiler).

import { useSyncExternalStore } from 'react'
import type { BoardStatus, Warehouse } from '@/lib/api/warehouse'
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

export interface SyncSnapshot {
  /** When the snapshot was taken; the store ticks every 10 s while anyone listens. */
  now: number
  /** The open board's apps, as its last status said. */
  apps: Record<AppId, AppSync>
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

const SERVER: SyncSnapshot = { now: 0, apps: {}, online: true, offlineSince: null, backOnlineAt: null, started: {}, recent: [], dismissed: [] }
let snap: SyncSnapshot = SERVER
let target: { warehouse: Warehouse; boardId: string } | null = null
const listeners = new Set<() => void>()
const endListeners = new Set<(e: SyncEnd) => void>()
let recentId = 0

function set(next: Partial<SyncSnapshot>) {
  snap = { ...snap, ...next, now: Date.now() }
  listeners.forEach((l) => l())
}

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

/** Hear how each sync you started ends (toasts, SY-29 / SY-30). */
export function onSyncEnd(l: (e: SyncEnd) => void): () => void {
  endListeners.add(l)
  return () => endListeners.delete(l)
}

/** The board whose status this store shows, and the warehouse its syncs go to. */
export function bindSync(next: { warehouse: Warehouse; boardId: string } | null) {
  if (target?.boardId === next?.boardId && target?.warehouse.id === next?.warehouse.id) return
  target = next
  set({ apps: {} })
}

/** A board status from the warehouse: the apps' states, and the end of any sync this viewer started. */
export function setStatus(boardId: string, status: BoardStatus) {
  if (target?.boardId !== boardId) return
  const apps = Object.fromEntries(status.connections.map((c) => [c.connectionId, new AppSync(c)]))
  const started = { ...snap.started }
  const ended: Record<SyncKind, SyncEnd> = { refresh: { kind: 'refresh', ok: [], failed: [] }, sync: { kind: 'sync', ok: [], failed: [] } }
  for (const [id, kind] of Object.entries(started) as [AppId, SyncKind][]) {
    const app = apps[id]
    if (app?.state === 'syncing') continue
    delete started[id]
    if (app) ended[kind][app.state === 'failed' ? 'failed' : 'ok'].push(id)
  }
  const now = Date.now()
  const recent = ended.sync.ok.length
    ? [...snap.recent.filter((r) => now - r.at < RECENT_MS), { id: ++recentId, apps: ended.sync.ok, at: now }]
    : snap.recent
  set({ apps, started, recent })
  for (const end of Object.values(ended)) if (end.ok.length || end.failed.length) endListeners.forEach((l) => l(end))
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

function marked(ids: AppId[], kind: SyncKind): Partial<Record<AppId, SyncKind>> {
  return { ...snap.started, ...Object.fromEntries(ids.map((id) => [id, kind])) }
}

/** Refresh: every app on the board, skipping apps to reconnect and first syncs (SY-9, SY-32). */
export async function refreshAll(): Promise<void> {
  if (!target || blockedReason(snap, Date.now())) return
  const { warehouse, boardId } = target
  const status = await warehouse.refreshBoard(boardId)
  const syncing = status.connections.filter((c) => c.state === 'syncing' || c.state === 'slow').map((c) => c.connectionId)
  set({ started: marked(syncing, 'refresh') })
  setStatus(boardId, status)
}

/** Sync on a banner or a row: only the given apps that are behind (SY-16). */
export async function syncApps(ids: AppId[]): Promise<void> {
  if (!target || blockedReason(snap, Date.now())) return
  const { warehouse, boardId } = target
  const behind = ids.filter((id) => snap.apps[id]?.state === 'behind')
  if (!behind.length) return
  set({ started: marked(behind, 'sync') })
  const states = await Promise.all(behind.map((id) => warehouse.syncConnection(id)))
  const apps = { ...snap.apps, ...Object.fromEntries(states.map((c) => [c.connectionId, new AppSync(c)])) }
  if (target?.boardId === boardId) set({ apps })
}

/** Reconnect (SY-26): the app's sign-in lives on the Connectors page. */
export function reconnect() {
  window.location.assign(ORG_CONNECTORS_ROUTE)
}

/** × on a banner: hidden on this board until its key changes (SY-20). */
export function dismissBanner(boardId: string, key: string) {
  set({ dismissed: [...snap.dismissed, `${boardId}|${key}`] })
}

export function dismissRecent(id: number) {
  set({ recent: snap.recent.filter((r) => r.id !== id) })
}
