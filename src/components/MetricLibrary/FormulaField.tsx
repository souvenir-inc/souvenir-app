'use client'

import { useId, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { MetricEntry } from '@/lib/api/warehouse'
import { categoryName, OPERATOR_SYMBOLS } from '@/lib/metrics/display'
import { absorbTyping, exactWord, resolveWord, suggestMetrics, type Piece } from '@/lib/metrics/tokens'
import styles from './MetricLibrary.module.css'

const OP_NAMES = { '+': 'add', '-': 'subtract', '*': 'multiply', '/': 'ratio' } as const

export interface FormulaFieldProps {
  pieces: Piece[]
  onChange: (pieces: Piece[]) => void
  entries: readonly MetricEntry[]
  /** The metric being defined: not offered, since it can't use itself. */
  self?: string
  /** The piece the current error points at, to ring it. */
  errorAt: number | null
  invalid: boolean
  autoFocus?: boolean
  labelledBy?: string
  /**
   * The word being typed, when it already names a metric exactly ("Refunds") or is a number: the formula can be
   * read with it before Enter, so the preview doesn't wait for a keystroke the presenter forgets.
   */
  onPending?: (piece: Piece | null) => void
}

/**
 * The formula box: metrics are pills with their labels (decision M8), operators and numbers sit between them.
 * Type a few letters to get metrics by label or name; Enter or Tab takes one; + − × ÷ and brackets type as
 * themselves; Backspace removes the last piece.
 */
export function FormulaField({ pieces, onChange, entries, self, errorAt, invalid, autoFocus, labelledBy, onPending }: FormulaFieldProps) {
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
    onPending?.(word.trim() === '' ? null : exactWord(word, entries, self))
  }

  /** Ends the word being typed: it becomes a pill (or a number), as the box's text would read it. */
  const commit = () => {
    const word = resolveWord(draft, entries, self)
    if (word) onChange([...pieces, word])
    setWord('')
    setActive(0)
  }

  const take = (name: string) => {
    onChange([...pieces, { kind: 'metric', name }])
    setWord('')
    setActive(0)
    input.current?.focus()
  }

  const remove = (index: number) => {
    onChange(pieces.filter((_, i) => i !== index))
    input.current?.focus()
  }

  return (
    <div
      className={styles.pillBox}
      data-invalid={invalid ? '' : undefined}
      data-focused={focused ? '' : undefined}
      onMouseDown={event => { if (event.target === event.currentTarget) { event.preventDefault(); input.current?.focus() } }}
    >
      {pieces.map((piece, index) => {
        const wrong = errorAt === index
        if (piece.kind === 'metric') {
          const entry = byName.get(piece.name)
          return (
            <span key={index} className={styles.pill} data-wrong={wrong || entry === undefined ? '' : undefined}>
              {entry?.label ?? piece.name}
              <button type="button" className={styles.pillRemove} aria-label={`Remove ${entry?.label ?? piece.name}`} tabIndex={-1} onMouseDown={event => event.preventDefault()} onClick={() => remove(index)}>
                <X size={12} strokeWidth={2} aria-hidden />
              </button>
            </span>
          )
        }
        const text = piece.kind === 'op' ? OPERATOR_SYMBOLS[OP_NAMES[piece.op]] : piece.kind === 'paren' ? piece.paren : piece.text
        return <span key={index} className={styles.pieceText} data-kind={piece.kind} data-wrong={wrong ? '' : undefined}>{text}</span>
      })}
      <input
        ref={input}
        className={styles.pillInput}
        value={draft}
        size={Math.max(2, draft.length + 1)}
        placeholder={pieces.length === 0 ? 'Type a metric, like Revenue' : ''}
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : 'Formula'}
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
          // Text can arrive a key at a time, as a whole typed phrase or as a paste: every word followed by a sign
          // becomes a pill, every sign stays a sign, and what follows the last sign is the word being typed.
          const { added, rest } = absorbTyping(event.target.value, entries, self)
          if (added.length > 0) onChange([...pieces, ...added])
          setWord(rest)
          setActive(0)
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
      {open && (
        <ul id={listId} className={styles.suggestions} role="listbox" aria-label="Metrics">
          {suggestions.map((suggestion, index) => (
            <li key={suggestion.name} role="presentation">
              <button
                id={`${listId}-${index}`}
                type="button"
                role="option"
                aria-selected={index === active}
                tabIndex={-1}
                className={styles.suggestionItem}
                data-active={index === active ? '' : undefined}
                onMouseDown={event => { event.preventDefault(); take(suggestion.name) }}
                onMouseEnter={() => setActive(index)}
              >
                <span>{suggestion.label}</span>
                <span className={styles.suggestionMeta}>{categoryName(suggestion.category)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
