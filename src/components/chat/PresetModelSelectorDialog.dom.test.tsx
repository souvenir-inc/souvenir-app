// @vitest-environment jsdom
//
// The model picker sits on the popover layer, above dialogs, so it must not stay open
// once focus has gone elsewhere — a modal opened from the keyboard takes focus without
// any mouse press, and would otherwise open underneath it.

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LazyMotion, domAnimation } from 'framer-motion'

const close = vi.fn()
const selectModel = vi.fn()
let anchor: HTMLButtonElement
let models: unknown[] = []
vi.mock('@/context/model-selector-context', () => ({
  useModelSelectorContext: () => ({
    models, selectedModel: null, selectModel, isOpen: true, anchorEl: anchor, close,
  }),
}))
vi.mock('@/lib/analytics/events', () => ({ trackFeature: vi.fn() }))
// jsdom has no ResizeObserver; the popover only uses it to measure, so an inert one will do.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver

import { PresetModelSelectorDialog } from '@/components/chat/PresetModelSelectorDialog'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root
let outside: HTMLButtonElement

beforeEach(() => {
  close.mockReset()
  models = []
  anchor = document.createElement('button')
  outside = document.createElement('button')
  document.body.append(anchor, outside)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove(); anchor.remove(); outside.remove()
})

async function renderOpen() {
  await act(async () => root.render(<LazyMotion features={domAnimation}><PresetModelSelectorDialog /></LazyMotion>))
  await act(async () => { await Promise.resolve() })
}

describe('PresetModelSelectorDialog', () => {
  it('closes when focus moves outside it', async () => {
    await renderOpen()
    expect(document.querySelector('[aria-label="Select model"]')).not.toBeNull()
    await act(async () => outside.focus())
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('stays open while focus is inside it or on its trigger', async () => {
    await renderOpen()
    // Inside the panel's content (the Popover), where every control of the picker lives.
    const inner = document.createElement('input')
    document.querySelector('[aria-label="Select model"]')!.firstElementChild!.appendChild(inner)
    await act(async () => inner.focus())
    await act(async () => anchor.focus())
    expect(close).not.toHaveBeenCalled()
  })

  it('moves focus into the panel when it opens, so Tab from the trigger reaches the models', async () => {
    models = [{ id: 'm1', modelId: 1, modelName: 'Model One', companyName: 'Acme', modelType: 'chat' }]
    anchor.focus()
    await renderOpen()
    await act(async () => { await new Promise((resolve) => requestAnimationFrame(() => resolve(null))) })
    const panel = document.querySelector('[aria-label="Select model"]')!
    expect(panel.contains(document.activeElement)).toBe(true)
    expect(close).not.toHaveBeenCalled()
  })

  it('returns focus to the trigger on Escape', async () => {
    await renderOpen()
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })
    expect(close).toHaveBeenCalled()
    expect(document.activeElement).toBe(anchor)
  })

  it('returns focus to the trigger once a model is chosen', async () => {
    models = [{ id: 'm1', modelId: 1, modelName: 'Model One', companyName: 'Acme', modelType: 'chat' }]
    await renderOpen()
    // Let the panel take focus first (its open frame), as it does before anyone can click.
    await act(async () => { await new Promise((resolve) => requestAnimationFrame(() => resolve(null))) })
    const row = [...document.querySelectorAll('[aria-label="Select model"] [role="button"]')].find((e) => e.textContent?.includes('Model One')) as HTMLElement
    await act(async () => row.click())
    expect(selectModel).toHaveBeenCalled()
    expect(document.activeElement).toBe(anchor)
  })

  it('moves focus into the panel once models arrive, when it opened before they loaded', async () => {
    anchor.focus()
    await renderOpen() // no models yet
    await act(async () => { await new Promise((resolve) => requestAnimationFrame(() => resolve(null))) })
    models = [{ id: 'm1', modelId: 1, modelName: 'Model One', companyName: 'Acme', modelType: 'chat' }]
    await renderOpen()
    await act(async () => { await new Promise((resolve) => requestAnimationFrame(() => resolve(null))) })
    expect(document.querySelector('[aria-label="Select model"]')!.contains(document.activeElement)).toBe(true)
  })
})
