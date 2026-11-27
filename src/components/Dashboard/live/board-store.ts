import { z } from 'zod'
import type { Board as SavedBoard, BoardRequest, Warehouse } from '@/lib/api/warehouse'
import { logger } from '@/lib/logger'
import type { Board, DashboardState, Person } from '../tabs/board-state'
import { draftCarry, rebase, serverView, type BoardsSnapshot, type PendingBoards } from '../tabs/board-layer'
import { Metrics } from './metrics'
import { validCompare } from '../period'

const cardSchema = z.object({
  metricId: z.string(),
  size:     z.enum(['sm', 'sm-tall', 'md', 'lg', 'full', 'full-lg']),
  x:        z.number().int(),
  y:        z.number().int(),
  chart:    z.enum(['trend', 'bars']).optional(),
})

/** What the dashboard keeps in a board's `layout`: its cards and dates. Where it sits is each viewer's own, kept apart. */
export const layoutSchema = z.object({
  cards:        z.array(cardSchema),
  initialCards: z.array(cardSchema),
  period:       z.string(),
  compare:      z.enum(['previous', 'last-year', 'none']),
})

export type Layout = z.infer<typeof layoutSchema>

/** What is written for a board; its version is added when it is sent. */
type Content = Omit<BoardRequest, 'version'>

/** Boards the viewer could edit that were deleted or unshared since they loaded: nothing was written to them. */
export class BoardsGoneError extends Error {
  constructor(readonly ids: string[]) {
    super(`${ids.length === 1 ? 'A board was' : 'Boards were'} deleted or unshared`)
    this.name = 'BoardsGoneError'
  }
}

/** A save of pending changes that failed; `upTo` is the last change it carried, `cause` why it failed. */
export class CommitError extends Error {
  constructor(readonly upTo: number, readonly cause: unknown) {
    super('Saving the boards failed')
    this.name = 'CommitError'
  }
}

/**
 * The boards of one warehouse, as the viewer sees them. Loads them into the dashboard's state and
 * writes back what changed: the viewer's own boards, the cards and dates of boards they can edit,
 * and the viewer's own arrangement (tab order, hidden, left), which never touches anyone else's.
 */
export class BoardStore {
  /** Board id → the content last written, to send only what changed. */
  private readonly written = new Map<string, string>()
  /** Board id → the version (updatedAt) last read, sent back so a change someone else made first is refused (409). */
  private readonly versions = new Map<string, string>()
  /** Boards someone else owns that the viewer sees. */
  private readonly others = new Set<string>()
  /** Boards of other people that were deleted or unshared since they loaded: never written again. */
  private readonly gone = new Set<string>()
  /** Boards of other people the viewer has left. */
  private left: string[] = []
  /** The arrangement last written (or read). */
  private arranged = ''
  private queue: Promise<unknown> = Promise.resolve()
  /** The boards as the server has them, the last pending change they include, and the drafts to put back. */
  private base: DashboardState | null = null
  private seq = 0
  private carry: BoardsSnapshot['carry'] = []

  constructor(private readonly warehouse: Warehouse, private readonly viewer: string) {}

  /**
   * The boards as the server has them now, for the boards query. Reads wait for writes in flight
   * (one queue), so a read never lands between a write and the version it returns.
   */
  read(people: Map<string, Person>, signal?: AbortSignal): Promise<BoardsSnapshot> {
    return this.enqueue(async () => {
      await this.fetchState(people, signal)
      return this.snapshot()
    })
  }

  /** The viewer's boards and the boards shared with them; an empty state when there are none yet. */
  load(people: Map<string, Person>, signal?: AbortSignal): Promise<DashboardState> {
    return this.enqueue(() => this.fetchState(people, signal))
  }

  /** The last boards read or written, with the pending changes they include. */
  snapshot(): BoardsSnapshot {
    if (!this.base) throw new Error('BoardStore: no boards read yet')
    return { state: this.base, seq: this.seq, carry: this.carry }
  }

  /**
   * Saves every pending change made before this save starts, replayed on the latest boards read.
   * Resolves with the new snapshot; rejects with a `CommitError` naming the last change it carried.
   */
  commit(pending: PendingBoards, openId: string, measurable: Set<string>): Promise<BoardsSnapshot> {
    return this.enqueue(async () => {
      const entries = pending.after(this.seq)
      const upTo = entries.at(-1)?.seq ?? this.seq
      pending.markAttempted(upTo)
      const state = rebase(this.snapshot(), entries, openId)
      const written = (gone: string[] = []) => {
        const kept = serverView(state)
        this.base = gone.length ? dropBoards(kept, gone) : kept
        this.seq = upTo
        this.carry = draftCarry(state)
      }
      try {
        await this.write(state, measurable)
        written()
        return this.snapshot()
      } catch (error) {
        // Everything but the gone boards was written: the snapshot moves on without them.
        if (error instanceof BoardsGoneError) written(error.ids)
        throw new CommitError(upTo, error)
      }
    })
  }

  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = this.queue.then(job, job)
    this.queue = run.catch(() => undefined)
    return run
  }

  private async fetchState(people: Map<string, Person>, signal?: AbortSignal): Promise<DashboardState> {
    const saved = await this.warehouse.boards(signal)
    // A board whose layout doesn't parse is left out (and left alone), not a reason to fail every board.
    const read = saved.flatMap((wire) => {
      const layout = layoutSchema.safeParse(wire.layout)
      if (layout.success) return [{ wire, layout: layout.data }]
      logger.warn('[dashboard] skipped a board with an unreadable layout', wire.id)
      return []
    })
    // What the server has now is what the next save is measured against.
    this.written.clear()
    this.versions.clear()
    this.others.clear()
    for (const { wire, layout } of read) {
      this.versions.set(wire.id, wire.updatedAt)
      if (wire.role !== 'view') this.written.set(wire.id, canonical(contentOf(wire, layout)))
      if (wire.role !== 'owner') this.others.add(wire.id)
    }
    // Put away by its owner: only they get it back, in Recently deleted.
    const live = read.filter((b) => b.wire.deletedAt === null)
    const placed = (state: 'tabs' | 'hidden' | 'left') => live
      .filter((b) => b.wire.placement?.state === state)
      .sort((a, b) => a.wire.placement!.position - b.wire.placement!.position)
      .map((b) => b.wire.id)
    this.left = placed('left')
    // Boards the viewer hasn't placed yet follow the ones they have: their own join the tabs, and so
    // does a board shared with them by name; one only open to the whole workspace waits in All boards,
    // so it never lands in tabs uninvited (SH-14, SH-29).
    const unplaced = live.filter((b) => b.wire.placement === null)
    const mine = unplaced.filter((b) => b.wire.role === 'owner').map((b) => b.wire.id)
    const named = unplaced.filter((b) => b.wire.role !== 'owner' && b.wire.grants.some((g) => g.userId === this.viewer)).map((b) => b.wire.id)
    const workspace = unplaced.filter((b) => b.wire.role !== 'owner' && !named.includes(b.wire.id)).map((b) => b.wire.id)
    const inTabs = placed('tabs')
    // Until a member arranges boards or makes one, they open on the workspace's default board.
    const fallback = this.warehouse.defaultBoard
    const first = inTabs.length === 0 && mine.length === 0 && fallback !== null && [...named, ...workspace].includes(fallback) ? [fallback] : []
    const tabs = [...first, ...inTabs, ...mine, ...named.filter((id) => !first.includes(id))]
    const hidden = [...placed('hidden'), ...workspace.filter((id) => !first.includes(id))]
    this.arranged = JSON.stringify({ tabs, hidden, left: this.left })
    this.base = {
      boards: Object.fromEntries(read.filter((b) => !this.left.includes(b.wire.id)).map(({ wire, layout }) => [wire.id, this.boardOf(wire, layout, people)])),
      tabs,
      hidden,
      deleted: read.filter((b) => b.wire.deletedAt !== null).map((b) => ({ id: b.wire.id, deletedAt: Date.parse(b.wire.deletedAt!) })),
      openId: tabs[0] ?? '',
    }
    return this.base
  }

  /** Writes the boards the viewer may change that did change, deletes their own that went, then their arrangement; one write at a time. */
  save(state: DashboardState, measurable: Set<string>): Promise<void> {
    return this.enqueue(() => this.write(state, measurable))
  }

  private write(state: DashboardState, measurable: Set<string>): Promise<void> {
    const next = new Map<string, Content>()
    const deleted = new Set(state.deleted.map((d) => d.id))
    const listed = new Set([...state.tabs, ...state.hidden, ...deleted])
    for (const board of Object.values(state.boards)) {
      if (board.draft || this.gone.has(board.id)) continue
      if (board.access === 'edit' || (board.access === 'owner' && listed.has(board.id))) {
        next.set(board.id, {
          name: board.label,
          layout: { cards: board.cards, initialCards: board.initialCards, period: board.period, compare: validCompare(board.compare) ? board.compare : 'previous' } satisfies Layout,
          metrics: [...new Set(board.cards.map((c) => Metrics.base(c.metricId)))].filter((name) => measurable.has(name)),
          general: board.general,
          grants: board.grants,
          deleted: board.access === 'owner' && deleted.has(board.id),
        })
      }
    }
    const kept = (ids: string[]) => ids.filter((id) => state.boards[id] && !state.boards[id].draft && !deleted.has(id))
    // One refused write doesn't stop the others; what failed stays unwritten, so the next save tries it again.
    const job = async () => {
      const failed: unknown[] = []
      const attempt = async (write: () => Promise<void>) => { try { await write() } catch (error) { failed.push(error) } }
      // Someone else's board is read again before it is written: the warehouse makes a board again,
      // as the editor's own, when the save lands after its owner deleted it for good.
      const theirs = [...next].filter(([id, content]) => this.others.has(id) && this.written.get(id) !== canonical(content))
      const gone: string[] = []
      if (theirs.length > 0) {
        await attempt(async () => {
          const fresh = new Map((await this.warehouse.boards()).map((b) => [b.id, b]))
          for (const [id] of theirs) {
            const now = fresh.get(id)
            if (now && now.role === 'edit' && now.deletedAt === null) continue
            next.delete(id)
            this.written.delete(id)
            this.others.delete(id)
            this.gone.add(id)
            gone.push(id)
          }
        })
        // The list couldn't be read: their boards wait for the next save rather than go out unchecked.
        if (failed.length) for (const [id] of theirs) next.delete(id)
      }
      for (const [id, content] of next) {
        const text = canonical(content)
        if (this.written.get(id) === text) continue
        await attempt(async () => {
          const board = await this.warehouse.putBoard(id, { ...content, version: this.versions.get(id) ?? null })
          this.written.set(id, text)
          this.versions.set(id, board.updatedAt)
        })
      }
      for (const id of [...this.written.keys()]) {
        if (next.has(id)) continue
        // Their own board that went is deleted for good; one they could edit and left stays its owner's.
        await attempt(async () => {
          if (!this.others.has(id)) await this.warehouse.deleteBoard(id)
          this.written.delete(id)
          this.versions.delete(id)
        })
      }
      // Someone else's board that went from the viewer's boards is one they left; it stays its owner's.
      const leaving = [...this.others].filter((id) => !state.boards[id] && !this.left.includes(id))
      const arrangement = { tabs: kept(state.tabs), hidden: kept(state.hidden), left: [...this.left, ...leaving] }
      const text = JSON.stringify(arrangement)
      // Placed only once every board in it is written, so a new board doesn't miss its place.
      if (failed.length === 0 && text !== this.arranged) {
        await attempt(async () => {
          await this.warehouse.arrange(arrangement)
          this.arranged = text
          this.left = arrangement.left
        })
      }
      if (failed.length) throw failed[0]
      if (gone.length) throw new BoardsGoneError(gone)
    }
    return job()
  }

  private boardOf(wire: SavedBoard, layout: Layout, people: Map<string, Person>): Board {
    return {
      id: wire.id,
      label: wire.name,
      cards: layout.cards,
      initialCards: layout.initialCards,
      period: layout.period,
      compare: layout.compare,
      access: wire.role,
      sharedBy: wire.role === 'owner' ? undefined : people.get(wire.createdBy),
      ownerId: wire.createdBy,
      general: wire.general,
      grants: wire.grants,
    }
  }
}

/** A state without the given boards (deleted or unshared by their owner). */
function dropBoards(state: DashboardState, ids: string[]): DashboardState {
  const gone = new Set(ids)
  return {
    ...state,
    boards: Object.fromEntries(Object.entries(state.boards).filter(([id]) => !gone.has(id))),
    tabs: state.tabs.filter((id) => !gone.has(id)),
    hidden: state.hidden.filter((id) => !gone.has(id)),
  }
}

/** What a saved board holds, as it would be written back. */
function contentOf(wire: SavedBoard, layout: Layout): Content {
  return { name: wire.name, layout, metrics: wire.metrics, general: wire.general, grants: wire.grants, deleted: wire.deletedAt !== null }
}

/** One spelling per board: the layout in the schema's key order, metrics and grants sorted. */
function canonical(content: Content): string {
  const grants = [...content.grants].sort((a, b) => a.userId.localeCompare(b.userId))
  return JSON.stringify({ name: content.name, layout: layoutSchema.parse(content.layout), metrics: [...content.metrics].sort(), general: content.general, grants, deleted: content.deleted })
}
