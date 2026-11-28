'use client'

import { useId, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { IconButton } from '@/components/ui/button'
import type { MetricEntry } from '@/lib/api/warehouse'
import { categoryName, OPERATOR_SYMBOLS } from '@/lib/metrics/display'
import { MAX_FORMULA_LENGTH } from '@/lib/metrics/formula'
import { absorbTyping, exactWord, resolveWord, suggestMetrics, type Piece } from '@/lib/metrics/tokens'
import type { Operator } from '@/lib/metrics/tree'
import { cn } from '@/lib/utils'

const OP_NAMES: ReadonlyMap<string, Operator> = new Map([['+', 'add'], ['-', 'subtract'], ['*', 'multiply'], ['/', 'ratio']])

export interface FormulaFieldProps {
  pieces: Piece[]
  onChange: (pieces: Piece[]) => void
  entries: readonly MetricEntry[]
  /** The metric being defined: not offered, since it can't use itself. */
  self?: string
  /** The piece the current error points at, to ring it. */
  errorAt: number | null
  invalid: boolean
  labelledBy: string
  describedBy?: string
  autoFocus?: boolean
  /** The word being typed, when it already names a metric exactly or is a number, so the preview needn't wait for Enter. */
  onPending: (piece: Piece | null) => void
}

/**
 * The formula box: metrics are pills with their labels, operators and numbers sit between them. Type a few
 * letters to get metrics by label or name (a combobox: ↑ ↓ to move, Enter or Tab to take one); + − × ÷ and
 * brackets type as themselves; Backspace on an empty word removes the last piece; Escape clears the word.
 */
export function FormulaField({ pieces, onChange, entries, self, errorAt, invalid, labelledBy, describedBy, autoFocus, onPending }: FormulaFieldProps) {
  const input = useRef<HTMLInputElement>(null)
  const listId = useId()
  const [draft, setDraft] = useState('')
  const [active, setActive] = useState(0)
  const [focused, setFocused] = useState(false)
  const byName = new Map(entries.map(entry => [entry.name, entry]))
  const suggestions = /^[\d.]/.test(draft) ? [] : suggestMetrics(draft, entries, 8, self)
  const open = focused && suggestions.length > 0

  const setWord = (word: string) => {
    setDraft(word)
    setActive(0)
    onPending(word.trim() === '' ? null : exactWord(word, entries, self))
  }

  /** Ends the word being typed: it becomes a pill (or a number), as the box's text would read it. */
  const commit = () => {
    const word = resolveWord(draft, entries, self)
    if (word) onChange([...pieces, word])
    setWord('')
  }

  const take = (name: string) => {
    onChange([...pieces, { kind: 'metric', name }])
    setWord('')
    input.current?.focus()
  }

  const remove = (index: number) => {
    onChange(pieces.filter((_, i) => i !== index))
    input.current?.focus()
  }

  return (
    <div className="relative">
      <div
        className={cn(
          'flex min-h-10 flex-wrap items-center gap-1 rounded-lg bg-[var(--text-field-bg)] px-2 py-1.5',
          'shadow-[0px_1px_1.5px_0px_var(--neutral-700-12),0px_0px_0px_1px_var(--text-field-ring)]',
          focused && 'outline-2 outline-offset-2 outline-solid outline-[var(--focus-ring)]',
          invalid && 'shadow-[0px_1px_1.5px_0px_var(--neutral-700-12),0px_0px_0px_1px_var(--red-500)]',
        )}
        onMouseDown={event => { if (event.target === event.currentTarget) { event.preventDefault(); input.current?.focus() } }}
      >
        {pieces.map((piece, index) => {
          const wrong = errorAt === index
          if (piece.kind === 'metric') {
            const label = byName.get(piece.name)?.label ?? piece.name
            return (
              <span
                // Pieces have no id of their own; a piece's place is its identity while the formula is edited.
                key={index}
                className={cn(
                  'inline-flex items-center gap-0.5 rounded-md bg-[var(--neutral-100)] py-0.5 pl-2 pr-0.5 text-body-sm text-[var(--neutral-900)]',
                  (wrong || !byName.has(piece.name)) && 'bg-[var(--color-tag-Red-bg)] text-[var(--color-tag-Red-text)]',
                )}
              >
                {label}
                <IconButton variant="ghost" size="xs" tabIndex={-1} aria-label={`Remove ${label}`} icon={<X size={12} aria-hidden />} onMouseDown={event => event.preventDefault()} onClick={() => remove(index)} />
              </span>
            )
          }
          const text = piece.kind === 'op' ? OPERATOR_SYMBOLS.get(OP_NAMES.get(piece.op) ?? 'add') : piece.kind === 'paren' ? piece.paren : piece.text
          return <span key={index} className={cn('px-0.5 text-body text-[var(--neutral-700)]', wrong && 'text-[var(--red-600)] underline')}>{text}</span>
        })}
        {/* eslint-disable-next-line no-restricted-syntax -- ds-allow: the caret between formula pills; no primitive renders a bare inline combobox input */}
        <input
          ref={input}
          className="min-w-12 flex-1 border-0 bg-transparent p-0 text-body text-[var(--text-field-text)] outline-none placeholder:text-[var(--text-field-placeholder)]"
          value={draft}
          maxLength={MAX_FORMULA_LENGTH}
          placeholder={pieces.length === 0 ? 'Type a metric, like Revenue' : ''}
          aria-labelledby={labelledBy}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          aria-autocomplete="list"
          aria-controls={open ? listId : undefined}
          aria-expanded={open}
          aria-activedescendant={open ? `${listId}-${active}` : undefined}
          role="combobox"
          spellCheck={false}
          autoComplete="off"
          autoFocus={autoFocus}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); if (draft.trim() !== '') commit() }}
          onChange={event => {
            // A key at a time, a whole typed phrase or a paste: each word followed by a sign becomes a pill.
            const { added, rest } = absorbTyping(event.target.value, entries, self)
            if (added.length > 0) onChange([...pieces, ...added])
            setWord(rest)
          }}
          onKeyDown={event => {
            if (open && event.key === 'ArrowDown') { event.preventDefault(); setActive(i => (i + 1) % suggestions.length); return }
            if (open && event.key === 'ArrowUp') { event.preventDefault(); setActive(i => (i - 1 + suggestions.length) % suggestions.length); return }
            if (open && (event.key === 'Enter' || event.key === 'Tab')) { event.preventDefault(); take(suggestions[active].name); return }
            if (event.key === 'Enter' && draft.trim() !== '') { event.preventDefault(); commit(); return }
            if (event.key === 'Escape' && draft !== '') { event.preventDefault(); event.stopPropagation(); setWord(''); return }
            if (event.key === 'Backspace' && draft === '' && pieces.length > 0) { event.preventDefault(); onChange(pieces.slice(0, -1)) }
          }}
        />
      </div>
      {open && (
        <ul id={listId} role="listbox" aria-label="Metrics" className="absolute left-0 top-full z-10 m-0 mt-1 flex max-h-64 w-full list-none flex-col overflow-y-auto rounded-lg bg-[var(--color-surface-container)] p-1 shadow-[var(--shadow-3)]">
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestion.name}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              className={cn('flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1.5 text-body-sm', index === active && 'bg-[var(--neutral-100)]')}
              onMouseDown={event => { event.preventDefault(); take(suggestion.name) }}
              onMouseEnter={() => setActive(index)}
            >
              <span className="text-[var(--neutral-900)]">{suggestion.label}</span>
              <span className="text-small text-[var(--neutral-500)]">{categoryName(suggestion.category)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
