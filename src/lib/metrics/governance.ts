import { useCallback, useSyncExternalStore } from 'react'

/**
 * Confirming and retiring metrics, and when each changed, until the API takes them. The catalog gives `verified`
 * (Proposed = false) but no way to change it, no retired flag and no change history, so these are kept in this
 * browser per workspace. The one swap: replace `record` with the API call and read the catalog's own fields instead.
 */
export type GovernanceAction = 'confirmed' | 'retired' | 'restored'

export interface GovernanceEvent {
  action: GovernanceAction
  /** ISO time. */
  at: string
  by: string
}

export type GovernanceLog = Readonly<Record<string, GovernanceEvent>>

const PREFIX = 'souvenir:metric-governance:'
const EMPTY: GovernanceLog = {}
const cache = new Map<string, GovernanceLog>()
const listeners = new Set<() => void>()

function read(workspaceId: string | undefined): GovernanceLog {
  if (!workspaceId || typeof window === 'undefined') return EMPTY
  const hit = cache.get(workspaceId)
  if (hit) return hit
  let log: GovernanceLog = EMPTY
  try {
    const raw = window.localStorage.getItem(PREFIX + workspaceId)
    if (raw) log = JSON.parse(raw) as GovernanceLog
  } catch { /* nothing kept */ }
  cache.set(workspaceId, log)
  return log
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function useGovernance(workspaceId: string | undefined): {
  log: GovernanceLog
  record: (names: readonly string[], action: GovernanceAction, by: string) => GovernanceLog
  restore: (snapshot: GovernanceLog) => void
} {
  const log = useSyncExternalStore(subscribe, () => read(workspaceId), () => EMPTY)
  const write = useCallback((next: GovernanceLog) => {
    if (!workspaceId) return
    cache.set(workspaceId, next)
    try { window.localStorage.setItem(PREFIX + workspaceId, JSON.stringify(next)) } catch { /* in-memory only */ }
    listeners.forEach(listener => listener())
  }, [workspaceId])
  /** Records one action on several metrics; returns the log before, for Undo. */
  const record = useCallback((names: readonly string[], action: GovernanceAction, by: string) => {
    const before = read(workspaceId)
    const at = new Date().toISOString()
    write({ ...before, ...Object.fromEntries(names.map(name => [name, { action, at, by }])) })
    return before
  }, [workspaceId, write])
  return { log, record, restore: write }
}

/** "25 Nov • Maya Chen" */
export function changedLine(event: GovernanceEvent | undefined): string | null {
  if (!event) return null
  const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(event.at))
  return `${day} • ${event.by}`
}
