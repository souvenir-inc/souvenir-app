'use client'

import { useState } from 'react'
import { GripVertical } from 'lucide-react'
import { IconButton } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { FOCUS } from './manage-tabs-parts'

// Manage tabs → Your tabs: rows that drag by the handle (MT-4), or move with ⌥↑ / ⌥↓ on a row or
// its handle. Each move is announced in a polite live region (A11Y-AN-03, A11Y-KB-05).

export interface RowProps {
  tabIndex: number
  'data-row-focus': boolean
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void
}

interface RowListProps {
  ids: string[]
  visibleCount: number
  onMove: (id: string, to: number) => void
  labelOf: (id: string) => string
  renderRow: (id: string, handle: React.ReactNode, rowProps: RowProps) => React.ReactNode
}

export function RowList({ ids, visibleCount, onMove, labelOf, renderRow }: RowListProps) {
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; line: number | null } | null>(null)
  // What the live region says after a move. The region is always rendered, so it's read when filled.
  const [announce, setAnnounce] = useState('')
  const movedTo = (id: string, to: number) => `${labelOf(id)} moved to position ${to + 1} of ${ids.length}`

  const start = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return
    e.preventDefault()
    const list = (e.currentTarget as HTMLElement).closest<HTMLElement>('[data-row-list]')
    const from = ids.indexOf(id)
    let to: number | null = null
    const move = (ev: PointerEvent) => {
      const rows = [...(list?.querySelectorAll<HTMLElement>('[data-row]') ?? [])]
      let g = rows.findIndex((r) => { const b = r.getBoundingClientRect(); return ev.clientY < b.top + b.height / 2 })
      if (g < 0) g = rows.length
      const t = g > from ? g - 1 : g
      to = t === from ? null : t // no line when nothing would change
      setDrag({ id, x: ev.clientX, y: ev.clientY, line: to == null ? null : g })
    }
    const end = (commit: boolean) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', key, true)
      if (commit && to != null) { onMove(id, to); setAnnounce(movedTo(id, to)) }
      setDrag(null)
    }
    const up = () => end(true)
    const cancel = () => end(false)
    const key = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); end(false) } }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', key, true)
  }

  // ⌥↑ / ⌥↓ on a focused row (or its handle) move it one place. Moving a focused element in the
  // page drops its focus, so it's put back on the same row (or handle) after the move.
  const keyMove = (e: React.KeyboardEvent, id: string, part: 'row' | 'handle') => {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
    const i = ids.indexOf(id)
    const to = i + (e.key === 'ArrowUp' ? -1 : 1)
    if (to < 0 || to >= ids.length) return
    e.preventDefault()
    const list = (e.currentTarget as HTMLElement).closest<HTMLElement>('[data-row-list]')
    onMove(id, to)
    setAnnounce(movedTo(id, to))
    requestAnimationFrame(() => {
      const row = list?.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(id)}"]`)
      const target = part === 'handle' ? row?.querySelector<HTMLElement>('[data-handle]') : row?.querySelector<HTMLElement>('[data-row-focus]')
      if (!target) return
      // Focus set by script doesn't count as keyboard focus, so mark it to keep the ring (MT-3).
      target.dataset.keyboard = 'true'
      target.addEventListener('blur', () => { delete target.dataset.keyboard }, { once: true })
      target.focus()
    })
  }

  return (
    <div data-row-list className="relative">
      {ids.map((id, i) => (
        <div key={id} data-row data-row-id={id} className={cn('relative', drag?.id === id && 'opacity-40')}>
          {drag?.line === i && <RowDropLine />}
          {/* A plain line after the last board that fits in the tab row (MT-3). */}
          {i === visibleCount && visibleCount < ids.length && (
            <div aria-hidden className="px-2 py-1"><div className="h-px bg-[var(--neutral-200)]" /></div>
          )}
          {renderRow(
            id,
            // The 16 px drag handle (MT-4): no fill, no press scale, the grab cursor.
            <IconButton
              variant="ghost"
              size="xs"
              iconSize={16}
              aria-label={`Move ${labelOf(id)}. Drag, or Alt + up or down arrow.`}
              data-handle
              onPointerDown={(e) => start(e, id)}
              onKeyDown={(e) => keyMove(e, id, 'handle')}
              icon={<GripVertical aria-hidden strokeWidth={1.5} absoluteStrokeWidth />}
              className={cn(
                'size-4 shrink-0 cursor-grab rounded-sm text-[var(--neutral-400)] [--hv:transparent] hover:text-[var(--neutral-700)] active:scale-100 active:cursor-grabbing focus-visible:outline-offset-0',
                FOCUS,
              )}
            />,
            { tabIndex: 0, 'data-row-focus': true, onKeyDown: (e) => { if (e.target === e.currentTarget) keyMove(e, id, 'row') } },
          )}
        </div>
      ))}
      {drag?.line === ids.length && <div className="relative"><RowDropLine /></div>}
      <p className="sr-only" aria-live="polite">{announce}</p>
      {/* The chip that follows the pointer (MT-4): white, hairline border, soft shadow, handle + name. */}
      {drag && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-[var(--z-tooltip)] flex h-8 items-center gap-2.5 rounded-md border border-solid border-[var(--neutral-200)] bg-[var(--dashboard-card-bg)] pl-2 pr-3 text-[length:var(--font-size-body)] font-medium leading-5 text-[var(--neutral-700)] shadow-[var(--dashboard-tab-lifted-shadow)]"
          style={{ left: drag.x - 12, top: drag.y - 16 }}
        >
          <GripVertical size={16} strokeWidth={1.5} absoluteStrokeWidth className="text-[var(--neutral-400)]" />
          {labelOf(drag.id)}
        </div>
      )}
    </div>
  )
}

/** Where a dragged row will land: a 2 px blue line with a dot, 8 px in from each side (MT-4). */
function RowDropLine() {
  return (
    <span aria-hidden className="pointer-events-none absolute -top-px left-2 right-2 z-10 h-0.5 rounded-hairline bg-[var(--dashboard-drop-line)]">
      <span className="absolute -left-1 -top-[3px] size-2 rounded-full bg-[var(--dashboard-drop-line)]" />
    </span>
  )
}
