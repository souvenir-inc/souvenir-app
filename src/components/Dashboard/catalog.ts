// The Add cards picker's catalog (docs-v2/dashboard/06-add-cards-rules.md): roles, short forms,
// and how metrics group by app. Stand-in until the Metric library has an endpoint.

import { METRICS } from './mock-data'
import { metricKind } from './series'
import { APP_ORDER, SOURCE_NAMES } from './sources'
import type { CardSize, Metric } from './types'

export interface Role { id: string; label: string }

export const YOUR_ROLE: Role = { id: 'founder', label: 'Founder or CEO' }
export const OTHER_ROLES: Role[] = [
  { id: 'ecommerce', label: 'Head of e-commerce' },
  { id: 'growth', label: 'Growth or ads lead' },
  { id: 'ops', label: 'Ops lead' },
  { id: 'finance', label: 'Finance or fractional CFO' },
  { id: 'agency', label: 'Agency' },
]

/** Metrics by role, in the order the rail lists them (Founder or CEO as drawn in A-2). A metric can sit under several roles. */
export const ROLE_METRICS: Record<string, string[]> = {
  founder: ['revenue', 'net-sales', 'orders', 'aov', 'new-customers', 'revenue-per-customer', 'mer', 'ad-spend', 'gross-margin', 'ga-sessions', 'ga-conversion-rate'],
  ecommerce: ['revenue', 'orders', 'aov', 'conversion-rate', 'sessions', 'returning-rate', 'cancellation-rate', 'refund-rate', 'items-per-order', 'ga-conversion-rate'],
  growth: ['ad-spend', 'roas', 'cpa', 'cac', 'ctr', 'cpc', 'cpm', 'impressions', 'clicks', 'reach', 'frequency', 'platform-conversion-rate', 'mer'],
  ops: ['orders', 'shipping', 'shipping-cost', 'refund-rate', 'cancellation-rate', 'items-per-order', 'zendesk-tickets', 'first-response-time'],
  finance: ['revenue', 'gross-sales', 'net-sales', 'gross-profit', 'gross-margin', 'cogs', 'contribution-margin', 'discount-rate', 'processing-fees', 'stripe-payouts', 'paypal-volume'],
  agency: ['ad-spend', 'roas', 'mer', 'cpa', 'ctr', 'cpm', 'revenue', 'new-customers'],
}

/** Short forms search understands (AC-13). */
const SHORT: Record<string, string> = {
  aov: 'aov', roas: 'roas', mer: 'mer', ctr: 'ctr', cpa: 'cpa', cpc: 'cpc', cpm: 'cpm', cac: 'cac', cogs: 'cogs',
}

/** Every metric the picker offers: the catalog, A–Z. */
export const CATALOG: Metric[] = Object.values(METRICS)
  .filter((m) => !(m.id in { 'return-label-cost': 1 }))
  .sort((a, b) => a.label.localeCompare(b.label))

/** A new card's size (AC-16): sums and counts 6 × 1, rates and multiples 3 × 1. */
// Revenue per customer lands 6 × 1 as drawn (A-5 calls it a sum: the number and its trend).
const LANDS_WIDE = new Set(['revenue-per-customer'])
export const landingSize = (m: Metric): CardSize => (metricKind(m) === 'sum' || LANDS_WIDE.has(m.id) ? 'md' : 'sm')

/** The app group a metric sits in: its app, the blended pair, or Custom metrics (AC-10). */
export function groupOf(m: Metric): string {
  if (m.custom) return 'Custom metrics'
  if (m.alsoFrom) return `${SOURCE_NAMES[m.source]} + ${SOURCE_NAMES[m.alsoFrom]}`
  return SOURCE_NAMES[m.source]
}

/** Group order: the apps in workspace order, then blended ones, then custom metrics. */
export function groupRank(m: Metric): number {
  if (m.custom) return 1000
  if (m.alsoFrom) return 900
  return APP_ORDER.indexOf(m.source)
}

/** Where a query matches a metric: the name (with the matched span), a short form, the app or the definition (AC-13). */
export function matchOf(m: Metric, query: string): { at: number; length: number } | null | false {
  const q = query.trim().toLowerCase()
  if (!q) return null
  const at = m.label.toLowerCase().indexOf(q)
  if (at >= 0) return { at, length: q.length }
  if (SHORT[m.id]?.startsWith(q)) return null
  if (SOURCE_NAMES[m.source].toLowerCase().includes(q) || (m.alsoFrom && SOURCE_NAMES[m.alsoFrom].toLowerCase().includes(q))) return null
  if (m.definition?.toLowerCase().split(/\W+/).some((w) => w.startsWith(q))) return null
  return false
}

/** "Revenue", "Revenue and Orders", "Revenue, Orders and AOV": names in a sentence (AC-11). */
export function nameList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}
