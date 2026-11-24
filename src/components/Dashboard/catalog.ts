// The Add cards picker's catalog (docs-v2/dashboard/06-add-cards-rules.md): roles, short forms, and
// how metrics group by app. The metrics are the warehouse's library (live/metrics.ts).

import type { Apps } from './live/apps'
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

/** Metrics by role, in the order the rail lists them. A metric can sit under several roles. */
export const ROLE_METRICS: Record<string, string[]> = {
  founder: ['revenue', 'net_sales', 'orders', 'aov', 'new_customers', 'revenue_per_customer', 'mer', 'ad_spend', 'contribution', 'site_sessions', 'site_conversion_rate'],
  ecommerce: ['revenue', 'orders', 'aov', 'site_conversion_rate', 'site_sessions', 'new_customers', 'cancellation_rate', 'refund_rate', 'return_rate', 'discount_rate'],
  growth: ['ad_spend', 'platform_roas', 'platform_cpa', 'cac', 'ctr', 'cpc', 'cpm', 'impressions', 'clicks', 'reach', 'frequency', 'platform_conversion_rate', 'mer'],
  ops: ['orders', 'shipping_cost', 'shipping_cost_per_order', 'refund_rate', 'cancellation_rate', 'return_rate', 'tickets_opened', 'tickets_per_order'],
  finance: ['revenue', 'gross_sales', 'net_sales', 'net_revenue', 'discounts', 'refunds', 'contribution', 'contribution_after_ads', 'discount_rate', 'processing_fees', 'payouts_paid'],
  agency: ['ad_spend', 'platform_roas', 'mer', 'platform_cpa', 'ctr', 'cpm', 'revenue', 'new_customers'],
}

/** Short forms search understands (AC-13). */
const SHORT: Record<string, string> = {
  aov: 'aov', platform_roas: 'roas', mer: 'mer', ctr: 'ctr', cpa: 'cpa', platform_cpa: 'cpa', cpc: 'cpc', cpm: 'cpm', cac: 'cac',
}

/** Every metric the picker offers, A–Z. */
export const catalogOf = (metrics: Metric[]): Metric[] => [...metrics].sort((a, b) => a.label.localeCompare(b.label))

/** A new card's size (AC-16): sums and counts 6 × 1, rates and multiples 3 × 1. */
export const landingSize = (m: Metric): CardSize => (m.sum ? 'md' : 'sm')

/** The app group a metric sits in: its app, the apps it blends, or Custom metrics (AC-10). */
export function groupOf(m: Metric, apps: Apps): string {
  if (m.custom) return 'Custom metrics'
  if (!m.apps.length) return 'Not connected'
  return m.apps.map((id) => apps.name(id)).join(' + ')
}

/** Group order: the apps in workspace order, then blended ones, then custom, then the ones no app feeds. */
export function groupRank(m: Metric, apps: Apps): number {
  if (m.custom) return 1000
  if (!m.apps.length) return 2000
  if (m.apps.length > 1) return 900
  return apps.rank(m.apps[0])
}

/** Where a query matches a metric: the name (with the matched span), a short form, the app or the definition (AC-13). */
export function matchOf(m: Metric, query: string, apps: Apps): { at: number; length: number } | null | false {
  const q = query.trim().toLowerCase()
  if (!q) return null
  const at = m.label.toLowerCase().indexOf(q)
  if (at >= 0) return { at, length: q.length }
  if (SHORT[m.id]?.startsWith(q)) return null
  if (m.apps.some((id) => apps.name(id).toLowerCase().includes(q))) return null
  if (m.definition.toLowerCase().split(/\W+/).some((w) => w.startsWith(q))) return null
  return false
}

/** "Revenue", "Revenue and Orders", "Revenue, Orders and AOV": names in a sentence (AC-11). */
export function nameList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}
