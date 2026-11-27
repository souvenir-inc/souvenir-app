'use client'

import { useRef, useState } from 'react'
import { m, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { DashboardSquareOneIcon } from '@strange-huge/icons'
import { EmptyState } from '@/components/ui'
import { LandingSlot, RemoveBadge, ResizeArc } from './EditChrome'
import { MetricCard, type CardView } from './MetricCard'
import { useDashboardData } from './live/dashboard-data'
import type { BoardCard, CardSize } from './types'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { cellStyle, SPAN } from './board/grid-geometry'
import { DragGhost, ResizeFrame } from './board/GridOverlays'
import { RemovedCard } from './board/RemovedCard'
import { useCardMove } from './board/use-card-move'
import { useCardResize } from './board/use-card-resize'
import { useLandingRing } from './board/use-landing-ring'
import { SPRING } from "@/styles/tokens/motion"

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
//
// The moves, resizes, landing ring and floating copies live in ./board/.

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

export function BoardGrid({ cards, onMoveTo, onSetLayout, onStep, onResize, onRemove, editing = false, cardView, onOpenCard, onRetryCard, onRemoveEmpty, landed, empty, onOpenSettings }: BoardGridProps) {
  const { metrics } = useDashboardData()
  const reduceMotion = useReducedMotion()
  const gridRef = useRef<HTMLUListElement>(null)
  // New cards: ringed and scrolled into view, then the ring fades (AC-17).
  const ring = useLandingRing(landed, gridRef, reduceMotion)
  // What the polite live region says about the last move or resize.
  const [announce, setAnnounce] = useState('')
  const { drag, ghostRef, startMove } = useCardMove({ cards, editing, metrics, gridRef, reduceMotion, onMoveTo, onSetLayout, onOpenSettings, announce: setAnnounce })
  const { resizing, gripFor } = useCardResize({ metrics, gridRef, reduceMotion, onResize, announce: setAnnounce })

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
          // A metric the warehouse no longer has keeps its place and says so (CR-22).
          if (!metric) {
            const canEdit = cardView?.(card.metricId)?.canEdit ?? editing
            return <RemovedCard key={card.metricId} card={card} canEdit={canEdit} onRemove={() => (editing ? onRemove(card.metricId) : onRemoveEmpty?.(card.metricId))} />
          }
          const isSlot = drag?.id === card.metricId
          const view = cardView?.(card.metricId)
          return (
            <m.li
              key={card.metricId}
              data-card-id={card.metricId}
              // On the 4-column design grid each card sits at its own cell (BS-29); narrower, the
              // cards flow in reading order with the spans below.
              style={cellStyle(card)}
              // "position": cards slide to their new places; sizes snap, so nothing stretches.
              layout={reduceMotion ? false : 'position'}
              transition={{ layout: { type: 'spring', ...SPRING.settle } }}
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
                <div aria-hidden className="size-full rounded-xl border-[length:var(--border-width-thick)] border-dashed border-[var(--dashboard-drop-line)] bg-[var(--dashboard-drop-slot)]" />
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
                    'pointer-events-none absolute inset-0 rounded-xl border-[length:var(--border-width-medium)] border-solid border-[var(--dashboard-landed-ring)] shadow-[0_0_0_4px_var(--dashboard-landed-halo)]',
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

      {resizing && resized && <ResizeFrame resizing={resizing} metric={resized} view={cardView?.(resizing.id)} />}
      {drag && dragged && <DragGhost drag={drag} metric={dragged} view={cardView?.(drag.id)} ghostRef={ghostRef} />}
    </div>
  )
}
