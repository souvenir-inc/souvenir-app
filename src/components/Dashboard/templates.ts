// New board (docs-v2/dashboard/08-new-board-rules.md): the templates, what a template leaves out or
// needs, the first visit's starter boards, and the stand-in "AI" drafter. Pure, so the rules are
// testable; the screen decides what's connected and passes it in.

import { flowCards } from './grid-layout'
import { METRICS } from './mock-data'
import type { AppId } from './sync/sync-model'
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

/** The library's templates, your role first (NB-7). Metrics a store can't measure are left out when used (NB-9). */
export const TEMPLATES: Template[] = [
  { id: 'founder', role: 'Founder or CEO', name: 'Founder', period: '7d', compare: 'previous', cards: [
    { metricId: 'revenue', size: 'full' }, { metricId: 'contribution-margin', size: 'sm' }, { metricId: 'mer', size: 'sm' },
    { metricId: 'new-customers', size: 'sm' }, { metricId: 'aov', size: 'sm' },
  ] },
  { id: 'ecommerce', role: 'Head of e-commerce', name: 'Store', period: 'today', compare: 'previous', cards: [
    { metricId: 'revenue', size: 'full' }, { metricId: 'orders', size: 'sm' }, { metricId: 'aov', size: 'sm' },
    { metricId: 'returning-rate', size: 'sm' }, { metricId: 'cancellation-rate', size: 'sm' }, { metricId: 'gross-margin', size: 'sm' },
  ] },
  { id: 'growth', role: 'Growth or ads lead', name: 'Paid ads', period: 'today', compare: 'previous', cards: [
    { metricId: 'ad-spend', size: 'full' }, { metricId: 'roas', size: 'sm' }, { metricId: 'mer', size: 'sm' },
    { metricId: 'cpa', size: 'sm' }, { metricId: 'ga-conversion-rate', size: 'sm' }, { metricId: 'ga-sessions', size: 'sm' },
  ] },
  { id: 'ops', role: 'Ops lead', name: 'Operations', period: '7d', compare: 'previous', cards: [
    { metricId: 'orders', size: 'full' }, { metricId: 'shipping-cost', size: 'sm' }, { metricId: 'cancellation-rate', size: 'sm' },
    { metricId: 'refund-rate', size: 'sm' }, { metricId: 'zendesk-tickets', size: 'sm' }, { metricId: 'first-response-time', size: 'sm' },
  ] },
  { id: 'finance', role: 'Finance or fractional CFO', name: 'Finance', period: '30d', compare: 'previous', cards: [
    { metricId: 'revenue', size: 'full' }, { metricId: 'gross-sales', size: 'sm' }, { metricId: 'net-sales', size: 'sm' },
    { metricId: 'cogs', size: 'sm' }, { metricId: 'gross-profit', size: 'sm' }, { metricId: 'processing-fees', size: 'sm' },
    { metricId: 'contribution-margin', size: 'sm' }, { metricId: 'discount-rate', size: 'sm' },
  ] },
  { id: 'agency', role: 'Agency', name: 'Agency client', period: '7d', compare: 'previous', cards: [
    { metricId: 'ad-spend', size: 'full' }, { metricId: 'roas', size: 'sm' }, { metricId: 'cpa', size: 'sm' },
    { metricId: 'ctr', size: 'sm' }, { metricId: 'cpm', size: 'sm' },
  ] },
]

/** The templates shown on an empty board: your role first, then the two nearest (NB-17). */
export const FOR_YOUR_ROLE = ['founder', 'ecommerce', 'growth']

const appsOf = (m: Metric): AppId[] => (m.alsoFrom ? [m.source, m.alsoFrom] : [m.source])

export interface UsedTemplate {
  /** Cards it makes, in order; `needsApp` when an app it reads isn't connected (NB-10, NB-13). */
  cards: (TemplateCard & { needsApp?: AppId })[]
  /** Metrics this store can't measure, left out quietly (NB-9). */
  leftOut: string[]
}

/** What a template makes in this store (NB-9, NB-10). */
export function templateFor(cards: TemplateCard[], isConnected: (app: AppId) => boolean): UsedTemplate {
  const out: UsedTemplate = { cards: [], leftOut: [] }
  for (const c of cards) {
    const m = METRICS[c.metricId]
    if (!m || m.unmeasured) { out.leftOut.push(c.metricId); continue }
    const missing = appsOf(m).find((a) => !isConnected(a))
    out.cards.push(missing ? { ...c, needsApp: missing } : c)
  }
  return out
}

/** The call-out's apps and how many cards need each (NB-10). */
export function appsNeeded(used: UsedTemplate): { app: AppId; count: number }[] {
  const counts = new Map<AppId, number>()
  for (const c of used.cards) if (c.needsApp) counts.set(c.needsApp, (counts.get(c.needsApp) ?? 0) + 1)
  return [...counts].map(([app, count]) => ({ app, count }))
}

/** "2 of these 6 cards need apps you haven't connected" (NB-10). */
export function callOutTitle(needing: number, total: number, apps: number): string {
  if (needing === total) return `Every card in this template needs ${apps === 1 ? 'an app' : 'apps'} you haven’t connected`
  return needing === 1
    ? `1 of these ${total} cards needs an app you haven’t connected`
    : `${needing} of these ${total} cards need apps you haven’t connected`
}

/** Board cards from template cards, laid out by the grid's flow (the template's layout). */
export const toBoardCards = (cards: TemplateCard[]): BoardCard[] => flowCards(cards.map(({ metricId, size }) => ({ metricId, size })))

// ── First visit (NB-31 – NB-33) ──────────────────────────────────────────────────

/** Shopify metrics that stand in for an ad card when no ad app is connected (N-11b). */
const SHOPIFY_FALLBACKS = ['returning-rate', 'gross-sales', 'items-per-order', 'refund-rate', 'cancellation-rate', 'net-sales']

/**
 * The starter boards (NB-32, NB-33): Store overview always, Growth, Ads when an ad app is connected,
 * Contribution margin when its costs can be measured (here: with an ad app). Built from the
 * workspace's own boards, with ad cards swapped for Shopify ones when only Shopify is connected.
 */
export function starterState(full: DashboardState, isConnected: (app: AppId) => boolean): DashboardState {
  const ads = isConnected('meta')
  const ids = ['store-overview', 'growth', ...(ads ? ['ads', 'contribution-margin'] : [])]
  const boards: Record<string, Board> = {}
  for (const id of ids) {
    const b = full.boards[id]
    if (!b) continue
    const used = new Set(b.cards.map((c) => c.metricId))
    const fallbacks = SHOPIFY_FALLBACKS.filter((f) => !used.has(f))
    const cards = b.cards.map((c) => {
      const m = METRICS[c.metricId]
      if (!m || appsOf(m).every(isConnected)) return { metricId: c.metricId, size: c.size }
      return { metricId: fallbacks.shift() ?? 'orders', size: 'sm' as CardSize }
    })
    const laid = flowCards(cards)
    boards[id] = { ...b, cards: laid, initialCards: laid }
  }
  return { boards, tabs: ids, hidden: [], deleted: [], openId: 'store-overview' }
}

// ── The stand-in AI drafter (NB-20 – NB-29) ────────────────────────────────────────

export type DraftResult =
  | { status: 'ready'; name: string; period: string; compare: string; cards: TemplateCard[]; leftOut: string[] }
  | { status: 'empty'; reason: string }

const TOPICS: { test: RegExp; name: string; cards: TemplateCard[] }[] = [
  { test: /\b(ads?|paid|roas|meta|spend)\b/, name: 'Paid ads', cards: [
    { metricId: 'ad-spend', size: 'full' }, { metricId: 'roas', size: 'sm' }, { metricId: 'cpa', size: 'sm' }, { metricId: 'ctr', size: 'sm' }, { metricId: 'mer', size: 'sm' },
  ] },
  { test: /\b(margin|profit|costs?)\b/, name: 'Where my margin goes', cards: [
    { metricId: 'contribution-margin', size: 'full' }, { metricId: 'gross-profit', size: 'sm' }, { metricId: 'cogs', size: 'sm' }, { metricId: 'shipping', size: 'sm' }, { metricId: 'net-sales', size: 'sm' },
  ] },
  { test: /\b(check-?in|store|sales|orders|revenue)\b/, name: 'Store check-in', cards: [
    { metricId: 'revenue', size: 'full' }, { metricId: 'orders', size: 'sm' }, { metricId: 'aov', size: 'sm' }, { metricId: 'new-customers', size: 'sm' }, { metricId: 'returning-rate', size: 'sm' },
  ] },
]

/** Things people ask for that this dummy store can't measure, and why (NB-23, NB-29). */
const NOT_MEASURABLE: { test: RegExp; strip: RegExp; name: string; reason: string }[] = [
  { test: /\bsessions?\b/, strip: /\bsessions?\b/g, name: 'Sessions', reason: 'Sessions, which this store can’t measure yet' },
  { test: /\b(email|open rate)\b/, strip: /\bemail(\s+(revenue|sales))?\b|\bopen rates?\b/g, name: 'Email revenue and open rate', reason: 'Email revenue and open rate need an email app, and none is connected.' },
]

/** Whether a request names a topic of its own (a change that does replaces the draft's topic, NB-24). */
export const hasTopic = (text: string) => TOPICS.some((t) => t.test.test(text.toLowerCase()))

/** A draft from a request (stand-in for the AI): measurable metrics only (NB-23, NB-29). */
export function draftFor(request: string, isConnected: (app: AppId) => boolean): DraftResult {
  const q = request.toLowerCase()
  const missing = NOT_MEASURABLE.filter((n) => n.test.test(q))
  // What it can't measure doesn't pick the topic ("email revenue" isn't a store check-in).
  const rest = missing.reduce((s, n) => s.replace(n.strip, ' '), q)
  const topic = TOPICS.find((t) => t.test.test(rest))
  const pick = topic ?? (missing.length ? null : TOPICS[2])
  if (!pick) return { status: 'empty', reason: missing.map((n) => n.reason).join(' ') }
  const used = templateFor(pick.cards, isConnected)
  const cards = used.cards.filter((c) => !c.needsApp).map(({ metricId, size }) => ({ metricId, size }))
  if (!cards.length) return { status: 'empty', reason: 'The metrics it asks for need apps that aren’t connected.' }
  const period = /\b(morning|today|daily|every day)\b/.test(q) ? 'today' : /\bmonth/.test(q) ? '30d' : '7d'
  const compare = /last year/.test(q) ? 'last-year' : 'previous'
  const cadence = /\bmorning\b/.test(q) ? ', every morning' : /\bmonday\b/.test(q) ? ', every Monday' : ''
  const name = pick === TOPICS[2] && /\bweekly\b/.test(q) ? 'Weekly check-in' : pick.name
  return { status: 'ready', name: `${name}${cadence}`, period, compare, cards, leftOut: missing.map((n) => n.reason) }
}

/** The three examples under the box (NB-20). */
export const AI_EXAMPLES = ['My paid ads every morning', 'Where my margin goes', 'Weekly store check-in']
