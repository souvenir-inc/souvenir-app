// Edit mode (Figma section 167:27722): one editor at a time, and moving cards with the keyboard.

import { describe, expect, it } from 'vitest'
import { claimLock, holderOf, LOCK_STALE_MS, lockKey, readLocks, releaseLocks } from './editLock'
import { liftWords, moveTo, rowStep, type SlotBox } from './gridKeys'
import type { StorageLike } from './store'

function memory(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value) } }
}

describe('one editor at a time', () => {
  it('gives the board to whoever starts first; the other is told who', () => {
    const storage = memory()
    expect(claimLock(storage, 'ws', 'board-a', 'Sam Lee', 'tab-1', 1_000)).toBeNull()
    const holder = claimLock(storage, 'ws', 'board-a', 'Dev Shah', 'tab-2', 2_000)
    expect(holder?.by).toBe('Sam Lee')
  })

  it('lets the same tab claim again, and other boards stay free', () => {
    const storage = memory()
    claimLock(storage, 'ws', 'board-a', 'Sam Lee', 'tab-1', 1_000)
    expect(claimLock(storage, 'ws', 'board-a', 'Sam Lee', 'tab-1', 5_000)).toBeNull()
    expect(claimLock(storage, 'ws', 'board-b', 'Dev Shah', 'tab-2', 5_000)).toBeNull()
  })

  it('frees a board when its editor leaves edit mode', () => {
    const storage = memory()
    claimLock(storage, 'ws', 'board-a', 'Sam Lee', 'tab-1', 1_000)
    releaseLocks(storage, 'ws', 'tab-1')
    expect(readLocks(storage, 'ws')).toEqual({})
    expect(claimLock(storage, 'ws', 'board-a', 'Dev Shah', 'tab-2', 2_000)).toBeNull()
  })

  it('frees a board whose editor stopped renewing (a tab closed mid-edit)', () => {
    const storage = memory()
    claimLock(storage, 'ws', 'board-a', 'Sam Lee', 'tab-1', 1_000)
    const locks = readLocks(storage, 'ws')
    expect(holderOf(locks, 'board-a', 'tab-2', 1_000 + LOCK_STALE_MS - 1)?.by).toBe('Sam Lee')
    expect(holderOf(locks, 'board-a', 'tab-2', 1_000 + LOCK_STALE_MS + 1)).toBeNull()
  })

  it('never reports your own tab as someone else, and reads junk as no locks', () => {
    const storage = memory()
    claimLock(storage, 'ws', 'board-a', 'Sam Lee', 'tab-1', 1_000)
    expect(holderOf(readLocks(storage, 'ws'), 'board-a', 'tab-1', 1_000)).toBeNull()
    storage.setItem(lockKey('other'), '{not json')
    expect(readLocks(storage, 'other')).toEqual({})
    expect(readLocks(null, 'ws')).toEqual({})
  })
})

describe('moving a card with the keyboard', () => {
  // Store overview at 1440: four Small cards on row one, then a Wide and two Small on row two.
  const boxes: SlotBox[] = [
    { id: 'a', top: 0, left: 0, width: 288 }, { id: 'b', top: 0, left: 304, width: 288 },
    { id: 'c', top: 0, left: 608, width: 288 }, { id: 'd', top: 0, left: 912, width: 288 },
    { id: 'e', top: 172, left: 0, width: 592 }, { id: 'f', top: 172, left: 608, width: 288 },
    { id: 'g', top: 172, left: 912, width: 288 },
  ]
  const order = boxes.map(b => b.id)

  it('moves one place earlier or later, clamped to the ends', () => {
    expect(moveTo(order, 'c', 1)).toEqual(['a', 'c', 'b', 'd', 'e', 'f', 'g'])
    expect(moveTo(order, 'a', -3)).toEqual(order)
    expect(moveTo(order, 'g', 99)).toEqual(order)
  })

  it('goes to the card nearest above or below', () => {
    expect(rowStep(boxes, order, 'f', 'up')).toBe(order.indexOf('c'))
    expect(rowStep(boxes, order, 'b', 'down')).toBe(order.indexOf('e'))
    expect(rowStep(boxes, order, 'd', 'down')).toBe(order.indexOf('g'))
  })

  it('goes to the start from the first row and the end from the last', () => {
    expect(rowStep(boxes, order, 'c', 'up')).toBe(0)
    expect(rowStep(boxes, order, 'f', 'down')).toBe(order.length - 1)
  })

  it('says where the card is at each step', () => {
    expect(liftWords.lifted('Revenue', 4, 11)).toBe('Revenue lifted. Position 5 of 11.')
    expect(liftWords.moved(5, 11)).toBe('Position 6 of 11.')
    expect(liftWords.dropped('Revenue', 5, 11)).toBe('Revenue dropped at position 6 of 11.')
    expect(liftWords.resized('Revenue', 'Medium', 6, 2)).toBe('Revenue, Medium, 6 by 2.')
  })
})
