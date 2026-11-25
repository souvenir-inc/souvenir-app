// @vitest-environment jsdom
//
// Editing a schedule whose trigger the Daily / Weekly fields can't express (every few minutes, an
// app event, once): it's shown as it is and saved unchanged, unless the person replaces it.

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@/lib/analytics/events', () => ({ trackFeature: vi.fn() }))
import { ScheduleEditModal } from './ScheduleEditModal'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  class Stub { observe() {} unobserve() {} disconnect() {} }
  Object.assign(globalThis, { ResizeObserver: Stub })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const button = (name: RegExp) => [...document.querySelectorAll('button')].find((b) => name.test(b.textContent ?? '')) as HTMLButtonElement

describe('ScheduleEditModal, a trigger it can’t express', () => {
  const schedule = { name: 'Watch inbox', instructions: 'Check for invoices', frequency: 'Every 5 minutes' }

  it('shows the trigger as it is and saves it unchanged', () => {
    const onSave = vi.fn()
    act(() => root.render(<ScheduleEditModal isOpen schedule={schedule} onSave={onSave} onClose={() => {}} />))
    expect(document.querySelector('[data-schedule-frequency-kept]')?.textContent).toContain('Every 5 minutes')
    expect(document.querySelector('#schedule-time')).toBeNull()
    act(() => button(/Update in Tasks/).click())
    expect(onSave).toHaveBeenCalledWith({ name: 'Watch inbox', instructions: 'Check for invoices', frequency: 'Every 5 minutes', frequencyUnchanged: true })
  })

  it('can be replaced with a daily or weekly time', () => {
    const onSave = vi.fn()
    act(() => root.render(<ScheduleEditModal isOpen schedule={schedule} onSave={onSave} onClose={() => {}} />))
    act(() => button(/Change to daily or weekly/).click())
    expect(document.querySelector('[data-schedule-frequency-kept]')).toBeNull()
    act(() => button(/Update in Tasks/).click())
    const saved = onSave.mock.calls[0][0]
    expect(saved.frequencyUnchanged).toBeUndefined()
    expect(saved.frequency).toMatch(/^Daily • 09:00/)
  })

  it('a daily schedule opens on its own fields', () => {
    act(() => root.render(<ScheduleEditModal isOpen schedule={{ ...schedule, frequency: 'Every day at 9:00 AM (UTC)' }} onSave={() => {}} onClose={() => {}} />))
    expect(document.querySelector('[data-schedule-frequency-kept]')).toBeNull()
  })
})
