import { describe, expect, it } from 'vitest'
import {
  boardReducer, cleanName, daysLeft, layoutRow, neighbourOf, uniqueName,
  type Board, type DashboardState,
} from './board-state'

const board = (id: string, label = id, access: Board['access'] = 'owner'): Board => ({
  id, label, cards: [], initialCards: [], period: '7d', compare: 'previous', access,
})

function state(tabs: string[], extra: Partial<DashboardState> = {}): DashboardState {
  const all = [...tabs, ...(extra.hidden ?? []), ...(extra.deleted ?? []).map((d) => d.id)]
  return {
    boards: Object.fromEntries(all.map((id) => [id, board(id)])),
    tabs, hidden: [], deleted: [], openId: tabs[0], ...extra,
  }
}

describe('names (TAB-23, TAB-24, TAB-26)', () => {
  it('trims and caps at 40 characters', () => {
    expect(cleanName('   ')).toBe('')
    expect(cleanName('  Growth  ')).toBe('Growth')
    expect(cleanName('x'.repeat(50))).toHaveLength(40)
  })
  it('numbers a name already in use, ignoring case', () => {
    expect(uniqueName('Growth', ['Ads'])).toBe('Growth')
    expect(uniqueName('Growth', ['growth'])).toBe('Growth 2')
    expect(uniqueName('Growth', ['Growth', 'Growth 2'])).toBe('Growth 3')
    expect(uniqueName('Untitled board', ['Untitled board'])).toBe('Untitled board 2')
  })
  it('keeps a numbered name within 40 characters', () => {
    const long = 'y'.repeat(40)
    expect(uniqueName(long, [long])).toHaveLength(40)
    expect(uniqueName(long, [long]).endsWith(' 2')).toBe(true)
  })
})

describe('row layout (TAB-15 – TAB-17)', () => {
  const tabs = Array.from({ length: 12 }, (_, i) => `b${i}`)
  const widths = tabs.map(() => 100)
  it('shows at most 6 and folds the rest into the count', () => {
    const r = layoutRow(tabs, 'b0', widths, 10_000, 80)
    expect(r.visible).toEqual(['b0', 'b1', 'b2', 'b3', 'b4', 'b5'])
    expect(r.overflow).toHaveLength(6)
  })
  it('shows fewer when there is less room, leaving room for the count', () => {
    expect(layoutRow(tabs, 'b0', widths, 480, 80).visible).toHaveLength(4)
  })
  it('puts the open board in the last place without changing the order of the rest', () => {
    const r = layoutRow(tabs, 'b9', widths, 10_000, 80)
    expect(r.visible).toEqual(['b0', 'b1', 'b2', 'b3', 'b4', 'b9'])
    expect(r.overflow).toEqual(['b5', 'b6', 'b7', 'b8', 'b10', 'b11'])
  })
  it('needs no count when everything fits', () => {
    const r = layoutRow(['a', 'b'], 'a', [100, 100], 300, 80)
    expect(r).toEqual({ visible: ['a', 'b'], overflow: [] })
  })
  it('always shows at least the open board', () => {
    expect(layoutRow(tabs, 'b7', widths, 10, 80).visible).toEqual(['b7'])
  })
  it('fits the set actually shown: a wide open board swapped in folds one more tab away (TAB-4)', () => {
    const w = tabs.map((id) => (id === 'b9' ? 300 : 100))
    const r = layoutRow(tabs, 'b9', w, 680, 80)
    expect(r.visible).toEqual(['b0', 'b1', 'b2', 'b9'])
    expect(r.visible.reduce((s, id) => s + w[tabs.indexOf(id)], 0) + 80).toBeLessThanOrEqual(680)
  })
  it('keeps a tab being renamed on show, and its growing field folds the tabs after it (TAB-22)', () => {
    const w = widths.slice()
    w[2] = 340 // b2's field at the whole name
    const r = layoutRow(tabs, ['b0', 'b2'], w, 700, 80)
    expect(r.visible).toEqual(['b0', 'b1', 'b2'])
    expect(r.visible).toContain('b2')
  })
  it('keeps the open board and the renamed tab when both sit past the row', () => {
    const r = layoutRow(tabs, ['b9', 'b10'], widths, 520, 80)
    expect(r.visible).toContain('b9')
    expect(r.visible).toContain('b10')
    expect(r.visible).toHaveLength(4)
  })
})

describe('neighbours (TAB-38, TAB-42)', () => {
  it('opens the board to the left, or to the right when first', () => {
    expect(neighbourOf(['a', 'b', 'c'], 'b')).toBe('a')
    expect(neighbourOf(['a', 'b', 'c'], 'a')).toBe('b')
  })
})

describe('reducer', () => {
  it('opening a hidden board puts it back as the last tab (TAB-39)', () => {
    const s = boardReducer(state(['a', 'b'], { hidden: ['h'] }), { type: 'open', id: 'h' })
    expect(s.tabs).toEqual(['a', 'b', 'h'])
    expect(s.hidden).toEqual([])
    expect(s.openId).toBe('h')
  })
  it('hiding the open tab opens its left neighbour (TAB-38)', () => {
    const s = boardReducer({ ...state(['a', 'b', 'c']), openId: 'b' }, { type: 'hide', id: 'b' })
    expect(s.tabs).toEqual(['a', 'c'])
    expect(s.hidden).toEqual(['b'])
    expect(s.openId).toBe('a')
  })
  it('hiding the first open tab opens the one to its right', () => {
    const s = boardReducer(state(['a', 'b']), { type: 'hide', id: 'a' })
    expect(s.openId).toBe('b')
  })
  it('never hides or deletes the last tab (TAB-45)', () => {
    const one = state(['a'])
    expect(boardReducer(one, { type: 'hide', id: 'a' })).toBe(one)
    expect(boardReducer(one, { type: 'delete', id: 'a', at: 0 })).toBe(one)
  })
  it('only the owner deletes (TAB-41)', () => {
    const s = state(['a', 'b'])
    s.boards.b = board('b', 'b', 'view')
    expect(boardReducer(s, { type: 'delete', id: 'b', at: 0 })).toBe(s)
  })
  it('delete then restore puts the board back as the last tab (TAB-42, TAB-44)', () => {
    const deleted = boardReducer({ ...state(['a', 'b', 'c']), openId: 'b' }, { type: 'delete', id: 'b', at: 5 })
    expect(deleted.tabs).toEqual(['a', 'c'])
    expect(deleted.deleted).toEqual([{ id: 'b', deletedAt: 5 }])
    expect(deleted.openId).toBe('a')
    const restored = boardReducer(deleted, { type: 'restore', id: 'b', open: false })
    expect(restored.tabs).toEqual(['a', 'c', 'b'])
    expect(restored.deleted).toEqual([])
  })
  it('undo of delete restores the board in its old place, open', () => {
    const deleted = boardReducer({ ...state(['a', 'b', 'c']), openId: 'b' }, { type: 'delete', id: 'b', at: 5 })
    const undone = boardReducer(deleted, { type: 'restore', id: 'b', index: 1, open: true })
    expect(undone.tabs).toEqual(['a', 'b', 'c'])
    expect(undone.openId).toBe('b')
  })
  it('moves a tab and leaves the state alone when nothing changes (TAB-31, TAB-34)', () => {
    const s = state(['a', 'b', 'c'])
    expect(boardReducer(s, { type: 'move-tab', id: 'a', to: 2 }).tabs).toEqual(['b', 'c', 'a'])
    expect(boardReducer(s, { type: 'move-tab', id: 'b', to: 1 })).toBe(s)
  })
  it('adds a board at a place and opens it (TAB-36, TAB-37)', () => {
    const s = boardReducer(state(['a', 'b']), { type: 'add-board', board: board('c'), index: 1, open: true })
    expect(s.tabs).toEqual(['a', 'c', 'b'])
    expect(s.openId).toBe('c')
  })
  it('never removes the last tab, by leaving or otherwise (TAB-45)', () => {
    const one = state(['a'])
    expect(boardReducer(one, { type: 'remove-board', id: 'a' })).toBe(one)
  })
  it('Manage tabs Save can never leave you with no tab, or a board in two lists (MT-13)', () => {
    const s = state(['a', 'b'])
    expect(boardReducer(s, { type: 'apply-manage', tabs: [], hidden: ['a', 'b'], labels: {} })).toBe(s)
    const both = boardReducer(s, { type: 'apply-manage', tabs: ['a'], hidden: ['a', 'b'], labels: {} })
    expect(both.tabs).toEqual(['a'])
    expect(both.hidden).toEqual(['b'])
  })
  it('removing the open board opens its neighbour (TAB-55)', () => {
    const s = boardReducer({ ...state(['a', 'b', 'c']), openId: 'c' }, { type: 'remove-board', id: 'c' })
    expect(s.boards.c).toBeUndefined()
    expect(s.openId).toBe('b')
  })
  it('Manage tabs Save applies order, hidden and names, and keeps a tab open (MT-7)', () => {
    const s = boardReducer({ ...state(['a', 'b', 'c']), openId: 'b' }, {
      type: 'apply-manage', tabs: ['c', 'a'], hidden: ['b'], labels: { a: 'Alpha' },
    })
    expect(s.tabs).toEqual(['c', 'a'])
    expect(s.hidden).toEqual(['b'])
    expect(s.boards.a.label).toBe('Alpha')
    expect(s.openId).toBe('a')
  })
  it('boards past 30 days are gone for good (TAB-43)', () => {
    const DAY = 86_400_000
    const s = state(['a'], { deleted: [{ id: 'old', deletedAt: 0 }, { id: 'new', deletedAt: 20 * DAY }] })
    expect(daysLeft(0, 31 * DAY)).toBe(0)
    const purged = boardReducer(s, { type: 'purge-expired', now: 31 * DAY })
    expect(purged.deleted.map((d) => d.id)).toEqual(['new'])
    expect(purged.boards.old).toBeUndefined()
  })
})

describe('card changes read the board as it is (BS-25, BS-26, BS-31)', () => {
  const withCards = (): DashboardState => {
    const s = state(['a'])
    s.boards.a = { ...s.boards.a, cards: ['w', 'x', 'y', 'z'].map((metricId, i) => ({ metricId, size: 'sm' as const, x: i, y: 0 })) }
    return s
  }
  const order = (s: DashboardState) => s.boards.a.cards.map((c) => c.metricId).join('')
  const at = (s: DashboardState, id: string) => { const c = s.boards.a.cards.find((k) => k.metricId === id)!; return [c.x, c.y] }
  it('moves in reading order and lays the cards out again', () => {
    let s = withCards()
    s = boardReducer(s, { type: 'move-card', id: 'a', metricId: 'w', to: 3 })
    expect(order(s)).toBe('xyzw')
    expect(at(s, 'w')).toEqual([3, 0])
    s = boardReducer(s, { type: 'step-card', id: 'a', metricId: 'w', by: -1 })
    expect(order(s)).toBe('xywz')
  })
  it('a removed card leaves no hole; a new one fills the first space', () => {
    let s = boardReducer(withCards(), { type: 'remove-card', id: 'a', metricId: 'x' })
    expect([at(s, 'y'), at(s, 'z')]).toEqual([[1, 0], [2, 0]])
    s = boardReducer(s, { type: 'add-card', id: 'a', metricId: 'q' })
    expect(at(s, 'q')).toEqual([3, 0])
  })
  it('leaves the state alone when nothing changes', () => {
    const s = withCards()
    expect(boardReducer(s, { type: 'move-card', id: 'a', metricId: 'x', to: 1 })).toBe(s)
    expect(boardReducer(s, { type: 'resize-card', id: 'a', metricId: 'x', size: 'sm' })).toBe(s)
  })
})
