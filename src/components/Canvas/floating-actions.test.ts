// Floating actions and the More menu (Figma 167:27721, 482:3675): taking back a board that was just made (a
// Duplicate's Undo, Cancel on a new board) and what the + holds for you and for a viewer.

import { describe, expect, it } from 'vitest'
import { dialActions } from './BoardActions'
import { addBoard, discardBoard, duplicateBoard, tabsOf } from './doc'
import type { BoardsDoc } from './store'

const doc = (): BoardsDoc => ({
  version: 1,
  boards: [
    { id: 'a', name: 'Store overview', cards: [] },
    { id: 'b', name: 'Growth', cards: [] },
  ],
  tabs: ['a', 'b'],
  activeId: 'a',
})

describe('taking back a board that was just made', () => {
  it('undoes a Duplicate: the copy is gone from the boards and the tabs, and nothing goes to Recently deleted', () => {
    const copied = duplicateBoard(doc(), 'a', 'a-copy', () => 'card')
    expect(tabsOf(copied)).toEqual(['a', 'a-copy', 'b'])
    const back = discardBoard(copied, 'a-copy')
    expect(back.boards.map(b => b.id)).toEqual(['a', 'b'])
    expect(tabsOf(back)).toEqual(['a', 'b'])
    expect(back.deleted ?? []).toEqual([])
  })

  it('discards a new board on Cancel, falling back to the first board when it was the one shown', () => {
    const made = { ...addBoard(doc(), { id: 'n', name: 'Untitled board', cards: [] }), activeId: 'n' }
    const back = discardBoard(made, 'n')
    expect(back.boards.some(b => b.id === 'n')).toBe(false)
    expect(back.activeId).toBe('a')
  })

  it('never takes the last board, and ignores a board that is not there', () => {
    const one: BoardsDoc = { version: 1, boards: [{ id: 'a', name: 'Store overview', cards: [] }], tabs: ['a'], activeId: 'a' }
    expect(discardBoard(one, 'a')).toBe(one)
    const two = doc()
    expect(discardBoard(two, 'missing')).toBe(two)
  })
})

describe('what the + holds', () => {
  it('on your own board: Add metrics, New board, Edit board, Share, More', () => {
    expect(dialActions(false).map(a => a.key)).toEqual(['add', 'new', 'edit', 'share', 'more'])
  })

  it('on a board you can only view: New board, Copy link up front, More; never Add metrics, Edit board or Share', () => {
    const keys = dialActions(true).map(a => a.key)
    expect(keys).toEqual(['new', 'copy', 'more'])
    expect(keys).not.toContain('share')
  })
})
