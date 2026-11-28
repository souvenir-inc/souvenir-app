'use client'

import type { BoardCard, CardSize } from '../types'
import {
  MAX_NAME, cardIdsFor, namesInUse, uniqueName,
  type Board, type BoardAction, type DashboardState, type NewCard,
} from './board-state'

// What changes a board's content: new boards from the chooser (08), cards added (06) and the card
// actions on one board (BS-19 – BS-31). Built by useDashboard over its own `run` and undo steps.

export interface ContentContext {
  /** The boards as they are now. */
  now: () => DashboardState
  board: (id: string) => Board | undefined
  /** Applies actions with no undo step. */
  dispatch: (action: BoardAction) => void
  /** Applies actions as one undo step; returns its key. */
  commit: (forward: BoardAction[], reverse: BoardAction[]) => number
  /** The same, returning the step's undo. */
  change: (forward: BoardAction[], reverse: BoardAction[]) => () => void
  undo: (key?: number) => void
  undoToast: (message: string, forward: BoardAction[], reverse: BoardAction[]) => void
  newId: () => string
  /** Fields that make a board the viewer's own and private. */
  mine: Pick<Board, 'access' | 'ownerId' | 'general' | 'grants' | 'sharedBy'>
}

export function useBoardContent({ now, board, dispatch, commit, change, undo, undoToast, newId, mine }: ContentContext) {
// ── New board (08-new-board-rules.md) ────────────────────────────────────────

/**
 * A board from New board (a template, a copy, a draft): private, yours, the last tab, open
 * (NB-12, NB-14, NB-34). Undo removes it outright and opens the board you were on. A draft isn't
 * an undo step (`undoable: false`): its own bar decides what happens to it (NB-27).
 */
const addBoard = (
  fields: { label: string; cards: BoardCard[]; period: string; compare: string; draft?: boolean },
  undoable = true,
) => {
  const s = now()
  const id = newId()
  const label = uniqueName(fields.label, namesInUse(s))
  const b: Board = { id, label, cards: fields.cards, initialCards: fields.cards, period: fields.period, compare: fields.compare, ...mine, draft: fields.draft }
  const add: BoardAction = { type: 'add-board', board: b, index: s.tabs.length, open: true }
  if (!undoable) { dispatch(add); return { id, label, undo: () => {} } }
  const undoIt = change([add], [{ type: 'remove-board', id }, { type: 'open', id: s.openId }])
  return { id, label, undo: undoIt }
}

/** "Store overview copy" as the last tab, private, same cards and dates (NB-14). */
const copyBoard = (id: string) => {
  const src = board(id)
  if (!src) return
  const base = src.label.slice(0, MAX_NAME - ' copy'.length).trimEnd()
  return addBoard({ label: `${base} copy`, cards: src.cards, period: src.period, compare: src.compare })
}

/** Fill a board from a template: its cards and dates; an untouched "Untitled board" takes its name (NB-18). */
const fillBoard = (id: string, fields: { label: string; cards: BoardCard[]; period: string; compare: string }) => {
  const b = board(id)
  if (!b) return
  const takesName = /^Untitled board( \d+)?$/.test(b.label)
  const label = takesName ? uniqueName(fields.label, namesInUse(now(), id)) : b.label
  return change(
    [{ type: 'update-board', id, patch: { cards: fields.cards, initialCards: fields.cards, period: fields.period, compare: fields.compare, label } }],
    [{ type: 'update-board', id, patch: { cards: b.cards, initialCards: b.initialCards, period: b.period, compare: b.compare, label: b.label } }],
  )
}

/** Discard a draft (NB-27): gone, the board you were on opens; Undo brings it back. Not in Recently deleted. */
const discardDraft = (id: string, openAfter: string) => {
  const b = board(id)
  if (!b) return
  const { tabs } = now()
  const index = tabs.indexOf(id)
  return change(
    [{ type: 'remove-board', id }, { type: 'open', id: openAfter }],
    [{ type: 'add-board', board: b, index: index < 0 ? tabs.length : index, open: true }],
  )
}

/**
 * Cards added at the end of a board, in order (06 AC-16, AC-23). One undo step takes them all off
 * again (AC-18); ⌘Z does the same. Returns the new card ids and that undo.
 */
const addCards = (boardId: string, cards: NewCard[]) => {
  const before = board(boardId)?.cards
  if (!before || !cards.length) return null
  const ids = cardIdsFor(before.map((c) => c.metricId), cards.map((c) => c.metricId))
  const key = commit([{ type: 'add-cards', id: boardId, cards }], [{ type: 'set-cards', id: boardId, cards: before }])
  return { ids, undo: () => undo(key) }
}

// ── Card actions on one board ─────────────────────────────────────────────

// Each change is applied by the reducer to the board as it is then, never to a copy captured
// by an earlier render (a drag keeps its handlers for its whole life, BS-25, BS-26).
const cardActions = (id: string) => ({
  step: (metricId: string, by: -1 | 1) => dispatch({ type: 'step-card', id, metricId, by }),
  resize: (metricId: string, size: CardSize) => dispatch({ type: 'resize-card', id, metricId, size }),
  remove: (metricId: string) => dispatch({ type: 'remove-card', id, metricId }),
  /** Remove card on an empty card while reading: it goes with Undo (05 CR-22). */
  removeWithUndo: (metricId: string, label: string) => {
    const before = board(id)?.cards
    if (!before) return
    undoToast(`Removed ${label}`, [{ type: 'remove-card', id, metricId }], [{ type: 'set-cards', id, cards: before }])
  },
  /** A narrow window's drag, or the keyboard: the card to a place in reading order (BS-25, BS-31). */
  moveTo: (metricId: string, index: number) => dispatch({ type: 'move-card', id, metricId, to: index }),
  /** A whole layout: a drag's preview or result, or the start put back on Esc (BS-26, BS-29). */
  setLayout: (cards: BoardCard[]) => dispatch({ type: 'set-cards', id, cards }),
  /** A new card lands small, at the end (BS-20 stand-in). */
  add: (metricId: string) => dispatch({ type: 'add-card', id, metricId }),
})


  return { addBoard, copyBoard, fillBoard, discardDraft, addCards, cardActions }
}
