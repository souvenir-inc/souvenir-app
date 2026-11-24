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
  id: ID, name: 'Store', timezone: 'America/New_York', defaultBoard: null,
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
        overridden: false, verified: false, createdBy: null, verified: true,
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

  it('reads a board with who sees it and what the viewer may do', async () => {
    apiFetchJson.mockResolvedValue([{
      id: 'b1', name: 'Store overview', layout: {}, metrics: ['revenue'], general: 'view',
      grants: [{ userId: 'auth0|other', role: 'edit' }], createdBy: 'auth0|maker', updatedAt: '2026-11-21T19:48:51Z', role: 'edit',
    }])
    const [board] = await new Warehouse(summary).boards()
    expect(board).toMatchObject({ general: 'view', role: 'edit', grants: [{ userId: 'auth0|other', role: 'edit' }] })
  })

  it('names the default board and comes back as the warehouse with it', async () => {
    apiFetchJson.mockResolvedValue({ ...summary, defaultBoard: 'b1' })
    const saved = await new Warehouse(summary).setDefaultBoard('b1')
    expect(apiFetchJson).toHaveBeenCalledWith(`${WAREHOUSE_ENDPOINT}/${ID}/default-board`, { method: 'PUT', body: JSON.stringify({ board: 'b1' }), signal: undefined })
    expect(saved.defaultBoard).toBe('b1')
  })

  it('drafts a board from the conversation; a question comes back without one', async () => {
    const messages = [{ role: 'user' as const, content: 'weekly check-in' }]
    apiFetchJson.mockResolvedValue({ reply: 'Revenue each week.', board: { name: 'Weekly check-in', period: '7d', compare: 'previous', cards: [{ metric: 'revenue', size: 'full' }] } })
    const drafted = await new Warehouse(summary).draftBoard(messages)
    expect(apiFetchJson).toHaveBeenCalledWith(`${WAREHOUSE_ENDPOINT}/${ID}/boards/draft`, { method: 'POST', body: JSON.stringify({ messages }), signal: undefined })
    expect(drafted.board?.cards).toEqual([{ metric: 'revenue', size: 'full' }])
    apiFetchJson.mockResolvedValue({ reply: 'Which part of the business?', board: null })
    expect((await new Warehouse(summary).draftBoard(messages)).board).toBeNull()
  })

  it('posts a board picture to a Slack channel as a form', async () => {
    apiFetchJson.mockResolvedValue({ connected: true, channels: [{ id: 'C1', name: 'growth' }] })
    expect((await Warehouse.slackChannels()).channels).toEqual([{ id: 'C1', name: 'growth' }])
    await new Warehouse(summary).postToSlack('b1', new Blob(['png']), 'store-overview.png', 'C1', 'A member shared Store overview')
    const [url, init] = apiFetchVoid.mock.calls[0]
    expect(url).toBe(`${WAREHOUSE_ENDPOINT}/${ID}/boards/b1/slack`)
    expect(init.method).toBe('POST')
    expect([...(init.body as FormData).keys()]).toEqual(['image', 'channelId', 'text'])
    expect((init.body as FormData).get('channelId')).toBe('C1')
  })

  it('keeps a feed status it does not know yet (free text in the API spec)', async () => {
    apiFetchJson.mockResolvedValue({ ...summary, connections: [{ ...summary.connections[0], feeds: [{ ...summary.connections[0].feeds[0], status: 'paused' }] }] })
    const got = await Warehouse.get(ID)
    expect(got.connections[0].feeds[0].status).toBe('paused')
  })

  it('reads a count metric that leaves out column and where (API spec Aggregate)', async () => {
    apiFetchJson.mockResolvedValue([{
      name: 'orders', label: 'Orders', unit: 'count', description: '', category: 'sales',
      value: { kind: 'count', table: 'orders', day: 'created_at' }, overridden: false, verified: false, createdBy: null,
    }])
    const [entry] = await new Warehouse(summary).metrics()
    expect(entry.value).toMatchObject({ kind: 'count', column: null, where: null })
  })

  it('reads a summary without defaultBoard as no default', async () => {
    const bare: Partial<typeof summary> = { ...summary }
    delete bare.defaultBoard
    apiFetchJson.mockResolvedValue(bare)
    expect((await Warehouse.get(ID)).defaultBoard).toBeNull()
  })
})
