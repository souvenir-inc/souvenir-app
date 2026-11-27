import { dims, sizeOf } from '../grid-layout'
import type { CardSize } from '../types'

// The board grid's measures and the small sums its moves and resizes share (BoardGrid.tsx).

// Narrower than the design grid (CR-36): 3-wide cards take half a row, 6- and 12-wide the whole
// row; heights stay. On the design grid each card sits at its own cell instead (--gc / --gr).
export const SPAN: Record<CardSize, string> = {
  sm: '',
  'sm-tall': 'row-span-2',
  md: '@lg:col-span-2',
  lg: '@lg:col-span-2 row-span-2',
  full: '@lg:col-span-2',
  'full-lg': '@lg:col-span-2 row-span-2',
}
export const ROW = 156
export const GAP = 16
export const DRAG_START = 4   // px before a press becomes a drag, so a click stays a click
export const SETTLE_MS = 140  // after a move, let the cards slide before reading the pointer again
export const DROP_MS = 180    // the copy settling into its slot

const WIDTHS = [1, 2, 4]

/** Arrow keys on the grip: → / ← one width wider or narrower (3 · 6 · 12), ↓ / ↑ taller or shorter. */
export function sizeForKey(size: CardSize, key: string): CardSize | null {
  const { w, h } = dims(size)
  const at = WIDTHS.indexOf(w)
  let next: CardSize | null = null
  if (key === 'ArrowRight' && at < WIDTHS.length - 1) next = sizeOf(WIDTHS[at + 1], h)
  if (key === 'ArrowLeft' && at > 0) next = sizeOf(WIDTHS[at - 1], h)
  if (key === 'ArrowDown' && h === 1) next = sizeOf(w, 2)
  if (key === 'ArrowUp' && h === 2) next = sizeOf(w, 1)
  return next
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi))

/** A card's own cell on the 4-column design grid, as the custom properties the grid classes read. */
export const cellStyle = (card: { x: number; y: number; size: CardSize }) => ({
  ['--gc' as string]: `${card.x + 1} / span ${dims(card.size).w}`,
  ['--gr' as string]: `${card.y + 1} / span ${dims(card.size).h}`,
})

/** The columns the grid lays out right now: they change with the window, not during a drag. */
export const columnsOf = (grid: HTMLElement) => getComputedStyle(grid).gridTemplateColumns.split(' ').length
