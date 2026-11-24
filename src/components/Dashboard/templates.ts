// New board (docs-v2/dashboard/08-new-board-rules.md): the templates, what a template leaves out in
// this store, and the first visit's starter boards. Pure: the screen passes in the warehouse's
// metrics. Ask the AI drafts on the server (Warehouse.draftBoard).

import { flowCards } from './grid-layout'
import type { Metrics } from './live/metrics'
import type { Board, DashboardState } from './tabs/board-state'
import type { BoardCard, CardSize, Metric } from './types'

export interface TemplateCard { metricId: string; size: CardSize }

export interface Template {
  id: string
  /** The role it's for, as the library lists it. */
  role: string
  /** The board's name once made ("Founder"). */
  name: string
  period: string
  compare: string
  cards: TemplateCard[]
}

const card = (metricId: string, size: CardSize = 'sm'): TemplateCard => ({ metricId, size })

/** The library's templates, your role first (NB-7). Metrics this store can't measure are left out when used (NB-9). */
export const TEMPLATES: Template[] = [
  { id: 'founder', role: 'Founder or CEO', name: 'Founder', period: '7d', compare: 'previous', cards: [
    card('revenue', 'full'), card('contribution'), card('mer'), card('new_customers'), card('aov'),
  ] },
  { id: 'ecommerce', role: 'Head of e-commerce', name: 'Store', period: 'today', compare: 'previous', cards: [
    card('revenue', 'full'), card('orders'), card('aov'), card('new_customers'), card('cancellation_rate'), card('refund_rate'),
  ] },
  { id: 'growth', role: 'Growth or ads lead', name: 'Paid ads', period: 'today', compare: 'previous', cards: [
    card('ad_spend', 'full'), card('platform_roas'), card('mer'), card('cpa'), card('site_conversion_rate'), card('site_sessions'),
  ] },
  { id: 'ops', role: 'Ops lead', name: 'Operations', period: '7d', compare: 'previous', cards: [
    card('orders', 'full'), card('shipping_cost'), card('cancellation_rate'), card('refund_rate'), card('tickets_opened'), card('return_rate'),
  ] },
  { id: 'finance', role: 'Finance or fractional CFO', name: 'Finance', period: '30d', compare: 'previous', cards: [
    card('revenue', 'full'), card('gross_sales'), card('net_sales'), card('discounts'), card('refunds'),
    card('processing_fees'), card('contribution'), card('discount_rate'),
  ] },
  { id: 'agency', role: 'Agency', name: 'Agency client', period: '7d', compare: 'previous', cards: [
    card('ad_spend', 'full'), card('platform_roas'), card('platform_cpa'), card('ctr'), card('cpm'),
  ] },
]

/** The templates shown on an empty board: your role first, then the two nearest (NB-17). */
export const FOR_YOUR_ROLE = ['founder', 'ecommerce', 'growth']

/** A connection feeds it, or it is the workspace's own: it can go on a board (NB-9). */
export const measurable = (m: Metric | undefined): m is Metric => !!m && !m.unmeasured && (m.custom || m.apps.length > 0)

export interface UsedTemplate {
  cards: TemplateCard[]
  /** Metrics this store can't measure, left out quietly (NB-9). */
  leftOut: string[]
}

/** What a template makes in this store (NB-9). */
export function templateFor(cards: TemplateCard[], metrics: Metrics): UsedTemplate {
  const out: UsedTemplate = { cards: [], leftOut: [] }
  for (const c of cards) {
    if (measurable(metrics.get(c.metricId))) out.cards.push(c)
    else out.leftOut.push(c.metricId)
  }
  return out
}

/** Board cards from template cards, laid out by the grid's flow (the template's layout). */
export const toBoardCards = (cards: TemplateCard[]): BoardCard[] => flowCards(cards.map(({ metricId, size }) => ({ metricId, size })))

// ── First visit (NB-31 – NB-33) ──────────────────────────────────────────────────

const STARTERS: { label: string; period: string; cards: TemplateCard[] }[] = [
  { label: 'Store overview', period: '7d', cards: [
    card('aov'), card('orders', 'lg'), card('new_customers'), card('platform_roas'), card('ad_spend'), card('revenue', 'md'),
    card('platform_cpa'), card('ctr'), card('net_sales', 'md'), card('discount_rate'), card('refund_rate'),
  ] },
  { label: 'Growth', period: '30d', cards: [
    card('new_customers', 'full-lg'), card('aov', 'sm-tall'), card('site_conversion_rate', 'sm-tall'), card('cancellation_rate', 'sm-tall'),
    card('refund_rate', 'sm-tall'), card('site_sessions', 'md'), card('orders'), card('revenue'),
  ] },
  { label: 'Ads', period: '7d', cards: [
    card('ad_spend', 'lg'), card('platform_roas'), card('platform_cpa'), card('ctr'), card('cpc'), card('impressions', 'md'), card('clicks', 'md'), card('cpm'),
  ] },
  { label: 'Contribution margin', period: '7d', cards: [
    card('contribution', 'lg'), card('net_sales'), card('discount_rate'), card('refund_rate'), card('shipping_cost'),
    card('processing_fees'), card('return_label_cost'), card('mer'),
  ] },
]

/** Store metrics that stand in for a card this store can't measure (N-11b). */
const FALLBACKS = ['gross_sales', 'cancellation_rate', 'refunds', 'discounts', 'net_revenue', 'taxes']

/**
 * The starter boards for a warehouse with none (NB-32, NB-33): Store overview always, and each other
 * board whose lead metric this store can measure. A card it can't measure gives way to a store one.
 */
export function starterState(metrics: Metrics, newId: () => string, owner: string): DashboardState {
  const boards: Record<string, Board> = {}
  const tabs: string[] = []
  for (const [i, starter] of STARTERS.entries()) {
    if (i > 0 && !measurable(metrics.get(starter.cards[0].metricId))) continue
    const used = new Set(starter.cards.map((c) => c.metricId))
    const fallbacks = FALLBACKS.filter((f) => !used.has(f) && measurable(metrics.get(f)))
    const cards = starter.cards
      .map((c) => (measurable(metrics.get(c.metricId)) ? c : { metricId: fallbacks.shift(), size: 'sm' as CardSize }))
      .filter((c): c is TemplateCard => c.metricId !== undefined)
    const laid = flowCards(cards)
    const id = newId()
    boards[id] = { id, label: starter.label, cards: laid, initialCards: laid, period: starter.period, compare: 'previous', access: 'owner', ownerId: owner, general: 'none', grants: [] }
    tabs.push(id)
  }
  return { boards, tabs, hidden: [], deleted: [], openId: tabs[0] }
}

/** The three examples under Ask the AI's box (NB-20). */
export const AI_EXAMPLES = ['My paid ads every morning', 'Where my margin goes', 'Weekly store check-in']
