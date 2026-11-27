import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MutationObserver, QueryClient } from '@tanstack/react-query'

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: toastError } }))

import { ApiError } from '@/lib/api/client'
import type { BoardStatus, ConnectionState, Warehouse } from '@/lib/api/warehouse'
import { queryKeys } from '@/lib/query-keys'
import { refreshBoardOptions, syncConnectionsOptions } from '../live/warehouse-mutations'
import {
  bindSync, getSyncSnapshot, markStarted, onSyncEnd, resetSyncStore, syncRefused, unmarkStarted, type SyncEnd,
} from './sync-store'

const ORG = 'org-1'
const WH = '9f1c2b7e-4d3a-4f6b-9a8e-1c2d3e4f5a6b'
const BOARD = 'b1b1b1b1-2222-4333-8444-555555555555'
const SHOP = '45aaa2ea-0000-4000-8000-000000000001'
const META = '45aaa2ea-0000-4000-8000-000000000002'

const conn = (id: string, state: ConnectionState['state'], over: Partial<ConnectionState> = {}): ConnectionState => ({
  connectionId: id, connectorSlug: 'shopify_app', name: id === SHOP ? 'Shopify' : 'Meta Ads', state, error: null,
  lastSyncedAt: '2026-11-21T19:48:51Z', syncingSince: null, syncableAt: null, metrics: ['revenue'], yours: true, ...over,
})
const status = (...connections: ConnectionState[]): BoardStatus => ({ dot: null, lastSyncedAt: null, syncableAt: null, connections })

const key = queryKeys.warehouse.status(ORG, WH, BOARD)
let qc: QueryClient
const warehouse = { id: WH } as Warehouse

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  toastError.mockReset()
})
afterEach(() => resetSyncStore())

describe('the sync store reads the board status from the query cache', () => {
  it('shows the apps of the cached status, and nothing before one is bound', () => {
    qc.setQueryData(key, status(conn(SHOP, 'up_to_date')))
    expect(getSyncSnapshot().apps).toEqual({})
    bindSync({ client: qc, key, warehouse, boardId: BOARD })
    expect(getSyncSnapshot().apps[SHOP]?.state).toBe('fresh')
  })

  it('follows a new status without anything copying it in', () => {
    bindSync({ client: qc, key, warehouse, boardId: BOARD })
    expect(getSyncSnapshot().apps).toEqual({})
    qc.setQueryData(key, status(conn(SHOP, 'behind')))
    expect(getSyncSnapshot().apps[SHOP]?.state).toBe('behind')
  })

  it('keeps one snapshot while nothing changes (useSyncExternalStore needs that)', () => {
    qc.setQueryData(key, status(conn(SHOP, 'up_to_date')))
    bindSync({ client: qc, key, warehouse, boardId: BOARD })
    expect(getSyncSnapshot()).toBe(getSyncSnapshot())
  })

  it('ends a sync this viewer started when a status says it stopped syncing', () => {
    const ends: SyncEnd[] = []
    const stop = onSyncEnd((e) => ends.push(e))
    qc.setQueryData(key, status(conn(SHOP, 'behind'), conn(META, 'behind')))
    bindSync({ client: qc, key, warehouse, boardId: BOARD })
    markStarted([SHOP, META], 'sync')
    qc.setQueryData(key, status(conn(SHOP, 'syncing'), conn(META, 'syncing')))
    expect(ends).toEqual([])
    expect(getSyncSnapshot().started).toEqual({ [SHOP]: 'sync', [META]: 'sync' })
    qc.setQueryData(key, status(conn(SHOP, 'up_to_date'), conn(META, 'failed')))
    expect(ends).toEqual([{ kind: 'sync', ok: [SHOP], failed: [META] }])
    expect(getSyncSnapshot().started).toEqual({})
    expect(getSyncSnapshot().recent.map((r) => r.apps)).toEqual([[SHOP]])
    stop()
  })

  it('stops watching the old board when another is bound', () => {
    bindSync({ client: qc, key, warehouse, boardId: BOARD })
    const other = queryKeys.warehouse.status(ORG, WH, 'c2c2c2c2-2222-4333-8444-555555555555')
    bindSync({ client: qc, key: other, warehouse, boardId: 'c2c2c2c2-2222-4333-8444-555555555555' })
    qc.setQueryData(key, status(conn(SHOP, 'failed')))
    expect(getSyncSnapshot().apps).toEqual({})
  })

  it('unmarks a refused sync and says so in a toast, never with the server’s words', () => {
    markStarted([SHOP], 'sync')
    unmarkStarted([SHOP])
    syncRefused(new ApiError(403, 'forbidden', 'raw server text'))
    expect(getSyncSnapshot().started).toEqual({})
    expect(toastError).toHaveBeenCalledWith('You don’t have access to sync this.', { id: 'dashboard-sync' })
  })
})

describe('Refresh and Sync mutations', () => {
  it('Refresh puts the answer into the status query and marks what it started', async () => {
    bindSync({ client: qc, key, warehouse, boardId: BOARD })
    const started = vi.fn()
    const refreshed = status(conn(SHOP, 'syncing'), conn(META, 'reconnect'))
    const wh = { id: WH, refreshBoard: vi.fn().mockResolvedValue(refreshed) } as unknown as Warehouse
    await new MutationObserver(qc, refreshBoardOptions(qc, ORG, { started })).mutate({ warehouse: wh, boardId: BOARD })
    expect(qc.getQueryData(key)).toBe(refreshed)
    expect(started).toHaveBeenCalledWith([SHOP])
    expect(getSyncSnapshot().apps[META]?.needsReconnect).toBe(true)
  })

  it('Sync merges each answer into the board status, keeping the board’s metrics', async () => {
    qc.setQueryData(key, status(conn(SHOP, 'behind'), conn(META, 'up_to_date')))
    const answer = conn(SHOP, 'syncing', { metrics: [] })
    const wh = { id: WH, syncConnection: vi.fn().mockResolvedValue(answer) } as unknown as Warehouse
    const started = vi.fn()
    await new MutationObserver(qc, syncConnectionsOptions(qc, ORG, { started })).mutate({ warehouse: wh, boardId: BOARD, ids: [SHOP] })
    const after = qc.getQueryData<BoardStatus>(key)!
    expect(started).toHaveBeenCalledWith([SHOP])
    expect(after.connections[0]).toMatchObject({ state: 'syncing', metrics: ['revenue'] })
    expect(after.connections[1].state).toBe('up_to_date')
  })

  it('a refused Sync reports the ids it marked, and leaves the status alone', async () => {
    const before = status(conn(SHOP, 'behind'))
    qc.setQueryData(key, before)
    const wh = { id: WH, syncConnection: vi.fn().mockRejectedValue(new ApiError(500, 'boom', 'x')) } as unknown as Warehouse
    const refused = vi.fn()
    await expect(new MutationObserver(qc, syncConnectionsOptions(qc, ORG, { refused })).mutate({ warehouse: wh, boardId: BOARD, ids: [SHOP] })).rejects.toBeInstanceOf(ApiError)
    expect(refused).toHaveBeenCalledWith([SHOP], expect.any(ApiError))
    expect(qc.getQueryData(key)).toBe(before)
  })
})
