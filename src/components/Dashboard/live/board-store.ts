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

/**
 * The boards of one warehouse, as the viewer sees them. Loads them into the dashboard's state and
 * writes back what changed: the viewer's own boards only, since only a board's maker changes it.
 */
export class BoardStore {
  /** Board id → the request last written, to send only what changed. */
  private readonly written = new Map<string, string>()
  private queue: Promise<void> = Promise.resolve()

  constructor(private readonly warehouse: Warehouse, private readonly viewer: string) {}

  /** The viewer's boards and the boards shared with them; an empty state when there are none yet. */
  async load(people: Map<string, Person>, signal?: AbortSignal): Promise<DashboardState> {
    const saved = await this.warehouse.boards(signal)
    const read = saved.map((wire) => ({ wire, layout: layoutSchema.parse(wire.layout) }))
    const own = read.filter((b) => b.wire.createdBy === this.viewer).sort((a, b) => a.layout.position - b.layout.position)
    const others = read.filter((b) => b.wire.createdBy !== this.viewer)
    for (const { wire, layout } of own) this.written.set(wire.id, canonical({ name: wire.name, layout, metrics: wire.metrics, shared: wire.shared }))
    const boards = Object.fromEntries(read.map(({ wire, layout }) => [wire.id, this.boardOf(wire, layout, people)]))
    const tabs = [
      ...own.filter((b) => !b.layout.hidden && b.layout.deletedAt === null).map((b) => b.wire.id),
      ...others.map((b) => b.wire.id),
    ]
    return {
      boards,
      tabs,
      hidden: own.filter((b) => b.layout.hidden && b.layout.deletedAt === null).map((b) => b.wire.id),
      deleted: own.filter((b) => b.layout.deletedAt !== null).map((b) => ({ id: b.wire.id, deletedAt: b.layout.deletedAt! })),
      openId: tabs[0] ?? '',
    }
  }

  /** Writes the viewer's boards that changed since the last write and deletes the ones that went; one write at a time. */
  save(state: DashboardState, measurable: Set<string>): Promise<void> {
    const next = new Map<string, BoardRequest>()
    // Place among the viewer's own boards: tabs, then hidden, then Recently deleted.
    const places = [...state.tabs, ...state.hidden, ...state.deleted.map((d) => d.id)]
      .filter((id) => state.boards[id]?.access === 'owner' && !state.boards[id].draft)
    places.forEach((id, position) => {
      const board = state.boards[id]
      const deleted = state.deleted.find((d) => d.id === id)
      const layout: Layout = {
        cards: board.cards, initialCards: board.initialCards, period: board.period, compare: layoutSchema.shape.compare.parse(board.compare),
        position, hidden: state.hidden.includes(id), deletedAt: deleted?.deletedAt ?? null,
      }
      const metrics = [...new Set(board.cards.map((c) => Metrics.base(c.metricId)))].filter((name) => measurable.has(name))
      next.set(id, { name: board.label, layout, metrics, shared: board.shared })
    })
    const job = async () => {
      for (const [id, request] of next) {
        const text = canonical(request)
        if (this.written.get(id) === text) continue
        await this.warehouse.putBoard(id, request)
        this.written.set(id, text)
      }
      for (const id of [...this.written.keys()]) {
        if (next.has(id)) continue
        await this.warehouse.deleteBoard(id)
        this.written.delete(id)
      }
    }
    this.queue = this.queue.then(job, job)
    return this.queue
  }

  private boardOf(wire: SavedBoard, layout: Layout, people: Map<string, Person>): Board {
    const owner = wire.createdBy === this.viewer
    return {
      id: wire.id,
      label: wire.name,
      cards: layout.cards,
      initialCards: layout.initialCards,
      period: layout.period,
      compare: layout.compare,
      access: owner ? 'owner' : 'view',
      sharedBy: owner ? undefined : people.get(wire.createdBy),
      shared: wire.shared,
    }
  }
}

/** One spelling per request: the layout in the schema's key order, metrics sorted. */
function canonical(request: BoardRequest): string {
  return JSON.stringify({ ...request, layout: layoutSchema.parse(request.layout), metrics: [...request.metrics].sort() })
}
