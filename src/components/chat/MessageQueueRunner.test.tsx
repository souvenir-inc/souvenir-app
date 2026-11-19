// @vitest-environment jsdom
//
// MessageQueueRunner: a chat's queued messages go out in the background, one
// per reply, once the reply each was waiting on finishes — but only for a chat
// that isn't on screen, never after a reply that failed, and not while out of
// credits.

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const fetchAiResponse = vi.fn()
let creditsBlocked = false

vi.mock('@/hooks/use-streaming-chat', () => ({
  useStreamingChat: () => ({ fetchAiResponse, handleStopGeneration: vi.fn() }),
}))
vi.mock('@/context/auth-context', () => ({ useAuth: () => ({ refreshUser: vi.fn() }) }))
vi.mock('@/context/chat-history-context', () => ({ useChatHistoryContext: () => ({ moveToTop: vi.fn() }) }))
vi.mock('@/context/org-context', () => ({ useOrgPlan: () => ({ plan: null }) }))
vi.mock('@/hooks/use-credit-status', () => ({ useCreditStatus: () => ({ blocked: creditsBlocked }) }))
vi.mock('@/lib/analytics/events', () => ({ trackBrowserEvent: vi.fn() }))
// Whether the backend still has a run going for the chat: none, unless a test says so.
const getChatRunState = vi.fn()
vi.mock('@/lib/api/chat', () => ({ getChatRunState: (...args: unknown[]) => getChatRunState(...args) }))

import { MessageQueueRunner, RUN_CHECK_ATTEMPTS, RUN_POLL_MS } from './MessageQueueRunner'
import { getChatQueue, queueMessage, setQueueForeground, takeAllQueuedMessages } from '@/lib/message-queue'
import { completeStream, isStreamActive, registerStream } from '@/lib/stream-registry'

let container: HTMLDivElement
let root: Root
// Ends the background send that is running, as its stream would.
let finishSend: (outcome: string) => void

const context = { settings: { pinsEnabled: true, webSearch: true }, modelId: 7 }
const view = Symbol('view')

beforeEach(async () => {
  creditsBlocked = false
  getChatRunState.mockReset()
  getChatRunState.mockResolvedValue('idle')
  fetchAiResponse.mockReset()
  fetchAiResponse.mockImplementation((_input: string, chatId: string) => new Promise((resolve) => {
    finishSend = (outcome) => { completeStream(chatId, outcome as 'done'); resolve(outcome) }
  }))
  container = document.createElement('div')
  root = createRoot(container)
  await act(async () => root.render(<MessageQueueRunner />))
})

afterEach(async () => {
  await act(async () => root.unmount())
  setQueueForeground(view, null)
  takeAllQueuedMessages('chat-1')
  completeStream('chat-1')
})

async function queueBehindReply(...contents: string[]) {
  await act(async () => {
    registerStream('chat-1')
    for (const content of contents) queueMessage('chat-1', { content, attachments: [], mentionedPins: [] }, context)
  })
}

const sentInputs = () => fetchAiResponse.mock.calls.map((call) => call[0])

describe('MessageQueueRunner', () => {
  it('sends a queued message once the reply before it finishes', async () => {
    await queueBehindReply('and then this')
    expect(fetchAiResponse).not.toHaveBeenCalled()

    await act(async () => completeStream('chat-1', 'done'))
    expect(fetchAiResponse).toHaveBeenCalledOnce()
    const [input, chatId, , modelId, options] = fetchAiResponse.mock.calls[0]
    expect([input, chatId, modelId]).toEqual(['and then this', 'chat-1', 7])
    expect(options).toMatchObject({ webSearch: true })
    expect(getChatQueue('chat-1')).toBeUndefined()
    // Reserved, so opening the chat now waits for this reply too.
    expect(isStreamActive('chat-1')).toBe(true)

    await act(async () => finishSend('done'))
    expect(isStreamActive('chat-1')).toBe(false)
  })

  it('sends several queued messages one at a time, each after the reply before it', async () => {
    await queueBehindReply('first', 'second')
    await act(async () => completeStream('chat-1', 'done'))
    expect(sentInputs()).toEqual(['first'])

    await act(async () => finishSend('done'))
    expect(sentInputs()).toEqual(['first', 'second'])

    await act(async () => finishSend('done'))
    expect(getChatQueue('chat-1')).toBeUndefined()
  })

  it('stops sending when one of them fails', async () => {
    await queueBehindReply('first', 'second')
    await act(async () => completeStream('chat-1', 'done'))
    await act(async () => finishSend('error'))
    expect(sentInputs()).toEqual(['first'])
    expect(getChatQueue('chat-1')).toMatchObject({ heldBy: 'error' })
  })

  it('leaves a chat on screen to its own view', async () => {
    await act(async () => setQueueForeground(view, 'chat-1'))
    await queueBehindReply('and then this')
    await act(async () => completeStream('chat-1', 'done'))
    expect(fetchAiResponse).not.toHaveBeenCalled()

    // …until the user leaves it.
    await act(async () => setQueueForeground(view, 'chat-2'))
    expect(fetchAiResponse).toHaveBeenCalledOnce()
  })

  it('holds the queue when the reply before it fails', async () => {
    await queueBehindReply('and then this')
    await act(async () => completeStream('chat-1', 'error'))
    expect(fetchAiResponse).not.toHaveBeenCalled()
    expect(getChatQueue('chat-1')?.heldBy).toBe('error')
  })

  it('does not send into a run the backend still has going, though this tab thinks the chat is idle', async () => {
    // The chat was left while its run was being recovered: nothing here marks it busy,
    // but the backend's run has not ended yet.
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    try {
      getChatRunState.mockResolvedValue('running')
      await act(async () => {
        queueMessage('chat-1', { content: 'and then this', attachments: [], mentionedPins: [] }, context)
      })
      await act(async () => { await Promise.resolve() })
      expect(fetchAiResponse).not.toHaveBeenCalled()
      expect(getChatRunState).toHaveBeenCalledWith('chat-1')
      // Held for the message the whole time, so nothing else sends to the chat either.
      expect(isStreamActive('chat-1')).toBe(true)

      // Still running at the next check; ended at the one after.
      await act(async () => { await vi.advanceTimersByTimeAsync(RUN_POLL_MS) })
      expect(fetchAiResponse).not.toHaveBeenCalled()
      getChatRunState.mockResolvedValue('idle')
      await act(async () => { await vi.advanceTimersByTimeAsync(RUN_POLL_MS) })
      expect(fetchAiResponse).toHaveBeenCalledOnce()
      expect(sentInputs()).toEqual(['and then this'])
    } finally {
      vi.useRealTimers()
    }
    await act(async () => finishSend('done'))
  })

  // A failed check is "can't tell", not "idle": rejected requests and non-OK responses
  // (getChatRunState throws for both) keep the message waiting, then hold it.
  for (const [label, failure] of [
    ['a rejected request', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['a non-OK response', () => Promise.reject(new Error("Couldn't read the chat's run state (503)"))],
  ] as const) {
    it(`holds the message, unsent, when the run state can't be read (${label})`, async () => {
      vi.useFakeTimers({ toFake: ['setTimeout'] })
      try {
        getChatRunState.mockImplementation(failure)
        await act(async () => {
          queueMessage('chat-1', { content: 'and then this', attachments: [], mentionedPins: [] }, context)
        })
        for (let i = 0; i < RUN_CHECK_ATTEMPTS; i++) {
          await act(async () => { await vi.advanceTimersByTimeAsync(RUN_POLL_MS) })
        }
        expect(getChatRunState).toHaveBeenCalledTimes(RUN_CHECK_ATTEMPTS)
        expect(fetchAiResponse).not.toHaveBeenCalled()
        // Back in its queue, which is held; the reservation is released.
        expect(getChatQueue('chat-1')).toMatchObject({ heldBy: 'error', messages: [{ content: 'and then this' }] })
        expect(isStreamActive('chat-1')).toBe(false)
      } finally {
        vi.useRealTimers()
      }
    })
  }

  it('stops waiting, and sends nothing, once the runner unmounts', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    try {
      getChatRunState.mockResolvedValue('running')
      await act(async () => {
        queueMessage('chat-1', { content: 'and then this', attachments: [], mentionedPins: [] }, context)
      })
      await act(async () => { await Promise.resolve() })
      const checksBefore = getChatRunState.mock.calls.length
      await act(async () => root.unmount())
      getChatRunState.mockResolvedValue('idle')
      await act(async () => { await vi.advanceTimersByTimeAsync(RUN_POLL_MS * 3) })
      expect(fetchAiResponse).not.toHaveBeenCalled()
      expect(getChatRunState.mock.calls.length).toBe(checksBefore)
      // The message is back in its queue and the reservation is released.
      expect(getChatQueue('chat-1')?.messages.map((m) => m.content)).toEqual(['and then this'])
      expect(isStreamActive('chat-1')).toBe(false)
    } finally {
      vi.useRealTimers()
    }
    // afterEach unmounts too; give it something to unmount.
    root = createRoot(container)
  })

  it('keeps checking after a failed check and sends once the run is seen to have ended', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    try {
      getChatRunState.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue('idle')
      await act(async () => {
        queueMessage('chat-1', { content: 'and then this', attachments: [], mentionedPins: [] }, context)
      })
      await act(async () => { await Promise.resolve() })
      expect(fetchAiResponse).not.toHaveBeenCalled()
      await act(async () => { await vi.advanceTimersByTimeAsync(RUN_POLL_MS) })
      expect(fetchAiResponse).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
    await act(async () => finishSend('done'))
  })

  it('waits while out of credits', async () => {
    creditsBlocked = true
    await act(async () => root.render(<MessageQueueRunner key="blocked" />))
    await queueBehindReply('and then this')
    await act(async () => completeStream('chat-1', 'done'))
    expect(fetchAiResponse).not.toHaveBeenCalled()
    expect(getChatQueue('chat-1')?.messages).toHaveLength(1)
  })
})
