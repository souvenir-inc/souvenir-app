// Wire-shaped warehouse answers for tests: a store on Shopify and Meta Ads, no shipping app, one
// custom metric and a scorecard. Shapes follow souvenir-server services/warehouse/schemas.py.

import type { AttachedConnection, ConnectionState, Measurement, MetricEntry, Scorecard } from '@/lib/api/warehouse'
import { Apps } from './apps'
import { Metrics, type Readings } from './metrics'

export const SHOP = '11111111-1111-4111-8111-111111111111'
export const META = '22222222-2222-4222-8222-222222222222'

const synced = '2025-11-14T09:00:00Z'

export const CONNECTIONS: AttachedConnection[] = [
  { connectionId: SHOP, connectorSlug: 'shopify_app', name: 'Shopify', feeds: [
    { category: 'store', status: 'ready', error: null, lastSyncedAt: synced },
    { category: 'ab_testing', status: 'not_applicable', error: 'No tests running', lastSyncedAt: null },
  ] },
  { connectionId: META, connectorSlug: 'metaads', name: 'Meta Ads', feeds: [{ category: 'ads', status: 'ready', error: null, lastSyncedAt: synced }] },
]

const entry = (name: string, label: string, unit: MetricEntry['unit'], category: string, value: MetricEntry['value'], description = ''): MetricEntry =>
  ({ name, label, unit, description, category, value, overridden: false, createdBy: null, verified: true })

const sum = (table: string, column: string) => ({ kind: 'sum' as const, table, column, day: 'placed_at', where: null })
const count = (table: string) => ({ kind: 'count' as const, table, column: null, day: 'placed_at', where: null })

export const CATALOG: MetricEntry[] = [
  entry('revenue', 'Revenue', 'money', 'store', sum('orders', 'total'), 'What customers paid'),
  entry('orders', 'Orders', 'count', 'store', count('orders')),
  entry('aov', 'Average order value', 'money', 'store', { op: 'ratio', numerator: 'revenue', denominator: 'orders' }),
  entry('refund_rate', 'Refund rate', 'percent', 'store', { op: 'ratio', numerator: 'refunds', denominator: 'revenue' }),
  entry('cancellation_rate', 'Cancellation rate', 'percent', 'store', { op: 'ratio', numerator: 'cancelled_orders', denominator: 'orders' }),
  entry('ad_spend', 'Ad spend', 'money', 'ads', sum('ad_insights', 'spend')),
  entry('platform_roas', 'Platform ROAS', 'ratio', 'ads', { op: 'ratio', numerator: 'platform_purchase_value', denominator: 'ad_spend' }),
  entry('platform_cpa', 'Platform CPA', 'money', 'ads', { op: 'ratio', numerator: 'ad_spend', denominator: 'platform_purchases' }),
  entry('mer', 'MER', 'ratio', 'blended', { op: 'ratio', numerator: 'revenue', denominator: 'ad_spend' }),
  entry('shipping_cost', 'Shipping cost', 'money', 'shipping', sum('shipments', 'label_cost')),
  { ...entry('net_after_ads', 'Net after ads', 'money', 'custom', { op: 'subtract', left: 'revenue', right: 'ad_spend' }), createdBy: 'auth0|maker', verified: false },
]

export const SCORECARDS: Scorecard[] = [{
  id: '33333333-3333-4333-8333-333333333333', name: 'Weekly', createdBy: 'auth0|maker', updatedAt: synced,
  rows: [
    { metric: 'revenue', target: 55000, direction: 'up', tolerance: 0.05, owner: null, note: '' },
    { metric: 'refund_rate', target: 0.05, direction: 'down', tolerance: 0, owner: null, note: '' },
  ],
}]

/** Fri 14 Nov 2025; Last 7 days is 8 – 14 Nov, compared with 1 – 7 Nov. */
export const TODAY = new Date(2025, 10, 14)

const days = (from: number, values: (number | null)[], metric: string) =>
  values.map((v, i) => ({ start: `2025-11-${String(from + i).padStart(2, '0')}`, values: { [metric]: v } }))

export const TOTAL: Measurement = {
  grain: 'total', start: '2025-11-08', end: '2025-11-14', timezone: 'America/New_York',
  periods: [{ start: '2025-11-08', values: { revenue: 48200, orders: 558, aov: 86.38, refund_rate: 0.0432, cancellation_rate: 0.018, ad_spend: 15600, platform_roas: 2.6, platform_cpa: 24.1, mer: 3.09, net_after_ads: 32600 } }],
  unavailable: { shipping_cost: 'needs shipments, which no connection in this store fills' },
}

export const TOTAL_BEFORE: Measurement = {
  ...TOTAL, start: '2025-11-01', end: '2025-11-07',
  periods: [{ start: '2025-11-01', values: { revenue: 42880, orders: 526, aov: 81.52, refund_rate: 0.0452, cancellation_rate: 0.018, ad_spend: 14857, platform_roas: 2.52, platform_cpa: 24.64, mer: 2.89, net_after_ads: 28023 } }],
}

export const DAILY: Measurement = {
  grain: 'day', start: '2025-11-08', end: '2025-11-14', timezone: 'America/New_York',
  periods: days(8, [6100, 6400, 7000, 6900, 7300, 7500, 7000], 'revenue'), unavailable: {},
}

/** The comparison week has only two days recorded: mostly empty, so nothing to compare (CR-24). */
export const DAILY_BEFORE: Measurement = {
  ...DAILY, start: '2025-11-01', end: '2025-11-07', periods: days(1, [null, null, null, null, null, 6000, 6200], 'revenue'),
}

export const WEEKLY: Measurement = {
  grain: 'week', start: '2025-10-13', end: '2025-11-14', timezone: 'America/New_York',
  periods: ['2025-10-13', '2025-10-20', '2025-10-27', '2025-11-03', '2025-11-10'].map((start, i) => ({ start, values: { orders: [165, 152, 156, 160, 84][i] } })),
  unavailable: {},
}

export const apps = () => new Apps(CONNECTIONS)

export function readings(over: Partial<Readings> = {}): Readings {
  return {
    catalog: CATALOG, scorecards: SCORECARDS, apps: apps(),
    total: TOTAL, totalBefore: TOTAL_BEFORE, daily: DAILY, dailyBefore: DAILY_BEFORE, weekly: WEEKLY,
    chart: { from: new Date(2025, 10, 8), to: TODAY }, chartBefore: { from: new Date(2025, 10, 1), to: new Date(2025, 10, 7) },
    compare: 'previous', today: TODAY,
    ...over,
  }
}

export const metrics = (over: Partial<Readings> = {}) => new Metrics(readings(over))

export function connectionState(over: Partial<ConnectionState> = {}): ConnectionState {
  return {
    connectionId: SHOP, connectorSlug: 'shopify_app', name: 'Shopify', state: 'up_to_date', error: null,
    lastSyncedAt: synced, syncingSince: null, syncableAt: null, yours: true, ...over,
  }
}
