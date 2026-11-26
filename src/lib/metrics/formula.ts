// A formula as text and back. Printing turns a warehouse `value` into "revenue / ad_spend" (or, for reading,
// "Revenue ÷ Ad spend"). Parsing turns simple text over metric names and numbers back into an expression, with
// an error that says what to fix and where.
//
// Sums and counts over a table aren't typed here: they need the table's day field, which the API doesn't expose
// any more. They come from the chat, which knows the tables.

import type { MetricAggregate, MetricExpression, MetricTerm } from '@/lib/api/warehouse'
import { isAggregate, type MetricValue, type Operator } from './tree'

const TEXT_SYMBOL: Record<Operator, string> = { add: '+', subtract: '-', multiply: '*', ratio: '/' }
const PRETTY_SYMBOL: Record<Operator, string> = { add: '+', subtract: '−', multiply: '×', ratio: '÷' }

/** Binding strength: + and − bind loosest, × and ÷ tighter, names and numbers tightest. */
const PRECEDENCE: Record<Operator, number> = { add: 1, subtract: 1, multiply: 2, ratio: 2 }
const ATOM = 3

export interface PrintOptions {
  /** Reading form: labels and ×, ÷, −. The default is the typing form: names and *, /, -. */
  pretty?: boolean
  /** A metric's label, for the reading form. */
  labelOf?: (name: string) => string | undefined
}

/** "sum(orders.total)", "count(orders where cancelled_at is null)" */
export function printAggregate(aggregate: MetricAggregate): string {
  const target = aggregate.kind === 'sum' && aggregate.column ? `${aggregate.table}.${aggregate.column}` : aggregate.table
  const where = aggregate.where ? ` where ${aggregate.where}` : ''
  return `${aggregate.kind}(${target}${where})`
}

function printNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(12)))
}

/** The formula as one line of text. */
export function printFormula(value: MetricValue, options: PrintOptions = {}): string {
  if (isAggregate(value)) return printAggregate(value)
  return printTerm(value, options).text
}

function printTerm(term: MetricTerm, options: PrintOptions): { text: string; precedence: number } {
  if (typeof term === 'number') return { text: printNumber(term), precedence: ATOM }
  if (typeof term === 'string') return { text: options.pretty ? options.labelOf?.(term) ?? term : term, precedence: ATOM }
  const loose: unknown = term
  if (typeof loose === 'object' && loose !== null && 'kind' in loose) return { text: printAggregate(loose as MetricAggregate), precedence: ATOM }

  const symbol = (options.pretty ? PRETTY_SYMBOL : TEXT_SYMBOL)[term.op]
  const precedence = PRECEDENCE[term.op]
  const wrap = (inner: MetricTerm, needs: (p: number) => boolean) => {
    const printed = printTerm(inner, options)
    return needs(printed.precedence) ? `(${printed.text})` : printed.text
  }
  let text: string
  switch (term.op) {
    case 'add':
      text = term.terms.map(t => wrap(t, p => p < 1)).join(` ${symbol} `)
      break
    case 'multiply':
      text = term.terms.map(t => wrap(t, p => p < 2)).join(` ${symbol} `)
      break
    case 'subtract':
      text = `${wrap(term.left, p => p < 1)} ${symbol} ${wrap(term.right, p => p <= 1)}`
      break
    case 'ratio':
      text = `${wrap(term.numerator, p => p < 2)} ${symbol} ${wrap(term.denominator, p => p <= 2)}`
      break
  }
  return { text, precedence }
}

type Token =
  | { kind: 'number'; value: number; text: string; start: number; end: number }
  | { kind: 'name'; text: string; start: number; end: number }
  | { kind: 'op'; text: '+' | '-' | '*' | '/'; start: number; end: number }
  | { kind: 'paren'; text: '(' | ')'; start: number; end: number }

export interface FormulaError {
  message: string
  /** Where the problem is in the text, for underlining it. */
  start: number
  end: number
}

export type ParseResult =
  | { ok: true; value: MetricExpression; names: string[] }
  | { ok: false; error: FormulaError }

class ParseFailure extends Error {
  constructor(message: string, readonly start: number, readonly end: number) { super(message) }
}

const OP_ALIASES: Record<string, '+' | '-' | '*' | '/'> = { '+': '+', '-': '-', '−': '-', '–': '-', '*': '*', '×': '*', 'x': '*', '/': '/', '÷': '/' }

function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  let at = 0
  while (at < text.length) {
    const char = text[at]
    if (/\s/.test(char)) { at++; continue }
    const number = /^(\d+(?:\.\d+)?|\.\d+)(%?)/.exec(text.slice(at))
    if (number) {
      const value = Number(number[1]) / (number[2] === '%' ? 100 : 1)
      tokens.push({ kind: 'number', value, text: number[0], start: at, end: at + number[0].length })
      at += number[0].length
      continue
    }
    const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(at))
    // A lone "x" between two operands is a times sign, as people write it ("ad_spend x 2").
    if (name && /^(sum|count)$/i.test(name[0]) && /^\s*\(/.test(text.slice(at + name[0].length))) {
      throw new ParseFailure(`${name[0].toLowerCase()}() reads a table directly. Ask for it in the chat, then use its name here.`, at, at + name[0].length)
    }
    if (name && !(name[0] === 'x' && tokens.length > 0 && tokens[tokens.length - 1].kind !== 'op' && tokens[tokens.length - 1].text !== '(')) {
      tokens.push({ kind: 'name', text: name[0].toLowerCase(), start: at, end: at + name[0].length })
      at += name[0].length
      continue
    }
    if (char === '(' || char === ')') {
      tokens.push({ kind: 'paren', text: char, start: at, end: at + 1 })
      at++
      continue
    }
    const op = OP_ALIASES[char]
    if (op !== undefined) {
      tokens.push({ kind: 'op', text: op, start: at, end: at + 1 })
      at++
      continue
    }
    throw new ParseFailure(`“${char}” isn't part of a formula. Use metric names, numbers, + − × ÷ and brackets.`, at, at + 1)
  }
  return tokens
}

/** Edit distance, for "did you mean". */
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const saved = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1))
      previous = saved
    }
  }
  return row[b.length]
}

/** The known name a mistyped one most likely meant. */
export function closestName(name: string, known: Iterable<string>): string | null {
  let best: string | null = null
  let bestScore = Infinity
  for (const candidate of known) {
    const score = distance(name, candidate)
    const limit = Math.max(1, Math.floor(candidate.length / 4))
    if (score <= limit && score < bestScore) { best = candidate; bestScore = score }
  }
  return best
}

export interface ParseOptions {
  /** Metric names the formula may use. Leave out to accept any name. */
  known?: Iterable<string>
  /** The metric being defined, which can't use itself. */
  self?: string
}

/** Reads text like "revenue / ad_spend" or "(revenue - refunds) / orders" into a warehouse expression. */
export function parseFormula(text: string, options: ParseOptions = {}): ParseResult {
  try {
    return { ok: true, ...parse(text, options) }
  } catch (error) {
    if (error instanceof ParseFailure) return { ok: false, error: { message: error.message, start: error.start, end: error.end } }
    throw error
  }
}

function parse(text: string, options: ParseOptions): { value: MetricExpression; names: string[] } {
  const tokens = tokenize(text)
  if (tokens.length === 0) throw new ParseFailure('Type a formula, like revenue / ad_spend', 0, 0)
  const known = options.known === undefined ? null : new Set(options.known)
  const names: string[] = []
  let at = 0
  const end = text.length
  const peek = (): Token | undefined => tokens[at]
  const isOp = (token: Token | undefined, ...ops: string[]) => token?.kind === 'op' && ops.includes(token.text)
  // Bracketed groups stay their own node, so "(a * b) * c" keeps the shape it was written in.
  const wrapped = new WeakSet<object>()

  const factor = (): MetricTerm => {
    const token = peek()
    if (token === undefined) throw new ParseFailure('The formula ends early. Add a metric or a number.', end, end)
    if (token.kind === 'number') { at++; return token.value }
    if (isOp(token, '-')) {
      const next = tokens[at + 1]
      if (next?.kind === 'number') { at += 2; return -next.value }
      throw new ParseFailure('A minus sign needs something before it, like revenue - refunds', token.start, token.end)
    }
    if (token.kind === 'name') {
      at++
      if (options.self !== undefined && token.text === options.self) {
        throw new ParseFailure('A metric can’t be built from itself.', token.start, token.end)
      }
      if (known !== null && !known.has(token.text)) {
        const guess = closestName(token.text, known)
        throw new ParseFailure(`No metric called ${token.text}.${guess ? ` Did you mean ${guess}?` : ''}`, token.start, token.end)
      }
      if (!names.includes(token.text)) names.push(token.text)
      return token.text
    }
    if (token.text === '(') {
      at++
      const inner = sum()
      const close = peek()
      if (close?.text !== ')') throw new ParseFailure('Close the bracket.', close?.start ?? end, close?.end ?? end)
      at++
      if (typeof inner === 'object') wrapped.add(inner)
      return inner
    }
    throw new ParseFailure(token.text === ')' ? 'There’s a closing bracket with nothing open.' : `${token.text} needs something before it.`, token.start, token.end)
  }

  const product = (): MetricTerm => {
    let left = factor()
    while (isOp(peek(), '*', '/')) {
      const op = peek()!
      at++
      const right = factor()
      if (op.text === '/') {
        if (right === 0) throw new ParseFailure('Dividing by 0 has no answer.', op.start, tokens[at - 1].end)
        left = { op: 'ratio', numerator: left, denominator: right }
      } else {
        left = typeof left === 'object' && left.op === 'multiply' && !wrapped.has(left) ? { op: 'multiply', terms: [...left.terms, right] } : { op: 'multiply', terms: [left, right] }
      }
    }
    return left
  }

  const sum = (): MetricTerm => {
    let left = product()
    while (isOp(peek(), '+', '-')) {
      const op = peek()!
      at++
      const right = product()
      left = op.text === '+'
        ? (typeof left === 'object' && left.op === 'add' && !wrapped.has(left) ? { op: 'add', terms: [...left.terms, right] } : { op: 'add', terms: [left, right] })
        : { op: 'subtract', left, right }
    }
    return left
  }

  const value = sum()
  const rest = peek()
  if (rest !== undefined) {
    throw new ParseFailure(rest.text === ')' ? 'There’s a closing bracket with nothing open.' : `Expected + − × or ÷ before ${rest.text}.`, rest.start, rest.end)
  }
  if (typeof value === 'number') throw new ParseFailure('A number on its own isn’t a metric. Combine it with a metric.', 0, end)
  if (typeof value === 'string') throw new ParseFailure(`That’s just ${value}. Combine it with something, like ${value} / orders.`, 0, end)
  return { value, names }
}

export interface Completion {
  /** The part of the text the chosen name replaces. */
  start: number
  end: number
  prefix: string
  names: string[]
}

/** Metric names that complete the word at the caret: names starting with it first, then names containing it. */
export function completionsAt(text: string, caret: number, known: Iterable<string>, limit = 8): Completion | null {
  const before = /[A-Za-z_][A-Za-z0-9_]*$/.exec(text.slice(0, caret))
  if (before === null) return null
  const after = /^[A-Za-z0-9_]*/.exec(text.slice(caret))
  const prefix = before[0].toLowerCase()
  const all = [...new Set(known)]
  const starts = all.filter(name => name.startsWith(prefix)).sort((a, b) => a.length - b.length || a.localeCompare(b))
  const contains = all.filter(name => !name.startsWith(prefix) && name.includes(prefix)).sort((a, b) => a.localeCompare(b))
  const names = [...starts, ...contains].filter(name => name !== prefix).slice(0, limit)
  if (names.length === 0) return null
  return { start: caret - before[0].length, end: caret + (after?.[0].length ?? 0), prefix, names }
}

/** "Shipping share of revenue" → shipping_share_of_revenue: the permanent key the warehouse accepts (^[a-z][a-z0-9_]*$, 64 max). */
export function metricNameOf(label: string): string {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64).replace(/_+$/, '')
  if (slug === '') return ''
  return /^[a-z]/.test(slug) ? slug : `m_${slug}`.slice(0, 64)
}
