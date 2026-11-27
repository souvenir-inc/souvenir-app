// @vitest-environment jsdom
//
// What the dashboard reads: the query factories (keys, polling, stand-ins) and the board status
// hook pointing the sync store at its query.

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider, type Query } from '@tanstack/react-query'

vi.mock('@/context/org-context', () => ({ useOrgIdentity: () => ({ orgId: 'org-1', orgIdReady: true }) }))
vi.mock('@/lib/connectorProvider', () => ({ onAnyLinkResult: () => () => {} }))

import type { BoardStatus, ConnectionState, MeasureRequest, Measurement, Warehouse } from '@/lib/api/warehouse'
import { queryKeys } from '@/lib/query-keys'
import { getSyncSnapshot, resetSyncStore } from '../sync/sync-store'
import { useBoardStatus } from './dashboard-data'
import { STATUS_POLL_MS, SYNCING_POLL_MS, warehouseQueries } from './warehouse-queries'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const WH = '9f1c2b7e-4d3a-4f6b-9a8e-1c2d3e4f5a6b'
const BOARD = 'b1b1b1b1-2222-4333-8444-555555555555'
const SHOP = '45aaa2ea-0000-4000-8000-000000000001'

const conn = (state: ConnectionState['state']): ConnectionState => ({
  connectionId: SHOP, connectorSlug: 'shopify_app', name: 'Shopify', state, error: null,
  lastSyncedAt: null, syncingSince: null, syncableAt: null, metrics: [], yours: true,
})
const status = (state: ConnectionState['state']): BoardStatus => ({ dot: null, lastSyncedAt: null, syncableAt: null, connections: [conn(state)] })

describe('warehouse query factories', () => {
  const warehouse = { id: WH } as Warehouse
  const interval = (data: BoardStatus | undefined) => {
    const refetch = warehouseQueries.status('org-1', warehouse, BOARD).refetchInterval as (q: Query<BoardStatus, Error, BoardStatus, readonly unknown[]>) => number
    return refetch({ state: { data } } as Query<BoardStatus, Error, BoardStatus, readonly unknown[]>)
  }

  it('keys every read by org and warehouse', () => {
    expect(warehouseQueries.status('org-1', warehouse, BOARD).queryKey).toEqual(queryKeys.warehouse.status('org-1', WH, BOARD))
    expect(warehouseQueries.slackChannels('org-1').queryKey).toEqual(['warehouse', 'org-1', 'slack-channels'])
    expect(warehouseQueries.connectionStates('org-1', warehouse).queryKey).toEqual(['warehouse', 'org-1', WH, 'connections'])
  })

  it('polls the status often while an app syncs, else each minute', () => {
    expect(interval(status('syncing'))).toBe(SYNCING_POLL_MS)
    expect(interval(status('first_sync'))).toBe(SYNCING_POLL_MS)
    expect(interval(status('up_to_date'))).toBe(STATUS_POLL_MS)
    expect(interval(undefined)).toBe(STATUS_POLL_MS)
  })

  it('makes no request for a slot without one, and keeps the old numbers only for the same dates', () => {
    expect(warehouseQueries.measure('org-1', warehouse, 'totalBefore', null).enabled).toBe(false)
    const body: MeasureRequest = { metrics: ['revenue'], start: '2025-11-08', end: '2025-11-14', grain: 'day' }
    const options = warehouseQueries.measure('org-1', warehouse, 'daily', body)
    const stand = options.placeholderData as (previous: Measurement | undefined, query: { queryKey: readonly unknown[] } | undefined) => Measurement | undefined
    const previous = { grain: 'day' } as Measurement
    expect(stand(previous, { queryKey: queryKeys.warehouse.measure('org-1', WH, { ...body, metrics: ['orders'] }) })).toBe(previous)
    expect(stand(previous, { queryKey: queryKeys.warehouse.measure('org-1', WH, { ...body, start: '2025-11-01' }) })).toBeUndefined()
  })
})

describe('useBoardStatus', () => {
  let root: Root
  let container: HTMLDivElement
  afterEach(() => { act(() => root.unmount()); container.remove(); resetSyncStore() })

  function Probe({ warehouse, saved }: { warehouse: Warehouse; saved: boolean }) {
    useBoardStatus(warehouse, BOARD, saved)
    return null
  }

  async function mount(warehouse: Warehouse, saved: boolean) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(<QueryClientProvider client={client}><Probe warehouse={warehouse} saved={saved} /></QueryClientProvider>))
    return client
  }

  it('reads the saved board’s status, and the sync store shows it from the cache', async () => {
    const boardStatus = vi.fn().mockResolvedValue(status('behind'))
    const client = await mount({ id: WH, boardStatus } as unknown as Warehouse, true)
    await act(async () => { await Promise.resolve() })
    expect(boardStatus).toHaveBeenCalledWith(BOARD, expect.any(AbortSignal))
    expect(getSyncSnapshot().apps[SHOP]?.state).toBe('behind')
    // A later status in the cache is what the store shows: nothing copies it over.
    act(() => { client.setQueryData(queryKeys.warehouse.status('org-1', WH, BOARD), status('up_to_date')) })
    expect(getSyncSnapshot().apps[SHOP]?.state).toBe('fresh')
  })

  it('reads nothing for a draft board, and the store shows no apps', async () => {
    const boardStatus = vi.fn()
    await mount({ id: WH, boardStatus } as unknown as Warehouse, false)
    expect(boardStatus).not.toHaveBeenCalled()
    expect(getSyncSnapshot().apps).toEqual({})
  })
})
