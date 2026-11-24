import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Board as SavedBoard, Warehouse } from '@/lib/api/warehouse'
import { BoardStore, type Layout } from './board-store'

const VIEWER = 'auth0|viewer'
const OTHER = 'auth0|other'

const layout = (over: Partial<Layout> = {}): Layout => ({
  cards: [{ metricId: 'revenue', size: 'md', x: 0, y: 0 }], initialCards: [], period: '7d', compare: 'previous',
  position: 0, hidden: false, deletedAt: null, ...over,
})

const saved = (id: string, name: string, createdBy: string, l: Layout, role: SavedBoard['role'] = createdBy === VIEWER ? 'owner' : 'view'): SavedBoard =>
  ({ id, name, layout: l, metrics: ['revenue'], general: 'view', grants: [], createdBy, updatedAt: '2025-11-14T09:00:00Z', role })

function warehouseWith(boards: SavedBoard[], defaultBoard: string | null = null) {
  return {
    defaultBoard,
    boards: vi.fn(async () => boards),
    putBoard: vi.fn(async (id: string) => boards.find((b) => b.id === id)!),
    deleteBoard: vi.fn(async () => {}),
  }
}

describe('BoardStore', () => {
  let api: ReturnType<typeof warehouseWith>
  let store: BoardStore

  beforeEach(() => {
    api = warehouseWith([
      saved('b', 'Second', VIEWER, layout({ position: 1 })),
      saved('a', 'First', VIEWER, layout({ position: 0 })),
      saved('h', 'Hidden', VIEWER, layout({ position: 2, hidden: true })),
      saved('d', 'Deleted', VIEWER, layout({ position: 3, deletedAt: 1000 })),
      saved('s', 'Shared', OTHER, layout({ position: 4, hidden: true })),
    ])
    store = new BoardStore(api as unknown as Warehouse, VIEWER)
  })

  it('loads the viewer’s boards in their order, then the ones shared with them, read only', async () => {
    const people = new Map([[OTHER, { name: 'Another member', initials: 'AM' }]])
    const state = await store.load(people)
    expect(state.tabs).toEqual(['a', 'b', 's'])
    expect(state.hidden).toEqual(['h'])
    expect(state.deleted).toEqual([{ id: 'd', deletedAt: 1000 }])
    expect(state.openId).toBe('a')
    expect(state.boards.a.access).toBe('owner')
    expect(state.boards.s).toMatchObject({ access: 'view', ownerId: OTHER, general: 'view', sharedBy: { name: 'Another member' } })
  })

  it('writes nothing back when nothing changed', async () => {
    const state = await store.load(new Map())
    await store.save(state, new Set(['revenue']))
    expect(api.putBoard).not.toHaveBeenCalled()
    expect(api.deleteBoard).not.toHaveBeenCalled()
  })

  it('writes a changed board with its place, only the metrics the warehouse knows, and never someone else’s', async () => {
    const state = await store.load(new Map())
    const cards = [...state.boards.a.cards, { metricId: 'gone_metric', size: 'sm' as const, x: 2, y: 0 }]
    const next = { ...state, tabs: ['b', 'a', 's'], boards: { ...state.boards, a: { ...state.boards.a, label: 'Renamed', cards }, s: { ...state.boards.s, label: 'Mine now?' } } }
    await store.save(next, new Set(['revenue']))
    const written = api.putBoard.mock.calls.map(([id]) => id)
    expect(written.sort()).toEqual(['a', 'b'])
    const a = api.putBoard.mock.calls.find(([id]) => id === 'a')![1] as unknown as { name: string; metrics: string[]; layout: Layout }
    expect(a.name).toBe('Renamed')
    expect(a.metrics).toEqual(['revenue'])
    expect(a.layout.position).toBe(1)
  })

  it('deletes a board of theirs that is gone (purged, discarded)', async () => {
    const state = await store.load(new Map())
    const boards = { ...state.boards }
    delete boards.d
    await store.save({ ...state, boards, deleted: [] }, new Set(['revenue']))
    expect(api.deleteBoard).toHaveBeenCalledWith('d')
  })

  it('a refused write is reported and tried again on the next save', async () => {
    const state = await store.load(new Map())
    const next = { ...state, boards: { ...state.boards, a: { ...state.boards.a, label: 'Renamed' } } }
    api.putBoard.mockRejectedValueOnce(new Error('403'))
    await expect(store.save(next, new Set(['revenue']))).rejects.toThrow('403')
    await store.save(next, new Set(['revenue']))
    expect(api.putBoard).toHaveBeenCalledTimes(2)
  })

  it('someone who can edit saves the cards and leaves the board where its owner keeps it', async () => {
    api = warehouseWith([saved('e', 'Team board', OTHER, layout({ position: 7, hidden: true }), 'edit')])
    store = new BoardStore(api as unknown as Warehouse, VIEWER)
    const state = await store.load(new Map())
    expect(state.tabs).toEqual(['e'])
    await store.save(state, new Set(['revenue']))
    expect(api.putBoard).not.toHaveBeenCalled()
    const cards = [{ metricId: 'revenue', size: 'full' as const, x: 0, y: 0 }]
    await store.save({ ...state, boards: { e: { ...state.boards.e, cards } } }, new Set(['revenue']))
    const sent = api.putBoard.mock.calls[0][1] as unknown as { layout: Layout }
    expect(sent.layout).toMatchObject({ cards, position: 7, hidden: true, deletedAt: null })
    // Leaving it takes it off their tabs; the board stays its owner's.
    await store.save({ ...state, boards: {}, tabs: [] }, new Set(['revenue']))
    expect(api.deleteBoard).not.toHaveBeenCalled()
  })

  it('a member with no boards of their own opens on the workspace’s default board', async () => {
    api = warehouseWith([saved('x', 'Ads', OTHER, layout()), saved('y', 'Store overview', OTHER, layout())], 'y')
    const fresh = await new BoardStore(api as unknown as Warehouse, VIEWER).load(new Map())
    expect(fresh.tabs).toEqual(['y', 'x'])
    expect(fresh.openId).toBe('y')
    api = warehouseWith([saved('mine', 'Mine', VIEWER, layout()), saved('y', 'Store overview', OTHER, layout())], 'y')
    expect((await new BoardStore(api as unknown as Warehouse, VIEWER).load(new Map())).openId).toBe('mine')
  })

  it('a board its owner deleted is gone for everyone else at once', async () => {
    api = warehouseWith([saved('gone', 'Old', OTHER, layout({ deletedAt: 1000 })), saved('y', 'Store overview', OTHER, layout())])
    const state = await new BoardStore(api as unknown as Warehouse, VIEWER).load(new Map())
    expect(state.tabs).toEqual(['y'])
    expect(state.boards.gone).toBeUndefined()
  })

  it('who sees a board is saved with it', async () => {
    const state = await store.load(new Map())
    const grants = [{ userId: OTHER, role: 'edit' as const }]
    await store.save({ ...state, boards: { ...state.boards, a: { ...state.boards.a, general: 'none', grants } } }, new Set(['revenue']))
    expect(api.putBoard.mock.calls[0][1]).toMatchObject({ general: 'none', grants })
  })

  it('leaves out a board whose layout it doesn’t recognise and still shows the rest', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    api.boards.mockResolvedValueOnce([saved('x', 'Broken', VIEWER, { cards: 'nope' } as unknown as Layout), saved('y', 'Fine', VIEWER, layout())])
    const state = await store.load(new Map())
    expect(Object.keys(state.boards)).toEqual(['y'])
  })
})
