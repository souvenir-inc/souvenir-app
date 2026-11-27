'use client'

import { useState } from 'react'
import { dims, sizeFromGrip } from '../grid-layout'
import type { Metrics } from '../live/metrics'
import { SIZE_LABEL, type GripProps } from '../MetricCard'
import type { BoardCard, CardSize } from '../types'
import { clamp, columnsOf, DROP_MS, GAP, ROW, sizeForKey } from './grid-geometry'

// Resizing a card by its grip (BS-19, Figma 2.7): drag sideways past half a column makes a card
// wider (a card at the right edge grows leftwards), down past half a row taller; it snaps to 1×1,
// 2×1 or 2×2. The card's frame follows the pointer freely while its place on the board shows the
// landing slot at the snapped size; on release the frame glides into the slot. Arrows on the grip.

/** A resize in progress: the free frame (viewport px), the snapped size, and where it settles. */
export interface ResizeView {
  id: string
  size: CardSize
  left: number
  top: number
  width: number
  height: number
  settleAt?: { left: number; top: number; width: number; height: number }
}

interface CardResizeOptions {
  metrics: Metrics
  gridRef: React.RefObject<HTMLUListElement | null>
  reduceMotion: boolean | null
  onResize: (metricId: string, size: CardSize) => void
  announce: (text: string) => void
}

export function useCardResize({ metrics, gridRef, reduceMotion, onResize, announce }: CardResizeOptions) {
  const [resizing, setResizing] = useState<ResizeView | null>(null)
  const sizeSaid = (id: string, size: CardSize) => `${metrics.get(id)?.label ?? 'Card'} is ${SIZE_LABEL[size]}`

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
      const columns = columnsOf(grid)
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
        announce(sizeSaid(id, current))
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
      if (next) { onResize(card.metricId, next); announce(sizeSaid(card.metricId, next)) }
    },
  })

  return { resizing, gripFor }
}
