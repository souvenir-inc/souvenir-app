// A formula as text and back. Printing turns a warehouse definition into "revenue / ad_spend" (or, for reading,
// "Revenue ÷ Ad spend"). Parsing turns simple text over metric names and numbers back into an expression, with
// an error that says what to fix and where.
//
// The text is the user's, so the parser is bounded (JS-7, JS-8, RG-1): the text is capped before any work, the
// tokenizer reads with sticky regexes from a position (never copying the rest of the text), brackets nest at
// most MAX_NESTING deep, and a formula holds at most MAX_FORMULA_SIZE pieces. Over a limit it returns a
// failure; it never throws.
//
// Sums and counts over a table aren't typed here: they need the table's day field. They come from the chat.

import type { Aggregate, Expression, Term } from '@/lib/api/warehouse-schemas'
import { formulaShape, isAggregate, MAX_FORMULA_SIZE, type MetricValue, type Operator } from './tree'

/** Longest formula text the parser reads. */
export const MAX_FORMULA_LENGTH = 2000
/** Deepest bracket nesting the parser follows. */
export const MAX_NESTING = 32
/** Longest metric name the warehouse accepts (CustomMetricRequest.name). */
export const MAX_NAME_LENGTH = 64

const TEXT_SYMBOL: ReadonlyMap<Operator, string> = new Map([['add', '+'], ['subtract', '-'], ['multiply', '*'], ['ratio', '/']])
const PRETTY_SYMBOL: ReadonlyMap<Operator, string> = new Map([['add', '+'], ['subtract', '−'], ['multiply', '×'], ['ratio', '÷']])

/** Binding strength: + and − bind loosest, × and ÷ tighter, names and numbers tightest. */
const PRECEDENCE: ReadonlyMap<Operator, number> = new Map([['add', 1], ['subtract', 1], ['multiply', 2], ['ratio', 2]])
const ATOM = 3

export interface PrintOptions {
  /** Reading form: labels and ×, ÷, −. The default is the typing form: names and *, /, -. */
  pretty?: boolean
  /** A metric's label, for the reading form. */
  labelOf?: (name: string) => string | undefined
}

/** "sum(orders.total)", "count(orders where cancelled_at is null)" */
export function printAggregate(aggregate: Aggregate): string {
  const target = aggregate.kind === 'sum' && aggregate.column ? `${aggregate.table}.${aggregate.column}` : aggregate.table
  const where = aggregate.where ? ` where ${aggregate.where}` : ''
  return `${aggregate.kind}(${target}${where})`
}

function printNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(12)))
}

/** The formula as one line of text; empty for a formula too deep or too big to print. */
export function printFormula(value: MetricValue, options: PrintOptions = {}): string {
  if (isAggregate(value)) return printAggregate(value)
  if (formulaShape(value) !== 'ok') return ''
  return printTerm(value, options).text
}

// Bounded: printFormula only calls it on formulas no deeper than MAX_FORMULA_DEPTH.
function printTerm(term: Term, options: PrintOptions): { text: string; precedence: number } {
  if (typeof term === 'number') return { text: printNumber(term), precedence: ATOM }
  if (typeof term === 'string') return { text: options.pretty ? options.labelOf?.(term) ?? term : term, precedence: ATOM }
  const loose: unknown = term
  if (typeof loose === 'object' && loose !== null && 'kind' in loose) return { text: printAggregate(loose as Aggregate), precedence: ATOM }

  const symbol = (options.pretty ? PRETTY_SYMBOL : TEXT_SYMBOL).get(term.op) ?? '?'
  const precedence = PRECEDENCE.get(term.op) ?? ATOM
  const wrap = (inner: Term, needs: (p: number) => boolean) => {
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

type Sign = '+' | '-' | '*' | '/'

type Token =
  | { kind: 'number'; value: number; text: string; start: number; end: number }
  | { kind: 'name'; text: string; start: number; end: number }
  | { kind: 'op'; text: Sign; start: number; end: number }
  | { kind: 'paren'; text: '(' | ')'; start: number; end: number }

export interface FormulaError {
  message: string
  /** Where the problem is in the text, for underlining it. */
  start: number
  end: number
}

export type ParseResult =
  | { ok: true; value: Expression; names: string[] }
  | { ok: false; error: FormulaError }

class ParseFailure extends Error {
  constructor(message: string, readonly start: number, readonly end: number) { super(message) }
}

/** The signs people type for each operation. */
export const SIGNS: ReadonlyMap<string, Sign> = new Map([
  ['+', '+'], ['-', '-'], ['−', '-'], ['–', '-'], ['*', '*'], ['×', '*'], ['/', '/'], ['÷', '/'],
])

const NUMBER = /(\d+(?:\.\d+)?|\.\d+)(%?)/y
const NAME = /[A-Za-z_][A-Za-z0-9_]*/y
const OPEN_AFTER = /\s*\(/y
const SPACE = /\s/

function stickyAt(pattern: RegExp, text: string, at: number): RegExpExecArray | null {
  pattern.lastIndex = at
  return pattern.exec(text)
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  let at = 0
  while (at < text.length) {
    if (tokens.length > MAX_FORMULA_SIZE) throw new ParseFailure('That formula is too long. Split it into smaller metrics.', at, text.length)
    const char = text[at]
    if (SPACE.test(char)) { at++; continue }
    const number = stickyAt(NUMBER, text, at)
    if (number) {
      const value = Number(number[1]) / (number[2] === '%' ? 100 : 1)
      const end = at + number[0].length
      if (!Number.isFinite(value)) throw new ParseFailure('That number is too big.', at, end)
      tokens.push({ kind: 'number', value, text: number[0], start: at, end })
      at = end
      continue
    }
    const name = stickyAt(NAME, text, at)
    if (name) {
      const word = name[0]
      const end = at + word.length
      const lower = word.toLowerCase()
      if ((lower === 'sum' || lower === 'count') && stickyAt(OPEN_AFTER, text, end)) {
        throw new ParseFailure(`${lower}() reads a table directly. Ask for it in the chat, then use its name here.`, at, end)
      }
      // A lone "x" between two operands is a times sign, as people write it ("ad_spend x 2").
      const previous = tokens[tokens.length - 1]
      const timesSign = word === 'x' && previous !== undefined && previous.kind !== 'op' && previous.text !== '('
      if (!timesSign) {
        tokens.push({ kind: 'name', text: lower, start: at, end })
        at = end
        continue
      }
    }
    if (char === '(' || char === ')') {
      tokens.push({ kind: 'paren', text: char, start: at, end: at + 1 })
      at++
      continue
    }
    const op = char === 'x' ? '*' : SIGNS.get(char)
    if (op !== undefined) {
      tokens.push({ kind: 'op', text: op, start: at, end: at + 1 })
      at++
      continue
    }
    throw new ParseFailure(`“${char}” isn't part of a formula. Use metric names, numbers, + − × ÷ and brackets.`, at, at + 1)
  }
  return tokens
}

/** Edit distance, for "did you mean". Both sides are at most MAX_NAME_LENGTH long. */
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
  if (name.length > MAX_NAME_LENGTH) return null
  let best: string | null = null
  let bestScore = Infinity
  for (const candidate of known) {
    if (candidate.length > MAX_NAME_LENGTH) continue
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

/** Reads text like "revenue / ad_spend" or "(revenue - refunds) / orders" into a warehouse expression. Never throws. */
export function parseFormula(text: string, options: ParseOptions = {}): ParseResult {
  if (text.length > MAX_FORMULA_LENGTH) {
    return { ok: false, error: { message: 'That formula is too long. Split it into smaller metrics.', start: MAX_FORMULA_LENGTH, end: text.length } }
  }
  try {
    return { ok: true, ...parse(text, options) }
  } catch (error) {
    if (error instanceof ParseFailure) return { ok: false, error: { message: error.message, start: error.start, end: error.end } }
    // Anything else (a RangeError from an engine limit) is still a formula we can't read, not a crash.
    return { ok: false, error: { message: 'That formula couldn’t be read. Simplify it and try again.', start: 0, end: text.length } }
  }
}

function parse(text: string, options: ParseOptions): { value: Expression; names: string[] } {
  const tokens = tokenize(text)
  if (tokens.length === 0) throw new ParseFailure('Type a formula, like revenue / ad_spend', 0, 0)
  const known = options.known === undefined ? null : new Set(options.known)
  const names: string[] = []
  let at = 0
  let nesting = 0
  const end = text.length
  const peek = (): Token | undefined => tokens[at]
  const isOp = (token: Token | undefined, ...ops: Sign[]) => token?.kind === 'op' && ops.includes(token.text)
  // Chains this parser built and may still extend in place; a bracketed group stays its own node, so
  // "(a * b) * c" keeps the shape it was written in.
  const open = new WeakSet<object>()

  const factor = (): Term => {
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
        const shown = token.text.length > MAX_NAME_LENGTH ? `${token.text.slice(0, MAX_NAME_LENGTH)}…` : token.text
        throw new ParseFailure(`No metric called ${shown}.${guess ? ` Did you mean ${guess}?` : ''}`, token.start, token.end)
      }
      if (!names.includes(token.text)) names.push(token.text)
      return token.text
    }
    if (token.text === '(') {
      if (nesting >= MAX_NESTING) throw new ParseFailure('Too many brackets inside each other. Split it into smaller metrics.', token.start, token.end)
      at++
      nesting++
      const inner = sum()
      nesting--
      const close = peek()
      if (close?.text !== ')') throw new ParseFailure('Close the bracket.', close?.start ?? end, close?.end ?? end)
      at++
      if (typeof inner === 'object') open.delete(inner)
      return inner
    }
    throw new ParseFailure(token.text === ')' ? 'There’s a closing bracket with nothing open.' : `${token.text} needs something before it.`, token.start, token.end)
  }

  const product = (): Term => {
    let left = factor()
    while (isOp(peek(), '*', '/')) {
      const op = peek()!
      at++
      const right = factor()
      if (op.text === '/') {
        if (right === 0) throw new ParseFailure('Dividing by 0 has no answer.', op.start, tokens[at - 1].end)
        left = { op: 'ratio', numerator: left, denominator: right }
      } else if (typeof left === 'object' && left.op === 'multiply' && open.has(left)) {
        left.terms.push(right)
      } else {
        left = { op: 'multiply', terms: [left, right] }
        open.add(left)
      }
    }
    return left
  }

  const sum = (): Term => {
    let left = product()
    while (isOp(peek(), '+', '-')) {
      const op = peek()!
      at++
      const right = product()
      if (op.text === '-') left = { op: 'subtract', left, right }
      else if (typeof left === 'object' && left.op === 'add' && open.has(left)) left.terms.push(right)
      else {
        left = { op: 'add', terms: [left, right] }
        open.add(left)
      }
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

const LABEL_LIMIT = 200

/** "Shipping share of revenue" → shipping_share_of_revenue: the permanent key the warehouse accepts (^[a-z][a-z0-9_]*$, 64 max). */
export function metricNameOf(label: string): string {
  let slug = ''
  let gap = false
  for (const char of label.slice(0, LABEL_LIMIT).toLowerCase()) {
    const word = (char >= 'a' && char <= 'z') || (char >= '0' && char <= '9')
    if (!word) { gap = slug !== ''; continue }
    if (gap) slug += '_'
    slug += char
    gap = false
  }
  if (slug === '') return ''
  const named = slug[0] >= 'a' && slug[0] <= 'z' ? slug : `m_${slug}`
  let cut = named.slice(0, MAX_NAME_LENGTH)
  while (cut.endsWith('_')) cut = cut.slice(0, -1)
  return cut
}

/** Whether a name is one the warehouse accepts as a metric's key. */
export function isMetricName(name: string): boolean {
  return name.length > 0 && name.length <= MAX_NAME_LENGTH && /^[a-z][a-z0-9_]*$/.test(name)
}
