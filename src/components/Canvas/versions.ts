// Earlier versions of each board, with who saved them and when (Canvas PRD, flow 9). Restoring one saves it as the
// newest version, so nothing is lost. A burst of changes by one person is one version: a change within a couple of
// minutes of that person's last one replaces it rather than adding another.
//
// Kept apart from the board document, so undoing a change never undoes the history of it. Behind one small interface,
// like the boards themselves, so the boards API can keep versions for the workspace later.

import { z } from 'zod'
import type { Board } from './board'
import { parseBoard, type StorageLike } from './store'

export interface BoardVersion {
  /** When it was saved (ISO date and time). */
  at: string
  /** Who saved it: their name. */
  by: string
  board: Board
}

/** Versions per board id, newest first. */
export type VersionLog = Record<string, BoardVersion[]>

/** Changes by one person this close together are one version. */
export const COALESCE_MS = 2 * 60_000
/** Versions kept per board. */
export const VERSIONS_KEPT = 25

function sameContent(a: Board, b: Board): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** Adds a board as it is now to its versions. Unchanged content adds nothing. */
export function recordVersion(log: VersionLog, board: Board, at: string, by: string): VersionLog {
  const list = log[board.id] ?? []
  const latest = list[0]
  if (latest && sameContent(latest.board, board)) return log
  // The first version is where the board started, so it's never merged into the change after it.
  const merge = list.length > 1 && latest.by === by && Date.parse(at) - Date.parse(latest.at) < COALESCE_MS
  const next = [{ at, by, board }, ...(merge ? list.slice(1) : list)].slice(0, VERSIONS_KEPT)
  return { ...log, [board.id]: next }
}

/** Forgets the versions of boards that are gone for good. */
export function keepVersionsOf(log: VersionLog, ids: ReadonlySet<string>): VersionLog {
  const entries = Object.entries(log).filter(([id]) => ids.has(id))
  return entries.length === Object.keys(log).length ? log : Object.fromEntries(entries)
}

export interface VersionStore {
  load(workspaceId: string): VersionLog
  save(workspaceId: string, log: VersionLog): boolean
}

const versionSchema = z.object({ at: z.string(), by: z.string(), board: z.unknown() })

export function versionsKey(workspaceId: string): string {
  return `souvenir.boards.versions.v1.${workspaceId}`
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/** Versions in this browser's storage. A version that doesn't read is dropped; storage trouble reads as no history. */
export function browserVersionStore(getStorage: () => StorageLike | null = defaultStorage): VersionStore {
  return {
    load(workspaceId) {
      try {
        const raw = getStorage()?.getItem(versionsKey(workspaceId))
        if (!raw) return {}
        const parsed = JSON.parse(raw) as unknown
        if (!parsed || typeof parsed !== 'object') return {}
        const log: VersionLog = {}
        for (const [id, list] of Object.entries(parsed as Record<string, unknown>)) {
          if (!Array.isArray(list)) continue
          const versions: BoardVersion[] = []
          for (const candidate of list) {
            const entry = versionSchema.safeParse(candidate)
            const board = entry.success ? parseBoard(entry.data.board) : null
            if (entry.success && board) versions.push({ at: entry.data.at, by: entry.data.by, board })
          }
          if (versions.length > 0) log[id] = versions
        }
        return log
      } catch {
        return {}
      }
    },
    save(workspaceId, log) {
      try {
        const storage = getStorage()
        if (!storage) return false
        storage.setItem(versionsKey(workspaceId), JSON.stringify(log))
        return true
      } catch {
        return false
      }
    },
  }
}

export const versionStore: VersionStore = browserVersionStore()
