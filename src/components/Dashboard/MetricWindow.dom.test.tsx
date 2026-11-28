// @vitest-environment jsdom
//
// The metric window's target: the Target tab shows the target, its status in words with the reason
// as visible text, and Edit target opens the editor, whose save goes to the scorecards API and
// changes the status. The warehouse is mocked at the API boundary.

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Warehouse, type Scorecard, type ScorecardRequest } from '@/lib/api/warehouse'
import { queryKeys } from '@/lib/query-keys'
import { CONNECTIONS, SCORECARDS, TODAY, apps, metrics } from './__fixtures__/live'
import { DashboardData, DashboardDataProvider } from './live/dashboard-data'
import { MetricWindow } from './MetricWindow'

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), info: vi.fn(), dismiss: vi.fn() }) }))
vi.mock('@/context/org-context', () => ({
  useOrgIdentity: () => ({ orgId: 'org-1', orgIdReady: true }),
  useOrg: () => ({ org: { name: 'Acme' } }),
  useOrgMembers: () => ({ members: [{ id: 'auth0|maya', name: 'Maya Lee', email: 'maya@example.com' }] }),
}))
vi.mock('@/context/auth-context', () => ({ useAuth: () => ({ user: { auth0Id: 'auth0|viewer' } }) }))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root
let server: Scorecard[]
let warehouse: Warehouse

const buttonNamed = (name: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === name)
const inputLabelled = (text: string) => {
  const label = [...document.querySelectorAll('label')].find((l) => l.textContent?.startsWith(text))
  return label ? (document.getElementById(label.htmlFor) as HTMLInputElement | null) : null
}
function typeInto(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

async function openWindow(metricId: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const data = new DashboardData(warehouse, apps(), metrics({ scorecards: server }), TODAY)
  await act(async () => root.render(
    <QueryClientProvider client={qc}>
      <DashboardDataProvider value={data}>
        <MetricWindow metric={data.metrics.get(metricId) ?? null} periodId="last-7" related={[]} onClose={() => {}} onOpenMetric={() => {}} boards={[]} onAddToBoard={() => {}} />
      </DashboardDataProvider>
    </QueryClientProvider>,
  ))
  const tab = [...document.querySelectorAll<HTMLElement>('[role=tab]')].find((t) => t.textContent === 'Target')!
  await act(async () => tab.click())
  return qc
}

beforeEach(() => {
  class Stub { observe() {} unobserve() {} disconnect() {} }
  Object.assign(globalThis, { ResizeObserver: Stub })
  server = structuredClone(SCORECARDS)
  warehouse = new Warehouse({ id: 'wh-1', name: 'Store', timezone: 'America/New_York', connections: CONNECTIONS, defaultBoard: null })
  vi.spyOn(warehouse, 'scorecards').mockImplementation(async () => structuredClone(server))
  vi.spyOn(warehouse, 'putScorecard').mockImplementation(async (id: string, request: ScorecardRequest) => {
    const saved = { ...server.find((c) => c.id === id)!, ...request }
    server = server.map((c) => (c.id === id ? saved : c))
    return saved
  })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.body.innerHTML = ''
})

describe('MetricWindow target', () => {
  it('shows the target and its status in words, with the reason as text', async () => {
    await openWindow('revenue')
    const section = await vi.waitFor(() => {
      const s = document.querySelector('section[aria-label="Target for Revenue"]')
      if (!s) throw new Error('not yet')
      return s
    })
    // Revenue $48,200 against $55,000, higher is better, 5% tolerance: 12% short.
    expect(section.textContent).toContain('Off track')
    expect(section.textContent).toContain('12% below the target, past the 5% tolerance')
    expect(section.textContent).toContain('$55,000')
    expect(section.textContent).toContain('No owner')
    expect(buttonNamed('Edit target')).toBeDefined()
    expect(buttonNamed('Remove target')).toBeDefined()
  })

  it('saves an edited target to the scorecard it lives in and shows the new status', async () => {
    await openWindow('revenue')
    await vi.waitFor(() => expect(buttonNamed('Edit target')).toBeDefined())
    await act(async () => buttonNamed('Edit target')!.click())

    const dialog = document.querySelector('[data-target-editor="revenue"]') as HTMLElement
    expect(dialog.getAttribute('role')).toBe('dialog')
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent).toBe('Edit the target for Revenue')
    const field = inputLabelled('Target')!
    expect(field.value).toBe('55000')

    await act(async () => typeInto(field, '45k'))
    await act(async () => buttonNamed('Save target')!.click())

    await vi.waitFor(() => expect(warehouse.putScorecard).toHaveBeenCalled())
    expect(warehouse.putScorecard).toHaveBeenCalledWith(SCORECARDS[0].id, {
      name: 'Weekly',
      rows: [{ ...SCORECARDS[0].rows[0], target: 45_000 }, SCORECARDS[0].rows[1]],
    })
    await vi.waitFor(() => expect(document.querySelector('[data-target-status]')?.textContent).toBe('On track'))
  })

  it('offers Set a target when the metric has none', async () => {
    await openWindow('orders')
    await vi.waitFor(() => expect(document.body.textContent).toContain('This metric has no target yet.'))
    expect(buttonNamed('Set a target')).toBeDefined()
  })

  it('says the target couldn’t load, without the backend’s text', async () => {
    vi.spyOn(warehouse, 'scorecards').mockRejectedValue(new Error('backend detail text'))
    const qc = await openWindow('revenue')
    await vi.waitFor(() => expect(document.querySelector('[role=alert]')?.textContent).toBe('Couldn’t load the target for Revenue. Try again, and contact support if it keeps happening.'))
    expect(document.body.textContent).not.toContain('backend detail text')
    expect(qc.getQueryData(queryKeys.warehouse.scorecards('org-1', 'wh-1'))).toBeUndefined()
  })
})
