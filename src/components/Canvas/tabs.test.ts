// The Tabs row and Manage tabs (D77–D96): the overflow, where a dragged tab lands, and the board changes behind
// hiding, showing, leaving, numbering names and Manage tabs' Save.

import { describe, expect, it } from 'vitest'
import type { Board } from './board'
import {
  deleteBoard, freeName, hiddenBoards, leaveBoard, rejoinBoard, renameBoards, setTabs, tabsOf, withoutTab,
} from './doc'
import { parseBoardsDoc, type BoardsDoc } from './store'
import { gapAt, gapInOrder, isNoopGap, moveToGap, visibleTabs } from './tabs'

const board = (id: string, name = id, extra: Partial<Board> = {}): Board => ({ id, name, cards: [], ...extra })
const docOf = (boards: Board[], tabs?: string[]): BoardsDoc => ({
  version: 1, boards, activeId: boards[0].id, ...(tabs ? { tabs } : {}),
})

describe('the tab row: six tabs, then "N more" (D77)', () => {
  const order = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']

  it('shows everything when it fits', () => {
    expect(visibleTabs(['a', 'b'], 'a', 6)).toEqual({ shown: ['a', 'b'], more: [] })
    expect(visibleTabs(order.slice(0, 6), 'f', 6)).toEqual({ shown: order.slice(0, 6), more: [] })
  })

  it('folds the rest into the count', () => {
    expect(visibleTabs(order, 'a', 6)).toEqual({ shown: ['a', 'b', 'c', 'd', 'e', 'f'], more: ['g', 'h'] })
    expect(visibleTabs(order, 'b', 4)).toEqual({ shown: ['a', 'b', 'c', 'd'], more: ['e', 'f', 'g', 'h'] })
  })

  it('always shows the open board, in the last place', () => {
    expect(visibleTabs(order, 'h', 6)).toEqual({ shown: ['a', 'b', 'c', 'd', 'e', 'h'], more: ['f', 'g'] })
  })
})

describe('dragging a tab: where it lands (D86)', () => {
  const order = ['a', 'b', 'c', 'd']

  it('moves to the gap before a tab, or to the end', () => {
    expect(moveToGap(order, 'b', 3)).toEqual(['a', 'c', 'b', 'd'])
    expect(moveToGap(order, 'c', 0)).toEqual(['c', 'a', 'b', 'd'])
    expect(moveToGap(order, 'a', 4)).toEqual(['b', 'c', 'd', 'a'])
  })

  it('draws no line, and changes nothing, on either side of the tab itself', () => {
    expect(isNoopGap(order, 'b', 1)).toBe(true)
    expect(isNoopGap(order, 'b', 2)).toBe(true)
    expect(isNoopGap(order, 'b', 3)).toBe(false)
    expect(moveToGap(order, 'b', 2)).toBe(order)
  })

  it('reads a gap in the row or the "N more" list as a gap in the whole order', () => {
    const all = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    const shown = ['a', 'b', 'c', 'd', 'e', 'h']
    const more = ['f', 'g']
    expect(gapInOrder(all, shown, 5)).toBe(7) // before h
    expect(gapInOrder(all, shown, 6)).toBe(8) // after h, the end
    expect(gapInOrder(all, more, 0)).toBe(5) // before f
    expect(gapInOrder(all, more, 2)).toBe(7) // after g
    expect(moveToGap(all, 'a', gapInOrder(all, more, 1))).toEqual(['b', 'c', 'd', 'e', 'f', 'a', 'g', 'h'])
  })

  it('finds the nearest gap from the pointer', () => {
    const edges = [{ start: 0, end: 100 }, { start: 100, end: 160 }, { start: 160, end: 300 }]
    expect(gapAt(edges, 10)).toBe(0)
    expect(gapAt(edges, 60)).toBe(1)
    expect(gapAt(edges, 140)).toBe(2)
    expect(gapAt(edges, 290)).toBe(3)
  })
})

describe('names in use get a number (D84)', () => {
  const doc = docOf([board('a', 'Growth'), board('b', 'Ads'), board('c', 'Growth 2')])

  it('numbers a clash, case aside, and skips numbers taken', () => {
    expect(freeName(doc, 'growth')).toBe('growth 3')
    expect(freeName(doc, 'Retention')).toBe('Retention')
  })

  it("doesn't count the board's own name", () => {
    expect(freeName(doc, 'Growth', 'a')).toBe('Growth')
  })

  it('keeps a numbered name within the limit', () => {
    const long = 'x'.repeat(40)
    const full = docOf([board('a', long)])
    expect(freeName(full, long, undefined, 40)).toBe(`${'x'.repeat(38)} 2`)
  })

  it('renames in one go, numbering clashes and skipping blanks', () => {
    const next = renameBoards(doc, { b: 'Growth', c: '   ' }, 40)
    expect(next.boards.map(b => b.name)).toEqual(['Growth', 'Growth 3', 'Growth 2'])
    expect(renameBoards(doc, { a: 'Growth' })).toBe(doc)
  })

  it("doesn't rename a board shared with you", () => {
    const shared = docOf([board('a', 'Q4 plan', { sharedBy: 'Maya Patel' }), board('b')])
    expect(renameBoards(shared, { a: 'Mine now' })).toBe(shared)
  })
})

describe('hiding and showing (D87) and Manage tabs’ Save (D93)', () => {
  const doc = docOf([board('a'), board('b'), board('c')], ['a', 'b', 'c'])

  it('lists hidden boards in board order', () => {
    expect(hiddenBoards(withoutTab(withoutTab(doc, 'c'), 'a')).map(b => b.id)).toEqual(['a', 'c'])
  })

  it('sets the tabs exactly; anything left out is hidden', () => {
    const next = setTabs(doc, ['c', 'a'])
    expect(tabsOf(next)).toEqual(['c', 'a'])
    expect(hiddenBoards(next).map(b => b.id)).toEqual(['b'])
  })

  it('never hides the last tab', () => {
    expect(setTabs(doc, [])).toBe(doc)
    expect(setTabs(doc, ['gone'])).toBe(doc)
  })
})

describe('boards shared with you: leave, not delete (D88, D90)', () => {
  const doc = docOf([board('a'), board('q', 'Q4 plan', { sharedBy: 'Maya Patel' }), board('c')], ['a', 'q', 'c'])

  it('leaving takes the board out for you only, with nothing kept to restore', () => {
    const next = leaveBoard(doc, 'q')
    expect(next.boards.map(b => b.id)).toEqual(['a', 'c'])
    expect(tabsOf(next)).toEqual(['a', 'c'])
    expect(next.deleted).toBeUndefined()
  })

  it('only shared boards can be left, and only owners delete', () => {
    expect(leaveBoard(doc, 'a')).toBe(doc)
    expect(deleteBoard(doc, 'q', '2026-11-19T10:00:00.000Z')).toBe(doc)
  })

  it('Undo puts it back where it was', () => {
    const back = rejoinBoard(leaveBoard(doc, 'q'), doc.boards[1], 1, ['a', 'q', 'c'])
    expect(back.boards.map(b => b.id)).toEqual(['a', 'q', 'c'])
    expect(tabsOf(back)).toEqual(['a', 'q', 'c'])
  })

  it('keeps the owner through a save', () => {
    const saved = parseBoardsDoc(JSON.parse(JSON.stringify(doc)))
    expect(saved?.boards[1].sharedBy).toBe('Maya Patel')
    expect(saved?.boards[0].sharedBy).toBeUndefined()
  })
})
