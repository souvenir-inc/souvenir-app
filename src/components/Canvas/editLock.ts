'use client'

// One editor at a time (Dev, 19 Nov: "only one editor rest viewer"). While someone has a board in edit mode, everyone
// else can only view it. Until the boards API holds edit locks (S6), the lock lives in this browser's storage, so two
// tabs or windows on one board are two editors. Swap `lockStorage` for the API's lock here and nowhere else.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { StorageLike } from './store'

export interface EditLock {
  boardId: string
  /** Who holds it, as their name reads on screen. */
  by: string
  /** The tab (page visit) holding it. */
  session: string
  /** When it was last renewed (ms). */
  at: number
}

type Locks = Record<string, EditLock>

const PREFIX = 'souvenir.boards.locks.v1'
/** A holder renews its lock this often while in edit mode. */
export const LOCK_BEAT_MS = 15_000
/** A lock not renewed for this long was let go (a tab closed mid-edit). */
export const LOCK_STALE_MS = 45_000

export function lockKey(workspaceId: string): string {
  return `${PREFIX}.${workspaceId}`
}

function lockStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function readLocks(storage: StorageLike | null, workspaceId: string): Locks {
  try {
    const raw = storage?.getItem(lockKey(workspaceId))
    const parsed: unknown = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' ? parsed as Locks : {}
  } catch {
    return {}
  }
}

function writeLocks(storage: StorageLike | null, workspaceId: string, locks: Locks) {
  try {
    storage?.setItem(lockKey(workspaceId), JSON.stringify(locks))
  } catch {
    // Storage full or blocked: edit mode still works; the lock just isn't shared.
  }
}

/** Someone else's live lock on a board, or null. */
export function holderOf(locks: Locks, boardId: string, session: string, now: number): EditLock | null {
  const lock = locks[boardId]
  if (!lock || lock.session === session || now - lock.at > LOCK_STALE_MS) return null
  return lock
}

/** Takes the lock on a board for this tab. Returns null when it's ours, or the lock of whoever started first. */
export function claimLock(
  storage: StorageLike | null, workspaceId: string, boardId: string, by: string, session: string, now: number,
): EditLock | null {
  const locks = readLocks(storage, workspaceId)
  const holder = holderOf(locks, boardId, session, now)
  if (holder) return holder
  writeLocks(storage, workspaceId, { ...locks, [boardId]: { boardId, by, session, at: now } })
  return null
}

/** Lets go of every lock this tab holds in a workspace. */
export function releaseLocks(storage: StorageLike | null, workspaceId: string, session: string) {
  const locks = readLocks(storage, workspaceId)
  const kept = Object.fromEntries(Object.entries(locks).filter(([, lock]) => lock.session !== session))
  if (Object.keys(kept).length !== Object.keys(locks).length) writeLocks(storage, workspaceId, kept)
}

function randomSession(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2)
}

export interface EditLockState {
  /** Someone else editing the board on screen, or null. */
  holder: EditLock | null
  /** Takes the board's lock. Returns null when it's ours, or the lock of whoever started first. */
  claim: (boardId: string) => EditLock | null
  /** Lets go of the lock (leaving edit mode). */
  release: () => void
}

/** The board's edit lock for this tab: who else is editing it, and taking or letting go of it. */
export function useEditLock(workspaceId: string | undefined, boardId: string | null, by: string): EditLockState {
  const [session] = useState(randomSession)
  const [locks, setLocks] = useState<Locks>({})
  const [now, setNow] = useState(0)
  const held = useRef<string | null>(null)

  const refresh = useCallback(() => {
    if (!workspaceId) return
    setLocks(readLocks(lockStorage(), workspaceId))
    setNow(Date.now())
  }, [workspaceId])

  // Other tabs' locks arrive as storage events; a stale one is noticed on the next beat.
  useEffect(() => {
    if (!workspaceId) return
    const onStorage = (event: StorageEvent) => { if (event.key === lockKey(workspaceId)) refresh() }
    window.addEventListener('storage', onStorage)
    const beat = window.setInterval(() => {
      if (held.current) claimLock(lockStorage(), workspaceId, held.current, by || 'Someone', session, Date.now())
      refresh()
    }, LOCK_BEAT_MS)
    const first = window.setTimeout(refresh, 0)
    const letGo = () => releaseLocks(lockStorage(), workspaceId, session)
    window.addEventListener('pagehide', letGo)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('pagehide', letGo)
      window.clearInterval(beat)
      window.clearTimeout(first)
      letGo()
    }
  }, [workspaceId, by, session, refresh])

  const claim = useCallback((id: string) => {
    if (!workspaceId) return null
    const storage = lockStorage()
    // One board at a time: a lock on another board goes first.
    if (held.current && held.current !== id) {
      releaseLocks(storage, workspaceId, session)
      held.current = null
    }
    const holder = claimLock(storage, workspaceId, id, by || 'Someone', session, Date.now())
    if (!holder) held.current = id
    refresh()
    return holder
  }, [workspaceId, by, session, refresh])

  const release = useCallback(() => {
    if (!workspaceId || !held.current) return
    held.current = null
    releaseLocks(lockStorage(), workspaceId, session)
    refresh()
  }, [workspaceId, session, refresh])

  return { holder: boardId ? holderOf(locks, boardId, session, now) : null, claim, release }
}
