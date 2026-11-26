// The tab row's rules, as pure functions: how many tabs show before "N more" (D77), and where a dragged tab lands
// (D86). The row and Manage tabs both use them.

/** Tabs on show before the rest fold into "N more". */
export const TAB_LIMIT = 6
/** Tabs on show in a narrow window (`NARROW_WIDTH` or less). */
export const NARROW_TAB_LIMIT = 4
export const NARROW_WIDTH = 1024

/**
 * Splits your tabs into the ones on show and the ones in "N more". Up to `limit` show; the open board is always on
 * show, taking the last place when it would otherwise be folded away. The rest keep their order.
 */
export function visibleTabs(order: readonly string[], activeId: string | null, limit: number): { shown: string[]; more: string[] } {
  const room = Math.max(1, limit)
  if (order.length <= room) return { shown: [...order], more: [] }
  let shown = order.slice(0, room)
  if (activeId && order.includes(activeId) && !shown.includes(activeId)) shown = [...order.slice(0, room - 1), activeId]
  const onShow = new Set(shown)
  return { shown, more: order.filter(id => !onShow.has(id)) }
}

/**
 * Moves `id` to a gap in `order`: gap n is just before `order[n]`, and `order.length` is the end. A drop that changes
 * nothing (the gap on either side of the tab itself) returns the same array.
 */
export function moveToGap(order: readonly string[], id: string, gap: number): readonly string[] {
  const from = order.indexOf(id)
  if (from === -1 || isNoopGap(order, id, gap)) return order
  const next = order.filter(t => t !== id)
  const at = Math.min(Math.max(0, gap > from ? gap - 1 : gap), next.length)
  next.splice(at, 0, id)
  return next
}

/** True when dropping `id` at `gap` would leave the order as it is, so no drop line is drawn there. */
export function isNoopGap(order: readonly string[], id: string, gap: number): boolean {
  const from = order.indexOf(id)
  return from === -1 || gap === from || gap === from + 1
}

/**
 * A gap in a part of the order (the tabs on show, or the "N more" list) as a gap in the whole order: before the
 * part's n-th tab, or just after its last one.
 */
export function gapInOrder(order: readonly string[], part: readonly string[], partGap: number): number {
  if (part.length === 0) return order.length
  if (partGap < part.length) return Math.max(0, order.indexOf(part[partGap]))
  return order.indexOf(part[part.length - 1]) + 1
}

/** Which gap a pointer at `x` is nearest, given the left and right edges of each item in a row (or top and bottom). */
export function gapAt(edges: readonly { start: number; end: number }[], at: number): number {
  for (let i = 0; i < edges.length; i += 1) {
    if (at < (edges[i].start + edges[i].end) / 2) return i
  }
  return edges.length
}
