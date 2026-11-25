import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Board as SavedBoard, Warehouse } from '@/lib/api/warehouse'
import { BoardStore, type Layout } from './board-store'

const VIEWER = 'auth0|viewer'
const OTHER = 'auth0|other'

const layout = (over: Partial<Layout> = {}): Layout => ({
  cards: [{ metricId: 'revenue', size: 'md', x: 0, y: 0 }], initialCards: [], period: '7d', compare: 'previous', ...over,
})

type Place = SavedBoard['placement']
const at = (state: NonNullable<Place>['state'], position: number): Place => ({ state, position })

// Someone else's board is shared with the viewer by name unless `named` is false (then only workspace-wide).
const saved = (id: string, name: string, createdBy: string, placement: Place, over: Partial<SavedBoard> & { named?: boolean } = {}): SavedBoard => {
  const { named = true, ...rest } = over
  const role = rest.role ?? (createdBy === VIEWER ? 'owner' : 'view')
  return {
    id, name, layout: layout(), metrics: ['revenue'], general: 'view',
    grants: createdBy !== VIEWER && named ? [{ userId: VIEWER, role: role === 'edit' ? 'edit' : 'view' }] : [],
    createdBy, updatedAt: '2025-11-14T09:00:00Z', role, placement, deletedAt: null, ...rest,
  }
}

function warehouseWith(boards: SavedBoard[], defaultBoard: string | null = null) {
  let n = 0
  return {
    defaultBoard,
    boards: vi.fn(async () => boards),
    // The warehouse answers with the board as written, at a new version.
    putBoard: vi.fn(async (id: string) => ({ ...(boards.find((b) => b.id === id) ?? boards[0]), id, updatedAt: `2025-11-15T09:00:0${++n}Z` })),
    deleteBoard: vi.fn(async () => {}),
    arrange: vi.fn(async () => {}),
  }
}

type Sent = { name: string; metrics: string[]; layout: Layout; version: string | null; deleted: boolean; general: string; grants: unknown[] }

describe('BoardStore', () => {
  let api: ReturnType<typeof warehouseWith>
  let store: BoardStore

  beforeEach(() => {
    api = warehouseWith([
      saved('b', 'Second', VIEWER, at('tabs', 1)),
      saved('a', 'First', VIEWER, at('tabs', 0)),
      saved('h', 'Hidden', VIEWER, at('hidden', 0)),
      saved('d', 'Deleted', VIEWER, null, { deletedAt: '1970-01-01T00:00:01Z' }),
      saved('s', 'Shared', OTHER, null),
    ])
    store = new BoardStore(api as unknown as Warehouse, VIEWER)
  })

  it('loads the viewer’s boards where they keep them, then the ones shared with them, read only', async () => {
    const people = new Map([[OTHER, { name: 'Another member', initials: 'AM' }]])
    const state = await store.load(people)
    expect(state.tabs).toEqual(['a', 'b', 's'])
    expect(state.hidden).toEqual(['h'])
    expect(state.deleted).toEqual([{ id: 'd', deletedAt: 1000 }])
    expect(state.openId).toBe('a')
    expect(state.boards.a.access).toBe('owner')
    expect(state.boards.s).toMatchObject({ access: 'view', ownerId: OTHER, general: 'view', sharedBy: { name: 'Another member' } })
  })

  it('a board open to the whole workspace waits in All boards until it is placed (SH-18, SH-29)', async () => {
    api = warehouseWith([saved('mine', 'Mine', VIEWER, null), saved('w', 'Workspace', OTHER, null, { named: false }), saved('p', 'Placed', OTHER, at('tabs', 0), { named: false })])
    const state = await new BoardStore(api as unknown as Warehouse, VIEWER).load(new Map())
    expect(state.tabs).toEqual(['p', 'mine'])
    expect(state.hidden).toEqual(['w'])
  })

  it('writes nothing back when nothing changed', async () => {
    const state = await store.load(new Map())
    await store.save(state, new Set(['revenue']))
    expect(api.putBoard).not.toHaveBeenCalled()
    expect(api.deleteBoard).not.toHaveBeenCalled()
    expect(api.arrange).not.toHaveBeenCalled()
  })

  it('writes a changed board with the version it read, only the metrics the warehouse knows, and never someone else’s', async () => {
    const state = await store.load(new Map())
    const cards = [...state.boards.a.cards, { metricId: 'gone_metric', size: 'sm' as const, x: 2, y: 0 }]
    const next = { ...state, boards: { ...state.boards, a: { ...state.boards.a, label: 'Renamed', cards }, s: { ...state.boards.s, label: 'Mine now?' } } }
    await store.save(next, new Set(['revenue']))
    expect(api.putBoard.mock.calls.map(([id]) => id)).toEqual(['a'])
    const a = api.putBoard.mock.calls[0][1] as unknown as Sent
    expect(a).toMatchObject({ name: 'Renamed', metrics: ['revenue'], version: '2025-11-14T09:00:00Z', deleted: false })
    expect(Object.keys(a.layout).sort()).toEqual(['cards', 'compare', 'initialCards', 'period'])
    // The next write sends the version the warehouse answered with.
    await store.save({ ...next, boards: { ...next.boards, a: { ...next.boards.a, label: 'Again' } } }, new Set(['revenue']))
    expect(api.putBoard.mock.calls[1][1]).toMatchObject({ name: 'Again', version: '2025-11-15T09:00:01Z' })
  })

  it('a new tab order, a hidden board and a board the viewer left are the viewer’s own arrangement; no board is rewritten for it', async () => {
    const state = await store.load(new Map())
    const boards = { ...state.boards }
    delete boards.s
    await store.save({ ...state, boards, tabs: ['b'], hidden: ['h', 'a'] }, new Set(['revenue']))
    expect(api.arrange).toHaveBeenCalledWith({ tabs: ['b'], hidden: ['h', 'a'], left: ['s'] })
    expect(api.putBoard).not.toHaveBeenCalled()
    expect(api.deleteBoard).not.toHaveBeenCalled()
    // Written once; the same arrangement isn't sent again.
    await store.save({ ...state, boards, tabs: ['b'], hidden: ['h', 'a'] }, new Set(['revenue']))
    expect(api.arrange).toHaveBeenCalledTimes(1)
  })

  it('a board the viewer left stays gone, and where they keep someone else’s board is theirs to choose', async () => {
    api = warehouseWith([saved('l', 'Left', OTHER, at('left', 0)), saved('k', 'Kept', OTHER, at('hidden', 0)), saved('t', 'Tab', OTHER, at('tabs', 0))])
    store = new BoardStore(api as unknown as Warehouse, VIEWER)
    const state = await store.load(new Map())
    expect([state.tabs, state.hidden, Object.keys(state.boards).sort()]).toEqual([['t'], ['k'], ['k', 't']])
    await store.save({ ...state, tabs: ['t', 'k'], hidden: [] }, new Set(['revenue']))
    expect(api.arrange).toHaveBeenCalledWith({ tabs: ['t', 'k'], hidden: [], left: ['l'] })
  })

  it('a board its owner deletes is put away by the warehouse, and deleted for good once it is gone', async () => {
    const state = await store.load(new Map())
    await store.save({ ...state, tabs: ['b'], deleted: [...state.deleted, { id: 'a', deletedAt: 2000 }] }, new Set(['revenue']))
    expect(api.putBoard.mock.calls.map(([id, sent]) => [id, (sent as unknown as Sent).deleted])).toEqual([['a', true]])
    expect(api.arrange).toHaveBeenCalledWith({ tabs: ['b'], hidden: ['h'], left: [] })
    const boards = { ...state.boards }
    delete boards.d
    await store.save({ ...state, boards, deleted: [] }, new Set(['revenue']))
    expect(api.deleteBoard).toHaveBeenCalledWith('d')
  })

  it('restoring a put-away board takes it back', async () => {
    const state = await store.load(new Map())
    await store.save({ ...state, tabs: [...state.tabs, 'd'], deleted: [] }, new Set(['revenue']))
    expect(api.putBoard.mock.calls.map(([id, sent]) => [id, (sent as unknown as Sent).deleted])).toEqual([['d', false]])
    expect(api.arrange).toHaveBeenCalledWith({ tabs: ['a', 'b', 's', 'd'], hidden: ['h'], left: [] })
  })

  it('a refused write is reported, holds back the arrangement, and is tried again on the next save', async () => {
    const state = await store.load(new Map())
    const next = { ...state, tabs: ['b', 'a', 's'], boards: { ...state.boards, a: { ...state.boards.a, label: 'Renamed' } } }
    api.putBoard.mockRejectedValueOnce(new Error('409'))
    await expect(store.save(next, new Set(['revenue']))).rejects.toThrow('409')
    expect(api.arrange).not.toHaveBeenCalled()
    await store.save(next, new Set(['revenue']))
    expect(api.putBoard).toHaveBeenCalledTimes(2)
    expect(api.arrange).toHaveBeenCalledTimes(1)
  })

  it('a new board is written before it is placed', async () => {
    const state = await store.load(new Map())
    const n = { ...state.boards.a, id: 'n', label: 'New' }
    await store.save({ ...state, boards: { ...state.boards, n }, tabs: [...state.tabs, 'n'] }, new Set(['revenue']))
    expect(api.putBoard.mock.calls[0]).toEqual(['n', expect.objectContaining({ name: 'New', version: null })])
    expect(api.putBoard.mock.invocationCallOrder[0]).toBeLessThan(api.arrange.mock.invocationCallOrder[0])
    expect(api.arrange).toHaveBeenCalledWith({ tabs: ['a', 'b', 's', 'n'], hidden: ['h'], left: [] })
  })

  it('a draft isn’t written or placed until it is kept', async () => {
    const state = await store.load(new Map())
    const n = { ...state.boards.a, id: 'n', label: 'Draft', draft: true }
    await store.save({ ...state, boards: { ...state.boards, n }, tabs: [...state.tabs, 'n'] }, new Set(['revenue']))
    expect(api.putBoard).not.toHaveBeenCalled()
    expect(api.arrange).not.toHaveBeenCalled()
  })

  it('someone who can edit saves the cards, never the board’s deletion, and leaving it is only their arrangement', async () => {
    api = warehouseWith([saved('e', 'Team board', OTHER, null, { role: 'edit' })])
    store = new BoardStore(api as unknown as Warehouse, VIEWER)
    const state = await store.load(new Map())
    expect(state.tabs).toEqual(['e'])
    await store.save(state, new Set(['revenue']))
    expect(api.putBoard).not.toHaveBeenCalled()
    const cards = [{ metricId: 'revenue', size: 'full' as const, x: 0, y: 0 }]
    await store.save({ ...state, boards: { e: { ...state.boards.e, cards } } }, new Set(['revenue']))
    expect(api.putBoard.mock.calls[0][1]).toMatchObject({ layout: { cards }, deleted: false, version: '2025-11-14T09:00:00Z' })
    await store.save({ ...state, boards: {}, tabs: [] }, new Set(['revenue']))
    expect(api.deleteBoard).not.toHaveBeenCalled()
    expect(api.arrange).toHaveBeenLastCalledWith({ tabs: [], hidden: [], left: ['e'] })
  })

  it('never writes a board its owner deleted, put away or unshared since it loaded, and says which', async () => {
    const boards = [saved('e', 'Team board', OTHER, null, { role: 'edit' }), saved('f', 'Other team board', OTHER, null, { role: 'edit' }), saved('g', 'Third', OTHER, null, { role: 'edit' })]
    api = warehouseWith(boards)
    store = new BoardStore(api as unknown as Warehouse, VIEWER)
    const state = await store.load(new Map())
    // e deleted for good (the warehouse would make it again as the editor's), f now view only, g put away.
    api.boards.mockResolvedValue([{ ...boards[1], role: 'view' }, { ...boards[2], deletedAt: '2025-11-15T00:00:00Z' }])
    const cards = [{ metricId: 'revenue', size: 'full' as const, x: 0, y: 0 }]
    const edited = { ...state, boards: { e: { ...state.boards.e, cards }, f: { ...state.boards.f, cards }, g: { ...state.boards.g, cards } } }
    await expect(store.save(edited, new Set(['revenue']))).rejects.toMatchObject({ name: 'BoardsGoneError', ids: ['e', 'f', 'g'] })
    expect(api.putBoard).not.toHaveBeenCalled()
    // And it stays unwritten on later saves, and isn't counted as one they left.
    await store.save(edited, new Set(['revenue']))
    expect(api.putBoard).not.toHaveBeenCalled()
    expect(api.arrange).not.toHaveBeenCalled()
  })

  it('an editor’s save waits when the boards can’t be read again first', async () => {
    api = warehouseWith([saved('e', 'Team board', OTHER, null, { role: 'edit' })])
    store = new BoardStore(api as unknown as Warehouse, VIEWER)
    const state = await store.load(new Map())
    api.boards.mockRejectedValueOnce(new Error('offline'))
    const cards = [{ metricId: 'revenue', size: 'full' as const, x: 0, y: 0 }]
    const edited = { ...state, boards: { e: { ...state.boards.e, cards } } }
    await expect(store.save(edited, new Set(['revenue']))).rejects.toThrow('offline')
    expect(api.putBoard).not.toHaveBeenCalled()
    await store.save(edited, new Set(['revenue']))
    expect(api.putBoard).toHaveBeenCalledTimes(1)
  })

  it('a member with no boards of their own and nothing placed opens on the workspace’s default board', async () => {
    api = warehouseWith([saved('x', 'Ads', OTHER, null), saved('y', 'Store overview', OTHER, null, { named: false })], 'y')
    const fresh = await new BoardStore(api as unknown as Warehouse, VIEWER).load(new Map())
    expect(fresh.tabs).toEqual(['y', 'x'])
    expect(fresh.openId).toBe('y')
    api = warehouseWith([saved('mine', 'Mine', VIEWER, null), saved('y', 'Store overview', OTHER, null)], 'y')
    expect((await new BoardStore(api as unknown as Warehouse, VIEWER).load(new Map())).openId).toBe('mine')
    api = warehouseWith([saved('x', 'Ads', OTHER, at('tabs', 0)), saved('y', 'Store overview', OTHER, at('hidden', 0))], 'y')
    expect((await new BoardStore(api as unknown as Warehouse, VIEWER).load(new Map())).tabs).toEqual(['x'])
  })

  it('who sees a board is saved with it', async () => {
    const state = await store.load(new Map())
    const grants = [{ userId: OTHER, role: 'edit' as const }]
    await store.save({ ...state, boards: { ...state.boards, a: { ...state.boards.a, general: 'none', grants } } }, new Set(['revenue']))
    expect(api.putBoard.mock.calls[0][1]).toMatchObject({ general: 'none', grants })
  })

  it('leaves out a board whose layout it doesn’t recognise and still shows the rest', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    api.boards.mockResolvedValueOnce([saved('x', 'Broken', VIEWER, null, { layout: { cards: 'nope' } }), saved('y', 'Fine', VIEWER, null)])
    const state = await store.load(new Map())
    expect(Object.keys(state.boards)).toEqual(['y'])
  })
})
