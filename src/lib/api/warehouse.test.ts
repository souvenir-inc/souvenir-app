import { beforeEach, describe, expect, it, vi } from 'vitest'

const { apiFetchJson, apiFetchVoid } = vi.hoisted(() => ({ apiFetchJson: vi.fn(), apiFetchVoid: vi.fn() }))

vi.mock('./client', async importOriginal => {
  const actual = await importOriginal<typeof import('./client')>()
  return { ...actual, apiFetchJson, apiFetchVoid }
})

import { WAREHOUSE_ENDPOINT } from '@/lib/config'
import { Warehouse } from './warehouse'

const ID = '9f1c2b7e-4d3a-4f6b-9a8e-1c2d3e4f5a6b'
const CONNECTION = '45aaa2ea-0000-4000-8000-000000000000'

const summary = {
  id: ID, name: 'Store', timezone: 'America/New_York',
  connections: [{
    connectionId: CONNECTION, connectorSlug: 'shopify_app', name: 'Shop',
    feeds: [{ category: 'store', status: 'ready', error: null, lastSyncedAt: '2026-11-21T19:48:51.367000Z' }],
  }],
}

describe('Warehouse', () => {
  beforeEach(() => {
    apiFetchJson.mockReset()
    apiFetchVoid.mockReset()
  })

  it('lists the organization warehouses', async () => {
    apiFetchJson.mockResolvedValue([summary])
    const [warehouse] = await Warehouse.list()
    expect(apiFetchJson).toHaveBeenCalledWith(WAREHOUSE_ENDPOINT, { signal: undefined })
    expect(warehouse).toBeInstanceOf(Warehouse)
    expect(warehouse.connections[0].feeds[0].status).toBe('ready')
  })

  it('parses library and custom metric definitions', async () => {
    apiFetchJson.mockResolvedValue([
      {
        name: 'revenue', label: 'Revenue', unit: 'money', description: '', category: 'store',
        value: { kind: 'sum', table: 'orders', column: 'total', day: 'created_at', where: null },
        overridden: false, createdBy: null, verified: true,
      },
      {
        name: 'shipping_share', label: 'Shipping share', unit: 'ratio', description: '', category: 'custom',
        value: { op: 'ratio', numerator: { op: 'add', terms: ['shipping_revenue', 1] }, denominator: 'revenue' },
        overridden: false, createdBy: 'auth0|x', verified: false,
      },
    ])
    const metrics = await new Warehouse(summary).metrics()
    expect(apiFetchJson).toHaveBeenCalledWith(`${WAREHOUSE_ENDPOINT}/${ID}/metrics`, { signal: undefined })
    expect(metrics.map(metric => metric.name)).toEqual(['revenue', 'shipping_share'])
  })

  it('posts a measurement request and parses the periods', async () => {
    apiFetchJson.mockResolvedValue({
      grain: 'total', start: '2026-10-15', end: '2026-11-15', timezone: 'America/New_York',
      periods: [{ start: '2026-10-15', values: { revenue: 1200.5, refund_rate: null } }],
      unavailable: { sessions: 'No connection fills site_sessions' },
    })
    const request = { metrics: ['revenue'], start: '2026-10-15', end: '2026-11-15', grain: 'total' as const }
    const measurement = await new Warehouse(summary).measure(request)
    expect(apiFetchJson).toHaveBeenCalledWith(`${WAREHOUSE_ENDPOINT}/${ID}/metrics`,
      { method: 'POST', body: JSON.stringify(request), signal: undefined })
    expect(measurement.periods[0].values.refund_rate).toBeNull()
  })

  it('reads board status with the viewer-owned reconnect flag', async () => {
    apiFetchJson.mockResolvedValue({
      dot: null, lastSyncedAt: null, syncableAt: null,
      connections: [{
        connectionId: CONNECTION, connectorSlug: 'shopify_app', name: 'Shop', state: 'reconnect',
        error: 'requires an active refresh_token', lastSyncedAt: null, syncingSince: null, syncableAt: null, yours: true,
      }],
    })
    const status = await new Warehouse(summary).boardStatus('b1')
    expect(status.connections[0]).toEqual(expect.objectContaining({ state: 'reconnect', yours: true }))
  })

  it('rejects a state the server does not send', async () => {
    apiFetchJson.mockResolvedValue({ ...summary, connections: [{ ...summary.connections[0], feeds: [{ ...summary.connections[0].feeds[0], status: 'done' }] }] })
    await expect(Warehouse.get(ID)).rejects.toThrow()
  })
})
