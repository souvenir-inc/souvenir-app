'use client'

import { cn } from '@/lib/utils'
import { SIZE_LABEL, SIZE_LEVEL, SIZE_NAME, type GripProps } from './MetricCard'
import type { CardSize } from './types'

// Edit mode's marks on a card (Figma 2.5 `19:4778`, 2.7 `19:5600`): the remove badge on the top-left
// corner, the resize arc on the bottom-right corner, and the landing slot a resized card will snap into.

const FOCUS = 'outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]'

/**
 * "Edit / remove badge" (19:5119): a 22 px round badge, 7 px outside the card's top-left corner, a
 * hairline ring and a soft shadow, an 8 px minus.
 */
export function RemoveBadge({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    // eslint-disable-next-line no-restricted-syntax -- ds-allow: the card's remove badge (Figma 19:5119)
    <button
      type="button"
      aria-label={`Remove ${label}`}
      data-no-drag // never starts a card drag
      data-remove-badge
      onClick={onRemove}
      className={cn(
        'absolute -left-[7px] -top-[7px] z-10 flex size-[22px] cursor-pointer items-center justify-center rounded-full p-0',
        'border border-solid border-[var(--dashboard-list-border)] bg-[var(--dashboard-badge-bg)] text-[var(--dashboard-figure)] shadow-[var(--dashboard-badge-shadow)]',
        'transition-transform duration-fast ease-standard hover:scale-110 active:scale-95',
        FOCUS,
      )}
    >
      <svg aria-hidden width="10" height="2" viewBox="0 0 10 2" fill="none">
        <path d="M0.9 1h8.17" stroke="currentColor" strokeWidth="1.46" strokeLinecap="round" />
      </svg>
    </button>
  )
}

/**
 * "Edit / resize arc" (19:5122): a 3 px quarter arc with round ends hugging the card's bottom-right
 * corner, ink at 35 %. Its 34 px box reaches 4 px past the corner and is the hit area. Drawn for this
 * board's 12 px card corner (the reference draws 16 px): legs of 7 px, a 10.5 px curve, the stroke's
 * outer edge on the card's edge. Drag it, or use the arrow keys (BS-19). Hidden on the narrow layout.
 */
export function ResizeArc({ label, size, grip, active }: { label: string; size: CardSize; grip: GripProps; active: boolean }) {
  return (
    <span
      role="slider"
      data-no-drag // the arc resizes; it never starts a move
      data-resize-arc
      tabIndex={0}
      aria-label={`Resize ${label}`}
      aria-valuetext={SIZE_LABEL[size]}
      aria-valuemin={1}
      aria-valuemax={6}
      aria-valuenow={SIZE_LEVEL[size]}
      onPointerDown={grip.onPointerDown}
      onKeyDown={grip.onKeyDown}
      className={cn(
        'group/arc absolute -bottom-1 -right-1 z-10 hidden size-[34px] cursor-nwse-resize touch-none rounded-br-2xl @min-[60rem]:block',
        FOCUS,
      )}
    >
      <svg
        aria-hidden
        width="34" height="34" viewBox="0 0 34 34" fill="none"
        className={cn(
          'text-[var(--dashboard-figure)] transition-opacity duration-fast ease-standard',
          active ? 'opacity-80' : 'opacity-35 group-hover/arc:opacity-60 group-focus-visible/arc:opacity-60',
        )}
      >
        {/* The reference path is M17.5 0 V2 C… 2 17.5 H0 in a box at (10, 10); here with a 10.5 px curve. */}
        <path d="M27.5 10 V17 A10.5 10.5 0 0 1 17 27.5 H10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </span>
  )
}

/**
 * "landing slot · Medium" (19:6006): where a resized card will land, at its snapped size: a dashed
 * 1 px line (6 · 5), a faint ink fill, and the size's name on a dark pill 26 px above its top-left.
 */
export function LandingSlot({ size }: { size: CardSize }) {
  return (
    <div aria-hidden data-landing-slot={size} className="relative size-full rounded-xl bg-[var(--dashboard-slot-fill)]">
      {/* Inset half a pixel so the 1 px line sits just inside the slot's edge. */}
      <svg className="pointer-events-none absolute inset-[0.5px] h-[calc(100%-1px)] w-[calc(100%-1px)] overflow-visible" fill="none">
        <rect x="0" y="0" width="100%" height="100%" rx="11.5" stroke="var(--dashboard-slot-line)" strokeDasharray="6 5" />
      </svg>
      <span className="absolute -top-[26px] left-3 flex h-[22px] items-center whitespace-nowrap rounded-full bg-[var(--dashboard-figure)] px-2 text-[length:var(--font-size-small)] font-medium leading-[var(--line-height-compact)] text-[var(--dashboard-toast-action-text)]">
        {SIZE_NAME[size]}
      </span>
    </div>
  )
}
