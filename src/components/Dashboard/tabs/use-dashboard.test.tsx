// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/client'
import type { BoardStore } from '../live/board-store'
import type { DashboardState } from './board-state'

const toastError = vi.fn()
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: (...args: unknown[]) => toastError(...args), success: vi.fn(), dismiss: vi.fn() }) }))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const EMPTY: DashboardState = { boards: {}, tabs: [], hidden: [], deleted: [], openId: '' }

async function saveRefusedWith(error: unknown) {
  const { useDashboard } = await import('./use-dashboard')
  const store = { save: vi.fn(() => Promise.reject(error)) } as unknown as BoardStore
  function Probe() { useDashboard(EMPTY, store, new Set(), 'auth0|viewer'); return null }
  const root = createRoot(document.createElement('div'))
  await act(async () => root.render(<Probe />))
  // The first write goes out a moment after the change.
  await act(async () => { vi.advanceTimersByTime(1000) })
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
  await act(async () => root.unmount())
  return toastError.mock.calls[0]?.[0] as string | undefined
}

describe('useDashboard save errors', () => {
  beforeEach(() => { vi.useFakeTimers(); toastError.mockReset(); vi.spyOn(console, 'error').mockImplementation(() => {}) })
  afterEach(() => { vi.useRealTimers() })

  it('a board someone else changed first (409 version) says so', async () => {
    const message = await saveRefusedWith(new ApiError(409, 'conflict', 'Conflict', 'Someone else changed this board since it was read'))
    expect(message).toMatch(/Someone else changed this board/)
  })

  it('a default board made private (409) says to pick another default', async () => {
    const message = await saveRefusedWith(new ApiError(409, 'conflict', 'Conflict', 'This is the default board; pick another before limiting who sees it'))
    expect(message).toMatch(/default board stays open/)
  })
})
