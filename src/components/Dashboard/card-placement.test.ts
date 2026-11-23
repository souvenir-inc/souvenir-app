import { describe, expect, it } from 'vitest'
import { bestIndex, cellRect, edgeScrollSpeed, layoutCells, type GridMetrics } from './card-placement'
import type { CardSize } from './types'

// The Figma board (17:889): its order and sizes.
const FIGMA: { id: string; size: CardSize }[] = [
  { id: 'aov', size: 'sm' }, { id: 'orders', size: 'lg' }, { id: 'new', size: 'sm' }, { id: 'roas', size: 'sm' },
  { id: 'spend', size: 'sm' }, { id: 'revenue', size: 'md' }, { id: 'cpa', size: 'sm' }, { id: 'ctr', size: 'sm' },
  { id: 'net', size: 'md' }, { id: 'discount', size: 'sm' }, { id: 'refund', size: 'sm' },
]
const G: GridMetrics = { columns: 4, colWidth: 288, rowHeight: 156, gap: 16 }

describe('grid layout matches CSS auto-placement (BS-28)', () => {
  it('lays out the Figma board exactly', () => {
    const cells = layoutCells(FIGMA.map((c) => c.size), 4).map((c) => `${c.col},${c.row}`)
    expect(cells).toEqual(['0,0', '1,0', '3,0', '0,1', '3,1', '0,2', '2,2', '3,2', '0,3', '2,3', '3,3'])
  })
  it('stacks everything in one column', () => {
    expect(layoutCells(['sm', 'md', 'lg'], 1).map((c) => [c.row, c.w, c.h])).toEqual([[0, 1, 1], [1, 1, 1], [2, 1, 2]])
  })
  it('never moves the cursor back (sparse: a gap stays a gap)', () => {
    // A large card that doesn't fit next to a small one leaves the rest of that row empty.
    const cells = layoutCells(['sm', 'sm', 'sm', 'lg', 'sm'], 4)
    expect(cells[3]).toMatchObject({ col: 0, row: 1 })
    expect(cells[4]).toMatchObject({ col: 2, row: 1 })
  })
})

describe('the slot goes where the pointer is (BS-25)', () => {
  const at = (cell: { col: number; row: number }) => {
    const r = cellRect({ ...cell, w: 1, h: 1 }, G)
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }
  const move = (id: string, i: number) => {
    const rest = FIGMA.filter((c) => c.id !== id)
    return [...rest.slice(0, i), FIGMA.find((c) => c.id === id)!, ...rest.slice(i)]
  }
  const slotFor = (id: string, i: number) => layoutCells(move(id, i).map((c) => c.size), 4)[i]
  const dist = (p: { x: number; y: number }, c: { col: number; row: number; w: number; h: number }) => {
    const r = cellRect(c, G)
    return Math.hypot(Math.max(r.left - p.x, 0, p.x - r.left - r.width), Math.max(r.top - p.y, 0, p.y - r.top - r.height))
  }
  it('lands exactly on the cell under the pointer whenever the grid can put it there', () => {
    for (const target of [{ col: 2, row: 2 }, { col: 3, row: 2 }, { col: 2, row: 3 }, { col: 3, row: 0 }, { col: 2, row: 1 }]) {
      const cell = slotFor('aov', bestIndex(FIGMA, 'aov', at(target), G))
      expect([cell.col, cell.row]).toEqual([target.col, target.row])
    }
  })
  it('otherwise takes the nearest place the grid can give it', () => {
    // (0, 2) is under Revenue, which a small card can't take without the 2×2 Orders card moving.
    const p = at({ col: 0, row: 2 })
    const chosen = dist(p, slotFor('aov', bestIndex(FIGMA, 'aov', p, G)))
    const nearest = Math.min(...FIGMA.map((_, i) => dist(p, slotFor('aov', i))))
    expect(chosen).toBe(nearest)
  })
  it('stays put while the pointer is over its own slot', () => {
    expect(bestIndex(FIGMA, 'cpa', at({ col: 2, row: 2 }), G)).toBe(6)
  })
  it('goes to the end below the last row', () => {
    expect(bestIndex(FIGMA, 'aov', { x: 100, y: 4 * 172 + 60 }, G)).toBe(FIGMA.length - 1)
  })
})

describe('edge scroll (BS-27)', () => {
  it('scrolls only near the edges, faster closer to them', () => {
    expect(edgeScrollSpeed(400, 0, 800)).toBe(0)
    expect(edgeScrollSpeed(10, 0, 800)).toBeLessThan(0)
    expect(edgeScrollSpeed(790, 0, 800)).toBeGreaterThan(edgeScrollSpeed(760, 0, 800))
  })
})
