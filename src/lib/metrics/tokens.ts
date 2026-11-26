// The formula box as a row of pieces: metric pills, operators, numbers and brackets (decision M8: people see
// labels as pills, not raw names). The pieces print to the same text `parseFormula` reads, so checking, the
// tree and the saved `value` all come from one place.

import type { MetricEntry } from '@/lib/api/warehouse'
import { parseFormula, printFormula, type ParseResult } from './formula'
import type { MetricValue } from './tree'

export type Piece =
  | { kind: 'metric'; name: string }
  | { kind: 'op'; op: '+' | '-' | '*' | '/' }
  | { kind: 'paren'; paren: '(' | ')' }
  | { kind: 'number'; text: string }

const OPS: Record<string, '+' | '-' | '*' | '/'> = { '+': '+', '-': '-', '−': '-', '–': '-', '*': '*', '×': '*', '/': '/', '÷': '/' }

/** Whether a typed character ends the word being typed and becomes a piece of its own. */
export function isOperatorChar(char: string): boolean {
  return char in OPS || char === '(' || char === ')'
}

export function pieceForChar(char: string): Piece | null {
  if (char === '(' || char === ')') return { kind: 'paren', paren: char }
  const op = OPS[char]
  return op === undefined ? null : { kind: 'op', op }
}

const NUMBER = /^(\d+(?:\.\d+)?|\.\d+)%?$/

/** What a finished word becomes: a number, or a metric (an unknown name stays a metric and the check flags it). */
export function pieceForWord(word: string): Piece | null {
  const trimmed = word.trim()
  if (trimmed === '') return null
  if (NUMBER.test(trimmed)) return { kind: 'number', text: trimmed }
  return { kind: 'metric', name: trimmed.toLowerCase().replace(/\s+/g, '_') }
}

function pieceText(piece: Piece): string {
  switch (piece.kind) {
    case 'metric': return piece.name
    case 'op': return piece.op
    case 'paren': return piece.paren
    case 'number': return piece.text
  }
}

/** The pieces as formula text, with where each piece sits in it (to point an error at a piece). */
export function textOf(pieces: readonly Piece[]): { text: string; spans: Array<{ start: number; end: number }> } {
  let text = ''
  const spans: Array<{ start: number; end: number }> = []
  pieces.forEach((piece, index) => {
    const part = pieceText(piece)
    // Brackets hug what they enclose; everything else is spaced, the way printFormula writes it.
    const tight = piece.kind === 'paren' && piece.paren === ')'
    const afterOpen = index > 0 && pieces[index - 1].kind === 'paren' && (pieces[index - 1] as { paren: string }).paren === '('
    if (index > 0 && !tight && !afterOpen) text += ' '
    spans.push({ start: text.length, end: text.length + part.length })
    text += part
  })
  return { text, spans }
}

/** The piece an error's character range points at, if any. */
export function pieceAt(spans: ReadonlyArray<{ start: number; end: number }>, start: number, end: number): number | null {
  const index = spans.findIndex(span => start < span.end && Math.max(end, start + 1) > span.start)
  return index === -1 ? null : index
}

/** Pieces from formula text, for opening an existing formula in the box. */
export function piecesFromText(text: string): Piece[] {
  const pieces: Piece[] = []
  const pattern = /\s*(?:(\d+(?:\.\d+)?%?|\.\d+%?)|([A-Za-z_][A-Za-z0-9_]*)|([-+*/()×÷−–]))/gy
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    if (match[1] !== undefined) pieces.push({ kind: 'number', text: match[1] })
    else if (match[2] !== undefined) pieces.push({ kind: 'metric', name: match[2].toLowerCase() })
    else if (match[3] !== undefined) {
      const piece = pieceForChar(match[3])
      if (piece) pieces.push(piece)
    }
    if (pattern.lastIndex >= text.length) break
  }
  return pieces
}

export function piecesFromValue(value: MetricValue): Piece[] {
  return piecesFromText(printFormula(value))
}

export interface MetricSuggestion {
  name: string
  label: string
  category: string
}

/**
 * Metrics matching what's typed, by label or name: whole-word starts first ("ad sp" → Ad spend), then any match.
 * Shorter labels first within each group, so the plain metric beats its variants.
 */
export function suggestMetrics(query: string, entries: readonly MetricEntry[], limit = 8, exclude?: string): MetricSuggestion[] {
  const q = query.trim().toLowerCase().replace(/_/g, ' ')
  if (q === '') return []
  const words = q.split(/\s+/)
  const scored: Array<{ entry: MetricEntry; score: number }> = []
  for (const entry of entries) {
    if (entry.name === exclude) continue
    const label = entry.label.toLowerCase()
    const name = entry.name.replace(/_/g, ' ')
    const labelWords = label.split(/[^a-z0-9]+/).filter(Boolean)
    const nameWords = name.split(' ')
    const startsWords = (have: string[]) => words.every(word => have.some(h => h.startsWith(word)))
    let score: number
    if (label.startsWith(q) || name.startsWith(q)) score = 0
    else if (startsWords(labelWords) || startsWords(nameWords)) score = 1
    else if (label.includes(q) || name.includes(q)) score = 2
    else continue
    scored.push({ entry, score })
  }
  return scored
    .sort((a, b) => a.score - b.score || a.entry.label.length - b.entry.label.length || a.entry.label.localeCompare(b.entry.label))
    .slice(0, limit)
    .map(({ entry }) => ({ name: entry.name, label: entry.label, category: entry.category }))
}

export interface PieceCheck {
  text: string
  /** Null while the box is empty. */
  result: ParseResult | null
  /** The piece the error points at, to ring it. */
  errorAt: number | null
  /** Not wrong, just not finished yet ("Revenue −"): say what's next quietly instead of in red. */
  incomplete: boolean
}

/** Reads the pieces with the formula parser: the text, the expression or the error, and which piece is wrong. */
export function checkPieces(pieces: readonly Piece[], known: Iterable<string>, self?: string): PieceCheck {
  const { text, spans } = textOf(pieces)
  if (pieces.length === 0) return { text, result: null, errorAt: null, incomplete: false }
  const result = parseFormula(text, { known, self })
  if (result.ok) return { text, result, errorAt: null, incomplete: false }
  const incomplete = result.error.start >= text.length
  return { text, result, errorAt: incomplete ? null : pieceAt(spans, result.error.start, result.error.end), incomplete }
}

const SIGN_SPLIT = /([-+*/()×÷−–])/

/**
 * A finished word as a piece: a number, a metric whose name or label matches exactly, else the best suggestion,
 * else the word as typed (the check then says "No metric called …").
 */
export function resolveWord(word: string, entries: readonly MetricEntry[], self?: string): Piece | null {
  const piece = pieceForWord(word)
  if (piece === null || piece.kind !== 'metric') return piece
  const typed = word.trim().toLowerCase()
  const exact = entries.find(entry => entry.name !== self && (entry.name === piece.name || entry.label.toLowerCase() === typed))
  if (exact) return { kind: 'metric', name: exact.name }
  const best = suggestMetrics(word, entries, 1, self)[0]
  return best ? { kind: 'metric', name: best.name } : piece
}

/** A word that already names a metric exactly (by name or label), or a number; null while it's still partial. */
export function exactWord(word: string, entries: readonly MetricEntry[], self?: string): Piece | null {
  const piece = pieceForWord(word)
  if (piece === null || piece.kind === 'number') return piece
  if (piece.kind !== 'metric') return null
  const typed = word.trim().toLowerCase()
  const exact = entries.find(entry => entry.name !== self && (entry.name === piece.name || entry.label.toLowerCase() === typed))
  return exact ? { kind: 'metric', name: exact.name } : null
}

/**
 * What the formula box does with new text, however it arrives: one key, a whole typed phrase, or a paste. Every
 * word followed by a sign becomes a piece, every sign becomes a piece, and what comes after the last sign stays
 * as the word being typed. "Gross sales - Discounts - Refunds" → Gross sales, −, Discounts, − and "Refunds" still
 * being typed. A number followed by a space is finished too.
 */
export function absorbTyping(text: string, entries: readonly MetricEntry[], self?: string): { added: Piece[]; rest: string } {
  const added: Piece[] = []
  const parts = text.split(SIGN_SPLIT)
  for (let i = 0; i < parts.length - 1; i += 2) {
    const word = resolveWord(parts[i], entries, self)
    if (word) added.push(word)
    const sign = pieceForChar(parts[i + 1])
    if (sign) added.push(sign)
  }
  let rest = parts[parts.length - 1].replace(/^\s+/, '')
  if (/^[\d.]+%?\s+$/.test(rest)) {
    const number = pieceForWord(rest)
    if (number) added.push(number)
    rest = ''
  }
  return { added, rest }
}
