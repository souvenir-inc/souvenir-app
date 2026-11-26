// Where boards are kept. One interface, so the API for saved boards (Sahil's ask S6) replaces the browser
// implementation here and nowhere else. Until then boards live in this browser's storage, namespaced by
// workspace id. Saving is silent; only a failed save says anything.
//
// Browser storage can be missing (server render), blocked (private mode, a policy) or full. Every access
// is wrapped: a failed load reads as "nothing saved", a failed save resolves false and the screen says so.

import { z } from 'zod'
import { LEGACY_SIZES, type Board, type BoardCard } from './board'

/** A deleted board, kept so it can be restored for 30 days. */
export interface DeletedBoard {
  board: Board
  /** When it was deleted (ISO date and time). */
  deletedAt: string
}

export interface BoardsDoc {
  version: 1
  /** Every board this person can see. */
  boards: Board[]
  /** Their tabs: the boards they picked, in their order. Missing (a save from before tabs were picked): every board. */
  tabs?: string[]
  /** The board shown last. Kept for older builds; the screen opens on the first tab (the home board). */
  activeId: string
  /** Starter tabs already offered on this device, so one that was deleted doesn't come back. */
  seeds?: string[]
  /** Deleted boards, newest first, restorable for 30 days. */
  deleted?: DeletedBoard[]
}

export interface BoardStore {
  /** Where saves go, for the note on screen: `device` until boards have an API, then `workspace`. */
  readonly where: 'device' | 'workspace'
  /** The saved boards for a workspace, or null when there are none (or they can't be read). */
  load(workspaceId: string): Promise<BoardsDoc | null>
  /** Resolves true once saved, false if it couldn't be. Never rejects. */
  save(workspaceId: string, doc: BoardsDoc): Promise<boolean>
}

export const STORAGE_PREFIX = 'souvenir.boards.v1'

export function storageKey(workspaceId: string): string {
  return `${STORAGE_PREFIX}.${workspaceId}`
}

// Parsing is forgiving per card: one bad field falls back to a default, one bad card is dropped, so a board
// saved by an older build still opens.
const cardSchema = z.object({
  id: z.string().min(1),
  metric: z.string().min(1),
  // "Against target" cards kept a target of their own; targets belong to the metric now, so they read as metric cards.
  kind: z.preprocess(v => (v === 'target' ? 'number' : v), z.enum(['number', 'trend', 'weekly'])).catch('number'),
  // S, M and L were saved before the six-size grid; they read as the sizes they looked like.
  size: z.preprocess(v => (typeof v === 'string' && v in LEGACY_SIZES ? LEGACY_SIZES[v] : v),
    z.enum(['3x1', '3x2', '6x1', '6x2', '12x1', '12x2'])).catch('3x1'),
  window: z.enum(['period', 'today', '7d', '30d', '90d', 'mtd']).catch('period'),
  comparison: z.enum(['previous', 'year', 'none']).catch('previous'),
})

const boardSchema = z.object({
  id: z.string().min(1),
  name: z.string().catch('My board'),
  cards: z.array(z.unknown()).catch([]),
  // Boards saved before 19 Nov may carry `dates`; boards have no dates of their own now, so they're dropped on read.
  sharedBy: z.string().min(1).optional().catch(undefined),
})

const docSchema = z.object({
  version: z.literal(1),
  boards: z.array(z.unknown()),
  tabs: z.array(z.string()).optional().catch(undefined),
  activeId: z.string().catch(''),
  seeds: z.array(z.string()).optional().catch(undefined),
  deleted: z.array(z.object({ board: z.unknown(), deletedAt: z.string() })).optional().catch(undefined),
})

/** One board, forgiving per card; null when it isn't a board at all. */
export function parseBoard(raw: unknown): Board | null {
  const board = boardSchema.safeParse(raw)
  if (!board.success) return null
  const cards: BoardCard[] = []
  const ids = new Set<string>()
  for (const c of board.data.cards) {
    const card = cardSchema.safeParse(c)
    if (!card.success) continue
    // Two cards with one id (a board saved by an older build) would confuse React's keys; the second gets a new one.
    let id = card.data.id
    for (let n = 2; ids.has(id); n += 1) id = `${card.data.id}-${n}`
    ids.add(id)
    cards.push({ ...(card.data as BoardCard), id })
  }
  const parsed: Board = { id: board.data.id, name: board.data.name, cards }
  if (board.data.sharedBy) parsed.sharedBy = board.data.sharedBy
  return parsed
}

/** Reads a stored document defensively; null when it isn't one of ours. */
export function parseBoardsDoc(raw: unknown): BoardsDoc | null {
  const doc = docSchema.safeParse(raw)
  if (!doc.success) return null
  const boards: Board[] = []
  for (const candidate of doc.data.boards) {
    const board = parseBoard(candidate)
    if (board && !boards.some(b => b.id === board.id)) boards.push(board)
  }
  if (boards.length === 0) return null
  const activeId = boards.some(b => b.id === doc.data.activeId) ? doc.data.activeId : boards[0].id
  const parsed: BoardsDoc = { version: 1, boards, activeId }
  if (doc.data.tabs) {
    const known = new Set(boards.map(b => b.id))
    const tabs = [...new Set(doc.data.tabs.filter(id => known.has(id)))]
    if (tabs.length > 0) parsed.tabs = tabs
  }
  if (doc.data.seeds) parsed.seeds = doc.data.seeds
  if (doc.data.deleted) {
    const deleted: DeletedBoard[] = []
    for (const entry of doc.data.deleted) {
      const board = parseBoard(entry.board)
      if (board && !Number.isNaN(Date.parse(entry.deletedAt))) deleted.push({ board, deletedAt: entry.deletedAt })
    }
    if (deleted.length > 0) parsed.deleted = deleted
  }
  return parsed
}

/**
 * The boards to show: what's saved, plus any starter tab this device hasn't been offered yet (so a new use-case tab
 * reaches boards saved before it existed), while a starter someone deleted stays deleted. With nothing saved, the
 * starters themselves.
 */
export function withStarters(saved: BoardsDoc | null | undefined, starters: Board[]): BoardsDoc {
  if (!saved) return { version: 1, boards: starters, activeId: starters[0]?.id ?? '', seeds: starters.map(b => b.id) }
  const offered = new Set([...(saved.seeds ?? []), ...saved.boards.map(b => b.id)])
  const fresh = starters.filter(b => !offered.has(b.id) && !(saved.deleted ?? []).some(d => d.board.id === b.id))
  if (fresh.length === 0) return saved
  const next: BoardsDoc = { ...saved, boards: [...saved.boards, ...fresh], seeds: [...offered, ...fresh.map(b => b.id)] }
  if (saved.tabs) next.tabs = [...saved.tabs, ...fresh.map(b => b.id)]
  return next
}

/** The part of the Storage API we use, so tests can pass a fake. */
export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

function defaultStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function browserBoardStore(getStorage: () => StorageLike | null = defaultStorage): BoardStore {
  return {
    where: 'device',
    async load(workspaceId) {
      try {
        const raw = getStorage()?.getItem(storageKey(workspaceId))
        return raw ? parseBoardsDoc(JSON.parse(raw)) : null
      } catch {
        return null
      }
    },
    async save(workspaceId, doc) {
      try {
        const storage = getStorage()
        if (!storage) return false
        storage.setItem(storageKey(workspaceId), JSON.stringify(doc))
        return true
      } catch {
        return false
      }
    },
  }
}

/**
 * Tells every open board screen (and the metric window's "Add to board") when boards were saved somewhere else, so
 * no screen saves over a change it hasn't seen. `from` is the saver, which ignores its own news.
 */
type BoardsListener = (workspaceId: string, doc: BoardsDoc, from: string) => void
const listeners = new Set<BoardsListener>()

export function onBoardsSaved(listener: BoardsListener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** The store the screen uses. Swap the inner store for the API-backed one when S6 lands. */
const inner: BoardStore = browserBoardStore()

export const boardStore: BoardStore & { saveFrom(workspaceId: string, doc: BoardsDoc, from: string): Promise<boolean> } = {
  where: inner.where,
  load: workspaceId => inner.load(workspaceId),
  save: (workspaceId, doc) => boardStore.saveFrom(workspaceId, doc, 'unknown'),
  async saveFrom(workspaceId, doc, from) {
    const ok = await inner.save(workspaceId, doc)
    if (ok) listeners.forEach(listener => listener(workspaceId, doc, from))
    return ok
  },
}
