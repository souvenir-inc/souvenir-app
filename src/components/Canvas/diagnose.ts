// The diagnose board: where "Open in Boards" from a red on the scorecard lands (`?focus=<metric>`).
// The metric's trend against the previous period leads; its inputs follow as cards, so you can see which one
// moved. Every card follows the dashboard's period picker in the header.
//
// Where inputs come from: a custom metric's own formula (the Metric library keeps the `value` it saved), else
// what each built-in metric is made of. The catalog carries no formulas yet (ask S3); when it does, the
// formula wins here too and the list below stops mattering.

import type { MetricEntry } from '@/lib/api/warehouse'
import { createCard, type Board, type BoardCard } from './board'

/**
 * What each built-in metric is made of: the numbers that move it, most telling first. Lists run past four so a
 * store that can't measure one still gets four inputs (see `pickAvailable`).
 */
export const BUILT_IN_INPUTS: Readonly<Record<string, readonly string[]>> = {
  // Store
  revenue: ['orders', 'aov', 'new_customers', 'discounts', 'refunds', 'shipping_revenue'],
  orders: ['new_customers', 'cancelled_orders', 'platform_purchases', 'clicks', 'aov', 'revenue'],
  aov: ['revenue', 'orders', 'discount_rate', 'shipping_revenue', 'discounts'],
  net_revenue: ['revenue', 'refunds', 'discounts', 'taxes'],
  net_sales: ['gross_sales', 'discounts', 'refunds', 'shipping_revenue'],
  gross_sales: ['orders', 'aov', 'discounts', 'refunds'],
  new_customers: ['orders', 'ad_spend', 'clicks', 'platform_purchases'],
  revenue_per_customer: ['revenue', 'new_customers', 'orders', 'aov'],
  refund_rate: ['refunds', 'refund_count', 'revenue', 'orders'],
  refunds: ['refund_count', 'orders', 'revenue', 'refund_rate'],
  discount_rate: ['discounts', 'gross_sales', 'orders', 'aov'],
  discounts: ['discount_rate', 'orders', 'gross_sales', 'revenue'],
  cancellation_rate: ['cancelled_orders', 'orders', 'revenue', 'refund_rate'],
  cancelled_orders: ['orders', 'cancellation_rate', 'refund_count', 'revenue'],
  // Ads
  ad_spend: ['impressions', 'cpm', 'clicks', 'cpc'],
  platform_roas: ['platform_purchase_value', 'ad_spend', 'platform_purchases', 'platform_cpa'],
  platform_cpa: ['ad_spend', 'platform_purchases', 'cpc', 'platform_conversion_rate'],
  ctr: ['clicks', 'impressions', 'frequency', 'reach'],
  cpc: ['ad_spend', 'clicks', 'ctr', 'cpm'],
  cpm: ['ad_spend', 'impressions', 'reach', 'frequency'],
  // Templates the Metric library offers, in case one was made outside this browser.
  mer: ['revenue', 'ad_spend', 'orders', 'aov'],
  ncac: ['ad_spend', 'new_customers', 'clicks', 'cpc'],
  blended_cpa: ['ad_spend', 'orders', 'cpc', 'ctr'],
}

export const MAX_INPUTS = 4
/** Spare candidates asked for alongside, so an input the store can't measure is replaced, not shown empty. */
export const MAX_CANDIDATES = 8

export interface InputsOptions {
  /** The metric's own formula references, when the Metric library knows them (custom metrics). */
  formulaInputs?: readonly string[] | null
  /** Catalog entries by name: an input the catalog doesn't have is skipped. */
  catalog: ReadonlyMap<string, Pick<MetricEntry, 'name' | 'category'>>
  /** Sources the store has connected: an input from a source it doesn't have is skipped. */
  sources: ReadonlySet<string>
  /** How many to return. Defaults to four. */
  max?: number
}

/** The inputs for a metric, in order: in the catalog, from a connected source, at most `max`. */
export function inputsFor(metric: string, { formulaInputs, catalog, sources, max = MAX_INPUTS }: InputsOptions): string[] {
  const proposed = formulaInputs && formulaInputs.length > 0 ? [...formulaInputs, ...(BUILT_IN_INPUTS[metric] ?? [])] : BUILT_IN_INPUTS[metric] ?? []
  const out: string[] = []
  for (const name of proposed) {
    if (name === metric || out.includes(name)) continue
    const entry = catalog.get(name)
    if (!entry) continue
    if (entry.category !== 'custom' && !sources.has(entry.category)) continue
    out.push(name)
    if (out.length === max) break
  }
  return out
}

/**
 * The first four candidates the store can measure, once the warehouse has said which it can't (`unavailable`
 * from a measurement). Before it answers, the first four, as the likeliest.
 */
export function pickAvailable(candidates: readonly string[], unavailable: Readonly<Record<string, string>> | undefined, max = MAX_INPUTS): string[] {
  return (unavailable ? candidates.filter(name => !(name in unavailable)) : candidates).slice(0, max)
}

/** Sizes that fill whole rows of the 12-column grid: four small and tall (number over sparkline), two medium, one large. */
function inputSize(count: number): BoardCard['size'] {
  if (count === 1) return '12x2'
  if (count === 2) return '6x2'
  return '3x2'
}

/** Three inputs can't fill a row of small cards, so the board shows the two most telling, as medium cards. */
function fitRows(inputs: readonly string[]): readonly string[] {
  return inputs.length === 3 ? inputs.slice(0, 2) : inputs
}

export const DIAGNOSE_BOARD_ID = 'diagnose'

/** The diagnose board for a metric: its trend (large), then its inputs as number cards, all on the dashboard's period. */
export function diagnoseBoard(metric: string, candidates: readonly string[], label: string): Board {
  const inputs = fitRows(candidates)
  const size = inputSize(inputs.length)
  return {
    id: DIAGNOSE_BOARD_ID,
    name: `Diagnose ${label}`,
    cards: [
      createCard(metric, 'trend', { id: `diagnose-${metric}`, size: '12x2', comparison: 'previous' }),
      ...inputs.map(name => createCard(name, 'number', { id: `diagnose-input-${name}`, size, comparison: 'previous' })),
    ],
  }
}
