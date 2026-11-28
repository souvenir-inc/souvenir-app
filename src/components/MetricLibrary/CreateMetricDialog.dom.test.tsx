// @vitest-environment jsdom
//
// New metric, asked for in words: the conversation goes to the warehouse's draft endpoint, the proposal shows
// before anything is saved, and an admin's "Add to library" saves it and opens its page. The API is mocked at
// its boundary: a stand-in Warehouse whose methods are the four metric endpoints.

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MetricDefinition, MeasureRequest, MetricEntry, Warehouse } from '@/lib/api/warehouse'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const push = vi.fn()
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast }))
vi.mock('@/context/org-context', () => ({ useOrgIdentity: () => ({ orgId: 'org-1', orgIdReady: true, orgRole: 'admin' }) }))
vi.mock('@/context/nav-guard-context', () => ({ useGuardedRouter: () => ({ push }) }))

import { CreateMetricDialog } from './CreateMetricDialog'
import { useLibrary } from './use-library'

const entry = (name: string, label: string, unit: MetricEntry['unit'], category: string): MetricEntry => ({
  name, label, unit, description: '', category, value: { kind: 'sum', table: 'orders', column: 'total', day: 'placed_at', where: null },
  overridden: false, createdBy: null, status: 'confirmed', version: 1, updatedBy: null, updatedAt: null, confirmedBy: null, confirmedAt: null, replacement: null, reason: null,
})
const CATALOG = [entry('revenue', 'Revenue', 'money', 'store'), entry('ad_spend', 'Ad spend', 'money', 'ads')]
const PROPOSAL: MetricDefinition = {
  name: 'blended_mer', label: 'Blended MER', unit: 'ratio', description: 'Revenue for every dollar of ad spend.',
  value: { op: 'ratio', numerator: 'revenue', denominator: 'ad_spend' },
}

function fakeWarehouse() {
  return {
    id: 'wh-1', name: 'Store', timezone: 'UTC', connections: [], defaultBoard: null,
    metrics: vi.fn(async () => CATALOG),
    measure: vi.fn(async (request: MeasureRequest) => ({
      grain: request.grain, start: request.start, end: request.end, timezone: 'UTC',
      periods: [{ start: request.start, values: { revenue: 1000, ad_spend: 250 } }], unavailable: {}, parts: null,
    })),
    draftMetric: vi.fn(async () => ({ reply: 'Here’s Blended MER: revenue ÷ ad spend.', draftVersion: 1, metric: PROPOSAL, baseVersion: null, questions: [], checks: [], preview: null, impact: [] })),
    putMetric: vi.fn(async (metric: MetricDefinition) => [...CATALOG, { ...entry(metric.name, metric.label, metric.unit, 'custom'), value: metric.value, createdBy: 'me' }]),
    deleteMetric: vi.fn(async () => undefined),
  }
}

function Harness({ warehouse, onClose }: { warehouse: Warehouse; onClose: () => void }) {
  const library = useLibrary(warehouse)
  if (!library.catalog.data) return null
  return <CreateMetricDialog library={library} onClose={onClose} />
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  class Stub { observe() {} unobserve() {} disconnect() {} }
  Object.assign(globalThis, { ResizeObserver: Stub })
  Object.assign(window, { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }) })
  Element.prototype.scrollIntoView = () => {}
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.clearAllMocks()
})

/** A button by its accessible name, as a person (or a screen reader) finds it. */
function button(name: string): HTMLButtonElement {
  const found = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') ?? b.textContent ?? '').trim() === name)
  if (!found) throw new Error(`No button named ${name}`)
  return found
}

async function settle() {
  for (let i = 0; i < 5; i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
}

describe('CreateMetricDialog', () => {
  it('asks in words, shows the proposal, then adds it unconfirmed and opens its page', async () => {
    const warehouse = fakeWarehouse()
    const onClose = vi.fn()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    act(() => root.render(<QueryClientProvider client={client}><Harness warehouse={warehouse as unknown as Warehouse} onClose={onClose} /></QueryClientProvider>))
    await settle()

    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog?.getAttribute('aria-labelledby') && document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent).toBe('New metric')
    expect(button('Add to library').disabled).toBe(true)

    const box = document.querySelector('textarea[aria-label="Describe the metric"]') as HTMLTextAreaElement
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(box, 'Revenue for every ad dollar')
      box.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => { button('Send').click() })
    await settle()

    expect(warehouse.draftMetric).toHaveBeenCalledWith({ messages: [{ role: 'user', content: 'Revenue for every ad dollar' }] })
    expect(document.querySelector('[role="log"]')?.textContent).toContain('Here’s Blended MER')
    expect(document.querySelector('[aria-label="Preview of Blended MER"]')).not.toBeNull()

    await act(async () => { button('Add to library').click() })
    await settle()

    expect(warehouse.putMetric).toHaveBeenCalledWith({ ...PROPOSAL, version: null })
    expect(toast.success).toHaveBeenCalledWith('Blended MER added to the library')
    expect(onClose).toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith('/dashboard/metrics/blended_mer')
  })

  it('keeps the dialog open and says why when the warehouse refuses the metric', async () => {
    const warehouse = fakeWarehouse()
    const { ApiError } = await import('@/lib/api/client')
    warehouse.putMetric.mockRejectedValueOnce(new ApiError(422, 'api_error', 'unknown metric nope', 'unknown metric nope'))
    const onClose = vi.fn()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    act(() => root.render(<QueryClientProvider client={client}><Harness warehouse={warehouse as unknown as Warehouse} onClose={onClose} /></QueryClientProvider>))
    await settle()
    const box = document.querySelector('textarea[aria-label="Describe the metric"]') as HTMLTextAreaElement
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(box, 'MER please')
      box.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => { button('Send').click() })
    await settle()
    await act(async () => { button('Add to library').click() })
    await settle()

    expect(toast.error).toHaveBeenCalledTimes(1)
    expect(toast.error.mock.calls[0][0]).not.toMatch(/nope/)
    expect(onClose).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })
})
