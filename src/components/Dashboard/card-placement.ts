// Where a dragged card lands (docs-v2/dashboard/02-board-screen-rules.md, BS-24 – BS-28).
// Pure, so the rules are testable without a browser.
//
// Narrower than the design grid, cards fill in reading order, dense: a later small card fills a
// gap beside an earlier one (CR-36). With mixed sizes,
// "before card X" doesn't always put a card where X is on screen, so instead of reasoning about
// neighbours, the drag tries every place in the order, works out where the grid would put the
// card for each, and picks the place whose slot is under (or nearest) the pointer (BS-25).

import { dims } from './grid-layout'
import type { CardSize } from './types'

export interface Cell { col: number; row: number; w: number; h: number }

/**
 * How many columns and rows a card covers in a grid of `columns` (CR-36): on 4 columns its own
 * size; on 2, 3-wide cards take half a row and 6- and 12-wide ones the whole row; on 1, all full
 * width. Heights stay.
 */
export function span(size: CardSize, columns: number): { w: number; h: number } {
  const d = dims(size)
  const w = columns >= 4 ? d.w : columns >= 2 && d.w > 1 ? 2 : 1
  return { w, h: d.h }
}

/**
 * CSS grid's auto-placement for items with no set position. Dense (the default, as the board
 * uses): each item takes the first place from the top where it fits. Sparse: a cursor that only
 * moves forward, and each item goes in the first place at or after it. Returns each item's cell.
 */
export function layoutCells(sizes: CardSize[], columns: number, dense = true): Cell[] {
  const taken = new Set<string>()
  const free = (col: number, row: number, w: number, h: number) => {
    if (col + w > columns) return false
    for (let r = row; r < row + h; r++) for (let c = col; c < col + w; c++) if (taken.has(`${c},${r}`)) return false
    return true
  }
  let cursorRow = 0
  let cursorCol = 0
  return sizes.map((size) => {
    const { w, h } = span(size, columns)
    let row = dense ? 0 : cursorRow
    let col = dense ? 0 : cursorCol
    while (!free(col, row, w, h)) {
      col += 1
      if (col + w > columns) { col = 0; row += 1 }
    }
    for (let r = row; r < row + h; r++) for (let c = col; c < col + w; c++) taken.add(`${c},${r}`)
    cursorRow = row
    cursorCol = col + w
    return { col, row, w, h }
  })
}

export interface GridMetrics { columns: number; colWidth: number; rowHeight: number; gap: number }

/** A cell in px, from the grid's top-left. */
export function cellRect(cell: Cell, g: GridMetrics) {
  return {
    left: cell.col * (g.colWidth + g.gap),
    top: cell.row * (g.rowHeight + g.gap),
    width: cell.w * g.colWidth + (cell.w - 1) * g.gap,
    height: cell.h * g.rowHeight + (cell.h - 1) * g.gap,
  }
}

/** 0 inside the rect, otherwise the distance to its nearest edge. */
function distance(p: { x: number; y: number }, r: { left: number; top: number; width: number; height: number }) {
  const dx = Math.max(r.left - p.x, 0, p.x - (r.left + r.width))
  const dy = Math.max(r.top - p.y, 0, p.y - (r.top + r.height))
  return Math.hypot(dx, dy)
}

/**
 * The place in the order that puts the dragged card's slot under the pointer, or nearest to it
 * (BS-25). `pointer` is relative to the grid's top-left. Keeps the current place unless another
 * is clearly better (`stickiness` px), so the slot doesn't flicker between two close places.
 */
export function bestIndex(
  order: { id: string; size: CardSize }[],
  dragId: string,
  pointer: { x: number; y: number },
  g: GridMetrics,
  stickiness = 12,
): number {
  const from = order.findIndex((o) => o.id === dragId)
  if (from < 0) return -1
  const dragged = order[from]
  const rest = order.filter((o) => o.id !== dragId)
  const score = (i: number) => {
    const sizes = [...rest.slice(0, i).map((o) => o.size), dragged.size, ...rest.slice(i).map((o) => o.size)]
    return distance(pointer, cellRect(layoutCells(sizes, g.columns)[i], g))
  }
  let best = from
  let bestScore = score(from) - stickiness
  for (let i = 0; i <= rest.length; i++) {
    if (i === from) continue
    const s = score(i)
    if (s < bestScore || (s === bestScore && Math.abs(i - from) < Math.abs(best - from))) { best = i; bestScore = s }
  }
  return best
}

/** Speed of the edge scroll while dragging near the top or bottom of the panel, px per frame (BS-27). */
export function edgeScrollSpeed(pointerY: number, top: number, bottom: number, zone = 64, max = 14): number {
  if (pointerY < top + zone) return -Math.ceil(max * Math.min(1, (top + zone - pointerY) / zone))
  if (pointerY > bottom - zone) return Math.ceil(max * Math.min(1, (pointerY - (bottom - zone)) / zone))
  return 0
}
