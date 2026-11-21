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
import { answersInFlight, failedAnswers, resetConnectPromptAnswers } from '@/components/chat/connector-prompt-answers'
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
  resetConnectPromptAnswers()
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

  it('tells the view it is on when an answer it took over goes through', async () => {
    let release!: () => void
    respondToChatPrompt.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve }))
    const leftView = vi.fn()
    await act(async () => root.render(<ConnectPromptCard prompt={prompt} onAnswered={leftView} />)) // answers on mount
    await flush()
    await act(async () => root.unmount()) // the row leaves mid-answer…
    root = createRoot(container)
    const shownView = vi.fn()
    await act(async () => root.render(<ConnectPromptCard prompt={prompt} onAnswered={shownView} />)) // …and comes back
    await flush()
    await act(async () => { release(); await Promise.resolve() })
    await flush()
    expect(shownView).toHaveBeenCalledOnce() // the view on screen refreshes
    expect(respondToChatPrompt).toHaveBeenCalledTimes(1)
  })

  it('shows a failed answer, with Try again, on the card that remounted while it was being sent', async () => {
    let fail!: (e: Error) => void
    respondToChatPrompt.mockImplementationOnce(() => new Promise<void>((_, reject) => { fail = reject }))
    await act(async () => root.render(<ConnectPromptCard prompt={prompt} />)) // connected: answers on mount
    await flush()
    await act(async () => root.unmount()) // the row leaves the virtual window mid-answer…
    root = createRoot(container)
    await act(async () => root.render(<ConnectPromptCard prompt={prompt} />)) // …and comes back
    await flush()
    await act(async () => { fail(new Error('Network error')); await Promise.resolve() })
    await flush()
    expect(respondToChatPrompt).toHaveBeenCalledTimes(1)
    expect(tryAgain()).toBeDefined() // the failure reached the card on screen
  })

  it('sees a failure that lands between the remounted card rendering and its effect running', async () => {
    let fail!: (e: Error) => void
    respondToChatPrompt.mockImplementationOnce(() => new Promise<void>((_, reject) => { fail = reject }))
    await act(async () => root.render(<ConnectPromptCard prompt={prompt} />)) // connected: answers on mount
    await flush()
    await act(async () => root.unmount())
    // The new card renders (taking note of the answer in flight); before its effect runs, that
    // answer's entry is gone (its sender settled it). Rendered after the card, in the same
    // pass, so the order is fixed: the card's render, then this, then the card's effect.
    let cleared = false
    const SettleBeforeEffects = () => { if (!cleared) { cleared = true; resetConnectPromptAnswers() } return null }
    root = createRoot(container)
    await act(async () => root.render(<><ConnectPromptCard prompt={prompt} /><SettleBeforeEffects /></>))
    await act(async () => { fail(new Error('Network error')); await Promise.resolve() })
    await flush()
    expect(tryAgain()).toBeDefined() // the failure still reached the card
    expect(respondToChatPrompt).toHaveBeenCalledTimes(1)
  })

  it('does not take another message’s pending answer for its own when the request id repeats', async () => {
    let release!: () => void
    respondToChatPrompt.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve }))
    respondToChatPrompt.mockResolvedValueOnce(undefined)
    const other = { ...prompt, respond_url: '/chats/c1/prompts/p1-second' } as ConnectorConnectPrompt
    await act(async () => root.render(<ConnectPromptCard prompt={prompt} />)) // m1/p1 answers on mount (connected)
    await flush()
    const second = createRoot(document.createElement('div'))
    await act(async () => second.render(<ConnectPromptCard prompt={other} />)) // m2/p1 mounts meanwhile
    await flush()
    expect(respondToChatPrompt).toHaveBeenCalledWith('connected', '/chats/c1/prompts/p1-second') // it answers for itself
    await act(async () => { release(); await Promise.resolve() })
    act(() => second.unmount())
  })

  it('keeps a "Not now" that failed after its card left, and never answers "connected" for it', async () => {
    vi.mocked(getConnector).mockResolvedValueOnce({ ownedConnections: [], apiKeyFields: [] } as unknown as Awaited<ReturnType<typeof getConnector>>)
    let fail!: (e: Error) => void
    respondToChatPrompt.mockImplementationOnce(() => new Promise<void>((_, reject) => { fail = reject }))
    await act(async () => root.render(<ConnectPromptCard prompt={prompt} />))
    await flush()
    const notNow = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Not now'))!
    await act(async () => notNow.click())
    await act(async () => root.unmount()) // the row leaves the screen…
    await act(async () => { fail(new Error('Network error')); await Promise.resolve() }) // …and the decline fails
    await flush()
    // The card comes back; the app is connected by now (the default lookup).
    root = createRoot(container)
    await act(async () => root.render(<ConnectPromptCard prompt={prompt} />))
    await flush()
    expect(respondToChatPrompt).toHaveBeenCalledTimes(1) // no "connected" sent
    expect(tryAgain()).toBeDefined() // the decline is offered again
    respondToChatPrompt.mockResolvedValueOnce(undefined)
    await act(async () => tryAgain()!.click())
    await flush()
    expect(respondToChatPrompt).toHaveBeenLastCalledWith('cancel', '/chats/c1/prompts/p1')
  })

  it('tells the view once when an answer it took over goes through under Strict Mode', async () => {
    let release!: () => void
    respondToChatPrompt.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve }))
    await act(async () => root.render(<ConnectPromptCard prompt={prompt} />)) // answers on mount
    await flush()
    await act(async () => root.unmount())
    root = createRoot(container)
    const shownView = vi.fn()
    await act(async () => root.render(<React.StrictMode><ConnectPromptCard prompt={prompt} onAnswered={shownView} /></React.StrictMode>))
    await flush()
    await act(async () => { release(); await Promise.resolve() })
    await flush()
    expect(shownView).toHaveBeenCalledOnce()
  })

  it('holds its actions while it waits on an answer that started after it rendered', async () => {
    vi.mocked(getConnector).mockResolvedValueOnce({ ownedConnections: [], apiKeyFields: [] } as unknown as Awaited<ReturnType<typeof getConnector>>)
    let release!: (v: Error | null) => void
    const outcome = new Promise<Error | null>((resolve) => { release = resolve })
    // Another card's answer starts after this card rendered and before its effect ran.
    let started = false
    const StartAnswer = () => { if (!started) { started = true; answersInFlight.set(prompt.respond_url, { decision: 'connected', outcome }) } return null }
    await act(async () => root.render(<><ConnectPromptCard prompt={prompt} /><StartAnswer /></>))
    await flush()
    const connect = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Connect'))
    expect(connect?.disabled ?? true).toBe(true) // no sign-in can start while that answer is out
    await act(async () => { release(null); await Promise.resolve() })
  })

  it('keeps a "Not now" that failed after it rendered, before its effect ran, over a connection', async () => {
    // Connected by now (the default lookup), but a decline failed between render and effect.
    let recorded = false
    const RecordFailure = () => { if (!recorded) { recorded = true; failedAnswers.set(prompt.respond_url, { decision: 'cancel', message: 'Network error' }) } return null }
    await act(async () => root.render(<><ConnectPromptCard prompt={prompt} /><RecordFailure /></>))
    await flush()
    expect(respondToChatPrompt).not.toHaveBeenCalled() // no "connected"
    expect(tryAgain()).toBeDefined() // the decline is offered again
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
