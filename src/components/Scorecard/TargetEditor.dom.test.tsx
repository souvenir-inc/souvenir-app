// @vitest-environment jsdom
//
// The target editor's validation: errors appear in text on submit, the field is marked invalid and
// linked to its message, focus goes to the first wrong field, and nothing is sent until it's right.

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/client'
import { Warehouse, type ScorecardRequest } from '@/lib/api/warehouse'
import { TargetEditor } from './TargetEditor'

const toastError = vi.fn()
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: (...args: unknown[]) => toastError(...args), success: vi.fn(), dismiss: vi.fn() }) }))
vi.mock('@/context/org-context', () => ({
  useOrgIdentity: () => ({ orgId: 'org-1', orgIdReady: true }),
  useOrg: () => ({ org: { name: 'Acme' } }),
  useOrgMembers: () => ({ members: [] }),
}))
vi.mock('@/context/auth-context', () => ({ useAuth: () => ({ user: { auth0Id: 'auth0|viewer' } }) }))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root
let warehouse: Warehouse
const onClose = vi.fn()

const buttonNamed = (name: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === name)!
const inputLabelled = (text: string) => {
  const label = [...document.querySelectorAll('label')].find((l) => l.textContent?.startsWith(text))!
  return document.getElementById(label.htmlFor) as HTMLInputElement
}
const describedBy = (input: HTMLElement) =>
  (input.getAttribute('aria-describedby') ?? '').split(' ').map((id) => document.getElementById(id)?.textContent).join(' ')
function typeInto(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

beforeEach(async () => {
  class Stub { observe() {} unobserve() {} disconnect() {} }
  Object.assign(globalThis, { ResizeObserver: Stub })
  toastError.mockReset()
  onClose.mockReset()
  warehouse = new Warehouse({ id: 'wh-1', name: 'Store', timezone: 'UTC', connections: [], defaultBoard: null })
  vi.spyOn(warehouse, 'scorecards').mockResolvedValue([])
  vi.spyOn(warehouse, 'putScorecard').mockImplementation(async (id: string, request: ScorecardRequest) => ({ id, ...request, createdBy: 'auth0|viewer', updatedAt: 'now' }))
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => root.render(
    <QueryClientProvider client={qc}>
      <TargetEditor open onClose={onClose} warehouse={warehouse} metric={{ id: 'refund_rate', label: 'Refund rate', unit: 'percent', upIsGood: false }} row={null} />
    </QueryClientProvider>,
  ))
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.body.innerHTML = ''
})

describe('TargetEditor', () => {
  it('is a labelled dialog that starts on the metric’s good direction', () => {
    const dialog = document.querySelector('[role=dialog]')!
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent).toBe('Set a target for Refund rate')
    const lower = [...document.querySelectorAll('[role=radio]')].find((r) => r.closest('label')?.textContent === 'Lower is better')
    expect(lower?.getAttribute('aria-checked')).toBe('true')
    expect(inputLabelled('Tolerance').value).toBe('10')
  })

  it('an empty target shows the error in text, marks the field and moves focus to it', async () => {
    await act(async () => buttonNamed('Save target').click())
    const target = inputLabelled('Target')
    expect(target.getAttribute('aria-invalid')).toBe('true')
    expect(describedBy(target)).toContain('Enter a target, like 55k or 4.5.')
    expect(document.activeElement).toBe(target)
    expect(warehouse.putScorecard).not.toHaveBeenCalled()
  })

  it('a tolerance over 100% is refused with a message saying how to fix it', async () => {
    await act(async () => typeInto(inputLabelled('Target'), '4.5'))
    await act(async () => typeInto(inputLabelled('Tolerance'), '150'))
    await act(async () => buttonNamed('Save target').click())
    expect(describedBy(inputLabelled('Tolerance'))).toContain('Enter a tolerance from 0 to 100%.')
    expect(document.activeElement).toBe(inputLabelled('Tolerance'))
    expect(warehouse.putScorecard).not.toHaveBeenCalled()
  })

  it('saves a percent target as a share in a new Targets scorecard, then closes', async () => {
    await act(async () => typeInto(inputLabelled('Target'), '4.5'))
    await act(async () => buttonNamed('Save target').click())
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled())
    const [, request] = vi.mocked(warehouse.putScorecard).mock.calls[0]
    expect(request).toEqual({ name: 'Targets', rows: [{ metric: 'refund_rate', target: 0.045, direction: 'down', tolerance: 0.1, owner: null, note: '' }] })
  })

  it('a refused save shows one friendly message and keeps the form open', async () => {
    vi.mocked(warehouse.putScorecard).mockRejectedValue(new ApiError(403, 'forbidden', 'Forbidden', 'backend detail text'))
    await act(async () => typeInto(inputLabelled('Target'), '4.5'))
    await act(async () => buttonNamed('Save target').click())
    await vi.waitFor(() => expect(toastError).toHaveBeenCalledTimes(1))
    expect(toastError.mock.calls[0][0]).toBe('Couldn’t save the target for Refund rate. You don’t have access to change targets in this workspace. Ask a workspace admin.')
    expect(onClose).not.toHaveBeenCalled()
    expect(inputLabelled('Target').value).toBe('4.5')
  })
})
