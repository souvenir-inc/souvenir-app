// Moving a card with the keyboard in edit mode (Figma "Keyboard · moving a card"): Space lifts it, ← → move it one
// place earlier or later, ↑ ↓ to the row above or below, Space or Enter drops it, Esc puts it back. Each step is
// announced. Pure, so the grid's geometry questions can be tested without a browser.

/** A card's box in the grid (its layout slot, not where a drag has taken it). */
export interface SlotBox {
  id: string
  top: number
  left: number
  width: number
}

/** Moves one id to a position in the order, clamped to the ends. */
export function moveTo(order: readonly string[], id: string, to: number): string[] {
  const from = order.indexOf(id)
  if (from === -1) return [...order]
  const next = order.filter(other => other !== id)
  next.splice(Math.max(0, Math.min(to, next.length)), 0, id)
  return next
}

/**
 * Where ↑ or ↓ takes a card: the place of the card in the row above (or below) whose middle is nearest the card's
 * middle. Past the first row ↑ goes to the start; past the last row ↓ goes to the end.
 */
export function rowStep(boxes: readonly SlotBox[], order: readonly string[], id: string, dir: 'up' | 'down'): number {
  const me = boxes.find(b => b.id === id)
  const at = order.indexOf(id)
  if (!me || at === -1) return at
  const centre = me.left + me.width / 2
  const others = boxes.filter(b => b.id !== id && (dir === 'up' ? b.top < me.top - 1 : b.top > me.top + 1))
  if (others.length === 0) return dir === 'up' ? 0 : order.length - 1
  const rowTop = dir === 'up' ? Math.max(...others.map(b => b.top)) : Math.min(...others.map(b => b.top))
  const row = others.filter(b => Math.abs(b.top - rowTop) <= 1)
  const nearest = row.reduce((best, b) =>
    Math.abs(b.left + b.width / 2 - centre) < Math.abs(best.left + best.width / 2 - centre) ? b : best)
  const target = order.indexOf(nearest.id)
  // Moving down, the card goes after the one it lands on; the order closes up behind it.
  return target === -1 ? at : target
}

/** What a screen reader hears at each step. */
export const liftWords = {
  lifted: (label: string, at: number, total: number) => `${label} lifted. Position ${at + 1} of ${total}.`,
  moved: (at: number, total: number) => `Position ${at + 1} of ${total}.`,
  dropped: (label: string, at: number, total: number) => `${label} dropped at position ${at + 1} of ${total}.`,
  cancelled: (label: string, at: number, total: number) => `${label} put back at position ${at + 1} of ${total}.`,
  resized: (label: string, size: string, cols: number, rows: number) => `${label}, ${size}, ${cols} by ${rows}.`,
}
