'use client'

import { createPortal } from 'react-dom'
import type { Metric } from '../types'
import { MetricCard, type CardView } from '../MetricCard'
import { DROP_MS } from './grid-geometry'
import type { DragView } from './use-card-move'
import type { ResizeView } from './use-card-resize'

// What floats over the page while a card is moved or resized: a cover that holds the cursor, and
// the card's copy (moved) or frame (resized), which settles into its slot on release.

/** The resized card's frame follows the pointer, then settles into its slot (Figma 2.7). */
export function ResizeFrame({ resizing, metric, view }: { resizing: ResizeView; metric: Metric; view?: CardView }) {
  return createPortal(
    <>
      <div aria-hidden className="fixed inset-0 z-[var(--z-overlay)] cursor-nwse-resize" />
      <div
        aria-hidden
        data-resize-frame={resizing.size}
        className="pointer-events-none fixed z-[var(--z-popover)]"
        style={{
          ...(resizing.settleAt ?? resizing),
          transition: resizing.settleAt ? `left ${DROP_MS}ms ease-out, top ${DROP_MS}ms ease-out, width ${DROP_MS}ms ease-out, height ${DROP_MS}ms ease-out` /* ds-keep: matches the drop timer */ : undefined,
        }}
      >
        <MetricCard
          metric={metric}
          size={resizing.size}
          view={view}
          dragging
          className="shadow-[var(--dashboard-resize-shadow)] outline outline-1 outline-[var(--dashboard-figure)]"
        />
      </div>
    </>,
    document.body,
  )
}

/** The lifted copy follows the pointer (BS-24), then settles into the slot. */
export function DragGhost({ drag, metric, view, ghostRef }: { drag: DragView; metric: Metric; view?: CardView; ghostRef: React.Ref<HTMLDivElement> }) {
  return createPortal(
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
          transition: drag.settleAt ? `left ${DROP_MS}ms ease-out, top ${DROP_MS}ms ease-out, transform ${DROP_MS}ms ease-out` /* ds-keep: matches the drop timer */ : 'transform var(--duration-fast) ease-out',
        }}
      >
        <MetricCard metric={metric} size={drag.size} view={view} dragging />
      </div>
    </>,
    document.body,
  )
}
