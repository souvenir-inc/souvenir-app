import { describe, expect, it } from 'vitest'
import type { MetricEntry } from '@/lib/api/warehouse'
import { countLine, filterTable, groupTable, NO_TABLE_FILTER, optionsOf, tableRows, toCsv } from './library-table'

const entry = (name: string, category: string, extra: Partial<MetricEntry> & { verified?: boolean; createdBy?: string | null } = {}) =>
  ({ name, label: name.replace(/_/g, ' '), unit: 'money', description: `${name} described`, category, ...extra }) as MetricEntry

const entries = [
  entry('net_sales', 'store', { verified: true }),
  entry('orders', 'store'),
  entry('ad_spend', 'ads'),
  entry('blended_roas', 'custom', { verified: false, createdBy: 'google-oauth2|123' }),
]

const workspace = {
  connectors: ['shopify', 'metaads'],
  connections: [
    { connectionId: 'a', connectorSlug: 'shopify', name: 'Shopify', feeds: [{ category: 'store', status: 'ready', error: null, lastSyncedAt: null }] },
    { connectionId: 'b', connectorSlug: 'metaads', name: 'Meta Ads', feeds: [{ category: 'ads', status: 'ready', error: null, lastSyncedAt: null }] },
  ],
}

describe('library table', () => {
  const rows = tableRows(entries, workspace, id => (id === 'google-oauth2|123' ? 'Maya Chen' : undefined))

  it('reads status, maker and apps from the catalog and the workspace', () => {
    expect(rows.map(row => row.status)).toEqual(['confirmed', 'confirmed', 'confirmed', 'proposed'])
    expect(rows[0].creator).toEqual({ kind: 'souvenir', name: 'Souvenir' })
    expect(rows[3].creator).toEqual({ kind: 'person', name: 'Maya Chen' })
    expect(rows[2].apps).toEqual([{ slug: 'metaads', name: 'Meta Ads' }])
    expect(rows[0].updated).toBeNull()
  })

  it('never shows a raw login id', () => {
    const [row] = tableRows([entry('x', 'custom', { createdBy: 'auth0|999' })], workspace)
    expect(row.creator.name).toBe('A teammate')
  })

  it('widens inside a filter and narrows across filters', () => {
    expect(filterTable(rows, { ...NO_TABLE_FILTER, area: ['store', 'ads'] })).toHaveLength(3)
    expect(filterTable(rows, { ...NO_TABLE_FILTER, area: ['store', 'ads'], app: ['metaads'] }).map(row => row.name)).toEqual(['ad_spend'])
    expect(filterTable(rows, { ...NO_TABLE_FILTER, query: 'blended' }).map(row => row.name)).toEqual(['blended_roas'])
  })

  it('counts each option against the other filters', () => {
    const status = optionsOf(rows, { ...NO_TABLE_FILTER, area: ['store'] }, 'status')
    expect(status.map(option => `${option.label} ${option.count}`)).toEqual(['Confirmed 2', 'Proposed 0', 'Retired 0'])
  })

  it('groups by area, maker or app', () => {
    expect(groupTable(rows, 'area').map(group => `${group.id} ${group.rows.length}`)).toContain('store 2')
    expect(groupTable(rows, 'creator').map(group => group.title)).toEqual(['Maya Chen', 'Souvenir'])
    expect(groupTable(rows, 'app').at(-1)?.title).toBe('No app')
    expect(groupTable(rows, 'none')).toHaveLength(1)
  })

  it('writes the count line and a CSV', () => {
    expect(countLine(rows, 4, false)).toBe('4 metrics • 1 custom • 1 proposed')
    expect(countLine(rows, 2, true)).toBe('2 of 4 metrics')
    expect(toCsv(rows.slice(0, 1)).split('\n')[1]).toBe('net sales,net_sales described,Store,Confirmed,Souvenir,Shopify')
  })
})

describe('data rules', () => {
  it('reads the order rules the definitions apply, through the metrics built on them', async () => {
    const { dataRules, syncLine } = await import('./data-rules')
    const catalog = [
      entry('orders', 'store', { value: { kind: 'count', table: 'orders', column: null, day: 'placed_at', where: "cancelled_at is null and is_sale and order_type <> 'test'" } } as Partial<MetricEntry>),
      entry('refunds', 'store', { value: { kind: 'sum', table: 'refunds', column: 'amount', day: 'refunded_at', where: null } } as Partial<MetricEntry>),
      entry('aov', 'store', { value: { op: 'ratio', numerator: 'revenue', denominator: 'orders' } } as Partial<MetricEntry>),
    ]
    const rules = dataRules(catalog)
    expect(rules.map(rule => rule.id)).toEqual(['test', 'cancelled', 'not-sale'])
    expect(rules[1].metrics.map(metric => metric.name)).toEqual(['orders', 'aov'])
    expect(dataRules([entry('sold', 'store', { value: { kind: 'count', table: 'orders', column: null, day: 'placed_at', where: 'is_sale' } } as Partial<MetricEntry>)]).map(rule => rule.id)).toEqual(['test', 'not-sale'])
    expect(syncLine('ready', '2026-11-25T10:00:00Z', Date.parse('2026-11-25T10:03:00Z'))).toBe('Up to date • Synced 3 min ago')
    expect(syncLine('syncing', null)).toBe('Syncing…')
  })
})
