'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { QueryKey } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { BoardStore } from '../live/board-store'
import { ACTION_COPY } from '../board/errors'
import { newBoardPeriod } from '../default-period'
import { boardLink, copyText } from '../share/share-model'
import { PendingBoards, rebase, type BoardsSnapshot } from './board-layer'
import {
  MAX_NAME,
  boardReducer, canDelete, canLeave, canRename, cleanName, namesInUse, uniqueName,
  type Board, type BoardAction, type DashboardState,
} from './board-state'
import { useBoardContent } from './use-board-content'
import { useBoardHistory } from './use-board-history'
import { useBoardSave } from './use-board-save'

// The board screen's boards: the server's (the boards query, `snapshot`) with the viewer's unsaved
// changes on top (board-layer.ts), the undo / redo history, the save, and every tab action. Every
// tab action the rules give an Undo records how to make it and how to reverse it (TAB-14).

export type RenameResult = { ok: true; name: string } | { ok: false; error: 'empty' }

const newId = () => crypto.randomUUID()

// A new board (or a copy) is the maker's and private until they share it (SH-6, TAB-37, NB-14).
const mine = (viewer: string) => ({ access: 'owner' as const, ownerId: viewer, general: 'none' as const, grants: [], sharedBy: undefined })

export interface DashboardOptions {
  /** The boards query's data. */
  snapshot: BoardsSnapshot
  queryKey: QueryKey
  store: BoardStore
  /** Metric names the catalog knows; a board's `metrics` lists only these (DASH-TR-13). */
  measurable: Set<string>
  viewer: string
  /** The workspace's default board (DASH-TR-26). */
  defaultBoard: string | null
  /** The starter boards for a warehouse with none yet (NB-32); called once. */
  starter: () => DashboardState
}

export function useDashboard({ snapshot, queryKey, store, measurable, viewer, defaultBoard, starter }: DashboardOptions) {
  // A warehouse with no boards yet gets the starter boards, as the viewer's first change (NB-32).
  const [pending] = useState(() => {
    const p = new PendingBoards()
    if (!snapshot.state.tabs.length) p.push({ type: 'replace', state: starter() })
    return p
  })
  const layer = useSyncExternalStore(pending.subscribe, pending.getSnapshot, pending.getSnapshot)
  const [openId, setOpenId] = useState(() => rebase(snapshot, pending.getSnapshot().entries, '').openId)
  const state = rebase(snapshot, layer.entries, openId)

  // What handlers act on: the boards as they are now, never the ones from the render that made
  // them (a toast's Undo runs long after). Set after each render and by `run` itself.
  const latest = useRef(state)
  useEffect(() => { latest.current = state })
  // Changes the server has (the snapshot's seq) leave the layer.
  useEffect(() => { pending.drop(snapshot.seq) }, [pending, snapshot.seq])

  /** Applies actions to the boards as they are now; each that changes something is a pending change. */
  const run = (actions: BoardAction[]) => {
    let s = latest.current
    for (const action of actions) {
      const next = boardReducer(s, action)
      if (next === s) continue
      // Opening a tab only moves the viewer's view: nothing to save.
      if (!(action.type === 'open' && s.tabs.includes(action.id))) pending.push(action)
      s = next
    }
    latest.current = s
    setOpenId(s.openId)
  }
  const dispatch = (action: BoardAction) => run([action])

  const history = useBoardHistory(run)
  const known = useRef(measurable)
  useEffect(() => { known.current = measurable })
  const save = useBoardSave({ store, pending, queryKey, latest, measurable: known, defaultBoard })

  // Boards past 30 days in Recently deleted are gone for good (TAB-43).
  useEffect(() => {
    const purge: BoardAction = { type: 'purge-expired', now: Date.now() }
    if (boardReducer(latest.current, purge) !== latest.current) pending.push(purge)
  }, [pending])

  /** Applies actions as one undo step; `reverse` undoes them. Returns the step's key. */
  const commit = (forward: BoardAction[], reverse: BoardAction[]) => {
    run(forward)
    return history.record(forward, reverse)
  }
  const undo = (key?: number) => history.undo(key)

  const undoToast = (message: string, forward: BoardAction[], reverse: BoardAction[]) => {
    const key = commit(forward, reverse)
    toast(message, { action: { label: 'Undo', onClick: () => undo(key) } })
  }

  const openBoard = state.boards[state.openId]
  // Handlers read the boards as they are when they run.
  const now = () => latest.current
  const board = (id: string): Board | undefined => now().boards[id]

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
    const saved = uniqueName(name, namesInUse(now(), id))
    commit([{ type: 'rename', id, label: saved }], [{ type: 'rename', id, label: b.label }])
    if (saved !== name) {
      toast(`Saved as ${saved} • ${name} is already in use`, {
        action: { label: 'Rename', onClick: () => onRenameAgain?.(id) },
      })
    }
    return { ok: true, name: saved }
  }

  const moveTab = (id: string, to: number) => {
    const { tabs } = now()
    const from = tabs.indexOf(id)
    if (from < 0 || from === to || to < 0 || to >= tabs.length) return
    commit([{ type: 'move-tab', id, to }], [{ type: 'move-tab', id, to: from }])
  }

  const createBoard = (): string => {
    const s = now()
    const id = newId()
    const label = uniqueName('Untitled board', namesInUse(s))
    const b: Board = { id, label, cards: [], initialCards: [], period: newBoardPeriod(), compare: 'previous', ...mine(viewer) }
    commit([{ type: 'add-board', board: b, index: s.tabs.length, open: true }], [{ type: 'remove-board', id }, { type: 'open', id: s.openId }])
    return id
  }

  /** `name` is the board's name as you see it (in Manage tabs, a rename not yet saved). */
  const duplicate = (id: string, name?: string): string | undefined => {
    const s = now()
    const src = s.boards[id]
    if (!src) return
    const copyId = newId()
    // Cut the name, not " copy", when the result would pass 40 characters (TAB-23).
    const base = cleanName(name ?? src.label) || src.label
    const label = uniqueName(`${base.slice(0, MAX_NAME - ' copy'.length).trimEnd()} copy`, namesInUse(s))
    // The copy is yours to edit and isn't shared (TAB-37).
    const copy: Board = { ...src, id: copyId, label, ...mine(viewer), initialCards: src.cards }
    const at = s.tabs.indexOf(id)
    commit(
      [{ type: 'add-board', board: copy, index: at < 0 ? s.tabs.length : at + 1, open: true }],
      [{ type: 'remove-board', id: copyId }, { type: 'open', id: s.openId }],
    )
    return copyId
  }

  const hide = (id: string) => {
    const s = now()
    const b = s.boards[id]
    if (!b || s.tabs.length <= 1) return
    undoToast(`${b.label} hidden from your tabs`, [{ type: 'hide', id }], [{ type: 'show', id, index: s.tabs.indexOf(id), open: s.openId === id }])
  }

  const show = (id: string) => {
    const s = now()
    const b = s.boards[id]
    if (!b) return
    undoToast(`${b.label} is back in your tabs`, [{ type: 'show', id, open: true }], [{ type: 'hide', id, openAfter: s.openId }])
  }

  /** The last tab can't go (TAB-45). */
  const isOnlyTab = (id: string) => now().tabs.length <= 1 && now().tabs[0] === id

  const remove = (id: string) => {
    const s = now()
    const b = s.boards[id]
    if (!b || !canDelete(b) || isOnlyTab(id)) return // owner only (TAB-41)
    // A hidden board comes back hidden; a tab comes back in its place.
    const reverse: BoardAction[] = s.hidden.includes(id)
      ? [{ type: 'restore', id, open: false }, { type: 'hide', id }]
      : [{ type: 'restore', id, index: s.tabs.indexOf(id), open: s.openId === id }]
    undoToast(`${b.label} deleted`, [{ type: 'delete', id, at: Date.now() }], reverse)
  }

  const restore = (id: string) => {
    const s = now()
    const b = s.boards[id]
    const entry = s.deleted.find((d) => d.id === id)
    if (!b || !entry) return
    undoToast(`${b.label} restored`, [{ type: 'restore', id, open: false }], [{ type: 'delete', id, at: entry.deletedAt }])
  }

  const leave = (id: string) => {
    const s = now()
    const b = s.boards[id]
    if (!b || !canLeave(b) || isOnlyTab(id)) return // shared boards only (TAB-52); never the last tab (TAB-45)
    // Undo brings it back in place: a tab where it was, a hidden board hidden.
    const reverse: BoardAction[] = s.hidden.includes(id)
      ? [{ type: 'add-board', board: b, index: s.tabs.length, open: false }, { type: 'hide', id }]
      : [{ type: 'add-board', board: b, index: s.tabs.indexOf(id), open: s.openId === id }]
    undoToast(`You left ${b.label}`, [{ type: 'remove-board', id }], reverse)
  }

  const applyManage = (
    draft: { tabs: string[]; hidden: string[]; labels: Record<string, string> },
    onRenameAgain?: (id: string) => void,
  ) => {
    const s = now()
    const labels: Record<string, string> = {}
    const prevLabels: Record<string, string> = {}
    const numbered: [string, string, string][] = [] // saved under the next number (TAB-26)
    for (const [id, raw] of Object.entries(draft.labels)) {
      const b = s.boards[id]
      const name = cleanName(raw)
      if (!b || !name || name === b.label || !canRename(b)) continue
      // Names already in use get the next number, against the names the dialog is saving.
      const taken = [...draft.tabs, ...draft.hidden].filter((x) => x !== id).map((x) => labels[x] ?? draft.labels[x] ?? s.boards[x]?.label ?? '')
      labels[id] = uniqueName(name, taken)
      prevLabels[id] = b.label
      if (labels[id] !== name) numbered.push([id, labels[id], name])
    }
    const changed =
      Object.keys(labels).length > 0 ||
      draft.tabs.join() !== s.tabs.join() ||
      draft.hidden.join() !== s.hidden.join()
    if (!changed) return
    commit(
      [{ type: 'apply-manage', tabs: draft.tabs, hidden: draft.hidden, labels }],
      [{ type: 'apply-manage', tabs: s.tabs, hidden: s.hidden, labels: prevLabels }],
    )
    for (const [id, saved, asked] of numbered) {
      toast(`Saved as ${saved} • ${asked} is already in use`, {
        action: { label: 'Rename', onClick: () => onRenameAgain?.(id) },
      })
    }
  }

  /** The board's link (SH-20): the canonical builder, so it opens like every other board link. */
  const copyLink = async (id: string) => {
    const ok = await copyText(boardLink(window.location.origin, id))
    if (ok) toast('Link copied', { id: 'dashboard-link' })
    else toast.error(ACTION_COPY.copyFailed, { id: 'dashboard-link' })
  }

  const startOver = (id: string) => {
    const b = board(id)
    if (!b) return
    commit([{ type: 'set-cards', id, cards: b.initialCards }], [{ type: 'set-cards', id, cards: b.cards }])
  }

  const setDates = (id: string, dates: { period?: string; compare?: string }) => dispatch({ type: 'set-dates', id, ...dates })

  /** Apply actions as one undo step: `reverse` undoes them (toasts' Undo, ⌘Z). Returns that undo. */
  const change = (actions: BoardAction[], reverse: BoardAction[]) => {
    const key = commit(actions, reverse)
    return () => undo(key)
  }

  /** Apply actions without an undo step (a draft's own life: drafting, landing, 08). */
  const apply = (actions: BoardAction[]) => run(actions)

  const content = useBoardContent({ now, board, dispatch, commit, change, undo, undoToast, newId, mine: mine(viewer) })
  const { addBoard, copyBoard, fillBoard, discardDraft, addCards, cardActions } = content

  return {
    state, openBoard, current: now, undo, redo: history.redo, canUndo: history.canUndo, canRedo: history.canRedo, saving: save.saving,
    open, rename, moveTab, createBoard, addCards, change, apply, addBoard, copyBoard, fillBoard, discardDraft, duplicate, hide, show, remove, restore, leave,
    applyManage, copyLink, startOver, setDates, cardActions,
    /** The board is on the server already (the boards query has it), so its sync status can be read. */
    onServer: (id: string) => Object.hasOwn(snapshot.state.boards, id),
  }
}

export type DashboardApi = ReturnType<typeof useDashboard>
