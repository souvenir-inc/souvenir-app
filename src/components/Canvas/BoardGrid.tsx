'use client'

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { animate, motion, useDragControls, useReducedMotion, type PanInfo } from 'framer-motion'
import { X } from 'lucide-react'
import type { MeasureRequest, MetricEntry } from '@/lib/api/warehouse'
import { Tooltip } from '@/components/Tooltip'
import { SIZE_LABEL, SIZE_SPAN, snapSize, stepSize, type Board, type BoardCard, type CardSize } from './board'
import type { MeasurePlan, RangeKey } from './batching'
import { BoardCardView, type CardHealthKit, type HealthReport } from './BoardCardView'
import { liftWords, moveTo, rowStep, type SlotBox } from './gridKeys'
import type { CardSource } from './metrics'
import styles from './Canvas.module.css'

/** What the keys do right now, for the hint above the edit bar: moving a lifted card, or resizing from the arc. */
export type EditHint = 'move' | 'resize' | null

export interface BoardGridProps {
  board: Board
  plan: MeasurePlan
  catalog: ReadonlyMap<string, MetricEntry>
  catalogReady: boolean
  /** The card that just arrived, to bring into view and mark. */
  freshId: string | null
  /** Cards added on this visit: a 2 s ring when they land, and a "New" badge until the board is next opened. */
  newIds?: ReadonlySet<string>
  /** A new order. Changes sharing a `step` (one resize pulled from the left) are one undo step. */
  onReorder: (ids: string[], step?: string) => void
  /** A change to a card. Changes sharing a `step` (one resize, frame by frame) are one undo step. */
  onChange: (id: string, patch: Partial<Omit<BoardCard, 'id'>>, step?: string) => void
  onRemove: (id: string) => void
  /** Edit mode, like the iOS home screen: cards drag from anywhere, resize from any side but the ×, remove with ×. */
  editing?: boolean
  /** Given, a long press on a card asks for edit mode. Nothing on the grid leaves it: only Save or Cancel (Dev, 19 Nov). */
  onEditingChange?: (editing: boolean) => void
  /** Hears what a screen reader should be told as a card is moved or resized with the keys. */
  onAnnounce?: (text: string) => void
  /** Hears which keys are live, for the hint above the edit bar. */
  onHint?: (hint: EditHint) => void
  /** Given, clicking a card's body opens that metric up close (not in edit mode). */
  onOpen?: (metric: string) => void
  /** Given, clicking a card in edit mode opens its own settings (metric, chart, duplicate, export). */
  onEdit?: (id: string) => void
  /** The apps (with logos) a metric's numbers come from, for the marks beside each card's title. */
  sourcesOf?: (metric: string) => ReadonlyArray<CardSource & { logo: string | null }>
  /** Cards to show as plain skeletons for now (see useBoards' `held`). */
  held?: ReadonlySet<string>
  /** Whether a metric's source has never synced, so its card reads "No data yet" instead of a number. */
  waitingOf?: (metric: string) => boolean
  /** The warehouse areas a metric reads, for each card's sync status (the board on screen only). */
  categoriesOf?: (metric: string) => string[]
  /** The scorecard's health, for the pill on cards whose metric has a target. */
  healthKit?: CardHealthKit
  /** Hears each card's health, for the board's summary line. */
  onHealth?: (cardId: string, report: HealthReport | null) => void
}

/**
 * The snapped grid. Cards flow left to right on 12 columns; dragging a card over another moves it to that
 * place, and the others glide to make room (framer-motion layout animation). framer-motion's `Reorder` is
 * one-dimensional, so the grid does its own hit-testing with the same drag and layout primitives.
 */
export function BoardGrid({
  board, plan, catalog, catalogReady, freshId, newIds, onReorder, onChange, onRemove,
  editing = false, onEditingChange, onOpen, onEdit, sourcesOf, held, waitingOf, healthKit, onHealth, categoriesOf,
  onAnnounce, onHint,
}: BoardGridProps) {
  const [dragOrder, setDragOrder] = useState<string[] | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  /** A card picked up with Space: where every card was when it was lifted, so Esc can put it back. */
  const [lift, setLift] = useState<{ id: string; start: string[] } | null>(null)
  const lastTarget = useRef<string | null>(null)
  /** Esc during a drag: the drag ends where it started. */
  const dragCancelled = useRef(false)
  /** The order when a resize began, for Esc. */
  const resizeStart = useRef<string[] | null>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const slotRef = useRef<HTMLDivElement>(null)

  // Leaving edit mode lets go of a lifted card.
  if (!editing && lift) {
    setLift(null)
    setDragOrder(null)
  }

  const byId = new Map(board.cards.map(c => [c.id, c]))
  const cards = dragOrder
    ? dragOrder.map(id => byId.get(id)).filter((c): c is BoardCard => c !== undefined)
    : board.cards
  const requests = new Map<RangeKey, MeasureRequest>(plan.requests.map(r => [r.key, r.request]))
  const labelFor = (id: string) => {
    const card = byId.get(id)
    return card ? catalog.get(card.metric)?.label ?? card.metric : ''
  }
  const ids = board.cards.map(c => c.id)

  // ── The card in hand: Space lifts, ← → ↑ ↓ move, Space or Enter drops, Esc puts it back (Figma "Keyboard"). ──
  const liftCard = (id: string) => {
    setLift({ id, start: ids })
    setDragOrder(ids)
    onAnnounce?.(liftWords.lifted(labelFor(id), ids.indexOf(id), ids.length))
    onHint?.('move')
  }
  const slotBoxes = (): SlotBox[] => [...(listRef.current?.querySelectorAll<HTMLElement>(':scope > [data-card-id]') ?? [])]
    .map(el => ({ id: el.dataset.cardId ?? '', top: el.offsetTop, left: el.offsetLeft, width: el.offsetWidth }))
  const stepLift = (dir: 'left' | 'right' | 'up' | 'down') => {
    if (!lift) return
    const order = dragOrder ?? lift.start
    const at = order.indexOf(lift.id)
    const to = dir === 'left' ? at - 1 : dir === 'right' ? at + 1 : rowStep(slotBoxes(), order, lift.id, dir)
    const next = moveTo(order, lift.id, to)
    setDragOrder(next)
    onAnnounce?.(liftWords.moved(next.indexOf(lift.id), next.length))
  }
  const dropLift = () => {
    if (!lift) return
    const order = dragOrder ?? lift.start
    if (order.join('|') !== lift.start.join('|')) onReorder(order)
    onAnnounce?.(liftWords.dropped(labelFor(lift.id), order.indexOf(lift.id), order.length))
    setLift(null)
    setDragOrder(null)
    onHint?.(null)
  }
  const cancelLift = () => {
    if (!lift) return
    onAnnounce?.(liftWords.cancelled(labelFor(lift.id), lift.start.indexOf(lift.id), lift.start.length))
    setLift(null)
    setDragOrder(null)
    onHint?.(null)
  }

  // Pulling a card's left or top side over the card before it: it takes that card's place, which moves on (Dev, 19 Nov:
  // "B: where you pulled").
  const pull = (id: string, overId: string, step: string) => {
    const from = ids.indexOf(id)
    const to = ids.indexOf(overId)
    if (from !== -1 && to !== -1 && to < from) onReorder(moveTo(ids, id, to), step)
  }

  // The card being moved lands where the outline is: its own slot in the grid, whatever the drag has done to it.
  const moving = draggingId ?? lift?.id ?? null
  useLayoutEffect(() => {
    const slot = slotRef.current
    const li = moving ? listRef.current?.querySelector<HTMLElement>(`:scope > [data-card-id="${CSS.escape(moving)}"]`) : null
    if (!slot || !li) return
    slot.style.left = `${li.offsetLeft - 3}px`
    slot.style.top = `${li.offsetTop - 3}px`
    slot.style.width = `${li.offsetWidth + 6}px`
    slot.style.height = `${li.offsetHeight + 6}px`
    // A move can take the lifted card's element out of the page and back; it keeps the focus.
    const body = li.querySelector<HTMLElement>('[data-clickable]')
    if (lift && body && document.activeElement !== body) body.focus({ preventScroll: true })
  }, [moving, dragOrder, lift])

  const dragOver = (id: string, point: { x: number; y: number }) => {
    const under = document.elementsFromPoint(point.x, point.y)
      .map(el => (el as HTMLElement).closest<HTMLElement>('[data-card-id]'))
      .find(el => el && el.dataset.cardId !== id)
    const targetId = under?.dataset.cardId ?? null
    if (!targetId || targetId === lastTarget.current) {
      if (!targetId) lastTarget.current = null
      return
    }
    lastTarget.current = targetId
    setDragOrder(order => {
      const current = order ?? board.cards.map(c => c.id)
      const from = current.indexOf(id)
      const to = current.indexOf(targetId)
      if (from === -1 || to === -1) return current
      const next = [...current]
      next.splice(from, 1)
      next.splice(to, 0, id)
      return next
    })
  }

  const dragEnd = () => {
    if (dragOrder && !dragCancelled.current) onReorder(dragOrder)
    dragCancelled.current = false
    setDragOrder(null)
    setDraggingId(null)
    lastTarget.current = null
  }

  const movingCard = moving ? byId.get(moving) : undefined
  return (
    <ul
      ref={listRef}
      className={styles.grid}
      aria-label={`${board.name}: ${cards.length} cards${editing ? ', editing' : ''}`}
      data-editing={editing || undefined}
    >
      {/* Where the card being moved will land: its slot, outlined, with its size's name (D4). */}
      {movingCard && (
        <div ref={slotRef} className={styles.moveSlot} aria-hidden>
          <span className={styles.landingLabel}>{SIZE_LABEL[movingCard.size]}</span>
        </div>
      )}
      {cards.map(card => (
        <GridCell
          key={card.id}
          card={card}
          entry={catalog.get(card.metric)}
          catalogReady={catalogReady}
          plan={plan}
          requests={requests}
          fresh={card.id === freshId}
          isNew={newIds?.has(card.id) ?? false}
          dragging={card.id === draggingId}
          editing={editing}
          onLongPress={onEditingChange ? () => onEditingChange(true) : undefined}
          onOpen={editing ? (onEdit ? () => onEdit(card.id) : undefined) : onOpen}
          sources={sourcesOf?.(card.metric)}
          held={held?.has(card.id) ?? false}
          waiting={waitingOf?.(card.metric) ?? false}
          categories={categoriesOf?.(card.metric)}
          healthKit={healthKit}
          onHealth={onHealth}
          onDragStart={() => { setDraggingId(card.id); setDragOrder(board.cards.map(c => c.id)) }}
          onDragOver={point => dragOver(card.id, point)}
          onDragEnd={dragEnd}
          onDragCancel={() => { dragCancelled.current = true }}
          onChange={(patch, step) => onChange(card.id, patch, step)}
          onRemove={() => onRemove(card.id)}
          lifted={lift?.id === card.id}
          onLift={() => liftCard(card.id)}
          onStep={stepLift}
          onDrop={dropLift}
          onCancelLift={cancelLift}
          onPull={(overId, step) => pull(card.id, overId, step)}
          onResizeStart={() => { resizeStart.current = ids }}
          onResizeCancel={step => { if (resizeStart.current) onReorder(resizeStart.current, step); resizeStart.current = null }}
          onArcFocus={focused => onHint?.(focused ? 'resize' : null)}
          onResized={(size) => onAnnounce?.(liftWords.resized(labelFor(card.id), SIZE_LABEL[size], SIZE_SPAN[size].cols, SIZE_SPAN[size].rows))}
        />
      ))}
    </ul>
  )
}

const LONG_PRESS_MS = 450
const LONG_PRESS_SLOP = 8
/** Past the smallest or largest size, the frame still gives, but only this much of the pointer's travel. */
const OVERSHOOT_GIVE = 0.18
/**
 * The settle into a snapped slot: quick (about a quarter of a second), with a hint of overshoot, like a widget landing
 * on the home screen. It stops as soon as it's within half a pixel, rather than easing out the last fractions.
 */
const SETTLE = { type: 'spring', stiffness: 700, damping: 46, mass: 0.7, restDelta: 0.5, restSpeed: 20 } as const

/** Which side or corner is being pulled. The top-right corner is the ×, so it isn't a handle (Dev, 19 Nov: option A). */
type Edge = 'n' | 's' | 'e' | 'w' | 'nw' | 'sw' | 'se'
const EDGE_HANDLES: ReadonlyArray<Exclude<Edge, 'se'>> = ['n', 's', 'e', 'w', 'nw', 'sw']

/** The grid's columns, gaps and row height, read from the CSS, for turning a pointer drag into grid units. */
function gridMetrics(grid: HTMLElement) {
  const style = getComputedStyle(grid)
  const columns = style.gridTemplateColumns.split(' ').filter(Boolean).length
  const colGap = parseFloat(style.columnGap) || 0
  const rowGap = parseFloat(style.rowGap) || 0
  const colWidth = (grid.clientWidth - colGap * (columns - 1)) / columns
  const rowHeight = parseFloat(style.gridAutoRows) || 156
  return { columns, colGap, rowGap, colWidth, rowHeight }
}

/** A value held between `min` and `max`, with a soft give past either end instead of a hard stop. */
function soften(value: number, min: number, max: number): number {
  if (value < min) return min - (min - value) * OVERSHOOT_GIVE
  if (value > max) return max + (value - max) * OVERSHOOT_GIVE
  return value
}

function isControl(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('button, a, input, select, textarea, [role="menuitem"], [data-handle]') !== null
}

interface Box { left: number; top: number; width: number; height: number }

/**
 * How far the resize arc runs along each edge from the card's corner, in px. 16 is the corner's curve alone; more
 * adds a short straight lead-in on both edges, less trims the curve. iOS-like between 16 and 20.
 */
const HANDLE_REACH = 18

// The arc's geometry inside its 34px zone: the card's corner sits at (28, 28); its 16px radius, measured to the
// border's centre line, is 15.5 around (12, 12).
const CORNER = 28
const RADIUS = 15.5
const CENTRE = 12

/** The path for the arc at a given reach, trimming the curve symmetrically when the reach is under the radius. */
function arcPath(reach: number): string {
  const edge = CORNER - 0.5
  if (reach >= CORNER - CENTRE) {
    const from = CORNER - reach
    return `M${edge} ${from} V${CENTRE} A${RADIUS} ${RADIUS} 0 0 1 ${CENTRE} ${edge} H${from}`
  }
  const start = Math.asin(Math.min(1, Math.max(0, (CORNER - CENTRE - reach) / RADIUS)))
  const point = (angle: number) => `${(CENTRE + RADIUS * Math.cos(angle)).toFixed(2)} ${(CENTRE + RADIUS * Math.sin(angle)).toFixed(2)}`
  return `M${point(start)} A${RADIUS} ${RADIUS} 0 0 1 ${point(Math.PI / 2 - start)}`
}

const ARC_PATH = arcPath(HANDLE_REACH)

/** The iOS resize corner, drawn on the card's border at the bottom-right, its stroke centred on the border line. */
function CornerArc() {
  return (
    <svg className={styles.arc} width="34" height="34" viewBox="0 0 34 34" aria-hidden focusable="false">
      <path d={ARC_PATH} fill="none" stroke="currentColor" strokeLinecap="round" />
    </svg>
  )
}

function GridCell({
  card, entry, catalogReady, plan, requests, fresh, isNew, dragging, editing, onLongPress, onOpen, sources,
  held, waiting, categories, healthKit, onHealth, onDragStart, onDragOver, onDragEnd, onDragCancel, onChange, onRemove,
  lifted, onLift, onStep, onDrop, onCancelLift, onPull, onResizeStart, onResizeCancel, onArcFocus, onResized,
}: {
  card: BoardCard
  entry: MetricEntry | undefined
  catalogReady: boolean
  plan: MeasurePlan
  requests: ReadonlyMap<RangeKey, MeasureRequest>
  fresh: boolean
  isNew: boolean
  dragging: boolean
  editing: boolean
  onLongPress?: () => void
  onOpen?: (metric: string) => void
  sources?: ReadonlyArray<CardSource & { logo: string | null }>
  held: boolean
  waiting: boolean
  categories?: readonly string[]
  healthKit?: CardHealthKit
  onHealth?: (cardId: string, report: HealthReport | null) => void
  onDragStart: () => void
  onDragOver: (point: { x: number; y: number }) => void
  onDragEnd: () => void
  onDragCancel: () => void
  onChange: (patch: Partial<Omit<BoardCard, 'id'>>, step?: string) => void
  onRemove: () => void
  /** Picked up with Space, to move with the arrow keys. */
  lifted: boolean
  onLift: () => void
  onStep: (dir: 'left' | 'right' | 'up' | 'down') => void
  onDrop: () => void
  onCancelLift: () => void
  /** The card's left or top side was pulled over another card. */
  onPull: (overId: string, step: string) => void
  onResizeStart: () => void
  onResizeCancel: (step: string) => void
  onArcFocus: (focused: boolean) => void
  onResized: (size: CardSize) => void
}) {
  const controls = useDragControls()
  const reduceMotion = useReducedMotion()
  const ref = useRef<HTMLLIElement>(null)
  const frame = useRef<HTMLDivElement>(null)
  const press = useRef<{ timer: number; x: number; y: number } | null>(null)
  /** A long press just entered edit mode: the click that ends that press isn't an "open". */
  const longPressed = useRef(false)
  /** The card was just dragged: the click that ends the drag isn't an "open" either. */
  const dragged = useRef(false)
  /**
   * While a side is held: which one, where the pointer started, the frame's box on screen then, the size it had, and
   * the undo step the whole resize makes.
   */
  const grip = useRef<{ edge: Edge; x: number; y: number; start: DOMRect; size: CardSize; step: string } | null>(null)
  /** The frame's size just before a size change from the menu or keyboard, to grow or shrink it from. */
  const morphFrom = useRef<{ width: number; height: number } | null>(null)
  const settling = useRef<ReturnType<typeof animate> | null>(null)
  /** The side being held, while a resize is on (and while it settles). */
  const [activeEdge, setActiveEdge] = useState<Edge | null>(null)
  const resizing = activeEdge !== null
  const span = SIZE_SPAN[card.size]
  const needs = plan.byCard[card.id]
  const label = entry?.label ?? card.metric

  useEffect(() => {
    if (fresh) ref.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' })
  }, [fresh, reduceMotion])

  // Esc while dragging puts the card back where it started (Dev, 19 Nov). Heard first, so edit mode's own Esc (Cancel)
  // doesn't also fire.
  useEffect(() => {
    if (!dragging) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onDragCancel()
      controls.stop()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [dragging, controls, onDragCancel])

  /** Lets the frame float free of its grid slot (absolute, in px from the slot's top-left) at a given box. */
  const floatFrame = (box: Box) => {
    const el = frame.current
    if (!el) return
    el.dataset.floating = ''
    el.style.left = `${box.left}px`
    el.style.top = `${box.top}px`
    el.style.width = `${box.width}px`
    el.style.height = `${box.height}px`
  }
  /** Springs the frame into its slot, then hands it back to the grid. */
  const settleFrame = (done?: () => void) => {
    const el = frame.current
    const cell = ref.current
    if (!el || !cell) return done?.()
    const release = () => {
      delete el.dataset.floating
      el.style.left = ''
      el.style.top = ''
      el.style.width = ''
      el.style.height = ''
      done?.()
    }
    if (reduceMotion) return release()
    settling.current?.stop()
    settling.current = animate(el, { left: 0, top: 0, width: cell.offsetWidth, height: cell.offsetHeight }, SETTLE)
    void settling.current.then(release)
  }

  // A size picked from the menu or with the arrow keys grows or shrinks from where it was, rather than jumping.
  useLayoutEffect(() => {
    const from = morphFrom.current
    morphFrom.current = null
    if (!from || reduceMotion) return
    floatFrame({ left: 0, top: 0, ...from })
    settleFrame()
    // floatFrame / settleFrame only touch the DOM; the size change is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.size])

  const changeSize = (size: CardSize) => {
    if (size === card.size) return
    const cell = ref.current
    if (cell && !grip.current) morphFrom.current = { width: cell.offsetWidth, height: cell.offsetHeight }
    onChange({ size })
    onResized(size)
  }
  const change = (patch: Partial<Omit<BoardCard, 'id'>>) => {
    if (patch.size) changeSize(patch.size)
    const rest = { ...patch }
    delete rest.size
    if (Object.keys(rest).length > 0) onChange(rest)
  }

  const cancelPress = () => {
    if (press.current) window.clearTimeout(press.current.timer)
    press.current = null
  }

  // ── Long press: enter edit mode (outside it). In edit mode, a press anywhere on the card drags it. ──
  const onPointerDown = (event: React.PointerEvent<HTMLLIElement>) => {
    longPressed.current = false
    dragged.current = false
    if (event.button !== 0 || isControl(event.target)) return
    if (editing) {
      controls.start(event)
      return
    }
    if (!onLongPress) return
    cancelPress()
    press.current = {
      x: event.clientX, y: event.clientY,
      timer: window.setTimeout(() => {
        press.current = null
        longPressed.current = true
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.(8)
        onLongPress()
      }, LONG_PRESS_MS),
    }
  }
  const onPointerMove = (event: React.PointerEvent<HTMLLIElement>) => {
    if (press.current && Math.hypot(event.clientX - press.current.x, event.clientY - press.current.y) > LONG_PRESS_SLOP) cancelPress()
  }

  // ── Resize from any side or corner ──
  // The frame follows the pointer pixel for pixel, lifted above the grid, with the opposite side held where it was.
  // Underneath, the card's grid slot snaps to the nearest size as the pointer passes halfway to the next; that slot
  // is drawn (only it, in the grid's snap units) so you can see where the card will land. On release the frame
  // springs into it. The content changes only when the slot does, with a fade.
  const startResize = (event: React.PointerEvent<HTMLElement>) => {
    const edge = event.currentTarget.dataset.edge as Edge | undefined
    if (event.button !== 0 || !edge) return
    event.stopPropagation()
    event.preventDefault()
    const cell = ref.current
    if (!cell) return
    settling.current?.stop()
    const start = (frame.current ?? cell).getBoundingClientRect()
    const at = cell.getBoundingClientRect()
    grip.current = { edge, x: event.clientX, y: event.clientY, start, size: card.size, step: `resize-${card.id}-${event.timeStamp}` }
    onResizeStart()
    floatFrame({ left: start.left - at.left, top: start.top - at.top, width: start.width, height: start.height })
    // A pointer that's no longer active (a stale or synthetic one) can't be captured; the resize still works without it.
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* not capturable */ }
    setActiveEdge(edge)
  }
  const moveResize = (event: React.PointerEvent<HTMLElement>) => {
    const held = grip.current
    const cell = ref.current
    const grid = cell?.parentElement
    if (!held || !cell || !grid) return
    const m = gridMetrics(grid)
    const { edge, start } = held
    const dx = event.clientX - held.x
    const dy = event.clientY - held.y
    const bounds = grid.getBoundingClientRect()
    const pullsLeft = edge.includes('w')
    const pullsTop = edge.includes('n')
    const pullsX = pullsLeft || edge.includes('e')
    const pullsY = pullsTop || edge.includes('s')
    const minWidth = m.colWidth * 3 + m.colGap * 2
    const maxWidth = pullsLeft ? start.right - bounds.left : bounds.right - start.left
    const maxHeight = m.rowHeight * 2 + m.rowGap
    const width = pullsX ? soften(start.width + (pullsLeft ? -dx : dx), minWidth, maxWidth) : start.width
    const height = pullsY ? soften(start.height + (pullsTop ? -dy : dy), m.rowHeight, maxHeight) : start.height
    // Hold the opposite side where it was on screen, even if the card's slot moves while the grid reflows.
    const left = pullsLeft ? start.right - width : start.left
    const top = pullsTop ? start.bottom - height : start.top
    const at = cell.getBoundingClientRect()
    floatFrame({ left: left - at.left, top: top - at.top, width, height })
    const next = snapSize(((width + m.colGap) / (m.colWidth + m.colGap)) * (12 / m.columns), (height + m.rowGap) / (m.rowHeight + m.rowGap))
    if (next !== card.size) onChange({ size: next }, held.step)
    // Pulled from the left or top over the card before it: the card grows where it was pulled, taking that card's place.
    if (pullsLeft || pullsTop) {
      const over = document.elementsFromPoint(pullsLeft ? left + 8 : left + width / 2, pullsTop ? top + 8 : top + height / 2)
        .map(el => (el as HTMLElement).closest<HTMLElement>('[data-card-id]'))
        .find(el => el && el.dataset.cardId !== card.id)
      if (over?.dataset.cardId) onPull(over.dataset.cardId, held.step)
    }
  }
  // Esc while resizing puts the card back to the size and place it had (Dev, 19 Nov).
  useEffect(() => {
    if (!resizing) return
    const onKey = (event: KeyboardEvent) => {
      const held = grip.current
      if (event.key !== 'Escape' || !held) return
      event.preventDefault()
      event.stopPropagation()
      grip.current = null
      onChange({ size: held.size }, held.step)
      onResizeCancel(held.step)
      // Once the grid has its old size back, the frame springs into it.
      requestAnimationFrame(() => settleFrame(() => setActiveEdge(null)))
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
    // The handlers only read refs and props at the moment Esc is pressed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resizing])

  // ── Keys on a card in edit mode (Figma "Keyboard"): Space lifts, Enter opens its settings, Delete removes it. The ×
  // and the arc keep their own keys. ──
  const onKeyDown = (event: React.KeyboardEvent<HTMLLIElement>) => {
    if (!editing || (event.target as HTMLElement).closest('button, [data-handle], input, textarea, select')) return
    const arrows: Record<string, 'left' | 'right' | 'up' | 'down'> = {
      ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
    }
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      if (lifted) onDrop()
      else if (event.key === ' ') onLift()
      else onOpen?.(card.metric)
    } else if (event.key === 'Escape' && lifted) {
      event.preventDefault()
      onCancelLift()
    } else if ((event.key === 'Delete' || event.key === 'Backspace') && !lifted) {
      event.preventDefault()
      onRemove()
    } else if (lifted && arrows[event.key]) {
      event.preventDefault()
      onStep(arrows[event.key])
    }
  }
  const endResize = (event: React.PointerEvent<HTMLElement>) => {
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    } catch { /* already released */ }
    if (!grip.current) return
    grip.current = null
    settleFrame(() => setActiveEdge(null))
  }

  if (!needs) return null
  const units = span.cols / 3
  return (
    <motion.li
      ref={ref}
      className={styles.cell}
      data-card-id={card.id}
      data-size={card.size}
      data-dragging={dragging || undefined}
      data-lifted={lifted || undefined}
      data-editing={editing || undefined}
      data-resizing={resizing || undefined}
      data-new={isNew || fresh || undefined}
      style={{ '--cols': span.cols, '--rows': span.rows } as CSSProperties}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={cancelPress}
      onPointerCancel={cancelPress}
      onPointerLeave={cancelPress}
      onContextMenu={event => { if (editing) event.preventDefault() }}
      layout={reduceMotion ? false : 'position'}
      transition={{ layout: { type: 'spring', stiffness: 520, damping: 44, mass: 0.9 } }}
      drag
      dragControls={controls}
      dragListener={false}
      dragSnapToOrigin
      dragMomentum={false}
      dragElastic={0}
      whileDrag={{ scale: 1.015 }}
      onDragStart={() => { dragged.current = true; onDragStart() }}
      onDrag={(_event: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
        onDragOver({ x: info.point.x - window.scrollX, y: info.point.y - window.scrollY })
      }}
      onDragEnd={onDragEnd}
    >
      {/* Where the card will land, shown only while it's being resized: the snapped slot in the grid's snap units. */}
      {resizing && (
        <div className={styles.landing} aria-hidden style={{ '--units': units, '--unit-rows': span.rows } as CSSProperties}>
          {Array.from({ length: units * span.rows }, (_, i) => <span key={i} className={styles.landingUnit} />)}
        </div>
      )}

      {/* The frame: in its grid slot normally; floating at its own box while it resizes or settles. */}
      <div ref={frame} className={styles.stretch}>
        <BoardCardView
          card={card}
          entry={entry}
          catalogReady={catalogReady}
          needs={needs}
          requests={requests}
          onChange={change}
          onRemove={onRemove}
          // In edit mode the whole card is the handle (onPointerDown above), so the title bar doesn't start it twice.
          onHandlePointerDown={event => { if (!editing) controls.start(event) }}
          editing={editing}
          sources={sources}
          held={held}
          waiting={waiting}
          isNew={isNew}
          categories={categories}
          healthKit={healthKit}
          onHealth={onHealth}
          onOpen={onOpen && (metric => {
            if (longPressed.current) { longPressed.current = false; return }
            if (dragged.current) { dragged.current = false; return }
            onOpen(metric)
          })}
        />
        {editing && (
          <>
            {/* × at the top right, where the app marks sit while reading (Dev, 19 Nov: option A). */}
            <Tooltip content="Remove" side="top">
              <button type="button" className={styles.remove} aria-label={`Remove ${label}`} onClick={onRemove} data-export-hide>
                <X size={14} strokeWidth={1.5} absoluteStrokeWidth aria-hidden />
              </button>
            </Tooltip>
            {/* Every side and corner stretches, but only the bottom-right arc is drawn: the others are invisible zones
                on the border that change the cursor, so the card stays clean. */}
            {EDGE_HANDLES.map(edge => (
              <span key={edge} className={styles.zone} data-edge={edge} data-handle data-export-hide aria-hidden
                onPointerDown={startResize} onPointerMove={moveResize} onPointerUp={endResize}
                onPointerCancel={endResize} onLostPointerCapture={endResize} />
            ))}
            <button
              type="button"
              className={styles.handle}
              data-edge="se"
              data-handle
              data-export-hide
              data-active={activeEdge === 'se' || undefined}
              aria-label={`Resize ${label}, now ${SIZE_LABEL[card.size]}. Drag any side or this corner, or use the arrow keys: left and right for width, up and down for height.`}
              onPointerDown={startResize}
              onPointerMove={moveResize}
              onPointerUp={endResize}
              onPointerCancel={endResize}
              onLostPointerCapture={endResize}
              onFocus={() => onArcFocus(true)}
              onBlur={() => onArcFocus(false)}
              onKeyDown={event => {
                const step = { ArrowLeft: ['cols', -1], ArrowRight: ['cols', 1], ArrowUp: ['rows', -1], ArrowDown: ['rows', 1] } as const
                const move = step[event.key as keyof typeof step]
                if (!move) return
                event.preventDefault()
                changeSize(stepSize(card.size, move[0], move[1]))
              }}
            >
              <CornerArc />
            </button>
          </>
        )}
      </div>

      {resizing && (
        <div className={styles.landingEdge} aria-hidden>
          <span className={styles.landingLabel}>{SIZE_LABEL[card.size]}</span>
        </div>
      )}
    </motion.li>
  )
}
