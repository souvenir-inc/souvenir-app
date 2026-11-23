import { describe, expect, it } from 'vitest'
import { collide, dims, firstFit, flowCards, pack, place, resize, sameLayout, sizeFromGrip, sizeOf, toItems, type Item } from './grid-layout'
import type { CardSize } from './types'

// The Figma board (17:889) in order.
const FIGMA: [string, CardSize][] = [
  ['aov', 'sm'], ['orders', 'lg'], ['new', 'sm'], ['roas', 'sm'], ['spend', 'sm'], ['revenue', 'md'],
  ['cpa', 'sm'], ['ctr', 'sm'], ['net', 'md'], ['discount', 'sm'], ['refund', 'sm'],
]
const board = () => toItems(flowCards(FIGMA.map(([metricId, size]) => ({ metricId, size }))))
const pos = (items: Item[], id: string) => { const i = items.find((x) => x.id === id)!; return [i.x, i.y] }
/** The board as rows of names, '.' for an empty cell. */
const draw = (items: Item[]) => {
  const rows = Math.max(...items.map((i) => i.y + i.h))
  const g = Array.from({ length: rows }, () => Array(4).fill('.'))
  for (const i of items) for (let y = i.y; y < i.y + i.h; y++) for (let x = i.x; x < i.x + i.w; x++) g[y][x] = i.id
  return g.map((r) => r.join(' '))
}
const holes = (items: Item[]) => draw(items).join(' ').split(' ').filter((c) => c === '.').length
const noOverlap = (items: Item[]) => items.every((a) => items.every((b) => !collide(a, b)))

describe('layout', () => {
  it('places the Figma board exactly', () => {
    expect(draw(board())).toEqual([
      'aov orders orders new',
      'roas orders orders spend',
      'revenue revenue cpa ctr',
      'net net discount refund',
    ])
  })
  it('packing the Figma board changes nothing', () => {
    expect(sameLayout(pack(board()), board())).toBe(true)
    expect(sameLayout(place(board(), 'aov', 0, 0), board())).toBe(true)
  })
})

describe('moving a big card goes where it is dropped, never to the end (BS-29)', () => {
  it('the large card to the bottom right: the board stays full', () => {
    const b = place(board(), 'orders', 2, 2)
    expect(pos(b, 'orders')).toEqual([2, 2])
    expect(holes(b)).toBe(0)
    expect(draw(b)).toHaveLength(4)
  })
  it('the large card to the top right', () => {
    const b = place(board(), 'orders', 2, 0)
    expect(draw(b).slice(0, 2)).toEqual(['aov new orders orders', 'roas spend orders orders'])
    expect(holes(b)).toBe(0)
  })
  it('a medium card across a row', () => {
    const b = place(board(), 'revenue', 2, 0)
    expect(pos(b, 'revenue')).toEqual([2, 0])
    expect(noOverlap(b)).toBe(true)
  })
})

describe('small ⇄ big (BS-29, BS-30)', () => {
  it('a small card dropped on a large one takes the spot; the large one moves aside', () => {
    const b = place(board(), 'aov', 1, 0)
    expect(pos(b, 'aov')).toEqual([1, 0])
    expect(pos(b, 'orders')).toEqual([2, 0])
    expect(holes(b)).toBe(0)
  })
  it('a large card dropped on small ones takes their place; they move on', () => {
    const b = place(board(), 'orders', 2, 2) // over CPA, CTR, Discount rate, Refund rate
    expect(pos(b, 'orders')).toEqual([2, 2])
    expect(noOverlap(b)).toBe(true)
  })
  it('same-size cards swap places, nothing else moves', () => {
    const b = place(board(), 'aov', 3, 0)
    expect(pos(b, 'aov')).toEqual([3, 0])
    expect(pos(b, 'new')).toEqual([0, 0])
    expect(pos(b, 'orders')).toEqual([1, 0])
  })
  it('two medium cards swap', () => {
    const b = place(board(), 'revenue', 0, 3)
    expect(pos(b, 'revenue')).toEqual([0, 3])
    expect(pos(b, 'net')).toEqual([0, 2])
  })
})

describe('least disturbance (BS-29)', () => {
  it('the large card to the bottom right: the four small cards it covers take its old place', () => {
    expect(draw(place(board(), 'orders', 2, 2))).toEqual([
      'aov cpa ctr new',
      'roas discount refund spend',
      'revenue revenue orders orders',
      'net net orders orders',
    ])
  })
  it('a small card onto a large card\'s corner: the large card steps down, it doesn\'t jump across', () => {
    const topRight = place(board(), 'orders', 2, 0)
    const b = place(topRight, 'aov', 2, 0)
    const orders = b.find((i) => i.id === 'orders')!
    expect(orders.x).toBe(2)
    expect(orders.y).toBe(1)
    expect(noOverlap(b)).toBe(true)
  })
  it('never sends a big card to the end of the board when there is room', () => {
    for (const [x, y] of [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]]) {
      const b = place(board(), 'orders', x, y)
      expect(pos(b, 'orders')).toEqual([x, y])
      expect(draw(b).length).toBeLessThanOrEqual(5)
    }
  })
})

describe('previews come from the start (BS-29)', () => {
  it('putting the card back where it was restores the whole board', () => {
    const start = board()
    place(start, 'orders', 2, 2)
    expect(sameLayout(place(start, 'orders', 1, 0), start)).toBe(true)
  })
  it('clamps into the grid', () => {
    expect(pos(place(board(), 'orders', 9, -3), 'orders')).toEqual([2, 0])
  })
})

describe('the resize grip reads direction, not position (BS-19)', () => {
  const C = 288, R = 156
  it('a small card grows wider either way, so the right-hand column can grow too', () => {
    expect(sizeFromGrip('sm', 200, 0, C, R)).toBe('md')
    expect(sizeFromGrip('sm', -200, 0, C, R)).toBe('md')
    expect(sizeFromGrip('sm', 100, 0, C, R)).toBe('sm') // under half a column: no change
  })
  it('a small card dragged down becomes small, tall (3 × 2); down and sideways, medium (6 × 2)', () => {
    expect(sizeFromGrip('sm', 0, 100, C, R)).toBe('sm-tall')
    expect(sizeFromGrip('sm', 200, 100, C, R)).toBe('lg')
  })
  it('widths snap to 3, 6 or 12 of 12 columns (CR-1)', () => {
    expect(sizeFromGrip('md', 300, 0, C, R)).toBe('full')       // a whole column more: 6 → 12 wide
    expect(sizeFromGrip('md', 200, 0, C, R)).toBe('md')         // under a whole column: stays 6 wide
    expect(sizeFromGrip('sm', 600, 0, C, R)).toBe('full')       // two columns more at once
    expect(sizeFromGrip('full', -300, 0, C, R)).toBe('md')
    expect(sizeFromGrip('full-lg', 0, -100, C, R)).toBe('full')
    expect(sizeFromGrip('sm-tall', 200, 0, C, R)).toBe('lg')
  })
  it('medium grows taller or narrows; large shortens or narrows', () => {
    expect(sizeFromGrip('md', 0, 100, C, R)).toBe('lg')
    expect(sizeFromGrip('md', -200, 0, C, R)).toBe('sm')
    expect(sizeFromGrip('lg', 0, -100, C, R)).toBe('md')
    expect(sizeFromGrip('lg', -200, -100, C, R)).toBe('sm')
    expect(sizeFromGrip('lg', 200, 0, C, R)).toBe('lg')
  })
  it('a card at the right edge that grows moves left to fit', () => {
    const b = resize(board(), 'new', sizeFromGrip('sm', -200, 0, C, R))
    expect(pos(b, 'new')).toEqual([2, 0])
    expect(noOverlap(b)).toBe(true)
  })
})

describe('resize and add', () => {
  it('a card that grows keeps its corner; the others pack around it', () => {
    const b = resize(board(), 'aov', 'lg')
    expect(pos(b, 'aov')).toEqual([0, 0])
    expect(noOverlap(b)).toBe(true)
  })
  it('a card that grows at the right edge moves left to fit', () => {
    expect(pos(resize(board(), 'new', 'md'), 'new')[0]).toBe(2)
  })
  it('a new card goes in the first free place', () => {
    const b = board().filter((i) => i.id !== 'cpa')
    expect(firstFit(b, 1, 1)).toEqual({ x: 2, y: 2 })
    expect(firstFit(board(), 1, 1)).toEqual({ x: 0, y: 4 })
  })
})

describe('six sizes (CR-1)', () => {
  it('cover 1, 2 or 4 columns by 1 or 2 rows, and back', () => {
    const sizes = ['sm', 'sm-tall', 'md', 'lg', 'full', 'full-lg'] as const
    expect(sizes.map((z) => { const d = dims(z); return `${d.w}x${d.h}` })).toEqual(['1x1', '1x2', '2x1', '2x2', '4x1', '4x2'])
    for (const z of sizes) { const d = dims(z); expect(sizeOf(d.w, d.h)).toBe(z) }
  })
  it('a full-width card resized in place pushes the rest below it', () => {
    const b = resize(board(), 'aov', 'full')
    expect(pos(b, 'aov')).toEqual([0, 0])
    expect(noOverlap(b)).toBe(true)
    expect(b.filter((i) => i.id !== 'aov').every((i) => i.y >= 1)).toBe(true)
  })
})
