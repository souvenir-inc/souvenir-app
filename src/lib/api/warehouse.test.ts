import { beforeEach, describe, expect, it, vi } from 'vitest'

const { apiFetchJson, apiFetchVoid } = vi.hoisted(() => ({ apiFetchJson: vi.fn(), apiFetchVoid: vi.fn() }))

vi.mock('./client', async importOriginal => {
  const actual = await importOriginal<typeof import('./client')>()
  return { ...actual, apiFetchJson, apiFetchVoid }
})

import { ApiError } from './client'
import { parseWorkspace } from './warehouse'
import { syncOf } from '@/lib/warehouse/present'
import { appsOf } from '@/lib/warehouse/sync'
import { dataUntil, sourcesOf } from '@/lib/warehouse/freshness'

/** What the dev back end answers for `GET /warehouse` today (22 Nov). */
const LIVE = [{
  id: '6b74d25e-1b0e-469f-a6d2-c89c6f49116a',
  name: 'Acme Store',
  timezone: 'America/New_York',
  connections: [
    {
      connectionId: '97eb068b-3f5d-43ea-8d8f-056590c3f44a',
      connectorSlug: 'metaads',
      name: 'Meta Ads',
      feeds: [{ category: 'ads', status: 'ready', error: null, lastSyncedAt: '2026-11-22T12:00:00Z' }],
    },
    {
      connectionId: 'd5110492-d30d-4967-a882-2d107d62c5e1',
      connectorSlug: 'heatmap',
      name: 'Heatmap',
      feeds: [{ category: 'site_analytics', status: 'ready', error: null, lastSyncedAt: '2026-11-22T07:00:00Z' }],
    },
  ],
}]

const connection = (connectorSlug: string, feeds: unknown[]) => ({ connectionId: `id-${connectorSlug}`, connectorSlug, name: connectorSlug, feeds })
const feed = (category: string, status: string, lastSyncedAt: string | null, error: string | null = null) => ({ category, status, error, lastSyncedAt })
const one = (connections: unknown[]) => [{ id: 'w', name: 'W', timezone: 'UTC', connections }]

describe('parseWorkspace', () => {
  it('maps the per-app response onto the workspace the app reads', () => {
    const workspace = parseWorkspace(LIVE)
    expect(workspace).toMatchObject({
      id: '6b74d25e-1b0e-469f-a6d2-c89c6f49116a',
      name: 'Acme Store',
      timezone: 'America/New_York',
      connectors: ['metaads', 'heatmap'],
      categories: [
        { category: 'ads', status: 'ready', error: null, lastSyncedAt: '2026-11-22T12:00:00Z' },
        { category: 'site_analytics', status: 'ready', error: null, lastSyncedAt: '2026-11-22T07:00:00Z' },
      ],
    })
    expect(workspace.connections).toHaveLength(2)
  })

  it('feeds the sync, freshness and data-cut helpers unchanged', () => {
    const workspace = parseWorkspace(LIVE)
    expect(syncOf(workspace)).toEqual({ state: 'ready', lastSyncedAt: '2026-11-22T12:00:00Z' })
    expect(sourcesOf(workspace).map(source => source.label)).toEqual(['Ads', 'Site analytics'])
    expect(dataUntil(workspace, 'ads')).toBe('2026-11-22')
    const apps = appsOf(workspace, Date.parse('2026-11-22T13:00:00Z'))
    expect(apps.find(app => app.categories.includes('ads'))).toMatchObject({ slug: 'metaads', state: 'up_to_date' })
  })

  it('folds a category several apps feed: the worst status, the oldest sync, the first error', () => {
    const workspace = parseWorkspace(one([
      connection('metaads', [feed('ads', 'ready', '2026-11-22T12:00:00Z')]),
      connection('googleads', [feed('ads', 'failed', '2026-11-20T08:00:00Z', 'Token expired')]),
      connection('tiktokads', [feed('ads', 'syncing', null)]),
    ]))
    expect(workspace.connectors).toEqual(['metaads', 'googleads', 'tiktokads'])
    expect(workspace.categories).toEqual([
      { category: 'ads', status: 'failed', error: 'Token expired', lastSyncedAt: '2026-11-20T08:00:00Z' },
    ])
  })

  it('reads a category as building while any app feeding it is still on its first build', () => {
    const workspace = parseWorkspace(one([
      connection('shopify', [feed('store', 'ready', '2026-11-22T12:00:00Z')]),
      connection('shopify_app', [feed('store', 'building', null)]),
    ]))
    expect(workspace.categories).toEqual([{ category: 'store', status: 'building', error: null, lastSyncedAt: '2026-11-22T12:00:00Z' }])
  })

  it('ignores apps with nothing for a category, unless none has anything', () => {
    const workspace = parseWorkspace(one([
      connection('shopify', [feed('store', 'ready', '2026-11-22T12:00:00Z'), feed('ab_testing', 'not_applicable', null)]),
      connection('metaads', [feed('store', 'not_applicable', null), feed('ab_testing', 'not_applicable', null)]),
    ]))
    expect(workspace.connectors).toEqual(['shopify', 'metaads'])
    expect(workspace.categories).toEqual([
      { category: 'store', status: 'ready', error: null, lastSyncedAt: '2026-11-22T12:00:00Z' },
      { category: 'ab_testing', status: 'not_applicable', error: null, lastSyncedAt: null },
    ])
  })

  it('lists a connector once when it has two connections', () => {
    const workspace = parseWorkspace(one([
      connection('shopify', [feed('store', 'ready', '2026-11-22T12:00:00Z')]),
      { ...connection('shopify', [feed('store', 'ready', '2026-11-21T12:00:00Z')]), connectionId: 'second' },
    ]))
    expect(workspace.connectors).toEqual(['shopify'])
    expect(workspace.categories[0].lastSyncedAt).toBe('2026-11-21T12:00:00Z')
  })

  it('reads the first workspace when the list has several', () => {
    const second = { ...LIVE[0], id: 'other', name: 'Other' }
    expect(parseWorkspace([...LIVE, second]).id).toBe(LIVE[0].id)
  })

  it('answers 404 for no workspace, or one with no app left, so the page shows "connect a store"', () => {
    for (const response of [[], one([])]) {
      let error: unknown
      try { parseWorkspace(response) } catch (caught) { error = caught }
      expect(error).toBeInstanceOf(ApiError)
      expect((error as ApiError).status).toBe(404)
    }
  })

  it('still parses the old single-workspace shape', () => {
    const old = {
      id: '74ec0f6b', name: 'Acme Store', slug: 'acme-store', timezone: 'America/Chicago',
      connectors: ['shopify', 'triple_whale'],
      categories: [
        { category: 'store', status: 'ready', lastSyncedAt: '2026-11-04T18:24:41Z' },
        { category: 'ab_testing', status: 'not_applicable', lastSyncedAt: null },
      ],
    }
    expect(parseWorkspace(old)).toEqual(old)
    expect(parseWorkspace([old])).toEqual(old)
  })

  it('takes a single per-app workspace that is not wrapped in a list', () => {
    expect(parseWorkspace(LIVE[0]).connectors).toEqual(['metaads', 'heatmap'])
  })

  it('rejects a response in neither shape as a parse error, not a missing workspace', () => {
    expect(() => parseWorkspace([{ id: 'w', name: 'W' }])).toThrow()
    expect(() => parseWorkspace([{ id: 'w', name: 'W' }])).not.toThrow(ApiError)
  })
})

const MEASUREMENT = { grain: 'day', start: '2026-11-01', end: '2026-11-02', timezone: 'UTC', periods: [], unavailable: {} }
const ID = LIVE[0].id
const withId = (id: string) => [{ ...LIVE[0], id }]

/** Answers the mocked API by "METHOD /warehouse/…"; anything else is a test failure. */
function serve(handlers: Record<string, () => unknown>) {
  const answer = async (url: string, init?: { method?: string }) => {
    const key = `${init?.method ?? 'GET'} ${url.slice(url.indexOf('/warehouse'))}`
    const handler = handlers[key]
    if (!handler) throw new Error(`unexpected ${key}`)
    return handler()
  }
  apiFetchJson.mockImplementation(answer)
  apiFetchVoid.mockImplementation(answer)
}
const calls = () => [...apiFetchJson.mock.calls, ...apiFetchVoid.mock.calls]
  .map(([url, init]: [string, { method?: string } | undefined]) => `${init?.method ?? 'GET'} ${url.slice(url.indexOf('/warehouse'))}`)

describe('routes under the workspace', () => {
  // The workspace id is remembered across calls, so every test starts from a fresh module (and its own ApiError).
  let api: typeof import('./warehouse')
  let FreshApiError: typeof ApiError
  beforeEach(async () => {
    apiFetchJson.mockReset()
    apiFetchVoid.mockReset()
    vi.resetModules()
    api = await import('./warehouse')
    FreshApiError = (await import('./client')).ApiError
  })

  it('parses GET /warehouse through the new mapping', async () => {
    serve({ 'GET /warehouse': () => LIVE })
    const workspace = await api.fetchWorkspace()
    expect(workspace.connectors).toEqual(['metaads', 'heatmap'])
    expect(workspace.categories.map(c => c.category)).toEqual(['ads', 'site_analytics'])
  })

  it('uses the id from the workspace the page already fetched', async () => {
    serve({ 'GET /warehouse': () => LIVE, [`POST /warehouse/${ID}/metrics`]: () => MEASUREMENT, [`GET /warehouse/${ID}/metrics`]: () => [] })
    await api.fetchWorkspace()
    await api.measure({ metrics: ['revenue'], start: '2026-11-01', end: '2026-11-02', grain: 'day' })
    await api.fetchMetricCatalog()
    expect(calls()).toEqual(['GET /warehouse', `POST /warehouse/${ID}/metrics`, `GET /warehouse/${ID}/metrics`])
  })

  it('reads why a metric is unavailable from the new object and the old string', async () => {
    const reason = 'needs orders, which no connection in this store fills'
    serve({
      'GET /warehouse': () => LIVE,
      [`POST /warehouse/${ID}/metrics`]: () => ({
        ...MEASUREMENT,
        unavailable: { orders: { code: 'no_connection', reason, connectors: ['shopify'] }, aov: reason },
      }),
    })
    const measured = await api.measure({ metrics: ['orders', 'aov'], start: '2026-11-01', end: '2026-11-02', grain: 'day' })
    expect(measured.unavailable).toEqual({ orders: reason, aov: reason })
  })

  it('looks the id up once when nothing has fetched the workspace yet', async () => {
    serve({ 'GET /warehouse': () => LIVE, [`POST /warehouse/${ID}/metrics`]: () => MEASUREMENT })
    const request = { metrics: ['revenue'], start: '2026-11-01', end: '2026-11-02', grain: 'day' as const }
    await Promise.all([api.measure(request), api.measure(request)])
    expect(calls()).toEqual(['GET /warehouse', `POST /warehouse/${ID}/metrics`, `POST /warehouse/${ID}/metrics`])
  })

  it('puts, drafts and deletes metrics under the workspace', async () => {
    serve({
      'GET /warehouse': () => LIVE,
      [`PUT /warehouse/${ID}/metrics`]: () => [],
      [`POST /warehouse/${ID}/metrics/draft`]: () => ({ reply: 'ok', metric: null }),
      [`DELETE /warehouse/${ID}/metrics/shipping%20share`]: () => undefined,
    })
    await api.putMetric({ name: 'x', label: 'X', unit: 'count', description: '', value: { kind: 'count', table: 'orders', column: null, day: 'placed_at', where: null } })
    await api.draftMetric([{ role: 'user', content: 'hi' }])
    await api.deleteMetric('shipping share')
    expect(calls()).toEqual(['GET /warehouse', `PUT /warehouse/${ID}/metrics`, `POST /warehouse/${ID}/metrics/draft`, `DELETE /warehouse/${ID}/metrics/shipping%20share`])
  })

  it('looks the id up again when the remembered one is refused, and retries once', async () => {
    let workspace = withId('old')
    serve({
      'GET /warehouse': () => workspace,
      'GET /warehouse/old/metrics': () => { throw new FreshApiError(404, 'not_found', 'gone') },
      'GET /warehouse/new/metrics': () => [],
    })
    await api.fetchWorkspace()
    workspace = withId('new')
    await expect(api.fetchMetricCatalog()).resolves.toEqual([])
    expect(calls()).toEqual(['GET /warehouse', 'GET /warehouse/old/metrics', 'GET /warehouse', 'GET /warehouse/new/metrics'])
  })

  it('gives up when the id is still the same, and passes other errors straight through', async () => {
    serve({
      'GET /warehouse': () => LIVE,
      [`GET /warehouse/${ID}/metrics`]: () => { throw new FreshApiError(404, 'not_found', 'no metrics') },
      [`POST /warehouse/${ID}/metrics`]: () => { throw new FreshApiError(422, 'invalid', 'unknown metrics') },
    })
    await expect(api.fetchMetricCatalog()).rejects.toMatchObject({ status: 404 })
    expect(calls()).toEqual(['GET /warehouse', `GET /warehouse/${ID}/metrics`, 'GET /warehouse'])
    apiFetchJson.mockClear()
    await expect(api.measure({ metrics: ['x'], start: '2026-11-01', end: '2026-11-02', grain: 'day' })).rejects.toMatchObject({ status: 422 })
    expect(calls()).toEqual([`POST /warehouse/${ID}/metrics`])
  })

  it('asks again when the page’s own workspace request was cancelled', async () => {
    let cancelled = true
    serve({
      'GET /warehouse': () => { if (cancelled) { cancelled = false; throw new DOMException('aborted', 'AbortError') } return LIVE },
      [`GET /warehouse/${ID}/metrics`]: () => [],
    })
    await expect(api.fetchWorkspace()).rejects.toThrow('aborted')
    await expect(api.fetchMetricCatalog()).resolves.toEqual([])
  })
})
