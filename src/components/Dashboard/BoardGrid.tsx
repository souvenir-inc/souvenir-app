'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { m, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { DashboardSquareOneIcon } from '@strange-huge/icons'
import { EmptyState } from '@/components/ui'
import { bestIndex, edgeScrollSpeed } from './card-placement'
import { dims, place, sameLayout, sizeFromGrip, toItems, withItems, type Item } from './grid-layout'
import { MetricCard, SIZE_LABEL, type GripProps } from './MetricCard'
import { METRICS } from './mock-data'
import type { BoardCard, CardSize } from './types'

// The card grid (Figma "grid", 1200 wide): four 288px columns, 156px rows, 16px gaps. A medium
// card spans two columns, a large one two columns and two rows. On the 4-column design grid each
// card sits at its own cell (grid-layout.ts); narrower, cards flow in reading order. Columns
// follow the panel width (container query), not the viewport: 4 → 2 → 1.
//
// Cards move, resize and go only in edit mode (BS-17 – BS-19, BS-24 – BS-31):
//   Move    press a card and drag: a copy lifts and follows the pointer, and the card's place
//           becomes a dashed drop slot. On 4 columns the copy's corner snaps to a cell: the card
//           goes there, any size, and the others pack around it; same-size cards swap. Narrower,
//           the slot takes the place in reading order nearest the pointer. Let go and the copy
//           settles into the slot; Esc puts every card back. Near the panel's top or bottom edge
//           the panel scrolls. Keyboard: ⌥← / ⌥→ on a focused card.
//   Resize  drag the grip: sideways past half a column makes a card wider (a card at the right
//           edge grows leftwards), down past half a row taller; it snaps to 1×1, 2×1 or 2×2.
//           Keyboard: arrows on the grip.
//   Remove  the card's ×, or Delete on a focused card.

const SPAN: Record<CardSize, string> = {
  sm: '',
  md: '@lg:col-span-2',
  lg: '@lg:col-span-2 row-span-2',
}
const ROW = 156
const GAP = 16
const DRAG_START = 4   // px before a press becomes a drag, so a click stays a click
const SETTLE_MS = 140  // after a move, let the cards slide before reading the pointer again
const DROP_MS = 180    // the copy settling into its slot

/** Arrow keys on the grip: → / ← wider or narrower, ↓ / ↑ taller or shorter. */
function sizeForKey(size: CardSize, key: string): CardSize | null {
  switch (key) {
    case 'ArrowRight': return size === 'sm' ? 'md' : null
    case 'ArrowLeft':  return size === 'sm' ? null : 'sm'
    case 'ArrowDown':  return size === 'lg' ? null : 'lg'
    case 'ArrowUp':    return size === 'lg' ? 'md' : null
    default:           return null
  }
}

interface DragView {
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

interface BoardGridProps {
  cards: BoardCard[]
  onMoveTo: (metricId: string, index: number) => void
  onSetLayout: (cards: BoardCard[]) => void
  onStep: (metricId: string, by: -1 | 1) => void
  onResize: (metricId: string, size: CardSize) => void
  onRemove: (metricId: string) => void
  /** Edit mode: cards move, resize and go (BS-18, BS-19). */
  editing?: boolean
  /** The board was just opened: names show, figures and charts shimmer (TAB-6). */
  loading?: boolean
}

export function BoardGrid({ cards, onMoveTo, onSetLayout, onStep, onResize, onRemove, editing = false, loading = false }: BoardGridProps) {
  const reduceMotion = useReducedMotion()
  const gridRef = useRef<HTMLUListElement>(null)
  const [drag, setDrag] = useState<DragView | null>(null)
  const [resizingId, setResizingId] = useState<string | null>(null)
  const [announce, setAnnounce] = useState('')
  // The order as last rendered; pointer handlers read it between renders.
  const orderRef = useRef<{ id: string; size: CardSize }[]>([])
  const cardsRef = useRef<BoardCard[]>(cards)
  useEffect(() => {
    orderRef.current = cards.map((c) => ({ id: c.metricId, size: c.size }))
    cardsRef.current = cards
  }, [cards])

  // ── Move: lift, slot, slide, settle (BS-24 – BS-28) ──────────────────────
  const startMove = (e: React.PointerEvent<HTMLElement>, card: BoardCard) => {
    if (!editing || e.button !== 0) return
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return // the grip and × do their own thing
    const li = e.currentTarget
    const grid = gridRef.current
    if (!grid) return
    const id = card.metricId
    const label = METRICS[id]?.label ?? 'Card'
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

    // Where the slot goes (BS-25, BS-29).
    //   4 columns (the design grid): the copy's top-left snaps to the nearest cell; the card is
    //   placed there and the others pack around it, worked out from the start every time, so
    //   moving back undoes a preview. Big cards go anywhere; same-size cards swap.
    //   Narrower: the place in reading order whose slot is under (or nearest) the pointer.
    const placeSlot = () => {
      const g = grid.getBoundingClientRect()
      const columns = getComputedStyle(grid).gridTemplateColumns.split(' ').length
      const colWidth = (g.width - GAP * (columns - 1)) / columns
      if (columns >= 4) {
        const cx = Math.round((pointer.x - offsetX - g.left) / (colWidth + GAP))
        const cy = Math.round((pointer.y - offsetY - g.top) / (ROW + GAP))
        const next = place(startItems, id, cx, cy)
        if (sameLayout(next, shown)) return
        shown = next
        onSetLayout(withItems(startCards, next))
        const at = next.find((i) => i.id === id)!
        setAnnounce(`${label}: column ${at.x + 1}, row ${at.y + 1}`)
        return
      }
      if (performance.now() - lastMoveAt < SETTLE_MS) return
      const order = orderRef.current
      const metrics = { columns, colWidth, rowHeight: ROW, gap: GAP }
      const to = bestIndex(order, id, { x: pointer.x - g.left, y: pointer.y - g.top }, metrics)
      if (to < 0 || to === order.findIndex((o) => o.id === id)) return
      lastMoveAt = performance.now()
      onMoveTo(id, to)
      setAnnounce(`${label}: place ${to + 1} of ${order.length}`)
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
        setAnnounce(`Moving ${label}`)
        frame = requestAnimationFrame(tick)
      }
      setDrag((d) => (d ? { ...d, x: ev.clientX, y: ev.clientY } : d))
      placeSlot()
    }

    const finish = (commit: boolean) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', key, true)
      cancelAnimationFrame(frame)
      if (!active) return
      if (!commit) onSetLayout(startCards) // Esc: everything back where it was (BS-26)
      // Settle: glide the copy into the slot, then drop it (BS-26).
      requestAnimationFrame(() => {
        const slot = grid.querySelector<HTMLElement>(`[data-card-id="${id}"]`)?.getBoundingClientRect()
        if (!slot || reduceMotion) { setDrag(null); return }
        setDrag((d) => (d ? { ...d, settleAt: { left: slot.left, top: slot.top } } : d))
        window.setTimeout(() => setDrag(null), DROP_MS)
      })
      setAnnounce(commit ? `${label} placed` : `${label} put back`)
    }
    const up = () => finish(true)
    const cancel = () => finish(false)
    const key = (ev: KeyboardEvent) => { if (ev.key === 'Escape' && active) { ev.preventDefault(); ev.stopPropagation(); finish(false) } }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', key, true)
  }

  // ── Resize (BS-19) ───────────────────────────────────────────────────────
  const gripFor = (card: BoardCard): GripProps => ({
    onPointerDown: (e) => {
      if (e.button !== 0) return
      e.stopPropagation()
      e.preventDefault()
      const grid = gridRef.current
      if (!grid) return
      // The size follows how far the grip has moved from the press, not where the pointer is, so
      // a card in the right-hand column can grow too: it grows leftwards (sizeFromGrip).
      const start = { x: e.clientX, y: e.clientY }
      const startSize = card.size
      const columns = getComputedStyle(grid).gridTemplateColumns.split(' ').length
      const colWidth = (grid.getBoundingClientRect().width - GAP * (columns - 1)) / columns
      let current = card.size
      setResizingId(card.metricId)
      const move = (ev: PointerEvent) => {
        const next = sizeFromGrip(startSize, ev.clientX - start.x, ev.clientY - start.y, colWidth, ROW)
        if (next !== current) { current = next; onResize(card.metricId, next) }
      }
      const end = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', end)
        window.removeEventListener('pointercancel', end)
        setResizingId(null)
        setAnnounce(`${METRICS[card.metricId]?.label ?? 'Card'} is ${SIZE_LABEL[current]}`)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', end)
      window.addEventListener('pointercancel', end)
    },
    onKeyDown: (e) => {
      if (!e.key.startsWith('Arrow')) return
      e.preventDefault()
      e.stopPropagation()
      const next = sizeForKey(card.size, e.key)
      if (next) { onResize(card.metricId, next); setAnnounce(`${METRICS[card.metricId]?.label ?? 'Card'} is ${SIZE_LABEL[next]}`) }
    },
  })

  if (cards.length === 0) {
    return (
      <EmptyState
        icon={<DashboardSquareOneIcon size={20} />}
        title="No cards yet"
        description={editing ? 'Add cards to start this board.' : 'This board is empty. Cards you add will show here.'}
        className="rounded-xl border border-dashed border-[var(--border-default)]"
      />
    )
  }

  const dragged = drag ? METRICS[drag.id] : null
  return (
    <div className="@container">
      <ul ref={gridRef} className="m-0 grid list-none auto-rows-[156px] grid-cols-1 gap-4 p-0 @lg:grid-cols-2 @4xl:grid-cols-4">
        {cards.map((card, i) => {
          const metric = METRICS[card.metricId]
          if (!metric) return null
          const isSlot = drag?.id === card.metricId
          return (
            <m.li
              key={card.metricId}
              data-card-id={card.metricId}
              // On the 4-column design grid each card sits at its own cell (BS-29); narrower, the
              // cards flow in reading order with the spans below.
              style={{ ['--gc' as string]: `${card.x + 1} / span ${dims(card.size).w}`, ['--gr' as string]: `${card.y + 1} / span ${dims(card.size).h}` }}
              // "position": cards slide to their new places; sizes snap, so nothing stretches.
              layout={reduceMotion ? false : 'position'}
              transition={{ layout: { type: 'spring', stiffness: 520, damping: 42 } }}
              onPointerDown={(e) => startMove(e, card)}
              // Edit mode: each card is a keyboard stop. ⌥← / ⌥→ move it; Delete removes it.
              tabIndex={editing ? 0 : undefined}
              aria-keyshortcuts={editing ? 'Alt+ArrowLeft Alt+ArrowRight Delete' : undefined}
              onKeyDown={editing ? (e) => {
                if (e.target !== e.currentTarget) return
                if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
                  e.preventDefault()
                  const by = e.key === 'ArrowLeft' ? -1 : 1
                  if (i + by >= 0 && i + by < cards.length) { onStep(card.metricId, by); setAnnounce(`${metric.label} moved to place ${i + by + 1} of ${cards.length}`) }
                } else if (e.key === 'Delete' || e.key === 'Backspace') {
                  e.preventDefault()
                  onRemove(card.metricId)
                }
              } : undefined}
              className={cn(
                'relative min-w-0 rounded-xl select-none',
                SPAN[card.size],
                '@4xl:[grid-column:var(--gc)]! @4xl:[grid-row:var(--gr)]!',
                editing && 'touch-none cursor-grab outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-[var(--focus-ring)]',
                resizingId === card.metricId && 'z-20',
              )}
            >
              {isSlot ? (
                // The drop slot: where the card will land (BS-24).
                <div aria-hidden className="size-full rounded-xl border-2 border-dashed border-[var(--dashboard-drop-line)] bg-[var(--dashboard-drop-slot)]" />
              ) : (
                <MetricCard
                  metric={metric}
                  size={card.size}
                  dragging={resizingId === card.metricId}
                  editing={editing}
                  loading={loading}
                  index={i}
                  onRemove={() => onRemove(card.metricId)}
                  grip={editing ? gripFor(card) : undefined}
                />
              )}
            </m.li>
          )
        })}
      </ul>
      <p className="sr-only" aria-live="polite">{announce}</p>

      {/* The lifted copy follows the pointer (BS-24), then settles into the slot. */}
      {drag && dragged && createPortal(
        <>
          <div aria-hidden className="fixed inset-0 z-[var(--z-overlay)] cursor-grabbing" />
          <div
            aria-hidden
            className="pointer-events-none fixed z-[var(--z-popover)]"
            style={{
              width: drag.width,
              height: drag.height,
              left: drag.settleAt ? drag.settleAt.left : drag.x - drag.offsetX,
              top: drag.settleAt ? drag.settleAt.top : drag.y - drag.offsetY,
              transform: drag.settleAt ? 'scale(1)' : 'scale(1.02)',
              transition: drag.settleAt ? `left ${DROP_MS}ms ease-out, top ${DROP_MS}ms ease-out, transform ${DROP_MS}ms ease-out` : 'transform 120ms ease-out',
            }}
          >
            <MetricCard metric={dragged} size={drag.size} dragging />
          </div>
        </>,
        document.body,
      )}
    </div>
  )
}
