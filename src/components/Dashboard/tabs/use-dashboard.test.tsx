// @vitest-environment jsdom
//
// The board screen's boards: server data in React Query with the viewer's unsaved changes on top,
// the save mutation (optimistic, rollback, 409s, retries) and undo / redo. The warehouse API is
// mocked at its boundary (the Warehouse object); the store, layer and hook are real.

import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { ApiError } from '@/lib/api/client'
import type { Board as SavedBoard, BoardRequest, Warehouse } from '@/lib/api/warehouse'
import { queryKeys } from '@/lib/query-keys'
import { BoardStore, type Layout } from '../live/board-store'
import { warehouseQueries } from '../live/warehouse-queries'
import { SAVE_COPY } from '../board/copy'
import type { BoardsSnapshot } from './board-layer'
import { useDashboard, type DashboardApi } from './use-dashboard'

const toastError = vi.fn()
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: (...args: unknown[]) => toastError(...args), success: vi.fn(), dismiss: vi.fn() }) }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() } }))

// React schedules on its own here (no act): the checks wait for what the viewer would see.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false

const VIEWER = 'auth0|viewer'
const OTHER = 'auth0|other'
const A = 'aaaaaaaa-1111-4111-8111-111111111111'
const B = 'bbbbbbbb-2222-4222-8222-222222222222'
const ORG = 'org-1'

const layout: Layout = { cards: [{ metricId: 'revenue', size: 'md', x: 0, y: 0 }], initialCards: [], period: '7d', compare: 'previous' }
const wire = (id: string, name: string, position: number, over: Partial<SavedBoard> = {}): SavedBoard => ({
  id, name, layout, metrics: ['revenue'], general: 'view', grants: [], createdBy: VIEWER,
  updatedAt: '2026-11-01T09:00:00Z', role: 'owner', placement: { state: 'tabs', position }, deletedAt: null, ...over,
})

/** The warehouse as the tests' server: what it holds, and what the next writes answer. */
function fakeWarehouse(defaultBoard: string | null = null) {
  let n = 0
  const server = { boards: [wire(A, 'Store', 0), wire(B, 'Ads', 1)] }
  const refusals: unknown[] = []
  const api = {
    defaultBoard,
    server,
    refusals,
    /** Every write from now on is refused with this (until cleared). */
    refuseAll: null as unknown,
    boards: vi.fn(async () => server.boards.map((b) => ({ ...b }))),
    putBoard: vi.fn(async (id: string, request: BoardRequest) => {
      const refusal = refusals.shift() ?? api.refuseAll
      if (refusal) throw refusal
      const was = server.boards.find((b) => b.id === id)
      const next: SavedBoard = { ...(was ?? wire(id, request.name, server.boards.length)), name: request.name, layout: request.layout, general: request.general, updatedAt: `2026-11-02T09:00:${String(++n).padStart(2, '0')}Z` }
      server.boards = was ? server.boards.map((b) => (b.id === id ? next : b)) : [...server.boards, next]
      return next
    }),
    deleteBoard: vi.fn(async () => {}),
    arrange: vi.fn(async () => {}),
  }
  return api
}

type Fake = ReturnType<typeof fakeWarehouse>

let root: Root
let client: QueryClient
let fake: Fake
const view: { api: DashboardApi | null } = { api: null }
const key = queryKeys.warehouse.boards(ORG, 'wh-1')

function mount(defaultBoard: string | null = null) {
  fake = fakeWarehouse(defaultBoard)
  const warehouse = { ...fake, id: 'wh-1' } as unknown as Warehouse
  const store = new BoardStore(warehouse, VIEWER)
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  function Inner({ snapshot }: { snapshot: BoardsSnapshot }) {
    view.api = useDashboard({ snapshot, queryKey: key, store, measurable: new Set(['revenue']), viewer: VIEWER, defaultBoard, starter: () => { throw new Error('no starter') } })
    return null
  }
  function Probe() {
    const q = useQuery({ ...warehouseQueries.boards(ORG, warehouse, store, new Map(), true), refetchInterval: false, refetchOnWindowFocus: false })
    return q.data ? <Inner snapshot={q.data} /> : null
  }
  root = createRoot(document.createElement('div'))
  root.render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>)
}

const api = () => {
  if (!view.api) throw new Error('not loaded')
  return view.api
}
const label = (id: string) => api().state.boards[id]?.label
/** Waits (advancing the fake clock) until the check passes. */
const until = (check: () => void) => vi.waitFor(check, { timeout: 200_000, interval: 200 })
const savedSeq = () => (client.getQueryData(key) as BoardsSnapshot | undefined)?.seq ?? 0

describe('useDashboard', () => {
  beforeEach(async () => {
    vi.useFakeTimers()
    toastError.mockReset()
    view.api = null
    mount()
    await until(() => expect(view.api).not.toBeNull())
  })
  afterEach(() => {
    root.unmount()
    client.clear()
    vi.useRealTimers()
  })

  it('shows a change at once and saves it a moment later; the saved snapshot then holds it', async () => {
    api().rename(A, 'Shop')
    await until(() => expect(label(A)).toBe('Shop'))
    expect(fake.putBoard).not.toHaveBeenCalled()
    await until(() => expect(fake.putBoard).toHaveBeenCalledWith(A, expect.objectContaining({ name: 'Shop', version: '2026-11-01T09:00:00Z' })))
    await until(() => expect(savedSeq()).toBeGreaterThan(0))
    expect(label(A)).toBe('Shop')
    expect(toastError).not.toHaveBeenCalled()
  })

  it('rolls a refused change back to what the server has, with one message (403)', async () => {
    fake.refusals.push(new ApiError(403, 'forbidden', 'Forbidden'))
    api().rename(A, 'Shop')
    await until(() => expect(toastError).toHaveBeenCalledTimes(1))
    await until(() => expect(label(A)).toBe('Store'))
    expect(toastError.mock.calls[0][0]).toBe(SAVE_COPY.forbidden.title)
  })

  it('keeps a change the server failed on (500), tries again, then says so once with Try again', async () => {
    fake.refuseAll = new ApiError(500, 'server_error', 'Server error')
    api().rename(A, 'Shop')
    await until(() => expect(fake.putBoard).toHaveBeenCalledTimes(1))
    // The retries wait 5 s, 10 s, 20 s and 40 s: let that time pass.
    await vi.advanceTimersByTimeAsync(80_000)
    await until(() => expect(toastError).toHaveBeenCalledTimes(1))
    // The first try and four more.
    expect(fake.putBoard).toHaveBeenCalledTimes(5)
    expect(toastError.mock.calls[0][0]).toBe(SAVE_COPY.retry.title)
    expect(toastError.mock.calls[0][1]).toMatchObject({ action: { label: SAVE_COPY.retry.action } })
    expect(label(A)).toBe('Shop')
  })

  it('a board someone else changed first (409) keeps the change on screen and says so', async () => {
    fake.refusals.push(new ApiError(409, 'conflict', 'Conflict'))
    api().rename(A, 'Shop')
    await until(() => expect(toastError).toHaveBeenCalledTimes(1))
    expect(toastError.mock.calls[0][0]).toBe(SAVE_COPY.conflict.title)
    expect(label(A)).toBe('Shop')
  })

  it('shows other people’s changes on a refetch, with the viewer’s unsaved change on top', async () => {
    api().rename(A, 'Shop')
    fake.server.boards = fake.server.boards.map((b) => (b.id === B ? { ...b, name: 'Paid ads', createdBy: OTHER, role: 'edit' as const } : b))
    await client.invalidateQueries({ queryKey: key })
    await until(() => expect(label(B)).toBe('Paid ads'))
    expect(label(A)).toBe('Shop')
  })

  it('redoes what was undone (button and ⌘⇧Z), and a new change clears redo', async () => {
    api().rename(A, 'Shop')
    await until(() => expect(api().canUndo).toBe(true))
    api().undo()
    await until(() => expect(label(A)).toBe('Store'))
    expect(api().canRedo).toBe(true)
    api().redo()
    await until(() => expect(label(A)).toBe('Shop'))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true }))
    await until(() => expect(label(A)).toBe('Store'))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, shiftKey: true }))
    await until(() => expect(label(A)).toBe('Shop'))
    api().undo()
    await until(() => expect(api().canRedo).toBe(true))
    api().rename(B, 'Paid')
    await until(() => expect(api().canRedo).toBe(false))
  })

  it('Ctrl+Y redoes too', async () => {
    api().moveTab(B, 0)
    await until(() => expect(api().state.tabs).toEqual([B, A]))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }))
    await until(() => expect(api().state.tabs).toEqual([A, B]))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true }))
    await until(() => expect(api().state.tabs).toEqual([B, A]))
  })
})

describe('useDashboard on the default board', () => {
  beforeEach(async () => {
    vi.useFakeTimers()
    toastError.mockReset()
    view.api = null
    mount(A)
    await until(() => expect(view.api).not.toBeNull())
  })
  afterEach(() => {
    root.unmount()
    client.clear()
    vi.useRealTimers()
  })

  it('the default board made private (409) is rolled back and says to pick another default', async () => {
    fake.refusals.push(new ApiError(409, 'conflict', 'Conflict'))
    api().apply([{ type: 'update-board', id: A, patch: { general: 'none' } }])
    await until(() => expect(toastError).toHaveBeenCalledTimes(1))
    expect(toastError.mock.calls[0][0]).toBe(SAVE_COPY.defaultBoard.title)
    await until(() => expect(api().state.boards[A]?.general).toBe('view'))
  })
})
