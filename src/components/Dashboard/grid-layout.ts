// The board's card positions on the 4-column design grid (docs-v2/dashboard/02-board-screen-rules.md,
// BS-24 – BS-31). Pure, so every rule is testable without a browser.
//
// Each card has a place (x, y in cells) and a size (w × h: small 1×1, medium 2×1, large 2×2).
// Placing a card pins it at the cell asked for and packs the others around it in reading order,
// each in the first space it fits, so the board never has holes and a big card can go anywhere.
// A card dropped exactly onto one card of the same size swaps places with it.

import type { BoardCard, CardSize } from './types'

export const COLUMNS = 4

export interface Item { id: string; x: number; y: number; w: number; h: number }

/** Cells a size covers on the 4-column grid. */
export function dims(size: CardSize): { w: number; h: number } {
  return size === 'sm' ? { w: 1, h: 1 } : size === 'md' ? { w: 2, h: 1 } : { w: 2, h: 2 }
}

export const collide = (a: Item, b: Item) =>
  a.id !== b.id && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/** Reading order: top to bottom, then left to right. */
export const byPosition = (a: Item, b: Item) => a.y - b.y || a.x - b.x

/**
 * Packs the board: the pinned card (the one just placed or resized) stays where it is, and every
 * other card, in reading order, goes into the first space it fits, row by row (BS-29). The cards
 * keep their order and the board has no holes; the pinned card is the only one that sits where
 * it was put.
 */
export function pack(items: Item[], pinned?: string, columns = COLUMNS): Item[] {
  const fixed = items.filter((i) => i.id === pinned)
  const rest = items.filter((i) => i.id !== pinned).sort(byPosition)
  const placed: Item[] = [...fixed]
  for (const it of rest) placed.push({ ...it, ...firstFit(placed, it.w, it.h, columns) })
  return placed
}

// ── Making room (BS-29) ──────────────────────────────────────────────────────
// Three ways to fit the other cards around a pinned one; place() keeps whichever disturbs the
// board least.

/** Cards that aren't covered keep their place; covered ones fill the first free spaces (often the
 *  place the moved card left). */
function stayPut(items: Item[], pinned: Item, columns: number): Item[] {
  const placed: Item[] = [pinned]
  const deferred: Item[] = []
  for (const it of items.filter((i) => i.id !== pinned.id).sort(byPosition)) {
    if (placed.some((o) => collide(o, it))) deferred.push(it)
    else placed.push(it)
  }
  for (const it of deferred) placed.push({ ...it, ...firstFit(placed, it.w, it.h, columns) })
  return placed
}

/** Covered cards move straight down out of the way; then every card floats up as far as it can. */
function pushDown(items: Item[], pinned: Item): Item[] {
  const placed: Item[] = [pinned]
  for (const it of items.filter((i) => i.id !== pinned.id).sort(byPosition)) {
    const next = { ...it }
    while (placed.some((o) => collide(o, next))) next.y += 1
    placed.push(next)
  }
  // Gravity, the pinned card fixed.
  const settled: Item[] = [pinned]
  for (const it of placed.filter((i) => i.id !== pinned.id).sort(byPosition)) {
    const next = { ...it, y: 0 }
    for (;;) {
      const hit = settled.find((o) => collide(o, next))
      if (!hit) break
      next.y = hit.y + hit.h
    }
    settled.push(next)
  }
  return settled
}

const height = (items: Item[]) => Math.max(0, ...items.map((i) => i.y + i.h))

/** Empty cells above the board's last row. A short last row is just where the board ends. */
function holes(items: Item[], columns: number): number {
  const h = height(items)
  let used = 0
  for (const i of items) {
    // Only the part of each card above the last row.
    const top = Math.min(i.y + i.h, h - 1) - i.y
    if (top > 0) used += i.w * top
  }
  return Math.max(0, (h - 1) * columns - used)
}

/** How far the other cards moved, in cells. */
function moved(start: Item[], next: Item[], movedId: string): number {
  const from = new Map(start.map((i) => [i.id, i]))
  let total = 0
  for (const i of next) {
    if (i.id === movedId) continue
    const o = from.get(i.id)
    if (o) total += Math.abs(i.x - o.x) + Math.abs(i.y - o.y)
  }
  return total
}

/**
 * How much a layout disturbs the board: how far the other cards moved (in cells), plus 3 per hole
 * above the last row and 2 per row the board grew by. Lower is better.
 */
export function disturbance(start: Item[], next: Item[], movedId: string, columns = COLUMNS): number {
  return moved(start, next, movedId) + 3 * holes(next, columns) + 2 * Math.max(0, height(next) - height(start))
}

/**
 * Puts card `id` with its top-left at (x, y), clamped into the grid, and fits the others around it
 * whichever way disturbs the board least (BS-29). Dropped exactly onto one card of the same size,
 * the two swap places instead (BS-30). Always worked out from the layout the drag began with, so
 * moving back undoes a preview.
 */
export function place(items: Item[], id: string, x: number, y: number, columns = COLUMNS): Item[] {
  const moving = items.find((i) => i.id === id)
  if (!moving) return items
  const target = { ...moving, x: Math.max(0, Math.min(columns - moving.w, x)), y: Math.max(0, y) }
  if (target.x === moving.x && target.y === moving.y) return items
  const covered = items.filter((o) => collide(o, target))
  if (covered.length === 1) {
    const o = covered[0]
    if (o.w === moving.w && o.h === moving.h && o.x === target.x && o.y === target.y) {
      return items.map((i) => (i.id === id ? target : i.id === o.id ? { ...o, x: moving.x, y: moving.y } : i))
    }
  }
  const pinnedBoard = items.map((i) => (i.id === id ? target : i))
  const options = [stayPut(items, target, columns), pushDown(items, target), pack(pinnedBoard, id, columns)]
  let best = options[0]
  let bestScore = disturbance(items, best, id, columns)
  // Lowest disturbance; on a tie, the one that moves the other cards least.
  for (const o of options.slice(1)) {
    const sc = disturbance(items, o, id, columns)
    if (sc < bestScore || (sc === bestScore && moved(items, o, id) < moved(items, best, id))) { best = o; bestScore = sc }
  }
  return best
}

/**
 * The size a grip drag asks for, from how far the grip has moved since it was pressed (BS-19).
 * Direction, not position, so a card at the right edge can still grow (it grows leftwards):
 *   - sideways past half a column (either way) makes a 1-wide card 2 wide; left past half a column
 *     makes a 2-wide card 1 wide;
 *   - down past half a row makes a 1-tall card 2 tall; up past half a row makes it 1 tall again.
 * There's no 1 × 2 size, so a small card dragged down becomes large.
 */
export function sizeFromGrip(size: CardSize, dx: number, dy: number, colWidth: number, rowHeight: number): CardSize {
  const { w, h } = dims(size)
  let nw = w
  let nh = h
  if (w === 1 && Math.abs(dx) > colWidth / 2) nw = 2
  if (w === 2 && dx < -colWidth / 2) nw = 1
  if (h === 1 && dy > rowHeight / 2) nh = 2
  if (h === 2 && dy < -rowHeight / 2) nh = 1
  if (nh === 2) return 'lg'
  return nw === 2 ? 'md' : 'sm'
}

/** A card changes size where it stands; the others pack around it (BS-19). */
export function resize(items: Item[], id: string, size: CardSize, columns = COLUMNS): Item[] {
  return pack(items.map((i) => {
    if (i.id !== id) return i
    const d = dims(size)
    return { ...i, ...d, x: Math.min(i.x, columns - d.w) }
  }), id, columns)
}

/** The first place, row by row, where a card of this size fits (a new card, BS-20). */
export function firstFit(items: Item[], w: number, h: number, columns = COLUMNS): { x: number; y: number } {
  for (let y = 0; ; y++) {
    for (let x = 0; x + w <= columns; x++) {
      if (!items.some((o) => collide(o, { id: '\0', x, y, w, h }))) return { x, y }
    }
  }
}

/**
 * Lays cards out in the given order, each in the first place at or after the last one that it
 * fits (CSS grid's sparse auto-placement). Used to give positions to cards that have none, and
 * when a narrow window or the keyboard changes the reading order.
 */
export function flow<T extends { id: string; w: number; h: number }>(cards: T[], columns = COLUMNS): Item[] {
  const placed: Item[] = []
  let cy = 0
  let cx = 0
  for (const c of cards) {
    let x = cx
    let y = cy
    for (;;) {
      if (x + c.w > columns) { x = 0; y += 1; continue }
      const at = { id: c.id, x, y, w: c.w, h: c.h }
      if (!placed.some((o) => collide(o, at))) break
      x += 1
    }
    placed.push({ id: c.id, x, y, w: c.w, h: c.h })
    cy = y
    cx = x + c.w
  }
  return placed
}

// ── Cards ⇄ items ────────────────────────────────────────────────────────────

export function toItems(cards: BoardCard[]): Item[] {
  return cards.map((c) => ({ id: c.metricId, x: c.x, y: c.y, ...dims(c.size) }))
}

/** Writes positions back onto the cards, in reading order (the DOM and keyboard order, BS-31). */
export function withItems(cards: BoardCard[], items: Item[]): BoardCard[] {
  const at = new Map(items.map((i) => [i.id, i]))
  return cards
    .map((c) => { const i = at.get(c.metricId); return i ? { ...c, x: i.x, y: i.y } : c })
    .sort((a, b) => a.y - b.y || a.x - b.x)
}

/** Positions for cards in order, as the grid would lay them out (dummy data, narrow reorders). */
export function flowCards(cards: Omit<BoardCard, 'x' | 'y'>[]): BoardCard[] {
  const items = flow(cards.map((c) => ({ id: c.metricId, ...dims(c.size) })))
  return cards.map((c, i) => ({ ...c, x: items[i].x, y: items[i].y }))
}

/** True when two layouts put every card in the same place. */
export function sameLayout(a: Item[], b: Item[]): boolean {
  if (a.length !== b.length) return false
  const at = new Map(b.map((i) => [i.id, i]))
  return a.every((i) => { const o = at.get(i.id); return !!o && o.x === i.x && o.y === i.y && o.w === i.w && o.h === i.h })
}
