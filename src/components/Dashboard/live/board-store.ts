import { z } from 'zod'
import type { Board as SavedBoard, BoardRequest, Warehouse } from '@/lib/api/warehouse'
import type { Board, DashboardState, Person } from '../tabs/board-state'
import { Metrics } from './metrics'

const cardSchema = z.object({
  metricId: z.string(),
  size:     z.enum(['sm', 'sm-tall', 'md', 'lg', 'full', 'full-lg']),
  x:        z.number().int(),
  y:        z.number().int(),
  chart:    z.enum(['trend', 'bars']).optional(),
})

/** What the dashboard keeps in a board's `layout`: its cards and dates, and where its owner keeps it. */
export const layoutSchema = z.object({
  cards:        z.array(cardSchema),
  initialCards: z.array(cardSchema),
  period:       z.string(),
  compare:      z.enum(['previous', 'last-year', 'none']),
  /** Place in the owner's tabs, then hidden boards, then Recently deleted. */
  position:     z.number().int(),
  hidden:       z.boolean(),
  /** ms since epoch; restorable for 30 days (TAB-43). */
  deletedAt:    z.number().nullable(),
})

export type Layout = z.infer<typeof layoutSchema>

type Place = Pick<Layout, 'position' | 'hidden' | 'deletedAt'>

/**
 * The boards of one warehouse, as the viewer sees them. Loads them into the dashboard's state and
 * writes back what changed: the viewer's own boards, and the cards and dates of boards they can
 * edit. Where a board sits (tab order, hidden, deleted) is its owner's, so an editor sends it back
 * as it came.
 */
export class BoardStore {
  /** Board id → the request last written, to send only what changed. */
  private readonly written = new Map<string, string>()
  /** Where each board someone else owns sits in its owner's tabs. */
  private readonly places = new Map<string, Place>()
  private queue: Promise<void> = Promise.resolve()

  constructor(private readonly warehouse: Warehouse, private readonly viewer: string) {}

  /** The viewer's boards and the boards shared with them; an empty state when there are none yet. */
  async load(people: Map<string, Person>, signal?: AbortSignal): Promise<DashboardState> {
    const saved = await this.warehouse.boards(signal)
    // A board whose layout doesn't parse is left out (and left alone), not a reason to fail every board.
    const read = saved.flatMap((wire) => {
      const layout = layoutSchema.safeParse(wire.layout)
      if (layout.success) return [{ wire, layout: layout.data }]
      console.warn('[dashboard] skipped a board with an unreadable layout', wire.id)
      return []
    })
    const own = read.filter((b) => b.wire.createdBy === this.viewer).sort((a, b) => a.layout.position - b.layout.position)
    const others = read.filter((b) => b.wire.createdBy !== this.viewer)
    for (const { wire, layout } of read) {
      if (wire.role !== 'view') this.written.set(wire.id, canonical({ name: wire.name, layout, metrics: wire.metrics, general: wire.general, grants: wire.grants }))
      if (wire.role !== 'owner') this.places.set(wire.id, { position: layout.position, hidden: layout.hidden, deletedAt: layout.deletedAt })
    }
    // Someone else's board its owner has since deleted isn't shown; the rest follow the viewer's own.
    const shown = read.filter((b) => b.wire.role === 'owner' || b.layout.deletedAt === null)
    const boards = Object.fromEntries(shown.map(({ wire, layout }) => [wire.id, this.boardOf(wire, layout, people)]))
    const theirs = others.filter((b) => b.layout.deletedAt === null).map((b) => b.wire.id)
    const mine = own.filter((b) => !b.layout.hidden && b.layout.deletedAt === null).map((b) => b.wire.id)
    // Until a member arranges boards of their own, they open on the workspace's default board.
    const first = mine.length === 0 && this.warehouse.defaultBoard !== null && theirs.includes(this.warehouse.defaultBoard) ? [this.warehouse.defaultBoard] : []
    const tabs = [...first, ...mine, ...theirs.filter((id) => !first.includes(id))]
    return {
      boards,
      tabs,
      hidden: own.filter((b) => b.layout.hidden && b.layout.deletedAt === null).map((b) => b.wire.id),
      deleted: own.filter((b) => b.layout.deletedAt !== null).map((b) => ({ id: b.wire.id, deletedAt: b.layout.deletedAt! })),
      openId: tabs[0] ?? '',
    }
  }

  /** Writes the boards the viewer may change that did change, and deletes their own that went; one write at a time. */
  save(state: DashboardState, measurable: Set<string>): Promise<void> {
    const next = new Map<string, BoardRequest>()
    // Place among the viewer's own boards: tabs, then hidden, then Recently deleted.
    const places = [...state.tabs, ...state.hidden, ...state.deleted.map((d) => d.id)]
      .filter((id) => state.boards[id]?.access === 'owner' && !state.boards[id].draft)
    const requestOf = (board: Board, place: Place): BoardRequest => ({
      name: board.label,
      layout: { cards: board.cards, initialCards: board.initialCards, period: board.period, compare: layoutSchema.shape.compare.parse(board.compare), ...place } satisfies Layout,
      metrics: [...new Set(board.cards.map((c) => Metrics.base(c.metricId)))].filter((name) => measurable.has(name)),
      general: board.general,
      grants: board.grants,
    })
    places.forEach((id, position) => {
      const deleted = state.deleted.find((d) => d.id === id)
      next.set(id, requestOf(state.boards[id], { position, hidden: state.hidden.includes(id), deletedAt: deleted?.deletedAt ?? null }))
    })
    for (const board of Object.values(state.boards)) {
      const place = this.places.get(board.id)
      if (board.access === 'edit' && place) next.set(board.id, requestOf(board, place))
    }
    // One refused write doesn't stop the others; what failed stays unwritten, so the next save tries it again.
    const job = async () => {
      const failed: unknown[] = []
      const attempt = async (write: () => Promise<void>) => { try { await write() } catch (error) { failed.push(error) } }
      for (const [id, request] of next) {
        const text = canonical(request)
        if (this.written.get(id) === text) continue
        await attempt(async () => { await this.warehouse.putBoard(id, request); this.written.set(id, text) })
      }
      for (const id of [...this.written.keys()]) {
        if (next.has(id)) continue
        // Their own board that went is deleted; one they could edit and left stays its owner's.
        await attempt(async () => { if (!this.places.has(id)) await this.warehouse.deleteBoard(id); this.written.delete(id) })
      }
      if (failed.length) throw failed[0]
    }
    this.queue = this.queue.then(job, job)
    return this.queue
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

/** One spelling per request: the layout in the schema's key order, metrics sorted. */
function canonical(request: BoardRequest): string {
  const grants = [...request.grants].sort((a, b) => a.userId.localeCompare(b.userId))
  return JSON.stringify({ name: request.name, layout: layoutSchema.parse(request.layout), metrics: [...request.metrics].sort(), general: request.general, grants })
}
