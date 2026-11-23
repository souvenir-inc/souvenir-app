'use client'

import { useEffect, useReducer, useRef } from 'react'
import { toast } from 'sonner'
import { initialDashboardState } from '../mock-data'
import type { BoardCard, CardSize } from '../types'
import {
  MAX_NAME,
  boardReducer, canDelete, canLeave, canRename, cardIdsFor, cleanName, namesInUse, uniqueName,
  type Board, type BoardAction,
} from './board-state'

// The dashboard's state, its undo history and its messages. Every tab action that the rules give
// an Undo to records the actions that reverse it; ⌘Z and the toast's Undo take the same step
// (TAB-14). Everything is in memory: there are no board endpoints yet.

interface UndoEntry {
  key: number
  reverse: BoardAction[]
}

export type RenameResult = { ok: true; name: string } | { ok: false; error: 'empty' }

let seq = 0
const newId = () => `board-${Date.now().toString(36)}-${(seq++).toString(36)}`

export function useDashboard() {
  const [state, dispatch] = useReducer(boardReducer, undefined, () => initialDashboardState(Date.now()))
  const history = useRef<UndoEntry[]>([])
  const keySeq = useRef(0)

  // Boards past 30 days in Recently deleted are gone for good (TAB-43).
  useEffect(() => { dispatch({ type: 'purge-expired', now: Date.now() }) }, [])

  const record = (reverse: BoardAction[]) => {
    const key = ++keySeq.current
    history.current.push({ key, reverse })
    return key
  }

  /** Undo one step: the given entry (a toast's Undo) or the latest (⌘Z). */
  const undo = (key?: number) => {
    const list = history.current
    const i = key == null ? list.length - 1 : list.findIndex((e) => e.key === key)
    if (i < 0) return
    const [entry] = list.splice(i, 1)
    entry.reverse.forEach(dispatch)
  }

  const undoToast = (message: string, reverse: BoardAction[]) => {
    const key = record(reverse)
    toast(message, { action: { label: 'Undo', onClick: () => undo(key) } })
  }

  // ⌘Z / Ctrl+Z, except while typing (TAB-14).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'z') return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      e.preventDefault()
      const list = history.current
      if (!list.length) return
      const [entry] = list.splice(list.length - 1, 1)
      entry.reverse.forEach(dispatch)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const board = (id: string): Board | undefined => state.boards[id]
  const openBoard = state.boards[state.openId]

  // ── Tab actions ────────────────────────────────────────────────────────────

  const open = (id: string) => dispatch({ type: 'open', id })

  /**
   * TAB-21 – TAB-26: empty is refused; a name in use gets the next number and a toast with Rename.
   * `onRenameAgain` reopens the field from that toast.
   */
  const rename = (id: string, raw: string, onRenameAgain?: (id: string) => void): RenameResult => {
    const b = board(id)
    const name = cleanName(raw)
    if (!name) return { ok: false, error: 'empty' }
    if (!b || !canRename(b) || name === b.label) return { ok: true, name: b?.label ?? name }
    const saved = uniqueName(name, namesInUse(state, id))
    dispatch({ type: 'rename', id, label: saved })
    record([{ type: 'rename', id, label: b.label }])
    if (saved !== name) {
      toast(`Saved as ${saved} • ${name} is already in use`, {
        action: { label: 'Rename', onClick: () => onRenameAgain?.(id) },
      })
    }
    return { ok: true, name: saved }
  }

  const moveTab = (id: string, to: number) => {
    const from = state.tabs.indexOf(id)
    if (from < 0 || from === to || to < 0 || to >= state.tabs.length) return
    dispatch({ type: 'move-tab', id, to })
    record([{ type: 'move-tab', id, to: from }])
  }

  const createBoard = (): string => {
    const id = newId()
    const label = uniqueName('Untitled board', namesInUse(state))
    const b: Board = { id, label, cards: [], initialCards: [], period: '7d', compare: 'previous', access: 'owner' }
    const prevOpen = state.openId
    dispatch({ type: 'add-board', board: b, index: state.tabs.length, open: true })
    record([{ type: 'remove-board', id }, { type: 'open', id: prevOpen }])
    return id
  }

  /** `name` is the board's name as you see it (in Manage tabs, a rename not yet saved). */
  const duplicate = (id: string, name?: string): string | undefined => {
    const src = board(id)
    if (!src) return
    const copyId = newId()
    // Cut the name, not " copy", when the result would pass 40 characters (TAB-23).
    const base = cleanName(name ?? src.label) || src.label
    const label = uniqueName(`${base.slice(0, MAX_NAME - ' copy'.length).trimEnd()} copy`, namesInUse(state))
    // The copy is yours to edit and isn't shared (TAB-37).
    const copy: Board = { ...src, id: copyId, label, access: 'owner', sharedBy: undefined, initialCards: src.cards }
    const at = state.tabs.indexOf(id)
    const prevOpen = state.openId
    dispatch({ type: 'add-board', board: copy, index: at < 0 ? state.tabs.length : at + 1, open: true })
    record([{ type: 'remove-board', id: copyId }, { type: 'open', id: prevOpen }])
    return copyId
  }

  const hide = (id: string) => {
    const b = board(id)
    if (!b || state.tabs.length <= 1) return
    const index = state.tabs.indexOf(id)
    const wasOpen = state.openId === id
    dispatch({ type: 'hide', id })
    undoToast(`${b.label} hidden from your tabs`, [{ type: 'show', id, index, open: wasOpen }])
  }

  const show = (id: string) => {
    const b = board(id)
    if (!b) return
    const prevOpen = state.openId
    dispatch({ type: 'show', id, open: true })
    undoToast(`${b.label} is back in your tabs`, [{ type: 'hide', id, openAfter: prevOpen }])
  }

  /** The last tab can't go (TAB-45). */
  const isOnlyTab = (id: string) => state.tabs.length <= 1 && state.tabs[0] === id

  const remove = (id: string) => {
    const b = board(id)
    if (!b || !canDelete(b) || isOnlyTab(id)) return // owner only (TAB-41)
    const index = state.tabs.indexOf(id)
    const wasHidden = state.hidden.includes(id)
    const wasOpen = state.openId === id
    dispatch({ type: 'delete', id, at: Date.now() })
    // A hidden board comes back hidden; a tab comes back in its place.
    const reverse: BoardAction[] = wasHidden
      ? [{ type: 'restore', id, open: false }, { type: 'hide', id }]
      : [{ type: 'restore', id, index, open: wasOpen }]
    undoToast(`${b.label} deleted`, reverse)
  }

  const restore = (id: string) => {
    const b = board(id)
    const entry = state.deleted.find((d) => d.id === id)
    if (!b || !entry) return
    dispatch({ type: 'restore', id, open: false })
    undoToast(`${b.label} restored`, [{ type: 'delete', id, at: entry.deletedAt }])
  }

  const leave = (id: string) => {
    const b = board(id)
    if (!b || !canLeave(b) || isOnlyTab(id)) return // shared boards only (TAB-52); never the last tab (TAB-45)
    const index = state.tabs.indexOf(id)
    const wasOpen = state.openId === id
    const wasHidden = state.hidden.includes(id)
    dispatch({ type: 'remove-board', id })
    // Undo brings it back in place: a tab where it was, a hidden board hidden.
    const reverse: BoardAction[] = wasHidden
      ? [{ type: 'add-board', board: b, index: state.tabs.length, open: false }, { type: 'hide', id }]
      : [{ type: 'add-board', board: b, index, open: wasOpen }]
    undoToast(`You left ${b.label}`, reverse)
  }

  const applyManage = (
    draft: { tabs: string[]; hidden: string[]; labels: Record<string, string> },
    onRenameAgain?: (id: string) => void,
  ) => {
    const labels: Record<string, string> = {}
    const prevLabels: Record<string, string> = {}
    const numbered: [string, string, string][] = [] // saved under the next number (TAB-26)
    for (const [id, raw] of Object.entries(draft.labels)) {
      const b = board(id)
      const name = cleanName(raw)
      if (!b || !name || name === b.label || !canRename(b)) continue
      // Names already in use get the next number, against the names the dialog is saving.
      const taken = [...draft.tabs, ...draft.hidden].filter((x) => x !== id).map((x) => labels[x] ?? draft.labels[x] ?? state.boards[x]?.label ?? '')
      labels[id] = uniqueName(name, taken)
      prevLabels[id] = b.label
      if (labels[id] !== name) numbered.push([id, labels[id], name])
    }
    const changed =
      Object.keys(labels).length > 0 ||
      draft.tabs.join() !== state.tabs.join() ||
      draft.hidden.join() !== state.hidden.join()
    if (!changed) return
    dispatch({ type: 'apply-manage', tabs: draft.tabs, hidden: draft.hidden, labels })
    record([{ type: 'apply-manage', tabs: state.tabs, hidden: state.hidden, labels: prevLabels }])
    for (const [id, saved, asked] of numbered) {
      toast(`Saved as ${saved} • ${asked} is already in use`, {
        action: { label: 'Rename', onClick: () => onRenameAgain?.(id) },
      })
    }
  }

  const copyLink = (id: string) => {
    const url = `${window.location.origin}/dashboard?board=${encodeURIComponent(id)}`
    navigator.clipboard?.writeText(url).then(
      () => toast('Link copied', { id: 'dashboard-link' }),
      () => toast.error('Couldn’t copy the link', { id: 'dashboard-link' }),
    )
  }

  const startOver = (id: string) => {
    const b = board(id)
    if (!b) return
    dispatch({ type: 'set-cards', id, cards: b.initialCards })
    record([{ type: 'set-cards', id, cards: b.cards }])
  }

  const setDates = (id: string, dates: { period?: string; compare?: string }) => dispatch({ type: 'set-dates', id, ...dates })

  /**
   * Cards added at the end of a board, in order (06 AC-16, AC-23). One undo step takes them all off
   * again (AC-18); ⌘Z does the same. Returns the new card ids and that undo.
   */
  const addCards = (boardId: string, cards: { metricId: string; size: CardSize }[]) => {
    const before = state.boards[boardId]?.cards
    if (!before || !cards.length) return null
    const ids = cardIdsFor(before.map((c) => c.metricId), cards.map((c) => c.metricId))
    dispatch({ type: 'add-cards', id: boardId, cards })
    const key = record([{ type: 'set-cards', id: boardId, cards: before }])
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
      const before = state.boards[id]?.cards
      if (!before) return
      dispatch({ type: 'remove-card', id, metricId })
      undoToast(`${label} removed`, [{ type: 'set-cards', id, cards: before }])
    },
    /** A narrow window's drag, or the keyboard: the card to a place in reading order (BS-25, BS-31). */
    moveTo: (metricId: string, index: number) => dispatch({ type: 'move-card', id, metricId, to: index }),
    /** A whole layout: a drag's preview or result, or the start put back on Esc (BS-26, BS-29). */
    setLayout: (cards: BoardCard[]) => dispatch({ type: 'set-cards', id, cards }),
    /** A new card lands small, at the end (BS-20 stand-in). */
    add: (metricId: string) => dispatch({ type: 'add-card', id, metricId }),
  })

  return {
    state, openBoard, undo,
    open, rename, moveTab, createBoard, addCards, duplicate, hide, show, remove, restore, leave,
    applyManage, copyLink, startOver, setDates, cardActions,
  }
}

export type DashboardApi = ReturnType<typeof useDashboard>
