// Changes to the whole board document: your tabs (which boards, in what order, the first is your home board),
// duplicating, deleting (restorable for 30 days) and restoring boards. Pure functions returning a new document.

import { copyBoard, type Board } from './board'
import type { BoardsDoc } from './store'

/** How long a deleted board can be restored. */
export const RESTORE_DAYS = 30
const DAY_MS = 86_400_000

/** Your tabs, in your order: the saved list where it's known, else every board. Never empty while there are boards. */
export function tabsOf(doc: BoardsDoc): string[] {
  const known = new Set(doc.boards.map(b => b.id))
  const tabs = (doc.tabs ?? []).filter(id => known.has(id))
  return tabs.length > 0 ? tabs : doc.boards.map(b => b.id)
}

/** The boards in your tabs, in order. */
export function tabBoards(doc: BoardsDoc): Board[] {
  const byId = new Map(doc.boards.map(b => [b.id, b]))
  return tabsOf(doc).map(id => byId.get(id)).filter((b): b is Board => b !== undefined)
}

/** Your home board: the first tab. */
export function homeOf(doc: BoardsDoc): string | null {
  return tabsOf(doc)[0] ?? null
}

/** Puts a board in your tabs (after `after`, else at the end). Already there: unchanged. */
export function withTab(doc: BoardsDoc, id: string, after?: string): BoardsDoc {
  const tabs = tabsOf(doc)
  if (tabs.includes(id) || !doc.boards.some(b => b.id === id)) return doc
  const at = after ? tabs.indexOf(after) : -1
  const next = [...tabs]
  next.splice(at === -1 ? next.length : at + 1, 0, id)
  return { ...doc, tabs: next }
}

/** Takes a board out of your tabs without deleting it; it stays in the list of every board. The last tab stays. */
export function withoutTab(doc: BoardsDoc, id: string): BoardsDoc {
  const tabs = tabsOf(doc)
  if (!tabs.includes(id) || tabs.length <= 1) return doc
  return { ...doc, tabs: tabs.filter(t => t !== id) }
}

/** Applies a new tab order (from dragging tabs). Ids it doesn't mention keep their place at the end. */
export function orderTabs(doc: BoardsDoc, ids: readonly string[]): BoardsDoc {
  const tabs = tabsOf(doc)
  const ordered = ids.filter(id => tabs.includes(id))
  return { ...doc, tabs: [...new Set([...ordered, ...tabs])] }
}

/** Adds a new board to the document and to your tabs (after `after`, else at the end). */
export function addBoard(doc: BoardsDoc, board: Board, after?: string): BoardsDoc {
  const boards = [...doc.boards]
  const at = after ? boards.findIndex(b => b.id === after) : -1
  boards.splice(at === -1 ? boards.length : at + 1, 0, board)
  return withTab({ ...doc, tabs: tabsOf(doc), boards }, board.id, after)
}

/**
 * "Founder", or "Founder 2" when another board has that name (case aside). A name in use is never blocked, only
 * numbered (D84); `except` is the board being renamed, so keeping its own name isn't a clash. A number that would
 * push the name past `max` characters shortens the name instead.
 */
export function freeName(doc: BoardsDoc, base: string, except?: string, max = Infinity): string {
  const taken = new Set(doc.boards.filter(b => b.id !== except).map(b => b.name.toLowerCase()))
  if (!taken.has(base.toLowerCase())) return base
  for (let n = 2; ; n += 1) {
    const suffix = ` ${n}`
    const name = `${base.slice(0, Math.max(1, max - suffix.length)).trimEnd()}${suffix}`
    if (!taken.has(name.toLowerCase())) return name
  }
}

/** Boards you can see that aren't in your tabs (hidden), in the order of the boards. */
export function hiddenBoards(doc: BoardsDoc): Board[] {
  const tabs = new Set(tabsOf(doc))
  return doc.boards.filter(b => !tabs.has(b.id))
}

/**
 * Sets your tabs exactly (Manage tabs' Save, or Undo after hiding): unknown ids are dropped, and a list left empty
 * keeps the tabs as they were, since the last board can't be hidden.
 */
export function setTabs(doc: BoardsDoc, ids: readonly string[]): BoardsDoc {
  const known = new Set(doc.boards.map(b => b.id))
  const tabs = [...new Set(ids.filter(id => known.has(id)))]
  if (tabs.length === 0) return doc
  return { ...doc, tabs }
}

/** Renames boards in one go (Manage tabs' Save): empty names are skipped, names in use are numbered. */
export function renameBoards(doc: BoardsDoc, names: Readonly<Record<string, string>>, max = Infinity): BoardsDoc {
  let next = doc
  for (const [id, raw] of Object.entries(names)) {
    const board = next.boards.find(b => b.id === id)
    const clean = raw.trim().replace(/\s+/g, ' ').slice(0, max)
    if (!board || board.sharedBy || clean === '' || clean === board.name) continue
    next = replaceBoard(next, { ...board, name: freeName(next, clean, id, max) })
  }
  return next
}

/**
 * Leaves a board someone shared with you: gone from your boards and tabs, with nothing kept to restore (the owner
 * still has it). Only shared boards can be left, and never the last board.
 */
export function leaveBoard(doc: BoardsDoc, id: string): BoardsDoc {
  const board = doc.boards.find(b => b.id === id)
  if (!board?.sharedBy || doc.boards.length <= 1) return doc
  const boards = doc.boards.filter(b => b.id !== id)
  const tabs = tabsOf(doc).filter(t => t !== id)
  return {
    ...doc,
    boards,
    tabs: tabs.length > 0 ? tabs : [boards[0].id],
    activeId: doc.activeId === id ? boards[0].id : doc.activeId,
  }
}

/**
 * Takes back a board that was just made (a Duplicate's Undo, or Cancel on a new board): gone from the boards and
 * tabs with nothing kept in Recently deleted, as if it was never made. Never the last board.
 */
export function discardBoard(doc: BoardsDoc, id: string): BoardsDoc {
  if (!doc.boards.some(b => b.id === id) || doc.boards.length <= 1) return doc
  const boards = doc.boards.filter(b => b.id !== id)
  const tabs = tabsOf(doc).filter(t => t !== id)
  return {
    ...doc,
    boards,
    tabs: tabs.length > 0 ? tabs : [boards[0].id],
    activeId: doc.activeId === id ? boards[0].id : doc.activeId,
  }
}

/** Undoes leaving: the board back where it was in the boards, with the tabs as they were. */
export function rejoinBoard(doc: BoardsDoc, board: Board, at: number, tabs: readonly string[]): BoardsDoc {
  if (doc.boards.some(b => b.id === board.id)) return doc
  const boards = [...doc.boards]
  boards.splice(Math.min(Math.max(0, at), boards.length), 0, board)
  return setTabs({ ...doc, boards }, tabs)
}

/** A private copy of a board, right after it in the tabs, named "<name> copy". */
export function duplicateBoard(doc: BoardsDoc, id: string, newId: string, cardId?: () => string): BoardsDoc {
  const board = doc.boards.find(b => b.id === id)
  if (!board) return doc
  return addBoard(doc, copyBoard(board, newId, freeName(doc, `${board.name} copy`), cardId), id)
}

/**
 * Deletes a board: gone from the boards and the tabs, kept with the time it went so it can be restored for
 * `RESTORE_DAYS`. A starter that's deleted is never offered again. The last board can't be deleted.
 */
export function deleteBoard(doc: BoardsDoc, id: string, now: string): BoardsDoc {
  const board = doc.boards.find(b => b.id === id)
  // Only the owner deletes a board; one shared with you is left instead (D88, D90).
  if (!board || board.sharedBy || doc.boards.length <= 1) return doc
  const boards = doc.boards.filter(b => b.id !== id)
  const tabs = tabsOf(doc).filter(t => t !== id)
  return {
    ...doc,
    boards,
    tabs: tabs.length > 0 ? tabs : [boards[0].id],
    activeId: doc.activeId === id ? boards[0].id : doc.activeId,
    seeds: [...new Set([...(doc.seeds ?? []), id])],
    deleted: [{ board, deletedAt: now }, ...(doc.deleted ?? []).filter(d => d.board.id !== id)],
  }
}

/** Brings a deleted board back, at the end of the boards and the tabs. */
export function restoreBoard(doc: BoardsDoc, id: string): BoardsDoc {
  const entry = (doc.deleted ?? []).find(d => d.board.id === id)
  if (!entry || doc.boards.some(b => b.id === id)) return doc
  const deleted = (doc.deleted ?? []).filter(d => d.board.id !== id)
  const next: BoardsDoc = { ...doc, boards: [...doc.boards, entry.board], tabs: [...tabsOf(doc), id] }
  if (deleted.length > 0) next.deleted = deleted
  else delete next.deleted
  return next
}

/** Drops deleted boards older than `RESTORE_DAYS`. Unchanged (same object) when nothing is that old. */
export function purgeDeleted(doc: BoardsDoc, now: string): BoardsDoc {
  if (!doc.deleted) return doc
  const cutoff = Date.parse(now) - RESTORE_DAYS * DAY_MS
  const kept = doc.deleted.filter(d => Date.parse(d.deletedAt) > cutoff)
  if (kept.length === doc.deleted.length) return doc
  const next: BoardsDoc = { ...doc }
  if (kept.length > 0) next.deleted = kept
  else delete next.deleted
  return next
}

/**
 * Whole days left to restore a board deleted at `deletedAt`: at least 1 while it's still there, and never more than
 * the 30 the list promises (a `now` read before the delete, as when the board goes from an open Manage tabs, would
 * otherwise say 31).
 */
export function daysLeft(deletedAt: string, now: string): number {
  const left = (Date.parse(deletedAt) + RESTORE_DAYS * DAY_MS - Date.parse(now)) / DAY_MS
  return Math.min(RESTORE_DAYS, Math.max(1, Math.ceil(left)))
}

/** Replaces one board in the document. */
export function replaceBoard(doc: BoardsDoc, board: Board): BoardsDoc {
  return { ...doc, boards: doc.boards.map(b => (b.id === board.id ? board : b)) }
}
