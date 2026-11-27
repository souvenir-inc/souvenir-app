// "What moved it" on a metric page (the test app's diagnose board, `?focus=<metric>`): the metric's inputs, so
// you can see which one moved. A metric built from others uses its own formula's metrics first; a library metric
// counted from a table uses the numbers that usually move it, listed below. Names come from the URL and the
// catalog, so the list is a Map (JS-1).

import type { MetricEntry } from '@/lib/api/warehouse-schemas'
import { CUSTOM_CATEGORY } from './display'

/** What each library metric is made of, most telling first. Lists run long so a store that can't measure one still gets enough. */
export const BUILT_IN_INPUTS: ReadonlyMap<string, readonly string[]> = new Map([
  // Store
  ['revenue', ['orders', 'aov', 'new_customers', 'discounts', 'refunds', 'shipping_revenue']],
  ['orders', ['new_customers', 'cancelled_orders', 'platform_purchases', 'clicks', 'aov', 'revenue']],
  ['aov', ['revenue', 'orders', 'discount_rate', 'shipping_revenue', 'discounts']],
  ['net_revenue', ['revenue', 'refunds', 'discounts', 'taxes']],
  ['net_sales', ['gross_sales', 'discounts', 'refunds', 'shipping_revenue']],
  ['gross_sales', ['orders', 'aov', 'discounts', 'refunds']],
  ['new_customers', ['orders', 'ad_spend', 'clicks', 'platform_purchases']],
  ['revenue_per_customer', ['revenue', 'new_customers', 'orders', 'aov']],
  ['refund_rate', ['refunds', 'refund_count', 'revenue', 'orders']],
  ['refunds', ['refund_count', 'orders', 'revenue', 'refund_rate']],
  ['discount_rate', ['discounts', 'gross_sales', 'orders', 'aov']],
  ['discounts', ['discount_rate', 'orders', 'gross_sales', 'revenue']],
  ['cancellation_rate', ['cancelled_orders', 'orders', 'revenue', 'refund_rate']],
  ['cancelled_orders', ['orders', 'cancellation_rate', 'refund_count', 'revenue']],
  // Ads
  ['ad_spend', ['impressions', 'cpm', 'clicks', 'cpc']],
  ['platform_roas', ['platform_purchase_value', 'ad_spend', 'platform_purchases', 'platform_cpa']],
  ['platform_cpa', ['ad_spend', 'platform_purchases', 'cpc', 'platform_conversion_rate']],
  ['ctr', ['clicks', 'impressions', 'frequency', 'reach']],
  ['cpc', ['ad_spend', 'clicks', 'ctr', 'cpm']],
  ['cpm', ['ad_spend', 'impressions', 'reach', 'frequency']],
])

export const MAX_INPUTS = 4
/** Spare candidates measured alongside, so an input the store can't measure is replaced, not shown empty. */
export const MAX_CANDIDATES = 8

export interface InputsOptions {
  /** The metrics the metric's own formula uses, when it has one. */
  formulaInputs?: readonly string[]
  /** Catalog entries by name: an input the catalog doesn't have is skipped. */
  catalog: ReadonlyMap<string, Pick<MetricEntry, 'name' | 'category'>>
  /** Areas the store's connected apps fill: an input from an area nothing fills is skipped. */
  areas: ReadonlySet<string>
  max?: number
}

/** The inputs for a metric, in order: in the catalog, from a connected area, at most `max`. */
export function inputsFor(metric: string, { formulaInputs = [], catalog, areas, max = MAX_CANDIDATES }: InputsOptions): string[] {
  const proposed = [...formulaInputs, ...(BUILT_IN_INPUTS.get(metric) ?? [])]
  const out: string[] = []
  for (const name of proposed) {
    if (name === metric || out.includes(name)) continue
    const entry = catalog.get(name)
    if (!entry) continue
    if (entry.category !== CUSTOM_CATEGORY && !areas.has(entry.category)) continue
    out.push(name)
    if (out.length === max) break
  }
  return out
}

/** The first `max` candidates the store can measure, once the warehouse said which it can't; before, the first `max`. */
export function pickAvailable(candidates: readonly string[], unmeasurable: ReadonlySet<string> | undefined, max = MAX_INPUTS): string[] {
  return (unmeasurable ? candidates.filter(name => !unmeasurable.has(name)) : candidates).slice(0, max)
}
