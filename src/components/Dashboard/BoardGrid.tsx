'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { m, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { DashboardSquareOneIcon } from '@strange-huge/icons'
import { EmptyState } from '@/components/ui'
import { bestIndex, edgeScrollSpeed } from './card-placement'
import { dims, place, sameLayout, sizeFromGrip, sizeOf, toItems, withItems, type Item } from './grid-layout'
import { LandingSlot, RemoveBadge, ResizeArc } from './EditChrome'
import { MetricCard, SIZE_LABEL, type CardView, type GripProps } from './MetricCard'
import { useDashboardData } from './live/dashboard-data'
import type { BoardCard, CardSize } from './types'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { CardEmptyState, emptyAction, emptyDetail } from './CardEmpty'

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

// Narrower than the design grid (CR-36): 3-wide cards take half a row, 6- and 12-wide the whole
// row; heights stay. On the design grid each card sits at its own cell instead (--gc / --gr).
const SPAN: Record<CardSize, string> = {
  sm: '',
  'sm-tall': 'row-span-2',
  md: '@lg:col-span-2',
  lg: '@lg:col-span-2 row-span-2',
  full: '@lg:col-span-2',
  'full-lg': '@lg:col-span-2 row-span-2',
}
const ROW = 156
const GAP = 16
const DRAG_START = 4   // px before a press becomes a drag, so a click stays a click
const SETTLE_MS = 140  // after a move, let the cards slide before reading the pointer again
const DROP_MS = 180    // the copy settling into its slot

const WIDTHS = [1, 2, 4]

/** Arrow keys on the grip: → / ← one width wider or narrower (3 · 6 · 12), ↓ / ↑ taller or shorter. */
function sizeForKey(size: CardSize, key: string): CardSize | null {
  const { w, h } = dims(size)
  const at = WIDTHS.indexOf(w)
  let next: CardSize | null = null
  if (key === 'ArrowRight' && at < WIDTHS.length - 1) next = sizeOf(WIDTHS[at + 1], h)
  if (key === 'ArrowLeft' && at > 0) next = sizeOf(WIDTHS[at - 1], h)
  if (key === 'ArrowDown' && h === 1) next = sizeOf(w, 2)
  if (key === 'ArrowUp' && h === 2) next = sizeOf(w, 1)
  return next
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
  /** How each card reads: body state, dot, shimmer, series, health (05-cards-reading-rules.md). */
  cardView?: (metricId: string) => CardView | undefined
  /** Reading: a click or Enter on a card opens its metric window (CR-7). */
  onOpenCard?: (metricId: string) => void
  /** Try again on a card that couldn't load (CR-20). */
  onRetryCard?: (metricId: string) => void
  /** Edit mode: a click (a press that doesn't move) or Enter opens the card's settings (10 CS-1). */
  onOpenSettings?: (metricId: string) => void
  /** What an empty board shows to someone who can edit it (08 NB-17); the plain empty state otherwise. */
  empty?: React.ReactNode
  /** Remove card on an empty card while reading, with Undo (CR-22). */
  onRemoveEmpty?: (metricId: string) => void
  /** Cards just added: a soft ring for 2 s, scrolled into view (06 AC-17). `n` changes on every landing. */
  landed?: { ids: string[]; n: number } | null
}

const RING_MS = 2000

export function BoardGrid({ cards, onMoveTo, onSetLayout, onStep, onResize, onRemove, editing = false, cardView, onOpenCard, onRetryCard, onRemoveEmpty, landed, empty, onOpenSettings }: BoardGridProps) {
  const { metrics } = useDashboardData()
  const reduceMotion = useReducedMotion()
  // New cards: ringed, then the ring fades after 2 s (AC-17). Adjusted while rendering when a new
  // landing arrives, React's pattern for state that follows a prop.
  const [ring, setRing] = useState<{ ids: string[]; on: boolean; n: number } | null>(null)
  if (landed && landed.n !== ring?.n) setRing({ ids: landed.ids, on: true, n: landed.n })
  useEffect(() => {
    if (!ring?.on) return
    // Just enough scrolling to show them all when they fit, the first one first, clear of the toast.
    const els = ring.ids.map((id) => gridRef.current?.querySelector(`[data-card-id="${CSS.escape(id)}"]`)).filter((e): e is Element => !!e)
    const scroller = gridRef.current?.closest<HTMLElement>('.kaya-scrollbar')
    if (els.length && scroller) {
      const view = scroller.getBoundingClientRect()
      const top = Math.min(...els.map((e) => e.getBoundingClientRect().top))
      const bottom = Math.max(...els.map((e) => e.getBoundingClientRect().bottom))
      const margin = 24
      const down = Math.min(bottom + margin + 72 - view.bottom, top - margin - view.top) // 72: room for the toast
      const up = top - margin - view.top
      const by = up < 0 ? up : down > 0 ? down : 0
      if (by) scroller.scrollBy({ top: by, behavior: reduceMotion ? 'auto' : 'smooth' })
    }
    const t = window.setTimeout(() => setRing((r) => (r ? { ...r, on: false } : r)), RING_MS)
    return () => window.clearTimeout(t)
  }, [ring?.on, ring?.n, ring?.ids, reduceMotion])
  const gridRef = useRef<HTMLUListElement>(null)
  const [drag, setDrag] = useState<DragView | null>(null)
  // The lifted copy is moved by writing its style once a frame, not through state: a pointer move
  // shouldn't re-render the grid (React leaves the style alone while drag.x/y stay as they started).
  const ghostRef = useRef<HTMLDivElement>(null)
  // The last drop's settle; a new drag that starts before it ends cancels it, so it can't clear the new copy.
  const settleTimer = useRef<number | undefined>(undefined)
  // A resize (Figma 2.7): the card's frame follows the pointer freely while its place on the board
  // shows the landing slot at the snapped size; on release the frame glides into the slot.
  const [resizing, setResizing] = useState<ResizeView | null>(null)
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
    // The column count only changes with the window, not during a drag.
    const columns = getComputedStyle(grid).gridTemplateColumns.split(' ').length

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
      const id = card.metricId
      const li = grid.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(id)}"]`)
      if (!li) return
      const start = { x: e.clientX, y: e.clientY }
      const startSize = card.size
      const startW = dims(startSize).w
      const box = li.getBoundingClientRect()
      const g = grid.getBoundingClientRect()
      const columns = getComputedStyle(grid).gridTemplateColumns.split(' ').length
      const colWidth = (g.width - GAP * (columns - 1)) / columns
      let current = card.size
      let pointer = start
      let frame = 0
      // The free frame: from the press, as far as the pointer has gone. A one-column card grows
      // either way (leftwards from the right edge); a wider one grows or shrinks to the right.
      const frameAt = (): ResizeView => {
        const dx = pointer.x - start.x
        const dy = pointer.y - start.y
        const width = clamp(box.width + (startW === 1 ? Math.abs(dx) : dx), colWidth * 0.75, g.width)
        const height = clamp(box.height + dy, ROW * 0.75, ROW * 2 + GAP + ROW * 0.25)
        const left = clamp(startW === 1 && dx < 0 ? box.right - width : box.left, g.left, g.right - width)
        return { id, size: current, left, top: box.top, width, height }
      }
      setResizing(frameAt())
      const move = (ev: PointerEvent) => {
        pointer = { x: ev.clientX, y: ev.clientY }
        const next = sizeFromGrip(startSize, pointer.x - start.x, pointer.y - start.y, colWidth, ROW)
        if (next !== current) { current = next; onResize(id, next) }
        // One update a frame keeps it smooth on fast pointers.
        if (!frame) frame = requestAnimationFrame(() => { frame = 0; setResizing(frameAt()) })
      }
      const end = (commit: boolean) => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', cancel)
        window.removeEventListener('keydown', key, true)
        cancelAnimationFrame(frame)
        if (!commit && current !== startSize) { current = startSize; onResize(id, startSize) } // Esc: as it was
        setResizing((r) => (r ? { ...r, size: current } : r))
        // Settle: glide the frame into its slot, then drop it (as a moved card does, BS-26).
        requestAnimationFrame(() => {
          const slot = grid.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(id)}"]`)?.getBoundingClientRect()
          if (!slot || reduceMotion) { setResizing(null); return }
          setResizing((r) => (r ? { ...r, settleAt: { left: slot.left, top: slot.top, width: slot.width, height: slot.height } } : r))
          window.setTimeout(() => setResizing(null), DROP_MS + 40)
        })
        setAnnounce(`${metrics.get(id)?.label ?? 'Card'} is ${SIZE_LABEL[current]}`)
      }
      const up = () => end(true)
      const cancel = () => end(false)
      const key = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); end(false) } }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', cancel)
      window.addEventListener('keydown', key, true)
    },
    onKeyDown: (e) => {
      if (!e.key.startsWith('Arrow')) return
      e.preventDefault()
      e.stopPropagation()
      const next = sizeForKey(card.size, e.key)
      if (next) { onResize(card.metricId, next); setAnnounce(`${metrics.get(card.metricId)?.label ?? 'Card'} is ${SIZE_LABEL[next]}`) }
    },
  })

  if (cards.length === 0) {
    if (empty) return <>{empty}</>
    return (
      <EmptyState
        icon={<DashboardSquareOneIcon size={20} />}
        title="No cards yet"
        description={editing ? 'Add cards to start this board.' : 'This board is empty. Cards you add will show here.'}
        className="rounded-xl border border-dashed border-[var(--border-default)]"
      />
    )
  }

  const dragged = drag ? metrics.get(drag.id) : null
  const resized = resizing ? metrics.get(resizing.id) : null
  return (
    <div className="@container">
      {/* 4 design columns from 960 px of board (about 1100 px of window, CR-35); 2 below, filling gaps
          dense (CR-36); 1 under 512 px. */}
      <ul ref={gridRef} className="m-0 grid list-none auto-rows-[156px] grid-flow-row-dense grid-cols-1 gap-4 p-0 @lg:grid-cols-2 @min-[60rem]:grid-cols-4">
        {cards.map((card, i) => {
          const metric = metrics.get(card.metricId)
          // A metric the warehouse no longer has: the card stays in its place and says so, with Remove
          // card for people who can edit (CR-22), instead of vanishing without a word.
          if (!metric) {
            const canEdit = cardView?.(card.metricId)?.canEdit ?? editing
            return (
              <li
                key={card.metricId}
                data-card-id={card.metricId}
                style={{ ['--gc' as string]: `${card.x + 1} / span ${dims(card.size).w}`, ['--gr' as string]: `${card.y + 1} / span ${dims(card.size).h}` }}
                className={cn('relative min-w-0 rounded-xl', SPAN[card.size], '@min-[60rem]:[grid-column:var(--gc)]! @min-[60rem]:[grid-row:var(--gr)]!')}
              >
                <article data-card-body="removed" aria-label="Removed metric" className="relative size-full overflow-clip rounded-xl bg-[var(--dashboard-card-bg)] shadow-[var(--dashboard-card-shadow)]">
                  {/* Its name is gone with it; the id it was saved under says which card this was. */}
                  <h3 className="absolute left-4 right-4 top-4 m-0 truncate text-[length:var(--font-size-body-sm)] font-medium leading-5 text-[var(--dashboard-faint)]">{card.metricId.replace(/#d+$/, '').replace(/_/g, ' ')}</h3>
                  <CardEmptyState
                    kind="removed"
                    compact={card.size === 'sm'}
                    detail={emptyDetail('removed', { apps: [] })}
                    action={emptyAction('removed', { canEdit, onRemove: () => (editing ? onRemove(card.metricId) : onRemoveEmpty?.(card.metricId)) })}
                    className="absolute bottom-4 left-4 right-4"
                  />
                </article>
              </li>
            )
          }
          const isSlot = drag?.id === card.metricId
          const view = cardView?.(card.metricId)
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
              aria-keyshortcuts={editing ? 'Enter Alt+ArrowLeft Alt+ArrowRight Delete' : undefined}
              onKeyDown={editing ? (e) => {
                if (e.target !== e.currentTarget) return
                if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
                  e.preventDefault()
                  const by = e.key === 'ArrowLeft' ? -1 : 1
                  if (i + by >= 0 && i + by < cards.length) { onStep(card.metricId, by); setAnnounce(`${metric.label} moved to place ${i + by + 1} of ${cards.length}`) }
                } else if (e.key === 'Enter') {
                  e.preventDefault()
                  onOpenSettings?.(card.metricId)
                } else if (e.key === 'Delete' || e.key === 'Backspace') {
                  e.preventDefault()
                  onRemove(card.metricId)
                }
              } : undefined}
              className={cn(
                'relative min-w-0 rounded-xl select-none',
                SPAN[card.size],
                '@min-[60rem]:[grid-column:var(--gc)]! @min-[60rem]:[grid-row:var(--gr)]!',
                editing && 'touch-none cursor-grab outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-[var(--focus-ring)]',
                resizing?.id === card.metricId && 'z-20',
              )}
            >
              {resizing?.id === card.metricId ? (
                // Where the resized card will land, named (Figma 2.7).
                <LandingSlot size={card.size} />
              ) : isSlot ? (
                // The drop slot: where the card will land (BS-24).
                <div aria-hidden className="size-full rounded-xl border-2 border-dashed border-[var(--dashboard-drop-line)] bg-[var(--dashboard-drop-slot)]" />
              ) : (
                // One card that can't render shows its own fallback; the rest of the board stays. Keyed by
                // what the card shows, so a card whose numbers reload (or come back) gets a fresh try.
                <ErrorBoundary key={view?.body ?? 'none'} variant="region" label={metric.label}>
                  <MetricCard
                    metric={metric}
                    size={card.size}
                    editing={editing}
                    view={view}
                    index={i}
                    onOpen={onOpenCard ? () => onOpenCard(card.metricId) : undefined}
                    onRetry={onRetryCard ? () => onRetryCard(card.metricId) : undefined}
                    onRemove={() => (editing ? onRemove(card.metricId) : onRemoveEmpty?.(card.metricId))}
                  />
                </ErrorBoundary>
              )}
              {/* Edit mode's marks on the corners (Figma 2.5): remove, top left; resize, bottom right. */}
              {editing && !isSlot && resizing?.id !== card.metricId && (
                <>
                  <RemoveBadge label={metric.label} onRemove={() => onRemove(card.metricId)} />
                  <ResizeArc label={metric.label} size={card.size} grip={gripFor(card)} active={false} />
                </>
              )}
              {ring?.ids.includes(card.metricId) && (
                <span
                  aria-hidden
                  data-landed={ring.on || undefined}
                  className={cn(
                    'pointer-events-none absolute inset-0 rounded-xl border-[1.5px] border-solid border-[var(--dashboard-landed-ring)] shadow-[0_0_0_4px_var(--dashboard-landed-halo)]',
                    'transition-opacity duration-slow motion-reduce:transition-none',
                    ring.on ? 'opacity-100' : 'opacity-0',
                  )}
                />
              )}
            </m.li>
          )
        })}
      </ul>
      <p className="sr-only" aria-live="polite">{announce}</p>

      {/* The resized card's frame follows the pointer, then settles into its slot (Figma 2.7). */}
      {resizing && resized && createPortal(
        <>
          <div aria-hidden className="fixed inset-0 z-[var(--z-overlay)] cursor-nwse-resize" />
          <div
            aria-hidden
            data-resize-frame={resizing.size}
            className="pointer-events-none fixed z-[var(--z-popover)]"
            style={{
              ...(resizing.settleAt ?? resizing),
              transition: resizing.settleAt ? `left ${DROP_MS}ms ease-out, top ${DROP_MS}ms ease-out, width ${DROP_MS}ms ease-out, height ${DROP_MS}ms ease-out` : undefined,
            }}
          >
            <MetricCard
              metric={resized}
              size={resizing.size}
              view={cardView?.(resizing.id)}
              dragging
              className="shadow-[var(--dashboard-resize-shadow)] outline outline-1 outline-[var(--dashboard-figure)]"
            />
          </div>
        </>,
        document.body,
      )}

      {/* The lifted copy follows the pointer (BS-24), then settles into the slot. */}
      {drag && dragged && createPortal(
        <>
          <div aria-hidden className="fixed inset-0 z-[var(--z-overlay)] cursor-grabbing" />
          <div
            ref={ghostRef}
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
            <MetricCard metric={dragged} size={drag.size} view={cardView?.(drag.id)} dragging />
          </div>
        </>,
        document.body,
      )}
    </div>
  )
}

/** A resize in progress: the free frame (viewport px), the snapped size, and where it settles. */
interface ResizeView {
  id: string
  size: CardSize
  left: number
  top: number
  width: number
  height: number
  settleAt?: { left: number; top: number; width: number; height: number }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi))
