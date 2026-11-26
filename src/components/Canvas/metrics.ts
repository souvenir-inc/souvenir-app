// How a catalog metric reads on a card (its format, which way is good) and the starter board built from
// what the store has connected. The catalog carries only a unit, so the extra meaning here is a small,
// named set of rules; the build notes ask for it in the catalog itself.

import type { MetricEntry, Workspace } from '@/lib/api/warehouse'
import { appsFor } from '@/lib/metrics/display'
import { buildTree, namesIn, type MetricValue } from '@/lib/metrics/tree'
import type { ValueFormat } from '@/components/charts/format'
import { createCard, type Board, type BoardCard, type CardKind, type CardSize } from './board'

/** Same rule as the metric library: a return on spend reads as a multiple (3.2x), not 320%. */
const MULTIPLE = /(^|_)(roas|mer)$/
/** Ratios that are averages per person, not shares: "1.8 impressions each". */
const PLAIN_MULTIPLE = new Set(['frequency'])

export function valueFormatOf(entry: Pick<MetricEntry, 'name' | 'unit'> | undefined): ValueFormat {
  if (!entry) return 'count'
  if (entry.unit === 'ratio' && (MULTIPLE.test(entry.name) || PLAIN_MULTIPLE.has(entry.name))) return 'multiple'
  return entry.unit
}

export type Polarity = 'higher' | 'lower' | 'neutral'

/** Spend and pass-through money move with the plan; a rise is neither good nor bad on its own. */
const NEUTRAL = new Set(['ad_spend', 'taxes', 'frequency', 'messages_sent'])

/** Costs, losses and leakage. Same list as the scorecard's default direction; the catalog should carry it (G3). */
const LOWER_IS_BETTER = new Set([
  'refund_rate', 'discount_rate', 'cancellation_rate', 'refunds', 'refund_count', 'cancelled_orders', 'discounts',
  'cpc', 'cpm', 'platform_cpa', 'unsubscribe_rate', 'bounce_rate', 'unsubscribes', 'bounces',
])

/** Which way is good, so a change is coloured honestly (a falling refund rate is good news). */
export function polarityOf(name: string): Polarity {
  if (NEUTRAL.has(name)) return 'neutral'
  return LOWER_IS_BETTER.has(name) ? 'lower' : 'higher'
}

export type ChangeTone = 'good' | 'bad' | 'flat'

/** Whether a change (in percent) is good, bad or nothing to colour. */
export function toneOfChange(change: number | null, polarity: Polarity): ChangeTone {
  if (change === null || Math.abs(change) < 0.05 || polarity === 'neutral') return 'flat'
  const up = change > 0
  return (up && polarity === 'higher') || (!up && polarity === 'lower') ? 'good' : 'bad'
}

// ── Where a card's numbers come from ──────────────────────────────────────────────────────────────────

/**
 * The synced areas (workspace categories) a metric's numbers come from: its own category when the workspace syncs it;
 * otherwise (a blended metric like MER, or a custom one) the areas of the metrics its formula reads, from the
 * catalog's formula or one saved on this device. Empty when there's no way to tell.
 */
export function sourceCategories(
  metric: string,
  catalog: ReadonlyMap<string, Pick<MetricEntry, 'category' | 'value'>>,
  synced: ReadonlySet<string>,
  savedValue: (name: string) => MetricValue | null | undefined = () => null,
): string[] {
  const entry = catalog.get(metric)
  if (!entry) return []
  if (synced.has(entry.category)) return [entry.category]
  const lookup = (name: string) => catalog.get(name)?.value ?? savedValue(name) ?? null
  if (!lookup(metric)) return []
  const areas = namesIn(buildTree(metric, lookup))
    .map(name => catalog.get(name)?.category)
    .filter((category): category is string => category !== undefined && synced.has(category))
  return [...new Set(areas)]
}

/** One connected app that feeds a card, by its connector slug and name ("shopify_app", "Shopify"). */
export interface CardSource {
  slug: string
  name: string
}

/** Shopify's slugs: drawn with Home's own Shopify mark, no logo to fetch. */
export const SHOPIFY_SLUGS: ReadonlySet<string> = new Set(['shopify', 'shopify_app'])

/**
 * The connected apps that feed some areas (catalog categories), one per app: the workspace's connectors, matched
 * to areas by the Metric library's `appsFor`, so both pages name the same sources.
 */
export function sourcesFor(categories: readonly string[], connectors: readonly string[]): CardSource[] {
  const out: CardSource[] = []
  for (const category of categories) {
    for (const slug of connectors) {
      const [name] = appsFor(category, [slug])
      if (name && !out.some(source => source.name === name)) out.push({ slug, name })
    }
  }
  return out
}

// ── Starter boards: one tab per use case ─────────────────────────────────────────────────────────────

/** A metric a starter row may use, and the kind of card it gets (a metric card unless it says otherwise). */
type PoolPick = string | readonly [string, CardKind]

interface StarterRow {
  size: CardSize
  /** How many cards the row wants: four small fill a row, two medium fill a block. */
  count: number
  /**
   * In order of preference. The row takes the first `count` the store can measure (in the catalog, and not listed
   * as unavailable), so a store without, say, customer data still gets a full row instead of "Not measured" cards.
   */
  pool: readonly PoolPick[]
}

interface StarterTab {
  id: string
  name: string
  /** The source a tab needs connected; null for the store's own overview, which always shows. */
  needs: string | null
  /** Rows of four small cards (just the numbers), then two medium ones (the same card stretched, so it draws its chart). */
  rows: readonly StarterRow[]
}

export const STARTER_BOARD_ID = 'starter'

const STORE_FALLBACKS = ['net_sales', 'gross_sales', 'discount_rate', 'refund_rate', 'items_per_order', 'cancellation_rate']

/** The starter tabs, in order. Store overview always; Growth and Ads when their sources are there. */
const STARTER_TABS: ReadonlyArray<StarterTab> = [
  {
    id: STARTER_BOARD_ID, name: 'Store overview', needs: null,
    rows: [
      { size: '3x1', count: 4, pool: ['revenue', 'orders', 'aov', 'new_customers', ...STORE_FALLBACKS] },
      { size: '6x2', count: 2, pool: ['revenue', ['orders', 'weekly'], 'net_sales', 'gross_sales', 'orders'] },
    ],
  },
  {
    id: 'starter-growth', name: 'Growth', needs: 'store',
    rows: [
      {
        size: '3x1', count: 4,
        pool: ['new_customers', 'revenue_per_customer', 'net_sales', 'discount_rate', 'refund_rate', 'aov', 'gross_sales', 'items_per_order', 'cancellation_rate'],
      },
      { size: '6x2', count: 2, pool: ['new_customers', 'net_sales', 'aov', 'discount_rate', 'gross_sales', 'refund_rate'] },
    ],
  },
  {
    id: 'starter-ads', name: 'Ads', needs: 'ads',
    rows: [
      { size: '3x1', count: 4, pool: ['ad_spend', 'platform_roas', 'platform_cpa', 'ctr', 'platform_purchase_value', 'platform_purchases'] },
      { size: '6x2', count: 2, pool: ['ad_spend', 'platform_roas', 'platform_purchase_value', 'clicks'] },
      { size: '3x1', count: 4, pool: ['clicks', 'impressions', 'cpc', 'cpm', 'reach', 'frequency', 'platform_conversion_rate', 'video_views'] },
    ],
  },
]

export const STARTER_IDS: ReadonlyArray<string> = STARTER_TABS.map(t => t.id)

/** Every metric a starter might use: asked about once, so the starters know which this store can measure. */
export const STARTER_METRICS: ReadonlyArray<string> = [...new Set(
  STARTER_TABS.flatMap(tab => tab.rows.flatMap(row => row.pool.map(pick => (typeof pick === 'string' ? pick : pick[0])))),
)].sort()

/** Metric name → why this store can't measure it, from a measurement's `unavailable`. */
export type Unavailable = Readonly<Record<string, string>>

/** The sources this workspace has: categories it syncs (even if the last sync failed), minus the ones it has nothing for. */
export function connectedSources(workspace: Pick<Workspace, 'categories'>): string[] {
  return workspace.categories.filter(c => c.status !== 'not_applicable').map(c => c.category)
}


function measurable(name: string, known: ReadonlySet<string>, unavailable: Unavailable | undefined): boolean {
  return known.has(name) && !(unavailable && name in unavailable)
}

function cardId(tab: string, metric: string, kind: CardKind, size: CardSize): string {
  return `${tab}-${metric}-${kind}-${size}`
}

function build(tab: StarterTab, known: ReadonlySet<string>, unavailable: Unavailable | undefined): Board {
  const cards: BoardCard[] = []
  const used = new Set<string>()
  for (const row of tab.rows) {
    let taken = 0
    for (const pick of row.pool) {
      if (taken === row.count) break
      const [metric, kind] = typeof pick === 'string' ? [pick, 'number' as CardKind] : pick
      const slot = `${metric}@${row.size}`
      if (used.has(slot) || !measurable(metric, known, unavailable)) continue
      used.add(slot)
      cards.push(createCard(metric, kind, { id: cardId(tab.id, metric, kind, row.size), size: row.size }))
      taken += 1
    }
  }
  return { id: tab.id, name: tab.name, cards }
}

// ── Contribution margin: a fixed ladder ───────────────────────────────────────────────────────────────

export const CM_BOARD_ID = 'starter-contribution-margin'

/**
 * Contribution margin's ladder, row by row: what's left of revenue (net revenue, discounts, refunds), the fulfilment
 * costs CM2 takes off (shipping, processing fees, return labels), then marketing (ad spend, MER). Unlike the other
 * starters it keeps a cost the store can't measure yet: that card reads "No data", so the gap in the ladder shows
 * instead of a number being made up. No COGS card (the catalog has no product-cost metric) and no CM figure.
 */
const CM_LADDER: ReadonlyArray<readonly [string, CardSize]> = [
  ['net_revenue', '6x1'], ['discounts', '3x1'], ['refunds', '3x1'],
  ['shipping_cost', '6x1'], ['processing_fees', '3x1'], ['return_label_cost', '3x1'],
  ['ad_spend', '6x1'], ['mer', '6x1'],
]

/** The Contribution margin board: every ladder metric the catalog has, measurable or not; null if it has none. */
export function contributionMarginBoard(catalog: ReadonlyArray<Pick<MetricEntry, 'name'>>): Board | null {
  const known = new Set(catalog.map(m => m.name))
  const cards = CM_LADDER
    .filter(([metric]) => known.has(metric))
    .map(([metric, size]) => createCard(metric, 'number', { id: cardId(CM_BOARD_ID, metric, 'number', size), size }))
  return cards.length > 0 ? { id: CM_BOARD_ID, name: 'Contribution margin', cards } : null
}

/**
 * The starter tabs this store gets: Store overview always (it's what a board is for, even when the store's category
 * is missing from the list), then Growth and Ads when their sources are connected, then Contribution margin. Growth
 * and Ads rows take the first metrics the store can measure; a tab left with nothing is dropped.
 */
export function starterBoards(
  catalog: ReadonlyArray<Pick<MetricEntry, 'name'>>, workspace: Pick<Workspace, 'categories'>, unavailable?: Unavailable,
): Board[] {
  const known = new Set(catalog.map(m => m.name))
  const sources = new Set(connectedSources(workspace))
  const tabs = STARTER_TABS
    .filter(tab => tab.needs === null || sources.has(tab.needs))
    .map(tab => build(tab, known, unavailable))
    .filter((board, i) => i === 0 || board.cards.length > 0)
  const cm = contributionMarginBoard(catalog)
  return cm ? [...tabs, cm] : tabs
}

/** The first board from the store's connected sources: Store overview. */
export function starterBoard(catalog: ReadonlyArray<Pick<MetricEntry, 'name'>>, workspace: Pick<Workspace, 'categories'>): Board {
  return starterBoards(catalog, workspace)[0]
}

/** A starter tab rebuilt fresh, for "Start over"; null for a board someone made themselves. */
export function starterFor(id: string, catalog: ReadonlyArray<Pick<MetricEntry, 'name'>>, unavailable?: Unavailable): Board | null {
  if (id === CM_BOARD_ID) return contributionMarginBoard(catalog)
  const tab = STARTER_TABS.find(t => t.id === id)
  return tab ? build(tab, new Set(catalog.map(m => m.name)), unavailable) : null
}

/**
 * A saved starter tab with cards the store turns out not to measure (seeded before we knew): each such starter card
 * is swapped for the next metric from its row's pool the store can measure, at the same size and place, so the
 * person's own arrangement stays. Cards they added themselves are left alone. Unchanged boards come back as is.
 */
export function repairStarter(board: Board, catalog: ReadonlyArray<Pick<MetricEntry, 'name'>>, unavailable: Unavailable): Board {
  const tab = STARTER_TABS.find(t => t.id === board.id)
  if (!tab) return board
  const known = new Set(catalog.map(m => m.name))
  const broken = (card: BoardCard) => card.id.startsWith(`${tab.id}-`) && card.metric in unavailable
  if (!board.cards.some(broken)) return board
  const onBoard = new Set(board.cards.filter(c => !broken(c)).map(c => `${c.metric}@${c.size}`))
  const anywhere = new Set(board.cards.filter(c => !broken(c)).map(c => c.metric))
  const cards: BoardCard[] = []
  for (const card of board.cards) {
    if (!broken(card)) { cards.push(card); continue }
    // The row it came from (its id ends with the size it was seeded at), even if the person has resized it since;
    // failing that, any row of the tab.
    const seededAt = card.id.split('-').at(-1)
    const rows = tab.rows.filter(row => row.size === seededAt)
    const pool = (rows.length > 0 ? rows : tab.rows).flatMap(row => row.pool)
    const options = pool
      .map(p => (typeof p === 'string' ? [p, 'number'] as const : p))
      .filter(([metric]) => !onBoard.has(`${metric}@${card.size}`) && measurable(metric, known, unavailable))
    // Something not on the board yet, if there is one; else something not already shown at this size.
    const pick = options.find(([metric]) => !anywhere.has(metric)) ?? options[0]
    if (!pick) continue
    const [metric, kind] = pick
    onBoard.add(`${metric}@${card.size}`)
    anywhere.add(metric)
    cards.push({ ...card, id: cardId(tab.id, metric, kind, card.size), metric, kind })
  }
  return { ...board, cards }
}
