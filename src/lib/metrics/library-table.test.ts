import { describe, expect, it } from 'vitest'
import type { MetricEntry } from '@/lib/api/warehouse-schemas'
import { countLine, filterTable, groupTable, initials, NO_TABLE_FILTER, optionsOf, tableRows, type App } from './library-table'

const entry = (name: string, category: string, extra: Partial<MetricEntry> = {}): MetricEntry => ({
  name, label: name.replace(/_/g, ' '), unit: 'money', description: `${name} described`, category,
  value: { kind: 'count', table: 'orders', column: null, day: 'placed_at', where: null },
  overridden: false, createdBy: null, status: 'confirmed', version: 1, updatedBy: null, updatedAt: null, confirmedBy: null, confirmedAt: null, replacement: null, reason: null, ...extra,
})

const entries = [
  entry('net_sales', 'store'),
  entry('orders', 'store', { overridden: true }),
  entry('ad_spend', 'ads'),
  entry('blended_roas', 'custom', { status: 'proposed', createdBy: 'google-oauth2|123' }),
]

const APPS = new Map<string, App[]>([['store', [{ slug: 'shopify', name: 'Shopify' }]], ['ads', [{ slug: 'metaads', name: 'Meta Ads' }]]])
const appsOf = (category: string) => APPS.get(category) ?? []

describe('library table', () => {
  const rows = tableRows(entries, appsOf, id => (id === 'google-oauth2|123' ? 'Maya Chen' : undefined))

  it('reads status, maker, origin and apps from the catalog', () => {
    expect(rows.map(row => row.status)).toEqual(['confirmed', 'confirmed', 'confirmed', 'proposed'])
    expect(rows.map(row => row.origin)).toEqual(['builtin', 'adjusted', 'builtin', 'custom'])
    expect(rows[0].creator).toEqual({ kind: 'souvenir', name: 'Souvenir' })
    expect(rows[3].creator).toEqual({ kind: 'person', name: 'Maya Chen' })
    expect(rows[2].apps).toEqual([{ slug: 'metaads', name: 'Meta Ads' }])
  })

  it('never shows a raw login id', () => {
    const [row] = tableRows([entry('x', 'custom', { createdBy: 'auth0|999' })], appsOf)
    expect(row.creator.name).toBe('A teammate')
  })

  it('widens inside a filter and narrows across filters', () => {
    expect(filterTable(rows, { ...NO_TABLE_FILTER, area: ['store', 'ads'] })).toHaveLength(3)
    expect(filterTable(rows, { ...NO_TABLE_FILTER, area: ['store', 'ads'], app: ['metaads'] }).map(row => row.name)).toEqual(['ad_spend'])
    expect(filterTable(rows, { ...NO_TABLE_FILTER, query: 'blended' }).map(row => row.name)).toEqual(['blended_roas'])
  })

  it('counts each option against the other filters, keeping a picked option at 0', () => {
    const status = optionsOf(rows, { ...NO_TABLE_FILTER, area: ['store'] }, 'status')
    expect(status.map(option => `${option.label} ${option.count}`)).toEqual(['Confirmed 2', 'Proposed 0'])
  })

  it('handles areas and makers named like built-in properties', () => {
    const odd = tableRows([entry('a', '__proto__'), entry('b', 'constructor', { createdBy: 'toString' })], appsOf)
    expect(optionsOf(odd, NO_TABLE_FILTER, 'area').map(option => option.count)).toEqual([1, 1])
    expect(groupTable(odd, 'area').map(group => group.rows.length)).toEqual([1, 1])
    expect(odd[1].creator.name).toBe('toString')
  })

  it('groups by area, maker or app', () => {
    expect(groupTable(rows, 'area').map(group => `${group.title} ${group.rows.length}`)).toEqual(['Store 2', 'Ads 1', 'Custom 1'])
    expect(groupTable(rows, 'creator').map(group => group.title)).toEqual(['Maya Chen', 'Your team', 'Souvenir'])
    expect(groupTable(rows, 'app').at(-1)?.title).toBe('No app')
    expect(groupTable(rows, 'none')).toHaveLength(1)
  })

  it('writes the count line and initials', () => {
    expect(countLine(rows, 4, false)).toBe('4 metrics • 1 custom • 1 proposed')
    expect(countLine(rows, 2, true)).toBe('2 of 4 metrics')
    expect(initials('Maya Chen')).toBe('MC')
    expect(initials('')).toBe('?')
  })
})
