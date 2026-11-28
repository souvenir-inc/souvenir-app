'use client'

import { useEffect, useRef, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MAX_NAME } from './board-state'
import { SEGMENT } from './tab-styles'
import type { RenameResult } from './use-dashboard'

// The tab's rename field (TAB-20 – TAB-24): it replaces the tab segment and sizes to the name.

interface RenameFieldProps {
  initial: string
  onCommit: (raw: string) => RenameResult
  onDone: () => void
  /** Each keystroke, so the row can make room for the whole name (TAB-22). */
  onValueChange?: (text: string) => void
}

export function RenameField({ initial, onCommit, onDone, onValueChange }: RenameFieldProps) {
  const [value, setValue] = useState(initial)
  const [error, setError] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const done = useRef(false)

  useEffect(() => {
    const el = inputRef.current
    el?.focus()
    el?.select() // the whole name selected, so typing replaces it (TAB-20)
  }, [])

  const finish = () => { if (!done.current) { done.current = true; onDone() } }
  const commit = (fromBlur: boolean) => {
    if (done.current) return
    const res = onCommit(value)
    if (res.ok) return finish()
    // Empty: Enter keeps the field open with the error; clicking away puts the old name back (TAB-24).
    if (fromBlur) finish()
    else setError(true)
  }

  return (
    <div className="relative">
      <div
        className={cn(
          SEGMENT, 'inline-grid max-w-full grid-cols-[minmax(0,max-content)] border border-solid bg-[var(--dashboard-tab-lifted)] px-[var(--dashboard-tab-lifted-padding-x)]',
          error ? 'border-[var(--dashboard-error)]' : 'border-[var(--border-default)]',
        )}
      >
        {/* The invisible copy sizes the field to the whole name (TAB-22). */}
        <span aria-hidden className="invisible col-start-1 row-start-1 whitespace-pre pr-0.5">{value || 'Board name'}</span>
        {/* eslint-disable-next-line no-restricted-syntax -- ds-allow: the field IS the tab segment: it shares one grid cell with the hidden copy that sizes it to the typed name (TAB-22). ui/Input renders its own bordered box, label and min width, so it can't shrink-wrap inside the capsule */}
        <input
          ref={inputRef}
          value={value}
          // size=1 drops the input's default ~20-character width, so the copy above sizes the field.
          size={1}
          maxLength={MAX_NAME}
          placeholder="Board name"
          aria-label="Board name"
          aria-invalid={error || undefined}
          aria-describedby={error ? 'board-name-error' : undefined}
          onChange={(e) => { setValue(e.target.value); onValueChange?.(e.target.value); if (error && e.target.value.trim()) setError(false) }}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') { e.preventDefault(); commit(false) }
            else if (e.key === 'Escape') { e.preventDefault(); finish() }
          }}
          onBlur={() => commit(true)}
          className="col-start-1 row-start-1 w-full min-w-0 border-0 bg-transparent p-0 text-[length:var(--font-size-body)] font-medium leading-5 tracking-[var(--dashboard-tab-tracking)] text-[var(--dashboard-figure)] outline-none placeholder:text-[var(--dashboard-faint)]"
        />
      </div>
      {error && <NameError id="board-name-error" className="absolute left-0 top-[calc(100%+6px)] z-20" />}
    </div>
  )
}

/** "Add a board name" (TAB-24, MT-6). */
export function NameError({ id, className }: { id?: string; className?: string }) {
  return (
    <p
      id={id}
      role="alert"
      className={cn(
        'm-0 flex items-center gap-1.5 whitespace-nowrap rounded-md border border-solid border-[var(--dashboard-error-border)] bg-[var(--dashboard-error-bg)] py-1 pl-2 pr-2.5',
        'text-[length:var(--font-size-small)] font-medium leading-4 text-[var(--dashboard-error)] shadow-[var(--shadow-soft)]',
        className,
      )}
    >
      <TriangleAlert aria-hidden size={14} strokeWidth={1.5} absoluteStrokeWidth />
      Add a board name
    </p>
  )
}
