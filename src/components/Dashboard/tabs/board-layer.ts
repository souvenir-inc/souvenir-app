// The boards on screen = the server's boards (React Query) + the viewer's changes not saved yet.
//
// The server's boards stay in the query cache (SD-ST-02) and are refetched like any other server
// data. What the viewer changed is kept as the reducer actions they made (`PendingBoards`), and the
// screen replays them on the latest server boards (`rebase`), so a refetch that brings someone
// else's change keeps the viewer's own on top of it. Once a save lands, the snapshot it returns
// carries the last action it included (`seq`), and those actions drop out.

import { boardReducer, type BoardAction, type DashboardState } from './board-state'

/** One change the viewer made, in order. */
export interface PendingEntry {
  seq: number
  action: BoardAction
}

/**
 * The boards as the server has them (the boards query's data). `seq` is the last pending action the
 * server already has; `carry` puts back what is never written (Ask the AI drafts, 08 NB-21).
 */
export interface BoardsSnapshot {
  state: DashboardState
  seq: number
  carry: BoardAction[]
}

/** The server's boards with the viewer's unsaved changes on top; `openId` is the viewer's open board. */
export function rebase(snapshot: BoardsSnapshot, entries: readonly PendingEntry[], openId: string): DashboardState {
  const start: DashboardState = { ...snapshot.state, openId }
  const actions = [...snapshot.carry, ...entries.filter((e) => e.seq > snapshot.seq).map((e) => e.action)]
  const state = actions.reduce(boardReducer, start)
  // The open board went (deleted by its owner, unshared): the first tab opens (TAB-55).
  return state.tabs.includes(state.openId) ? state : { ...state, openId: state.tabs[0] ?? '' }
}

/** What the server keeps of a state that was just written: everything but drafts. */
export function serverView(state: DashboardState): DashboardState {
  const drafts = new Set(Object.values(state.boards).filter((b) => b.draft).map((b) => b.id))
  if (!drafts.size) return state
  const boards = Object.fromEntries(Object.entries(state.boards).filter(([id]) => !drafts.has(id)))
  return { ...state, boards, tabs: state.tabs.filter((id) => !drafts.has(id)), hidden: state.hidden.filter((id) => !drafts.has(id)) }
}

/** The drafts a written state had, as actions that put them back where they were. */
export function draftCarry(state: DashboardState): BoardAction[] {
  return state.tabs.flatMap((id, index) => {
    const board = state.boards[id]
    return board?.draft ? [{ type: 'add-board' as const, board, index, open: false }] : []
  })
}

interface PendingSnapshot {
  entries: readonly PendingEntry[]
  /** The highest seq a save has started with; later changes are what's waiting. */
  attempted: number
}

/**
 * The viewer's changes not yet saved: a small external store, read with `useSyncExternalStore`
 * (SD-ST-05). The board store reads it while saving, so a save always takes every change made
 * before it starts, never a copy a render captured.
 */
export class PendingBoards {
  private seq = 0
  private snapshot: PendingSnapshot = { entries: [], attempted: 0 }
  private readonly listeners = new Set<() => void>()

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  getSnapshot = (): PendingSnapshot => this.snapshot

  push(action: BoardAction) {
    this.set({ ...this.snapshot, entries: [...this.snapshot.entries, { seq: ++this.seq, action }] })
  }

  /** Changes after `seq`, the ones the server doesn't have yet. */
  after(seq: number): PendingEntry[] {
    return this.snapshot.entries.filter((e) => e.seq > seq)
  }

  /** The last seq handed out. */
  get latest(): number {
    return this.seq
  }

  /** Changes up to `seq` are on their way: nothing to save on its own until a newer change comes. */
  markAttempted(seq: number) {
    if (seq > this.snapshot.attempted) this.set({ ...this.snapshot, attempted: seq })
  }

  /** Forget changes up to `seq`: saved (the server has them) or refused (rolled back). */
  drop(seq: number) {
    if (!this.snapshot.entries.some((e) => e.seq <= seq)) return
    this.set({ ...this.snapshot, entries: this.snapshot.entries.filter((e) => e.seq > seq) })
  }

  /** Waiting to be saved: a change no save has started with yet. */
  get unsent(): boolean {
    return this.snapshot.entries.some((e) => e.seq > this.snapshot.attempted)
  }

  /** Any change the server doesn't have yet, sent or not. */
  get unsaved(): boolean {
    return this.snapshot.entries.length > 0
  }

  private set(next: PendingSnapshot) {
    this.snapshot = next
    for (const listener of this.listeners) listener()
  }
}
