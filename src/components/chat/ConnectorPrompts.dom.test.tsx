// @vitest-environment jsdom
//
// The connect card answers its turn with a POST to the prompt's respond URL. If that
// POST fails the run is still waiting, so the card must not count itself answered:
// it says so, and "Try again" resends the answer alone — once, however often it's clicked.

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const respondToChatPrompt = vi.fn()
vi.mock('@/lib/api/chat', () => ({ respondToChatPrompt: (...args: unknown[]) => respondToChatPrompt(...args) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/api/connectors', async (orig) => ({
  ...(await orig<typeof import('@/lib/api/connectors')>()),
  // Already connected (from Connectors, or another tab): the card answers at once.
  getConnector: vi.fn(async () => ({ ownedConnections: [{ connected: true, needsReconnect: false }], apiKeyFields: [] })),
}))

import { ConnectPromptCard } from '@/components/chat/ConnectorPrompts'
import { parsePrompt } from '@/lib/api/prompts'
import type { ConnectorConnectPrompt } from '@/types/chat'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const prompt = parsePrompt('tool_connect_prompt', {
  event: 'tool_connect_prompt', prompt_id: 'p1', respond_url: '/chats/c1/prompts/p1',
  connector_slug: 'notion', display_name: 'Notion', auth_mode: 'oauth2', provider: 'pipedream',
}) as ConnectorConnectPrompt

let container: HTMLDivElement
let root: Root
const flush = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve() })
const tryAgain = () => [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Try again'))

beforeEach(() => {
  respondToChatPrompt.mockReset()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('ConnectPromptCard under StrictMode', () => {
  // StrictMode (on in dev) mounts, cleans up and mounts again with the same refs. The
  // cleanup marks the card aborted; if the second mount does not clear that, the card
  // never answers its turn, even for an app that is already connected.
  it('still answers an already-connected app after the double mount', async () => {
    respondToChatPrompt.mockResolvedValue(undefined)
    const onConnected = vi.fn()
    await act(async () => root.render(<React.StrictMode><ConnectPromptCard prompt={prompt} onConnected={onConnected} /></React.StrictMode>))
    await flush()
    expect(respondToChatPrompt).toHaveBeenCalledTimes(1)
    expect(onConnected).toHaveBeenCalledTimes(1)
  })
})

describe('ConnectPromptCard when the answer does not reach the backend', () => {
  it('does not report connected, shows the error, and offers a retry', async () => {
    respondToChatPrompt.mockRejectedValueOnce(new Error('Network error'))
    const onConnected = vi.fn()
    await act(async () => root.render(<ConnectPromptCard prompt={prompt} onConnected={onConnected} />))
    await flush()

    expect(respondToChatPrompt).toHaveBeenCalledTimes(1)
    expect(onConnected).not.toHaveBeenCalled()
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Network error')
    expect(tryAgain()).toBeDefined()
  })

  it('"Try again" resends the answer and then reports connected', async () => {
    respondToChatPrompt.mockRejectedValueOnce(new Error('Network error')).mockResolvedValueOnce(undefined)
    const onConnected = vi.fn()
    await act(async () => root.render(<ConnectPromptCard prompt={prompt} onConnected={onConnected} />))
    await flush()

    await act(async () => tryAgain()!.click())
    await flush()

    expect(respondToChatPrompt).toHaveBeenCalledTimes(2)
    expect(respondToChatPrompt).toHaveBeenLastCalledWith('connected', '/chats/c1/prompts/p1')
    expect(onConnected).toHaveBeenCalledTimes(1)
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(tryAgain()).toBeUndefined()
  })

  it('sends one answer while one is in flight, however often retry is clicked', async () => {
    let release!: () => void
    respondToChatPrompt
      .mockRejectedValueOnce(new Error('Network error'))
      .mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve }))
    const onConnected = vi.fn()
    await act(async () => root.render(<ConnectPromptCard prompt={prompt} onConnected={onConnected} />))
    await flush()

    const button = tryAgain()!
    await act(async () => { button.click(); button.click(); button.click() })
    expect(respondToChatPrompt).toHaveBeenCalledTimes(2)

    await act(async () => release())
    await flush()
    expect(onConnected).toHaveBeenCalledTimes(1)
  })
})
