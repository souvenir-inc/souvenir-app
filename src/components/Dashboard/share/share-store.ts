'use client'

import { useSyncExternalStore } from 'react'
import { ME, type General, type Grant, type Role, type Share } from './share-model'

// Who has access to each board, and the dummy Slack connection (09 SH-5 – SH-28). In memory: there
// are no sharing endpoints yet. Read through useSyncExternalStore (React Compiler).

export interface ShareSnapshot {
  shares: Record<string, Share>
  slack: 'connected' | 'off' | 'connecting'
  /** The last channel posted to, picked first next time (SH-25). */
  lastChannel: string
}

/** Boards shared with you (Q4 plan, Creative tests), as the tabs mock has them (SH-39). */
const SEEDED: Record<string, Share> = {
  'q4-plan': { owner: 'maya', grants: [{ id: ME, role: 'view' }, { id: 'growth-team', role: 'view' }], general: { to: 'none' } },
  'creative-tests': { owner: 'maya', grants: [{ id: ME, role: 'edit' }, { id: 'sam', role: 'view' }], general: { to: 'none' } },
}

let snap: ShareSnapshot = { shares: { ...SEEDED }, slack: 'connected', lastChannel: 'growth' }
let failPost = false
let failCopy = false
const listeners = new Set<() => void>()
const set = (patch: Partial<ShareSnapshot>) => { snap = { ...snap, ...patch }; listeners.forEach((l) => l()) }

/** A board's share; your own boards start private (SH-6). */
export const shareOf = (s: ShareSnapshot, boardId: string): Share => s.shares[boardId] ?? { owner: ME, grants: [], general: { to: 'none' } }

const update = (boardId: string, fn: (sh: Share) => Share) => set({ shares: { ...snap.shares, [boardId]: fn(shareOf(snap, boardId)) } })

export function invite(boardId: string, ids: string[], role: Role) {
  update(boardId, (sh) => ({ ...sh, grants: [...sh.grants.filter((g) => !ids.includes(g.id)), ...ids.map((id) => ({ id, role }))] }))
}
export function setRole(boardId: string, id: string, role: Role) {
  update(boardId, (sh) => ({ ...sh, grants: sh.grants.map((g) => (g.id === id ? { ...g, role } : g)) }))
}
/** Remove access; returns what puts it back (SH-17). */
export function removeGrant(boardId: string, id: string): () => void {
  const before = shareOf(snap, boardId).grants
  const at = before.findIndex((g) => g.id === id)
  const grant: Grant | undefined = before[at]
  update(boardId, (sh) => ({ ...sh, grants: sh.grants.filter((g) => g.id !== id) }))
  return () => { if (grant) update(boardId, (sh) => ({ ...sh, grants: [...sh.grants.slice(0, at), grant, ...sh.grants.slice(at)] })) }
}
export function setGeneral(boardId: string, general: General) {
  update(boardId, (sh) => ({ ...sh, general }))
}

// ── Slack (stand-in, SH-27, SH-28) ──────────────────────────────────────────────────

export function connectSlack() {
  if (snap.slack !== 'off') return
  set({ slack: 'connecting' })
  window.setTimeout(() => set({ slack: 'connected' }), 2_000)
}
/** Posts after a moment; `?slack=fail` fails the first one. */
export function postToSlack(channel: string): Promise<void> {
  return new Promise((resolve, reject) => {
    window.setTimeout(() => {
      if (failPost) { failPost = false; reject(new Error('post failed')); return }
      set({ lastChannel: channel })
      resolve()
    }, 900)
  })
}

// ── Clipboard (SH-20, SH-22) ────────────────────────────────────────────────────────

/** Copies the text; `?copy=fail` refuses, as a locked-down browser would. */
export async function copyText(text: string): Promise<boolean> {
  if (failCopy) return false
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** Scenarios from the URL: ?slack=off|fail, ?copy=fail. */
export function seedShareFromQuery(q: { slack: string | null; copy: string | null }) {
  failPost = q.slack === 'fail'
  failCopy = q.copy === 'fail'
  if (q.slack === 'off') set({ slack: 'off' })
}

export function useShareSnapshot(): ShareSnapshot {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l) } },
    () => snap,
    () => snap,
  )
}
