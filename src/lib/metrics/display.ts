// How the library writes numbers, units and sources. Built on Home's formatters so a number reads the same on
// every page.

import type { MetricUnit } from '@/lib/api/warehouse'
import { formatCount, formatCurrency, formatCurrencyCompact, formatPercent } from '@/lib/home/format'
import type { DisplayUnit, Operator } from './tree'

const LOCALE = 'en-US'

/** One number in its unit: $48.2k, 2,140, 3.4%, 3.20x. Missing data is a dash, never a zero. */
export function formatDisplay(value: number | null | undefined, unit: DisplayUnit, options: { exact?: boolean } = {}): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  switch (unit) {
    case 'money':    return options.exact ? formatCurrency(value) : formatCurrencyCompact(value)
    case 'count':    return formatCount(value)
    case 'percent':  return formatPercent(value * 100, Math.abs(value) < 0.1 ? 2 : 1)
    case 'multiple': return `${new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}x`
    case 'number':   return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 }).format(value)
  }
}

export const UNIT_NAMES: Record<MetricUnit, string> = { money: 'Money', count: 'Count', ratio: 'Ratio' }

export const DISPLAY_NAMES: Record<DisplayUnit, string> = {
  money: 'Money', count: 'Count', percent: 'Percent', multiple: 'Multiple', number: 'Number',
}

export const OPERATOR_SYMBOLS: Record<Operator, string> = { add: '+', subtract: '−', multiply: '×', ratio: '÷' }

export const OPERATOR_NAMES: Record<Operator, string> = {
  add: 'Sum of', subtract: 'Difference of', multiply: 'Product of', ratio: 'Ratio of',
}

/** Catalog categories in the words a merchant uses, in the order the library lists them. */
export const CATEGORY_NAMES: Record<string, string> = {
  store: 'Store',
  ads: 'Ads',
  attribution: 'Attribution',
  email_sms: 'Email & SMS',
  shipping: 'Shipping',
  returns: 'Returns',
  reviews: 'Reviews',
  surveys: 'Surveys',
  ab_testing: 'A/B tests',
  support: 'Support',
  site_analytics: 'Site analytics',
  blended: 'Blended',
  custom: 'Custom',
}

export function categoryName(category: string): string {
  return CATEGORY_NAMES[category] ?? category.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

/** The order categories appear in: the known ones as listed above, then any new ones alphabetically. */
export function categoryOrder(categories: Iterable<string>): string[] {
  const known = Object.keys(CATEGORY_NAMES)
  return [...new Set(categories)].sort((a, b) => {
    const ia = known.indexOf(a)
    const ib = known.indexOf(b)
    if (ia !== -1 && ib !== -1) return ia - ib
    if (ia !== -1) return -1
    if (ib !== -1) return 1
    return a.localeCompare(b)
  })
}

/** "cancelled_at is null" → "Cancelled at is null"; table and field names in plain words for the tree. */
export function humanize(field: string): string {
  const words = field.replace(/_/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export interface Change {
  direction: 'up' | 'down' | 'flat'
  /** The magnitude only; the arrow carries the sign: "3.3%", "0.4 pts", "0.25x". */
  text: string
  /** For screen readers: "up 3.3%". */
  spoken: string
}

/**
 * How much a number moved against the period before. Money and counts move in percent; a percentage moves in
 * points (2.0% → 2.4% is 0.4 pts, not 20%); a multiple moves in x. Nothing to compare against gives no change.
 */
export function changeOf(current: number | null | undefined, previous: number | null | undefined, unit: DisplayUnit): Change | null {
  if (current === null || current === undefined || previous === null || previous === undefined) return null
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null
  let amount: number
  let text: (magnitude: number) => string
  if (unit === 'percent') {
    amount = (current - previous) * 100
    text = magnitude => `${new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(magnitude)} pts`
  } else if (unit === 'multiple') {
    amount = current - previous
    text = magnitude => `${new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(magnitude)}x`
  } else {
    if (previous === 0) return null
    amount = ((current - previous) / Math.abs(previous)) * 100
    text = magnitude => formatPercent(magnitude, 1)
  }
  const magnitude = Math.abs(amount)
  if (magnitude < 0.05) return { direction: 'flat', text: text(0), spoken: 'no change' }
  const direction = amount > 0 ? 'up' : 'down'
  return { direction, text: text(magnitude), spoken: `${direction} ${text(magnitude)}` }
}

/** The warehouse's store fields in the words a merchant uses (Dev's rule: no internal names on screen). */
const COLUMN_WORDS: Record<string, string> = {
  total: 'order total', subtotal: 'subtotal', placed_at: 'order date', created_at: 'date created',
  processed_at: 'date processed', refunded_at: 'refund date', cancelled_at: 'cancellation date',
  shipping_charged: 'shipping charged', total_discounts: 'discounts', total_tax: 'tax', amount: 'amount',
  quantity: 'quantity', price: 'price',
}

/** A column in plain words: a known one as written above, a date column as "date refunded", else its words. */
export function columnWords(column: string): string {
  const known = COLUMN_WORDS[column]
  if (known) return known
  const date = /^(\w+)_at$/.exec(column)
  if (date) return `date ${date[1].replace(/_/g, ' ')}`
  return column.replace(/_/g, ' ')
}

/** A row filter in plain words: "not cancelled", "refunded"; an unknown condition is just "filtered". */
export function ruleWords(where: string | null): string | null {
  const rule = where?.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!rule) return null
  const notSet = /^(\w+)_at is null$/.exec(rule)
  if (notSet) return `not ${notSet[1].replace(/_/g, ' ')}`
  const set = /^(\w+)_at is not null$/.exec(rule)
  if (set) return set[1].replace(/_/g, ' ')
  return 'filtered'
}

/** A root metric's source in plain words, for "How it's calculated" and the metric window's Sources. */
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

export function describeSource(
  aggregate: { kind: 'sum' | 'count'; table: string; column: string | null; day: string; where: string | null },
  app?: string,
): SourceDescription {
  const table = `${app ? `${app} ` : ''}${aggregate.table.replace(/_/g, ' ')}`
  const column = aggregate.kind === 'sum' && aggregate.column ? columnWords(aggregate.column) : null
  const headline = column ? `${column.charAt(0).toUpperCase()}${column.slice(1)} from ${table}` : table.charAt(0).toUpperCase() + table.slice(1)
  const rule = ruleWords(aggregate.where)
  const day = columnWords(aggregate.day)
  const sentence = `${column ? `${headline}` : `Counted from ${table}`}${rule ? `, ${rule}` : ''}, by ${day}`
  return { headline, table, column, day, rule, ruleRaw: aggregate.where?.trim() || null, sentence }
}

const CONNECTOR_NAMES: Record<string, string> = {
  shopify: 'Shopify', shopify_app: 'Shopify',
  metaads: 'Meta Ads', meta_ads: 'Meta Ads', facebook_ads: 'Meta Ads',
  google_ads: 'Google Ads', googleads: 'Google Ads', tiktok_ads: 'TikTok Ads',
  klaviyo: 'Klaviyo', attentive: 'Attentive', postscript: 'Postscript',
  'triple-whale': 'Triple Whale', triple_whale: 'Triple Whale', triplewhale: 'Triple Whale',
  microsoft_clarity: 'Microsoft Clarity', clarity: 'Microsoft Clarity',
  google_analytics: 'Google Analytics', ga4: 'Google Analytics',
  shiphero: 'ShipHero', ship_hero: 'ShipHero',
}

const TRIPLE_WHALE = ['triple-whale', 'triple_whale', 'triplewhale']

// Which apps feed which area is our reading: the API doesn't say (PRD question 6).
const CATEGORY_CONNECTORS: Record<string, readonly string[]> = {
  store: ['shopify', 'shopify_app'],
  ads: ['metaads', 'meta_ads', 'facebook_ads', 'google_ads', 'googleads', 'tiktok_ads', ...TRIPLE_WHALE],
  attribution: TRIPLE_WHALE,
  site_analytics: ['microsoft_clarity', 'clarity', 'google_analytics', 'ga4'],
  shipping: ['shiphero', 'ship_hero'],
  email_sms: ['klaviyo', 'attentive', 'postscript'],
}

/** The connected apps that feed an area, one per app: its slug (for the logo) and name. Empty when we can't tell. */
export function appSlugsFor(category: string, connectors: readonly string[]): { slug: string; name: string }[] {
  const feeding = CATEGORY_CONNECTORS[category] ?? []
  const seen = new Set<string>()
  const apps: { slug: string; name: string }[] = []
  for (const slug of connectors) {
    if (!feeding.includes(slug)) continue
    const name = CONNECTOR_NAMES[slug] ?? slug
    if (seen.has(name)) continue
    seen.add(name)
    apps.push({ slug, name })
  }
  return apps
}

/** The connected apps that feed an area, by name: "Shopify", "Meta Ads". Empty when we can't tell. */
export function appsFor(category: string, connectors: readonly string[]): string[] {
  const feeding = CATEGORY_CONNECTORS[category] ?? []
  return [...new Set(connectors.filter(slug => feeding.includes(slug)).map(slug => CONNECTOR_NAMES[slug]))]
}
