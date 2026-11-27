'use client'

import { useEffect, useRef, useState } from 'react'
import { Info, TriangleAlert, Users } from 'lucide-react'
import { Tooltip } from '@/components/Tooltip'
import { cn } from '@/lib/utils'
import { MAX_NAME, type Board } from './board-state'

// The small pieces of Manage tabs (03-manage-tabs-rules.md): row looks, names, the Shared tag,
// rename in place and the fading scroll area.

export const FOCUS = cn(
  'outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-[var(--focus-ring)]',
  'data-[keyboard=true]:focus:outline-2 data-[keyboard=true]:focus:outline-solid data-[keyboard=true]:focus:outline-[var(--focus-ring)]',
)
/** The row tint runs 8 px past both edges (MT-3); the list leaves that room on each side. */
export const ROW = cn(
  'group/row relative isolate flex h-8 items-center gap-2 rounded-md',
  'before:absolute before:inset-y-0 before:-inset-x-2 before:-z-10 before:rounded-lg before:content-[""] before:transition-colors before:duration-fast',
  'hover:before:bg-[var(--dashboard-row-hover)] data-[open=true]:before:bg-[var(--dashboard-row-hover)]',
  FOCUS,
)

/** An info icon and one line on what the tab holds (Hidden, Recently deleted). */
export function Helper({ children }: { children: React.ReactNode }) {
  return (
    <p className="m-0 flex items-center gap-1.5 pl-[var(--space-1-75)] pr-2 text-[length:var(--font-size-body-sm)] leading-[var(--line-height-compact)] text-[var(--dashboard-muted)]">
      <Info aria-hidden size={14} strokeWidth={1.5} absoluteStrokeWidth className="shrink-0" />
      {children}
    </p>
  )
}

export function RowName({ board, label, muted, onDoubleClick }: { board: Board; label: string; muted?: boolean; onDoubleClick?: () => void }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2" onDoubleClick={onDoubleClick}>
      <span className={cn('min-w-0 truncate text-[length:var(--font-size-body)] font-medium leading-5', muted ? 'text-[var(--dashboard-faint)]' : 'text-[var(--neutral-700)]')}>{label}</span>
      {board.sharedBy && <SharedTag by={board.sharedBy.name} muted={muted} />}
    </span>
  )
}

/**
 * "Shared" (Tag / Shared, MT-12): 20 px pill, no border, a see-through fill (the text colour at
 * 7 %, 4 % muted) so it stays a step darker than a hovered row; people icon and text 12 px. Hover
 * names the owner. Long names cut off before it, so it always shows.
 * Not a tab stop: it does nothing when pressed. Screen readers hear "Shared by <name>" from its
 * text, and keyboard users find the owner at the foot of the row's ⋯ menu.
 */
export function SharedTag({ by, muted }: { by: string; muted?: boolean }) {
  return (
    <Tooltip content={`Shared by ${by}`} side="top">
      <span
        className={cn(
          'inline-flex h-5 shrink-0 items-center gap-1 rounded-full pl-1.5 pr-2 text-[length:var(--font-size-small)] font-medium leading-4',
          muted ? 'bg-[var(--dashboard-tag-bg-muted)] text-[var(--dashboard-faint)]' : 'bg-[var(--dashboard-tag-bg)] text-[var(--dashboard-label)]',
        )}
      >
        <Users aria-hidden size={12} strokeWidth={1.5} absoluteStrokeWidth />
        Shared<span className="sr-only"> by {by}</span>
      </span>
    </Tooltip>
  )
}

/**
 * Rename in place (MT-6): white field, 1 px border, the name selected. Enter or clicking away keeps
 * it; Esc cancels. Empty: red border and "Add a board name" inside the field, at its right.
 */
export function InlineRename({ initial, onCommit, onDone }: { initial: string; onCommit: (raw: string) => boolean; onDone: () => void }) {
  const [value, setValue] = useState(initial)
  const [error, setError] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  const done = useRef(false)
  useEffect(() => { ref.current?.focus(); ref.current?.select() }, [])
  const finish = () => { if (!done.current) { done.current = true; onDone() } }
  const commit = (fromBlur: boolean) => {
    if (done.current) return
    if (onCommit(value)) return finish()
    if (fromBlur) finish() // clicking away with nothing typed puts the old name back
    else setError(true)
  }
  return (
    <span
      data-rename-field
      className={cn(
        'flex h-[26px] min-w-0 flex-1 items-center gap-0.5 rounded-md border border-solid bg-[var(--dashboard-card-bg)] pl-[var(--space-1-75)] pr-2',
        error ? 'border-[var(--dashboard-error)]' : 'border-[var(--border-default)]',
      )}
    >
      {/* eslint-disable-next-line no-restricted-syntax -- ds-allow: the bare text control inside the row's own 26 px bordered box, which also holds the inline "Add a board name" error (MT-6); ui/Input (InputField) draws its own box, label and message below, which can't sit inside a 32 px row */}
      <input
        ref={ref}
        value={value}
        maxLength={MAX_NAME}
        placeholder="Board name"
        aria-label="Board name"
        aria-invalid={error || undefined}
        aria-describedby={error ? 'manage-name-error' : undefined}
        onChange={(e) => { setValue(e.target.value); if (error && e.target.value.trim()) setError(false) }}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') { e.preventDefault(); commit(false) }
          else if (e.key === 'Escape') {
            // Esc cancels the rename only (the dialog stands aside: its onEscapeKeyDown).
            e.preventDefault()
            finish()
          }
        }}
        onBlur={() => commit(true)}
        className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-[length:var(--font-size-body)] font-medium leading-5 text-[var(--dashboard-figure)] outline-none placeholder:text-[var(--dashboard-faint)]"
      />
      {error && (
        <span id="manage-name-error" role="alert" className="flex shrink-0 items-center gap-1 text-[length:var(--font-size-small)] font-medium leading-4 text-[var(--dashboard-error)]">
          <TriangleAlert aria-hidden size={14} strokeWidth={1.5} absoluteStrokeWidth />
          Add a board name
        </span>
      )}
    </span>
  )
}

/** Scrolls between the pinned header and footer, with fades when there's more (MT-1). */
export function FadingScroll({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ top: false, bottom: false })
  const read = () => {
    const el = ref.current
    if (!el) return
    setEdges({ top: el.scrollTop > 0, bottom: el.scrollTop + el.clientHeight < el.scrollHeight - 1 })
  }
  useEffect(() => {
    read()
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(read)
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    return () => ro.disconnect()
  }, [])
  return (
    <div className={cn('relative', className)}>
      {/* No reserved gutter: it would push ⋯ off the line it shares with × and Save (MT-3). */}
      <div ref={ref} onScroll={read} className="kaya-scrollbar size-full overflow-y-auto" style={{ scrollbarGutter: 'auto' }}>
        {children}
      </div>
      <div aria-hidden className={cn('pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-[var(--neutral-50)] to-transparent transition-opacity', edges.top ? 'opacity-100' : 'opacity-0')} />
      <div aria-hidden className={cn('pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-[var(--neutral-50)] to-transparent transition-opacity', edges.bottom ? 'opacity-100' : 'opacity-0')} />
    </div>
  )
}
