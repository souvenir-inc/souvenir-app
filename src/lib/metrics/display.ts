// How the metric library names things: operators, catalog areas, table fields and filters in a merchant's words,
// and how much a number moved. Numbers themselves are formatted in the component layer with the Dashboard's
// formatters, so a figure reads the same on every page. Lookups keyed by catalog data are Maps (JS-1).

import type { Aggregate } from '@/lib/api/warehouse-schemas'
import type { Operator } from './tree'
import type { DisplayUnit } from './units'

export const OPERATOR_SYMBOLS: ReadonlyMap<Operator, string> = new Map([['add', '+'], ['subtract', '−'], ['multiply', '×'], ['ratio', '÷']])
export const OPERATOR_WORDS: ReadonlyMap<Operator, string> = new Map([['add', 'plus'], ['subtract', 'minus'], ['multiply', 'times'], ['ratio', 'divided by']])

export const DISPLAY_NAMES: ReadonlyMap<DisplayUnit, string> = new Map([
  ['money', 'Money'], ['count', 'Count'], ['percent', 'Percent'], ['ratio', 'Ratio'], ['number', 'Number'],
])

/** Catalog categories in the words a merchant uses, in the order the library lists them. */
const CATEGORY_NAMES: ReadonlyMap<string, string> = new Map([
  ['store', 'Store'],
  ['ads', 'Ads'],
  ['attribution', 'Attribution'],
  ['email_sms', 'Email & SMS'],
  ['shipping', 'Shipping'],
  ['returns', 'Returns'],
  ['reviews', 'Reviews'],
  ['surveys', 'Surveys'],
  ['ab_testing', 'A/B tests'],
  ['support', 'Support'],
  ['site_analytics', 'Site analytics'],
  ['blended', 'Blended'],
  ['custom', 'Custom'],
])
const CATEGORY_ORDER = [...CATEGORY_NAMES.keys()]

export const CUSTOM_CATEGORY = 'custom'

export function categoryName(category: string): string {
  return CATEGORY_NAMES.get(category) ?? humanize(category)
}

/** The order categories appear in: the known ones as listed above, then any new ones alphabetically. */
export function categoryOrder(categories: Iterable<string>): string[] {
  return [...new Set(categories)].sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a)
    const ib = CATEGORY_ORDER.indexOf(b)
    if (ia !== -1 && ib !== -1) return ia - ib
    if (ia !== -1) return -1
    if (ib !== -1) return 1
    return a.localeCompare(b)
  })
}

/** "cancelled_at" → "Cancelled at": table and field names in plain words. */
export function humanize(field: string): string {
  const words = field.replace(/_/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export interface Change {
  direction: 'up' | 'down' | 'flat'
  /** How far it moved, always positive. */
  magnitude: number
  /** What the magnitude counts: a percent of the number before, percentage points, or a ratio's own units. */
  measure: 'percent' | 'points' | 'ratio'
}

/**
 * How much a number moved against the period before. Money and counts move in percent; a percentage moves in
 * points (2.0% → 2.4% is 0.4 pts, not 20%); a ratio moves in its own units. Nothing to compare gives no change.
 */
export function changeOf(current: number | null | undefined, previous: number | null | undefined, unit: DisplayUnit): Change | null {
  if (current === null || current === undefined || previous === null || previous === undefined) return null
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null
  let amount: number
  let measure: Change['measure']
  if (unit === 'percent') {
    amount = (current - previous) * 100
    measure = 'points'
  } else if (unit === 'ratio') {
    amount = current - previous
    measure = 'ratio'
  } else {
    if (previous === 0) return null
    amount = ((current - previous) / Math.abs(previous)) * 100
    measure = 'percent'
  }
  const magnitude = Math.abs(amount)
  if (magnitude < 0.05) return { direction: 'flat', magnitude: 0, measure }
  return { direction: amount > 0 ? 'up' : 'down', magnitude, measure }
}

/** The warehouse's store fields in the words a merchant uses: no internal names on screen. */
const COLUMN_WORDS: ReadonlyMap<string, string> = new Map([
  ['total', 'order total'], ['subtotal', 'subtotal'], ['placed_at', 'order date'], ['created_at', 'date created'],
  ['processed_at', 'date processed'], ['refunded_at', 'refund date'], ['cancelled_at', 'cancellation date'],
  ['shipping_charged', 'shipping charged'], ['total_discounts', 'discounts'], ['total_tax', 'tax'], ['amount', 'amount'],
  ['quantity', 'quantity'], ['price', 'price'],
])

const FIELD_LIMIT = 120

/** A column in plain words: a known one as written above, a date column as "date refunded", else its words. */
export function columnWords(column: string): string {
  const field = column.slice(0, FIELD_LIMIT)
  const known = COLUMN_WORDS.get(field)
  if (known) return known
  if (field.endsWith('_at') && field.length > 3) return `date ${field.slice(0, -3).replace(/_/g, ' ')}`
  return field.replace(/_/g, ' ')
}

/** A row filter in plain words: "not cancelled", "refunded"; any other condition is just "filtered". */
export function ruleWords(where: string | null): string | null {
  const rule = where?.slice(0, FIELD_LIMIT).trim().toLowerCase().replace(/\s+/g, ' ')
  if (!rule) return null
  const column = rule.split(' ')[0]
  const at = column.endsWith('_at') && /^[a-z0-9_]+$/.test(column) ? column.slice(0, -3).replace(/_/g, ' ') : null
  if (at && rule === `${column} is null`) return `not ${at}`
  if (at && rule === `${column} is not null`) return at
  return 'filtered'
}

/** A root metric's source in plain words, for "How it's calculated". */
export interface SourceDescription {
  /** "Shopify orders" for a count, "Order total from Shopify orders" for a sum. */
  headline: string
  /** The table as read: "Shopify orders". */
  table: string
  /** What's added up, for a sum: "order total"; null for a count. */
  column: string | null
  /** The date that puts a row on a day: "order date" (always in the store's time zone). */
  day: string
  /** The filter in words ("not cancelled", or "filtered" for one we can't put in words), or null. */
  rule: string | null
  /** The filter exactly as the warehouse holds it, for the detailed steps only. */
  ruleRaw: string | null
  /** One line: "Counted from Shopify orders, not cancelled, by order date". */
  sentence: string
}

export function describeSource(aggregate: Aggregate, app?: string): SourceDescription {
  const table = `${app ? `${app} ` : ''}${aggregate.table.slice(0, FIELD_LIMIT).replace(/_/g, ' ')}`
  const column = aggregate.kind === 'sum' && aggregate.column ? columnWords(aggregate.column) : null
  const headline = column ? `${column.charAt(0).toUpperCase()}${column.slice(1)} from ${table}` : table.charAt(0).toUpperCase() + table.slice(1)
  const rule = ruleWords(aggregate.where)
  const day = columnWords(aggregate.day)
  const sentence = `${column ? headline : `Counted from ${table}`}${rule ? `, ${rule}` : ''}, by ${day}`
  return { headline, table, column, day, rule, ruleRaw: aggregate.where?.trim() || null, sentence }
}
