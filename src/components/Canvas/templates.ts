// Board templates by role (Canvas PRD, flow 6). A template shows your own numbers before you use it, and leaves out
// cards your apps can't fill: a metric from an app that isn't connected is left out with an offer to connect it; a
// metric the store can't measure, or that isn't in the catalog, is left out quietly. Once used, the board is yours:
// changing it never changes the template.

import type { MetricEntry } from '@/lib/api/warehouse'
import { createCard, type Board, type CardSize } from './board'
import type { Unavailable } from './metrics'

export type TemplateId = 'founder' | 'store' | 'ads' | 'ops' | 'finance' | 'agency'

export interface BoardTemplate {
  id: TemplateId
  name: string
  /** Who it's for: "Founder or CEO". */
  forWho: string
  /** Its cards, in order: the headline across the top, the rest as numbers. */
  metrics: ReadonlyArray<string>
}

/**
 * The templates, as the PRD lists them, in catalog names. Some PRD metrics aren't in the catalog yet (contribution
 * margin, CAC, sessions, the store's conversion rate) and drop out until they are. "Fulfilment costs" are shipping,
 * processing fees and return labels, the costs the contribution-margin ladder uses.
 */
export const TEMPLATES: ReadonlyArray<BoardTemplate> = [
  { id: 'founder', name: 'Founder', forWho: 'Founder or CEO',
    metrics: ['revenue', 'contribution_margin', 'mer', 'new_customers', 'aov'] },
  { id: 'store', name: 'Store', forWho: 'Head of e-commerce',
    metrics: ['revenue', 'orders', 'conversion_rate', 'aov', 'sessions'] },
  { id: 'ads', name: 'Paid ads', forWho: 'Growth or ads lead',
    metrics: ['ad_spend', 'mer', 'platform_roas', 'cac', 'new_customers'] },
  { id: 'ops', name: 'Ops', forWho: 'Ops lead',
    metrics: ['orders', 'refunds', 'cancelled_orders', 'shipping_cost'] },
  { id: 'finance', name: 'Finance', forWho: 'Finance or fractional CFO',
    metrics: ['net_sales', 'discounts', 'refunds', 'shipping_cost', 'processing_fees', 'return_label_cost', 'contribution_margin'] },
  { id: 'agency', name: 'Agency client', forWho: 'Agency',
    metrics: ['ad_spend', 'platform_roas', 'ctr', 'cpm'] },
]

/** Every metric any template uses, for the one request that tells which the store can measure. */
export const TEMPLATE_METRICS: ReadonlyArray<string> = [...new Set(TEMPLATES.flatMap(t => t.metrics))]

/** Areas that aren't an app of their own: a blended metric reads several apps, a custom one is the workspace's. */
const NOT_AN_APP = new Set(['blended', 'custom'])

export interface TemplateResult {
  /** The board as it would be made, with your numbers once it's drawn. */
  board: Board
  /** Areas (catalog categories) whose app isn't connected, so their cards were left out: offer to connect them. */
  missingApps: string[]
}

/**
 * A template as a board for this store. The first metric that makes it is the headline (full width, with its trend
 * beside it); the rest are numbers.
 */
export function templateBoard(
  template: BoardTemplate,
  catalog: ReadonlyMap<string, Pick<MetricEntry, 'category'>>,
  synced: ReadonlySet<string>,
  unavailable: Unavailable | undefined,
  id: string,
): TemplateResult {
  const missingApps: string[] = []
  const kept: string[] = []
  for (const metric of template.metrics) {
    const entry = catalog.get(metric)
    if (!entry) continue
    if (!synced.has(entry.category) && !NOT_AN_APP.has(entry.category)) {
      if (!missingApps.includes(entry.category)) missingApps.push(entry.category)
      continue
    }
    if (unavailable && metric in unavailable) continue
    kept.push(metric)
  }
  const cards = kept.map((metric, i) => {
    const size: CardSize = i === 0 ? '12x1' : '3x1'
    return createCard(metric, 'number', { id: `${id}-${metric}`, size })
  })
  return { board: { id, name: template.name, cards }, missingApps }
}
