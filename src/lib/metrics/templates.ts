// Starter metrics people ask for by name, built from metrics the catalog already has. Each one is checked
// against this workspace's catalog: ready to add, already there, missing an input, or waiting on data no
// connected app sends (contribution margin needs product cost).

import type { CustomMetric, Expression, MetricEntry, Unit } from '@/lib/api/warehouse-schemas'
import { parseFormula } from './formula'

export interface MetricTemplate {
  id: string
  /** The metric's permanent key once added. */
  name: string
  label: string
  /** The short form on a chip: "MER". */
  short: string
  unit: Unit
  description: string
  /** As typed: "revenue / ad_spend". */
  formula: string
  /** Data no connected app sends yet; the template can't be built until it does. */
  blockedBy?: string
}

export const TEMPLATES: readonly MetricTemplate[] = [
  {
    id: 'avg_discount_per_order', name: 'avg_discount_per_order', short: 'Avg discount per order', label: 'Average discount per order', unit: 'money',
    description: 'Discounts given for every order, on average. Rising means each sale costs more margin.',
    formula: 'discounts / orders',
  },
  {
    id: 'mer', name: 'mer', short: 'MER', label: 'Marketing efficiency ratio', unit: 'ratio',
    description: 'Store revenue for every dollar of ad spend, across every channel. Also called blended ROAS.',
    formula: 'revenue / ad_spend',
  },
  {
    id: 'ncac', name: 'ncac', short: 'nCAC', label: 'New customer acquisition cost', unit: 'money',
    description: 'Ad spend for every new customer. What it costs to grow the customer base.',
    formula: 'ad_spend / new_customers',
  },
  {
    id: 'blended_cpa', name: 'blended_cpa', short: 'Blended CPA', label: 'Blended cost per order', unit: 'money',
    description: 'Ad spend for every order, whether or not an ad gets the credit.',
    formula: 'ad_spend / orders',
  },
  {
    id: 'ad_spend_share', name: 'ad_spend_share', short: 'Ad spend share', label: 'Ad spend as a share of revenue', unit: 'percent',
    description: 'How much of each dollar of revenue goes back into ads.',
    formula: 'ad_spend / revenue',
  },
  {
    id: 'revenue_after_ads', name: 'revenue_after_ads', short: 'Revenue after ads', label: 'Revenue after ad spend', unit: 'money',
    description: 'Revenue left once ad spend is paid. Product, shipping and fees are not taken out yet.',
    formula: 'revenue - ad_spend',
  },
  {
    id: 'message_revenue_share', name: 'message_revenue_share', short: 'Email & SMS share', label: 'Email and SMS share of revenue', unit: 'percent',
    description: 'The part of revenue that email and SMS messages are credited with.',
    formula: 'message_attributed_revenue / revenue',
  },
  {
    id: 'shipping_share', name: 'shipping_share', short: 'Shipping share', label: 'Shipping share of revenue', unit: 'percent',
    description: 'Shipping charged to customers as a share of revenue.',
    formula: 'shipping_revenue / revenue',
  },
  {
    id: 'cm1', name: 'contribution_margin_1', short: 'CM1', label: 'Contribution margin 1', unit: 'money',
    description: 'Net sales minus the cost of the products sold.',
    formula: 'net_sales - product_cost',
    blockedBy: 'product cost',
  },
  {
    id: 'cm2', name: 'contribution_margin_2', short: 'CM2', label: 'Contribution margin 2', unit: 'money',
    description: 'CM1 minus shipping, fulfilment and payment costs.',
    formula: 'contribution_margin_1 - fulfilment_cost',
    blockedBy: 'product cost and fulfilment cost',
  },
  {
    id: 'cm3', name: 'contribution_margin_3', short: 'CM3', label: 'Contribution margin 3', unit: 'money',
    description: 'CM2 minus ad spend: what each period actually contributes.',
    formula: 'contribution_margin_2 - ad_spend',
    blockedBy: 'product cost and fulfilment cost',
  },
]

/** A template's formula as the warehouse's expression. Template formulas are fixed text checked by tests. */
export function templateValue(template: MetricTemplate): Expression | null {
  const parsed = parseFormula(template.formula)
  return parsed.ok ? parsed.value : null
}

export function templateInputs(template: MetricTemplate): string[] {
  const parsed = parseFormula(template.formula)
  return parsed.ok ? parsed.names : []
}

export type TemplateStatus =
  | { state: 'ready' }
  /** A metric with this name is already in the library. */
  | { state: 'exists'; name: string }
  /** The catalog lacks an input. */
  | { state: 'missing'; inputs: string[] }
  /** Needs data no connected app sends. */
  | { state: 'blocked'; reason: string }
  /** Every input exists, but this store can't measure one of them. */
  | { state: 'no-data'; input: string }

export interface TemplateOption {
  template: MetricTemplate
  status: TemplateStatus
}

/** Each template judged against this workspace's catalog and, when given, the inputs the store can't measure. */
export function templatesFor(catalog: readonly Pick<MetricEntry, 'name'>[], unmeasurable: ReadonlySet<string> = new Set()): TemplateOption[] {
  const names = new Set(catalog.map(entry => entry.name))
  return TEMPLATES.map(template => {
    if (template.blockedBy !== undefined) {
      return { template, status: { state: 'blocked', reason: `Needs ${template.blockedBy}, which no connected app sends yet.` } }
    }
    if (names.has(template.name)) return { template, status: { state: 'exists', name: template.name } }
    const inputs = templateInputs(template)
    const missing = inputs.filter(input => !names.has(input))
    if (missing.length > 0) return { template, status: { state: 'missing', inputs: missing } }
    const cannot = inputs.find(input => unmeasurable.has(input))
    if (cannot !== undefined) return { template, status: { state: 'no-data', input: cannot } }
    return { template, status: { state: 'ready' } }
  })
}

/** The metric a template adds, ready to preview and put. Unchecked until someone confirms it. */
export function metricFromTemplate(template: MetricTemplate): CustomMetric | null {
  const value = templateValue(template)
  if (value === null) return null
  return { name: template.name, label: template.label, unit: template.unit, description: template.description, value, verified: false }
}
