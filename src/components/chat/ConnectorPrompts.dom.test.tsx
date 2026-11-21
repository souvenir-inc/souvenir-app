// @vitest-environment jsdom
//
// The connect card answers its turn with a POST to the prompt's respond URL. If that
// POST fails the run is still waiting, so the card must not count itself answered:
// it says so, and "Try again" resends the answer alone — once, however often it's clicked.
// Once answered (connected, or "Not now") the card is gone.

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
  // A sign-in that is under way: the server has not answered yet.
  initiateLink: vi.fn(() => new Promise(() => {})),
}))

import { ConnectPromptCard } from '@/components/chat/ConnectorPrompts'
import { getConnector } from '@/lib/api/connectors'
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
    const onDecided = vi.fn()
    await act(async () => root.render(<React.StrictMode><ConnectPromptCard prompt={prompt} onDecided={onDecided} /></React.StrictMode>))
    await flush()
    expect(respondToChatPrompt).toHaveBeenCalledTimes(1)
    expect(onDecided).toHaveBeenCalledExactlyOnceWith('connected')
  })
})

describe('ConnectPromptCard when the answer does not reach the backend', () => {
  it('does not report connected, shows the error, and offers a retry', async () => {
    respondToChatPrompt.mockRejectedValueOnce(new Error('Network error'))
    const onDecided = vi.fn()
    await act(async () => root.render(<ConnectPromptCard prompt={prompt} onDecided={onDecided} />))
    await flush()

    expect(respondToChatPrompt).toHaveBeenCalledTimes(1)
    expect(onDecided).not.toHaveBeenCalled()
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Network error')
    expect(tryAgain()).toBeDefined()
  })

  it('"Try again" resends the answer and then reports connected', async () => {
    respondToChatPrompt.mockRejectedValueOnce(new Error('Network error')).mockResolvedValueOnce(undefined)
    const onDecided = vi.fn()
    await act(async () => root.render(<ConnectPromptCard prompt={prompt} onDecided={onDecided} />))
    await flush()

    await act(async () => tryAgain()!.click())
    await flush()

    expect(respondToChatPrompt).toHaveBeenCalledTimes(2)
    expect(respondToChatPrompt).toHaveBeenLastCalledWith('connected', '/chats/c1/prompts/p1')
    expect(onDecided).toHaveBeenCalledExactlyOnceWith('connected')
    expect(container.textContent).toBe('')
  })

  it('sends one answer while one is in flight, however often retry is clicked', async () => {
    let release!: () => void
    respondToChatPrompt
      .mockRejectedValueOnce(new Error('Network error'))
      .mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve }))
    const onDecided = vi.fn()
    await act(async () => root.render(<ConnectPromptCard prompt={prompt} onDecided={onDecided} />))
    await flush()

    const button = tryAgain()!
    await act(async () => { button.click(); button.click(); button.click() })
    expect(respondToChatPrompt).toHaveBeenCalledTimes(2)
    // While it is in flight: the old failure is not shown and the card offers no other action.
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(tryAgain()).toBeDefined()
    expect([...container.querySelectorAll('button')].some((x) => x.textContent?.includes('Connect Notion'))).toBe(false)

    await act(async () => release())
    await flush()
    expect(onDecided).toHaveBeenCalledExactlyOnceWith('connected')
  })
})

describe('ConnectPromptCard "Not now"', () => {
  it('declines this ask only and the card goes away', async () => {
    vi.mocked(getConnector).mockResolvedValueOnce({ ownedConnections: [], apiKeyFields: [] } as unknown as Awaited<ReturnType<typeof getConnector>>)
    respondToChatPrompt.mockResolvedValue(undefined)
    const onDecided = vi.fn()
    await act(async () => root.render(<ConnectPromptCard prompt={prompt} onDecided={onDecided} />))
    await flush()
    expect(respondToChatPrompt).not.toHaveBeenCalled()

    const notNow = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Not now'))!
    await act(async () => notNow.click())
    await flush()

    expect(respondToChatPrompt).toHaveBeenCalledExactlyOnceWith('cancel', '/chats/c1/prompts/p1')
    expect(onDecided).toHaveBeenCalledExactlyOnceWith('cancel')
    expect(container.textContent).toBe('')
  })

  it('keeps Connect disabled while "Not now" is still being sent', async () => {
    vi.mocked(getConnector).mockResolvedValueOnce({ ownedConnections: [], apiKeyFields: [] } as unknown as Awaited<ReturnType<typeof getConnector>>)
    let release!: () => void
    respondToChatPrompt.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve }))
    await act(async () => root.render(<ConnectPromptCard prompt={prompt} />))
    await flush()
    const button = (label: string) => [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(label))
    await act(async () => button('Not now')!.click())
    await flush()
    const connect = button('Connect')!
    expect(connect.disabled).toBe(true)
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    await act(async () => connect.click())
    expect(open).not.toHaveBeenCalled()
    await act(async () => { release(); await Promise.resolve() })
    open.mockRestore()
  })

  it('keeps a failed "Not now" as the answer when a connection turns up afterwards', async () => {
    // The connection lookup answers only after the person has said "Not now".
    let lookup!: (value: unknown) => void
    vi.mocked(getConnector).mockImplementationOnce(() => new Promise((resolve) => { lookup = resolve }) as ReturnType<typeof getConnector>)
    respondToChatPrompt.mockRejectedValueOnce(new Error('Network error'))
    await act(async () => root.render(<ConnectPromptCard prompt={prompt} />))
    const notNow = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Not now'))!
    await act(async () => notNow.click())
    await flush()
    await act(async () => lookup({ ownedConnections: [{ connected: true, needsReconnect: false }], apiKeyFields: [] }))
    await flush()
    expect(respondToChatPrompt).toHaveBeenCalledTimes(1)
    expect(respondToChatPrompt).toHaveBeenCalledWith('cancel', '/chats/c1/prompts/p1')
    expect(tryAgain()).toBeDefined()
  })

  it('does not send an answer again when the card remounts while it is on its way', async () => {
    let release!: () => void
    respondToChatPrompt.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve }))
    // Already connected: the card answers on mount, and the answer is still in flight…
    await act(async () => root.render(<ConnectPromptCard prompt={prompt} />))
    await flush()
    expect(respondToChatPrompt).toHaveBeenCalledTimes(1)
    // …when the row leaves the virtual window and comes back: a new card instance mounts.
    await act(async () => root.unmount())
    root = createRoot(container)
    await act(async () => root.render(<ConnectPromptCard prompt={prompt} />))
    await flush()
    expect(respondToChatPrompt).toHaveBeenCalledTimes(1)
    await act(async () => { release(); await Promise.resolve() })
  })

  it('stays gone on remount once a decision is recorded', async () => {
    await act(async () => root.render(<ConnectPromptCard prompt={{ ...prompt, decision: 'cancel' }} />))
    await flush()
    expect(container.textContent).toBe('')
  })

  it('keeps "Not now" disabled while a sign-in is under way', async () => {
    vi.mocked(getConnector).mockResolvedValueOnce({ ownedConnections: [], apiKeyFields: [] } as unknown as Awaited<ReturnType<typeof getConnector>>)
    await act(async () => root.render(<ConnectPromptCard prompt={prompt} />))
    await flush()
    const button = (label: string) => [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(label))!
    expect(button('Not now').disabled).toBe(false)
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    await act(async () => button('Connect').click())
    await flush()
    expect(button('Not now').disabled).toBe(true)
    await act(async () => button('Not now').click())
    expect(respondToChatPrompt).not.toHaveBeenCalled()
    open.mockRestore()
  })
})
