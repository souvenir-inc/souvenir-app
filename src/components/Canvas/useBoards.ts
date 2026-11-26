'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { MetricEntry, Workspace } from '@/lib/api/warehouse'
import type { Board, BoardCard } from './board'
import {
  addBoard, deleteBoard, discardBoard, duplicateBoard, freeName, hiddenBoards, homeOf, leaveBoard, orderTabs, purgeDeleted, rejoinBoard,
  renameBoards, replaceBoard, restoreBoard, setTabs, tabBoards, tabsOf, withoutTab, withTab,
} from './doc'
import { repairStarter, STARTER_IDS, starterBoards, starterFor, type Unavailable } from './metrics'
import { boardStore, onBoardsSaved, withStarters, type BoardsDoc, type DeletedBoard } from './store'
import { keepVersionsOf, recordVersion, versionStore, type BoardVersion, type VersionLog } from './versions'

export type SaveState = 'idle' | 'saved' | 'failed'

/** The longest a board's name can be; the tab row stays one line. */
export const BOARD_NAME_MAX = 40
/** Changes that can be undone in one visit. */
const UNDO_LIMIT = 50
/** What an undo or redo toast calls a change nobody named ("Undid the last change"). */
const SOME_CHANGE = 'the last change'

/** A document on the undo or redo stack, with the change that leads away from it ("Duplicate"), for the toasts. */
interface HistoryEntry {
  doc: BoardsDoc
  label: string
}

export interface BoardsState {
  /** Every board this person can see, or an empty list while loading. */
  boards: Board[]
  /** Their tabs, in their order; the first is the home board. */
  tabs: Board[]
  /** Boards they can see that aren't in their tabs (hidden), in board order. */
  hidden: Board[]
  /** The board on screen, or null while loading. */
  board: Board | null
  /** Deleted boards that can still be restored, newest first. */
  deleted: DeletedBoard[]
  /** True until the person changes something: starter boards aren't saved until then. */
  pristine: boolean
  saveState: SaveState
  where: 'device' | 'workspace'
  /**
   * Applies a change to the board on screen and saves. `label` names it for ⌘Z's toast ("Undid Move card"). In edit
   * mode the change is held until Save instead, and changes sharing a `step` (one drag or resize) are one undo step.
   */
  update: (change: (board: Board) => Board, label?: string, step?: string) => void
  /** Edit mode is open on the board on screen: its card changes are held until Save. */
  editing: boolean
  /** Edit mode holds changes that Save would keep. */
  dirty: boolean
  /** Opens edit mode on the board on screen. */
  beginEdit: () => void
  /** Leaves edit mode, throwing its changes away. */
  discardEdit: () => void
  /** Saves edit mode's changes as one change and leaves edit mode. Resolves false (still editing) when the save fails. */
  saveEdit: () => Promise<boolean>
  /** The same, for a board by id, on screen or not (an Undo pressed after switching boards). */
  updateBoard: (id: string, change: (board: Board) => Board, label?: string) => void
  /** Shows a board; one that isn't in the tabs is added to them. */
  select: (id: string) => void
  /** Adds an empty board at the end of the tabs, shows it, and returns its id. A name in use gets a number. */
  add: (name?: string) => string | null
  /** Adds a board made elsewhere (from a template) at the end of the tabs and shows it. */
  addMade: (board: Board) => void
  /** A copy of a board, yours, right after it, shown. Returns its Undo (the copy gone, the original shown). */
  duplicate: (id: string) => (() => void) | null
  /**
   * Takes back a board that was just made, with nothing in Recently deleted (Cancel on a new board), and shows
   * `then`. Returns its Undo.
   */
  discard: (id: string, then?: string | null) => (() => void) | null
  /**
   * Renames a board: blank names are ignored, and a name another board has gets the next number ("Growth 2"). Returns
   * the name it was given, or null when nothing changed. A board shared with you can't be renamed.
   */
  rename: (id: string, name: string) => string | null
  /** Deletes a board (restorable for 30 days); the last one, and boards shared with you, can't be. Returns its Undo. */
  remove: (id: string) => (() => void) | null
  /** Brings a deleted board back as the last tab, shown unless `open` is false. Returns its Undo (deleted again). */
  restore: (id: string, open?: boolean) => (() => void) | null
  /** Takes a board out of the tabs without deleting it (hides it). Returns its Undo. */
  hide: (id: string) => (() => void) | null
  /** Puts a hidden board back as the last tab, without opening it. Returns its Undo. */
  show: (id: string) => (() => void) | null
  /** Leaves a board someone shared with you: gone for you only. Returns its Undo. */
  leave: (id: string) => (() => void) | null
  reorderTabs: (ids: string[]) => void
  /** Manage tabs' Save: the tabs exactly (order; anything left out is hidden) and any renames, as one change. */
  manage: (changes: { tabs: string[]; names: Record<string, string> }) => void
  /** Puts a starter board back as it started. */
  reset: () => void
  /** Whether the board on screen is a starter that "Start over" can rebuild. */
  canReset: boolean
  /** Undoes the last change; returns what it was ("Duplicate"), or null when there was nothing to undo. */
  undo: () => string | null
  /** Redoes the last undone change; returns what it was, or null. */
  redo: () => string | null
  canUndo: boolean
  canRedo: boolean
  /** A board's earlier versions, newest first. */
  versionsOf: (id: string) => BoardVersion[]
  /** Restores a version: saved as the newest one, so nothing is lost. */
  restoreVersion: (id: string, at: string) => void
  /**
   * Cards to hold as plain skeletons: a saved starter's own cards, until we know what the store can measure (one may
   * be swapped), so an old name never flashes before its replacement.
   */
  held: ReadonlySet<string>
}

const NONE: ReadonlySet<string> = new Set()

/** Edit mode's changes, held until Save (Dev, 19 Nov): the board's cards as they are now, and their undo steps. */
interface Draft {
  boardId: string
  cards: BoardCard[]
  past: { cards: BoardCard[]; label: string }[]
  future: { cards: BoardCard[]; label: string }[]
  /** The step (one drag or resize) the last change belonged to, so the next change of the same step joins it. */
  step: string | null
}

const sameCards = (a: ReadonlyArray<BoardCard>, b: ReadonlyArray<BoardCard>) => a === b || JSON.stringify(a) === JSON.stringify(b)

function randomId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10)
}

function newBoardId(): string {
  return `board-${randomId()}`
}

/** What the store can't measure, from a measurement of the starter metrics, and whether that's been answered yet. */
export interface Availability {
  unavailable: Unavailable | undefined
  /** The answer came back (or failed): starters can be built without waiting longer. */
  settled: boolean
}

export interface BoardsOptions {
  /** A board to open on instead of the home board (from a link). */
  initialBoardId?: string | null
  /** Who's changing things, for version history. */
  by: string
}

/**
 * The boards for a workspace: the saved ones, plus any starter tab this device hasn't been offered yet (Store
 * overview, then Growth and Ads when their sources are connected). A starter someone deletes stays deleted. Starters
 * only use metrics the store can measure: a first visit waits for that answer, and a starter saved before it has its
 * unmeasurable cards swapped for measurable ones. Nothing is saved until the person changes something.
 *
 * The screen opens on the home board (the first tab) unless a link names another. Every change saves at once, can be
 * undone while on the page, and is kept in the board's versions.
 */
export function useBoards(
  workspace: Workspace | undefined, catalog: MetricEntry[] | undefined, availability: Availability, options: BoardsOptions,
): BoardsState {
  const workspaceId = workspace?.id
  const [token] = useState(randomId)
  const [now] = useState(() => new Date().toISOString())
  const [loaded, setLoaded] = useState<{ workspaceId: string; doc: BoardsDoc | null } | null>(null)
  const [edited, setEdited] = useState<{ workspaceId: string; doc: BoardsDoc } | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [history, setHistory] = useState<{ past: HistoryEntry[]; future: HistoryEntry[] }>({ past: [], future: [] })
  const [versions, setVersions] = useState<{ workspaceId: string; log: VersionLog } | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)

  useEffect(() => {
    if (!workspaceId) return
    let alive = true
    void boardStore.load(workspaceId).then(doc => { if (alive) setLoaded({ workspaceId, doc }) })
    return () => { alive = false }
  }, [workspaceId])

  // Boards saved somewhere else on this page (a metric's "Add to board") are read in, so they're never saved over.
  useEffect(() => onBoardsSaved((savedFor, doc, from) => {
    if (savedFor !== workspaceId || from === token) return
    setLoaded({ workspaceId: savedFor, doc })
    setEdited(null)
  }), [workspaceId, token])

  const saved = edited && edited.workspaceId === workspaceId ? edited.doc
    : loaded && loaded.workspaceId === workspaceId ? loaded.doc : undefined
  const { unavailable } = availability
  const ready = workspaceId !== undefined && loaded?.workspaceId === workspaceId && workspace !== undefined && catalog !== undefined
    // A first visit seeds starters, so it waits to know what the store can measure; a saved board shows at once.
    && (saved !== null && saved !== undefined || availability.settled)

  // The document on screen: what's saved, with any starter tab not offered yet appended, starter cards the store
  // can't measure swapped out, and boards deleted more than 30 days ago gone.
  let doc: BoardsDoc | null = ready ? purgeDeleted(withStarters(saved, starterBoards(catalog, workspace, unavailable)), now) : null
  if (doc && unavailable && catalog) {
    const repaired = doc.boards.map(b => repairStarter(b, catalog, unavailable))
    if (repaired.some((b, i) => b !== doc!.boards[i])) doc = { ...doc, boards: repaired }
  }
  const shownId = doc
    ? [activeId, options.initialBoardId].find(id => id && doc!.boards.some(b => b.id === id)) ?? homeOf(doc)
    : null
  const savedBoard = doc ? doc.boards.find(b => b.id === shownId) ?? null : null
  // In edit mode the board on screen shows the held changes; the saved board stays as it was until Save.
  const editDraft = draft && savedBoard && draft.boardId === savedBoard.id ? draft : null
  const board = savedBoard && editDraft ? { ...savedBoard, cards: editDraft.cards } : savedBoard
  const log = versions && versions.workspaceId === workspaceId ? versions.log : null

  // What the handlers act on: the latest document, never the one from the render that made them (an Undo in a toast
  // is pressed later, after other changes). Updated after every render, and at once by every save.
  const live = useRef({ doc, shownId, history, log, draft })
  useLayoutEffect(() => { live.current = { doc, shownId, history, log, draft } })

  const setDraftNow = (next: Draft | null) => {
    live.current = { ...live.current, draft: next }
    setDraft(next)
  }

  /** Shows a board (null: the home board). Edit mode doesn't follow: changes held for another board are dropped. */
  const showOn = (id: string | null) => {
    live.current = { ...live.current, shownId: id }
    setActiveId(id)
    const held = live.current.draft
    if (held && held.boardId !== id) setDraftNow(null)
  }

  const readLog = (): VersionLog => live.current.log ?? (workspaceId ? versionStore.load(workspaceId) : {})

  /**
   * Saves a document; changes (not undo or redo) go on the undo stack under `label`. Changed boards are added to their
   * versions.
   */
  const persist = (next: BoardsDoc, how: 'change' | 'undo' | 'redo' = 'change', label = SOME_CHANGE, stored = false) => {
    const before = live.current.doc
    if (!workspaceId || !before) return
    live.current = { ...live.current, doc: next }
    setEdited({ workspaceId, doc: next })
    if (how === 'change') {
      const history = { past: [...live.current.history.past, { doc: before, label }].slice(-UNDO_LIMIT), future: [] }
      live.current = { ...live.current, history }
      setHistory(history)
    }
    // `stored`: the store already has it (edit mode's Save waits for the store before anything changes on screen).
    if (!stored) void boardStore.saveFrom(workspaceId, next, token).then(ok => setSaveState(ok ? 'saved' : 'failed'))

    // Versions: each board whose content changed, with the one before it as a starting point the first time.
    const at = new Date().toISOString()
    let nextLog = readLog()
    const beforeById = new Map(before.boards.map(b => [b.id, b]))
    for (const b of next.boards) {
      const old = beforeById.get(b.id)
      if (old && JSON.stringify(old) === JSON.stringify(b)) continue
      if (old && !nextLog[b.id]) nextLog = recordVersion(nextLog, old, at, options.by)
      nextLog = recordVersion(nextLog, b, at, options.by)
    }
    const alive = new Set([...next.boards.map(b => b.id), ...(next.deleted ?? []).map(d => d.board.id)])
    nextLog = keepVersionsOf(nextLog, alive)
    live.current = { ...live.current, log: nextLog }
    setVersions({ workspaceId, log: nextLog })
    versionStore.save(workspaceId, nextLog)
  }

  /** The latest document and the board on screen in it. */
  const current = () => {
    const latest = live.current.doc
    return { doc: latest, board: latest?.boards.find(b => b.id === live.current.shownId) ?? null }
  }

  /** A change to edit mode's held cards: one undo step, or part of the drag (`step`) the last change belonged to. */
  const changeDraft = (held: Draft, cards: BoardCard[], label = SOME_CHANGE, step?: string) => {
    if (sameCards(cards, held.cards)) return
    if (step && held.step === step) {
      // A drag or resize sends a change per frame; they're one step. One that ends where its step began (Esc) is none.
      const before = held.past.at(-1)
      const back = before !== undefined && sameCards(before.cards, cards)
      setDraftNow({ ...held, cards, past: back ? held.past.slice(0, -1) : held.past, step: back ? null : step })
      return
    }
    setDraftNow({
      ...held, cards, past: [...held.past, { cards: held.cards, label }].slice(-UNDO_LIMIT), future: [], step: step ?? null,
    })
  }

  const update = (change: (board: Board) => Board, label?: string, step?: string) => {
    const { doc, board } = current()
    if (!doc || !board) return
    const held = live.current.draft
    if (held && held.boardId === board.id) {
      changeDraft(held, change({ ...board, cards: held.cards }).cards, label, step)
      return
    }
    const next = change(board)
    if (next === board) return
    persist(replaceBoard(doc, next), 'change', label)
  }

  const updateBoard = (id: string, change: (board: Board) => Board, label?: string) => {
    const { doc } = current()
    const target = doc?.boards.find(b => b.id === id)
    if (!doc || !target) return
    const held = live.current.draft
    if (held && held.boardId === id) {
      changeDraft(held, change({ ...target, cards: held.cards }).cards, label)
      return
    }
    const next = change(target)
    if (next === target) return
    persist(replaceBoard(doc, next), 'change', label)
  }

  // ── Edit mode (Dev, 19 Nov): changes are held until Save; Cancel throws them away. ──
  const beginEdit = () => {
    const { board } = current()
    if (!board || live.current.draft?.boardId === board.id) return
    setDraftNow({ boardId: board.id, cards: board.cards, past: [], future: [], step: null })
  }

  const discardEdit = () => setDraftNow(null)

  const saveEdit = async () => {
    const held = live.current.draft
    const { doc } = current()
    if (!held || !doc || !workspaceId) return true
    const saved = doc.boards.find(b => b.id === held.boardId)
    if (!saved || sameCards(held.cards, saved.cards)) {
      setDraftNow(null)
      return true
    }
    const { cards } = held
    const next = replaceBoard(doc, { ...saved, cards })
    const ok = await boardStore.saveFrom(workspaceId, next, token)
    // A failed Save keeps edit mode open and says so itself, so `saveState` (the quiet saves' warning) isn't touched.
    if (!ok) return false
    setSaveState('saved')
    // One Save is one change: one undo step outside edit mode, one version.
    const latest = live.current.doc
    const latestBoard = latest?.boards.find(b => b.id === held.boardId)
    if (latest && latestBoard) persist(replaceBoard(latest, { ...latestBoard, cards }), 'change', 'Edit board', latest === doc)
    // Changes made while the save was on its way stay in edit mode.
    const now = live.current.draft
    setDraftNow(now && now.boardId === held.boardId && !sameCards(now.cards, cards) ? now : null)
    return true
  }

  const select = (id: string) => {
    const { doc } = current()
    if (!doc || !doc.boards.some(b => b.id === id)) return
    if (!tabsOf(doc).includes(id)) persist(withTab(doc, id), 'change', 'Show tab')
    showOn(id)
  }

  const add = (name = 'Untitled board') => {
    const { doc } = current()
    if (!doc) return null
    const id = newBoardId()
    persist(addBoard(doc, { id, name: freeName(doc, name.slice(0, BOARD_NAME_MAX), undefined, BOARD_NAME_MAX), cards: [] }), 'change', 'New board')
    showOn(id)
    return id
  }

  const addMade = (made: Board) => {
    const { doc } = current()
    if (!doc) return
    const id = doc.boards.some(b => b.id === made.id) ? newBoardId() : made.id
    persist(addBoard(doc, { ...made, id, name: freeName(doc, made.name.slice(0, BOARD_NAME_MAX), undefined, BOARD_NAME_MAX) }), 'change', 'New board')
    showOn(id)
  }

  const duplicate = (id: string) => {
    const { doc } = current()
    if (!doc) return null
    const copyId = newBoardId()
    const next = duplicateBoard(doc, id, copyId)
    if (next === doc) return null
    persist(next, 'change', 'Duplicate')
    showOn(copyId)
    return () => {
      const { doc } = current()
      if (!doc) return
      const back = discardBoard(doc, copyId)
      if (back === doc) return
      persist(back)
      if (live.current.shownId === copyId) open(id)
    }
  }

  const discard = (id: string, then: string | null = null) => {
    const { doc } = current()
    if (!doc) return null
    const at = doc.boards.findIndex(b => b.id === id)
    const board = doc.boards[at]
    const before = tabsOf(doc)
    const next = discardBoard(doc, id)
    if (!board || next === doc) return null
    persist(next, 'change', 'Cancel')
    if (then && next.boards.some(b => b.id === then)) open(then)
    else leaveScreen(id)
    return () => {
      const { doc } = current()
      if (!doc) return
      persist(rejoinBoard(doc, board, at, before))
      open(id)
    }
  }

  const rename = (id: string, name: string) => {
    const { doc } = current()
    if (!doc) return null
    const next = renameBoards(doc, { [id]: name }, BOARD_NAME_MAX)
    if (next === doc) return null
    persist(next, 'change', 'Rename')
    return next.boards.find(b => b.id === id)?.name ?? null
  }

  /** Leaves the board on screen when it goes from the tabs: the screen falls back to the home board. */
  const leaveScreen = (id: string) => {
    if (live.current.shownId !== id) return
    showOn(null)
  }

  /** Shows a board by id, as the screen's board. */
  const open = (id: string) => showOn(id)

  const remove = (id: string) => {
    const { doc } = current()
    if (!doc) return null
    const next = deleteBoard(doc, id, new Date().toISOString())
    if (next === doc) return null
    persist(next, 'change', 'Delete board')
    leaveScreen(id)
    return () => { restore(id) }
  }

  const restore = (id: string, show = true): (() => void) | null => {
    const { doc } = current()
    if (!doc) return null
    const entry = doc.deleted?.find(d => d.board.id === id)
    const next = restoreBoard(doc, id)
    if (!entry || next === doc) return null
    persist(next, 'change', 'Restore')
    if (show) open(id)
    return () => {
      const { doc } = current()
      if (!doc) return
      persist(deleteBoard(doc, id, entry.deletedAt))
      leaveScreen(id)
    }
  }

  /** Sets the tabs back to an earlier list (an Undo). */
  const tabsBack = (tabs: string[]) => {
    const { doc } = current()
    if (doc) persist(setTabs(doc, tabs))
  }

  const hide = (id: string) => {
    const { doc } = current()
    if (!doc) return null
    const before = tabsOf(doc)
    const next = withoutTab(doc, id)
    if (next === doc) return null
    persist(next, 'change', 'Hide tab')
    leaveScreen(id)
    return () => tabsBack(before)
  }

  const show = (id: string) => {
    const { doc } = current()
    if (!doc) return null
    const before = tabsOf(doc)
    const next = withTab(doc, id)
    if (next === doc) return null
    persist(next, 'change', 'Show tab')
    return () => tabsBack(before)
  }

  const leave = (id: string) => {
    const { doc } = current()
    if (!doc) return null
    const at = doc.boards.findIndex(b => b.id === id)
    const board = doc.boards[at]
    const before = tabsOf(doc)
    const next = leaveBoard(doc, id)
    if (!board || next === doc) return null
    persist(next, 'change', 'Leave board')
    leaveScreen(id)
    return () => {
      const { doc } = current()
      if (doc) persist(rejoinBoard(doc, board, at, before))
    }
  }

  const manage = ({ tabs, names }: { tabs: string[]; names: Record<string, string> }) => {
    const { doc } = current()
    if (!doc) return
    const next = renameBoards(setTabs(doc, tabs), names, BOARD_NAME_MAX)
    if (next === doc) return
    persist(next, 'change', 'Manage tabs')
    const shown = live.current.shownId
    if (shown && !tabsOf(next).includes(shown)) leaveScreen(shown)
  }

  const reorderTabs = (ids: string[]) => {
    const { doc } = current()
    if (!doc) return
    const next = orderTabs(doc, ids)
    if (JSON.stringify(tabsOf(next)) !== JSON.stringify(tabsOf(doc))) persist(next, 'change', 'Reorder tabs')
  }

  const starter = board && catalog ? starterFor(board.id, catalog, unavailable) : null
  const reset = () => {
    if (!starter || !board) return
    update(() => ({ ...starter, name: board.name }), 'Start over')
  }

  const undo = () => {
    const held = live.current.draft
    if (held && held.boardId === live.current.shownId) {
      const previous = held.past.at(-1)
      if (!previous) return null
      setDraftNow({
        ...held, cards: previous.cards, past: held.past.slice(0, -1),
        future: [{ cards: held.cards, label: previous.label }, ...held.future], step: null,
      })
      return previous.label
    }
    const { doc } = current()
    const { past, future } = live.current.history
    const previous = past.at(-1)
    if (!previous || !doc) return null
    const history = { past: past.slice(0, -1), future: [{ doc, label: previous.label }, ...future] }
    live.current = { ...live.current, history }
    setHistory(history)
    persist(previous.doc, 'undo')
    return previous.label
  }

  const redo = () => {
    const held = live.current.draft
    if (held && held.boardId === live.current.shownId) {
      const following = held.future[0]
      if (!following) return null
      setDraftNow({
        ...held, cards: following.cards, past: [...held.past, { cards: held.cards, label: following.label }],
        future: held.future.slice(1), step: null,
      })
      return following.label
    }
    const { doc } = current()
    const { past, future } = live.current.history
    const following = future[0]
    if (!following || !doc) return null
    const history = { past: [...past, { doc, label: following.label }], future: future.slice(1) }
    live.current = { ...live.current, history }
    setHistory(history)
    persist(following.doc, 'redo')
    return following.label
  }

  const versionsOf = (id: string) => (log ?? (workspaceId ? versionStore.load(workspaceId) : {}))[id] ?? []

  const restoreVersion = (id: string, at: string) => {
    const { doc } = current()
    if (!doc) return
    const version = readLog()[id]?.find(v => v.at === at)
    if (!version) return
    if (doc.boards.some(b => b.id === id)) persist(replaceBoard(doc, version.board))
    showOn(id)
  }

  return {
    boards: doc?.boards ?? [],
    tabs: doc ? tabBoards(doc) : [],
    hidden: doc ? hiddenBoards(doc) : [],
    board,
    deleted: doc?.deleted ?? [],
    pristine: !saved,
    saveState,
    where: boardStore.where,
    update,
    updateBoard,
    editing: editDraft !== null,
    dirty: editDraft !== null && savedBoard !== null && !sameCards(editDraft.cards, savedBoard.cards),
    beginEdit,
    discardEdit,
    saveEdit,
    select,
    add,
    addMade,
    duplicate,
    discard,
    rename,
    remove,
    restore,
    hide,
    show,
    leave,
    reorderTabs,
    manage,
    reset,
    canReset: starter !== null,
    undo,
    redo,
    canUndo: editDraft ? editDraft.past.length > 0 : history.past.length > 0,
    canRedo: editDraft ? editDraft.future.length > 0 : history.future.length > 0,
    versionsOf,
    restoreVersion,
    held: board && saved && !availability.settled && STARTER_IDS.includes(board.id)
      ? new Set(board.cards.filter(card => card.id.startsWith(`${board.id}-`)).map(card => card.id))
      : NONE,
  }
}
