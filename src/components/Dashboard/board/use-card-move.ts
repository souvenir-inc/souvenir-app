'use client'

import { useEffect, useRef, useState } from 'react'
import { bestIndex, edgeScrollSpeed } from '../card-placement'
import { place, sameLayout, toItems, withItems, type Item } from '../grid-layout'
import type { Metrics } from '../live/metrics'
import type { BoardCard, CardSize } from '../types'
import { columnsOf, DRAG_START, DROP_MS, GAP, ROW, SETTLE_MS } from './grid-geometry'

// Moving a card in edit mode (BS-24 – BS-29): lift, slot, slide, settle.
//   Press a card and drag: a copy lifts and follows the pointer, and the card's place becomes a
//   dashed drop slot. On 4 columns the copy's corner snaps to a cell: the card goes there, any size,
//   and the others pack around it; same-size cards swap. Narrower, the slot takes the place in
//   reading order nearest the pointer. Let go and the copy settles into the slot; Esc puts every
//   card back. Near the panel's top or bottom edge the panel scrolls.

export interface DragView {
  id: string
  size: CardSize
  width: number
  height: number
  /** Where in the card it was picked up, so it doesn't jump to the pointer. */
  offsetX: number
  offsetY: number
  x: number
  y: number
  /** Letting go: the copy glides to the slot's place. */
  settleAt?: { left: number; top: number }
}

interface CardMoveOptions {
  cards: BoardCard[]
  editing: boolean
  metrics: Metrics
  gridRef: React.RefObject<HTMLUListElement | null>
  reduceMotion: boolean | null
  onMoveTo: (metricId: string, index: number) => void
  onSetLayout: (cards: BoardCard[]) => void
  onOpenSettings?: (metricId: string) => void
  announce: (text: string) => void
}

export function useCardMove({ cards, editing, metrics, gridRef, reduceMotion, onMoveTo, onSetLayout, onOpenSettings, announce }: CardMoveOptions) {
  const [drag, setDrag] = useState<DragView | null>(null)
  // The lifted copy is moved by writing its style once a frame, not through state: a pointer move
  // shouldn't re-render the grid (React leaves the style alone while drag.x/y stay as they started).
  const ghostRef = useRef<HTMLDivElement>(null)
  // The last drop's settle; a new drag that starts before it ends cancels it, so it can't clear the new copy.
  const settleTimer = useRef<number | undefined>(undefined)
  // The order as last rendered; pointer handlers read it between renders.
  const orderRef = useRef<{ id: string; size: CardSize }[]>([])
  const cardsRef = useRef<BoardCard[]>(cards)
  useEffect(() => {
    orderRef.current = cards.map((c) => ({ id: c.metricId, size: c.size }))
    cardsRef.current = cards
  }, [cards])

  const startMove = (e: React.PointerEvent<HTMLElement>, card: BoardCard) => {
    if (!editing || e.button !== 0) return
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return // the grip and × do their own thing
    window.clearTimeout(settleTimer.current)
    const li = e.currentTarget
    const grid = gridRef.current
    if (!grid) return
    const id = card.metricId
    const label = metrics.get(id)?.label ?? 'Card'
    const start = { x: e.clientX, y: e.clientY }
    const box = li.getBoundingClientRect()
    const offsetX = e.clientX - box.left
    const offsetY = e.clientY - box.top
    const scroller = li.closest<HTMLElement>('.kaya-scrollbar')
    const startCards = cardsRef.current            // the layout the drag began with (BS-29)
    const startItems: Item[] = toItems(startCards)
    let shown: Item[] = startItems
    let active = false
    let pointer = { x: e.clientX, y: e.clientY }
    let lastMoveAt = 0
    let frame = 0
    let pending = 0
    const columns = columnsOf(grid)

    // Where the slot goes (BS-25, BS-29).
    //   4 columns (the design grid): the copy's top-left snaps to the nearest cell; the card is
    //   placed there and the others pack around it, worked out from the start every time, so
    //   moving back undoes a preview. Big cards go anywhere; same-size cards swap.
    //   Narrower: the place in reading order whose slot is under (or nearest) the pointer.
    const placeSlot = () => {
      const g = grid.getBoundingClientRect()
      const colWidth = (g.width - GAP * (columns - 1)) / columns
      if (columns >= 4) {
        const cx = Math.round((pointer.x - offsetX - g.left) / (colWidth + GAP))
        const cy = Math.round((pointer.y - offsetY - g.top) / (ROW + GAP))
        const next = place(startItems, id, cx, cy)
        if (sameLayout(next, shown)) return
        shown = next
        onSetLayout(withItems(startCards, next))
        const at = next.find((i) => i.id === id)!
        announce(`${label}: column ${at.x + 1}, row ${at.y + 1}`)
        return
      }
      if (performance.now() - lastMoveAt < SETTLE_MS) return
      const order = orderRef.current
      const sizes = { columns, colWidth, rowHeight: ROW, gap: GAP }
      const to = bestIndex(order, id, { x: pointer.x - g.left, y: pointer.y - g.top }, sizes)
      if (to < 0 || to === order.findIndex((o) => o.id === id)) return
      lastMoveAt = performance.now()
      onMoveTo(id, to)
      announce(`${label}: place ${to + 1} of ${order.length}`)
    }

    // Near the panel's top or bottom edge, scroll, and keep placing as the cards pass (BS-27).
    const tick = () => {
      if (scroller) {
        const r = scroller.getBoundingClientRect()
        const speed = edgeScrollSpeed(pointer.y, r.top, r.bottom)
        if (speed) { scroller.scrollTop += speed; placeSlot() }
      }
      frame = requestAnimationFrame(tick)
    }

    const move = (ev: PointerEvent) => {
      pointer = { x: ev.clientX, y: ev.clientY }
      if (!active) {
        if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < DRAG_START) return
        active = true
        setDrag({ id, size: card.size, width: box.width, height: box.height, offsetX: start.x - box.left, offsetY: start.y - box.top, x: ev.clientX, y: ev.clientY })
        announce(`Moving ${label}`)
        frame = requestAnimationFrame(tick)
      }
      // One update a frame, however fast the pointer reports.
      if (!pending) pending = requestAnimationFrame(() => {
        pending = 0
        const ghost = ghostRef.current
        if (ghost) { ghost.style.left = `${pointer.x - offsetX}px`; ghost.style.top = `${pointer.y - offsetY}px` }
        placeSlot()
      })
    }

    const finish = (commit: boolean) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', key, true)
      cancelAnimationFrame(frame)
      // A drop in the same frame as the last move: place for where the pointer let go, not a frame before.
      if (pending) { cancelAnimationFrame(pending); pending = 0; if (commit && active) placeSlot() }
      // A press that never moved is a click: the card's settings (10 CS-1).
      if (!active) { if (commit) onOpenSettings?.(id); return }
      if (!commit) onSetLayout(startCards) // Esc: everything back where it was (BS-26)
      // Settle: glide the copy into the slot, then drop it (BS-26).
      requestAnimationFrame(() => {
        const slot = grid.querySelector<HTMLElement>(`[data-card-id="${id}"]`)?.getBoundingClientRect()
        if (!slot || reduceMotion) { setDrag(null); return }
        setDrag((d) => (d ? { ...d, settleAt: { left: slot.left, top: slot.top } } : d))
        settleTimer.current = window.setTimeout(() => setDrag(null), DROP_MS)
      })
      announce(commit ? `${label} placed` : `${label} put back`)
    }
    const up = () => finish(true)
    const cancel = () => finish(false)
    const key = (ev: KeyboardEvent) => { if (ev.key === 'Escape' && active) { ev.preventDefault(); ev.stopPropagation(); finish(false) } }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', key, true)
  }

  return { drag, ghostRef, startMove }
}
