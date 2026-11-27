'use client'

import { useRef, useState } from 'react'

// Dragging a tab (TAB-30 – TAB-35): the tabs stay put, the place dims, a copy follows the pointer,
// a blue line marks the drop. Holding over "N more" for half a second opens its list (TAB-33).

const DRAG_START = 4    // TAB-35
const LIST_DELAY = 500  // TAB-33

export type DropLine = { kind: 'row'; x: number } | { kind: 'list'; index: number }
export interface DragView { id: string; label: string; x: number; y: number; to: number | null; line: DropLine | null }

interface TabDragOptions {
  /** Every tab, in your order. */
  order: string[]
  visible: string[]
  overflow: string[]
  labelOf: (id: string) => string
  /** No drag while a tab is being renamed. */
  renaming: boolean
  onMoveTo: (id: string, to: number) => void
  tabRefs: React.RefObject<Map<string, HTMLElement>>
  countRef: React.RefObject<HTMLButtonElement | null>
}

export function useTabDrag({ order, visible, overflow, labelOf, renaming, onMoveTo, tabRefs, countRef }: TabDragOptions) {
  const capsuleRef = useRef<HTMLDivElement>(null)
  const dragListRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<DragView | null>(null)
  const [dragListOpen, setDragListOpen] = useState(false)
  /** True from a drag's start until just after its release: the click that follows mustn't open the tab. */
  const suppressClick = useRef(false)

  const dropTarget = (from: number, x: number, y: number, listOpen: boolean): Pick<DragView, 'to' | 'line'> => {
    const inside = (r: DOMRect) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
    let target: number
    let line: DropLine
    const list = dragListRef.current
    if (listOpen && list && inside(list.getBoundingClientRect()) && overflow.length) {
      const rows = [...list.querySelectorAll<HTMLElement>('[data-more-row]')]
      let r = rows.findIndex((row) => { const b = row.getBoundingClientRect(); return y < b.top + b.height / 2 })
      if (r < 0) r = rows.length
      target = r < overflow.length ? order.indexOf(overflow[r]) : order.indexOf(overflow[overflow.length - 1]) + 1
      line = { kind: 'list', index: r }
    } else {
      const cap = capsuleRef.current?.getBoundingClientRect()
      const rects = visible.map((id) => tabRefs.current.get(id)?.getBoundingClientRect())
      let g = rects.findIndex((b) => b && x < b.left + b.width / 2)
      if (g < 0) g = visible.length
      target = g < visible.length ? order.indexOf(visible[g]) : order.indexOf(visible[visible.length - 1]) + 1
      const edge = g < visible.length ? rects[g]!.left : rects[visible.length - 1]!.right
      line = { kind: 'row', x: edge - (cap?.left ?? 0) }
    }
    const to = target > from ? target - 1 : target
    return to === from ? { to: null, line: null } : { to, line } // no line when nothing would change (TAB-31)
  }

  const onTabPointerDown = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0 || renaming) return
    const start = { x: e.clientX, y: e.clientY }
    const from = order.indexOf(id)
    const label = labelOf(id)
    let active = false
    let listOpen = false
    let timer: number | undefined
    let latest: Pick<DragView, 'to' | 'line'> = { to: null, line: null }

    const move = (ev: PointerEvent) => {
      if (!active) {
        if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < DRAG_START) return
        active = true
        suppressClick.current = true
      }
      // Holding over "N more" for half a second opens the list (TAB-33).
      const count = countRef.current?.getBoundingClientRect()
      const overCount = !!count && ev.clientX >= count.left && ev.clientX <= count.right && ev.clientY >= count.top && ev.clientY <= count.bottom
      if (overCount && !listOpen && timer == null) {
        timer = window.setTimeout(() => { listOpen = true; timer = undefined; setDragListOpen(true) }, LIST_DELAY)
      } else if (!overCount && timer != null) {
        window.clearTimeout(timer); timer = undefined
      }
      latest = dropTarget(from, ev.clientX, ev.clientY, listOpen)
      setDrag({ id, label, x: ev.clientX, y: ev.clientY, ...latest })
    }
    const finish = (commit: boolean) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', key, true)
      if (timer != null) window.clearTimeout(timer)
      if (active && commit && latest.to != null) onMoveTo(id, latest.to)
      setDrag(null)
      setDragListOpen(false)
      // The click that follows a drag must not open the tab.
      window.setTimeout(() => { suppressClick.current = false }, 0)
    }
    const up = () => finish(true)
    const cancel = () => finish(false)
    const key = (ev: KeyboardEvent) => { if (ev.key === 'Escape' && active) { ev.preventDefault(); ev.stopPropagation(); finish(false) } }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', key, true)
  }

  return { drag, dragListOpen, capsuleRef, dragListRef, suppressClick, onTabPointerDown }
}
