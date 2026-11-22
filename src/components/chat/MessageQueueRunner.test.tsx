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
import { trackBrowserEvent } from '@/lib/analytics/events'
import { getChatQueue, queueMessage, setQueueForeground, takeAllQueuedMessages } from '@/lib/message-queue'
import { completeStream, detachStream, isStreamActive, registerStream } from '@/lib/stream-registry'

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

  it('puts a refused message back at the front of its queue, held', async () => {
    await queueBehindReply('first', 'second')
    await act(async () => completeStream('chat-1', 'done'))
    const options = fetchAiResponse.mock.calls[0][4] as { onSendRefused?: () => void }
    await act(async () => { options.onSendRefused?.(); finishSend('error') })
    expect(getChatQueue('chat-1')?.messages.map((m) => m.content)).toEqual(['first', 'second'])
    expect(getChatQueue('chat-1')).toMatchObject({ heldBy: 'error' })
  })

  it('holds a refused message that was the last in its queue, rather than sending it again', async () => {
    await queueBehindReply('only')
    await act(async () => completeStream('chat-1', 'done'))
    const options = fetchAiResponse.mock.calls[0][4] as { onSendRefused?: () => void }
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      await act(async () => { options.onSendRefused?.(); finishSend('error') })
      await act(async () => { await vi.runAllTimersAsync() }) // any retry would have gone out by now
    } finally {
      vi.useRealTimers()
    }
    expect(fetchAiResponse).toHaveBeenCalledOnce()
    expect(getChatQueue('chat-1')?.messages.map((m) => m.content)).toEqual(['only'])
    expect(getChatQueue('chat-1')).toMatchObject({ heldBy: 'error' })
  })

  it('does not put back a message whose send failed in a way the backend may have taken it', async () => {
    await queueBehindReply('first', 'second')
    await act(async () => completeStream('chat-1', 'done'))
    await act(async () => finishSend('error'))
    expect(getChatQueue('chat-1')?.messages.map((m) => m.content)).toEqual(['second'])
  })

  it('counts a send only when it goes out, not for a wait that ends in a hand-over', async () => {
    vi.mocked(trackBrowserEvent).mockClear()
    vi.useFakeTimers()
    try {
      getChatRunState.mockResolvedValue('running')
      await queueBehindReply('first')
      await act(async () => completeStream('chat-1', 'done'))
      await act(async () => { await vi.advanceTimersByTimeAsync(RUN_POLL_MS) }) // waiting on the run
      await act(async () => { setQueueForeground(view, 'chat-1'); detachStream('chat-1') }) // handed over
      await act(async () => { await vi.advanceTimersByTimeAsync(10) })
      expect(trackBrowserEvent).not.toHaveBeenCalled()
      await act(async () => setQueueForeground(view, null)) // the user leaves: the runner sends it
      getChatRunState.mockResolvedValue('idle')
      await act(async () => { await vi.advanceTimersByTimeAsync(RUN_POLL_MS * 2) })
      expect(fetchAiResponse).toHaveBeenCalledOnce()
      expect(vi.mocked(trackBrowserEvent).mock.calls.filter(([name]) => name === 'chat_message_sent')).toHaveLength(1)
      await act(async () => finishSend('done'))
    } finally {
      vi.useRealTimers()
    }
  })

  it('hands a waiting message over to the chat when it is opened, without making it wait', async () => {
    // The clock is fake from the start, so the runner's own polls run on it.
    vi.useFakeTimers()
    try {
      getChatRunState.mockResolvedValue('running') // the previous run is still going
      await queueBehindReply('first')
      await act(async () => completeStream('chat-1', 'done'))
      await act(async () => { await vi.advanceTimersByTimeAsync(RUN_POLL_MS) })
      expect(getChatRunState.mock.calls.length).toBeGreaterThanOrEqual(2) // it is polling
      expect(isStreamActive('chat-1')).toBe(true) // reserved while it waits
      // The chat opens: its view marks the queue as on screen and frees the chat.
      await act(async () => {
        setQueueForeground(view, 'chat-1')
        expect(detachStream('chat-1')).toBe(true)
      })
      expect(isStreamActive('chat-1')).toBe(false)
      await act(async () => { await vi.advanceTimersByTimeAsync(10) })
      expect(getChatQueue('chat-1')?.messages.map((m) => m.content)).toEqual(['first'])
      expect(getChatQueue('chat-1')?.heldBy).toBeUndefined()
      // Through several more poll intervals, now with the run over: no further checks, no send.
      const checks = getChatRunState.mock.calls.length
      getChatRunState.mockResolvedValue('idle')
      await act(async () => { await vi.advanceTimersByTimeAsync(RUN_POLL_MS * 3) })
      expect(getChatRunState.mock.calls.length).toBe(checks)
      expect(fetchAiResponse).not.toHaveBeenCalled() // the open chat sends it, not the runner
    } finally {
      vi.useRealTimers()
    }
  })

  it("sends a turn for a chat's own endpoint without asking the chat API about its run", async () => {
    getChatRunState.mockResolvedValue('running') // would hold it, if it were asked
    await act(async () => {
      registerStream('chat-1')
      queueMessage('chat-1', { content: 'agent', attachments: [], mentionedPins: [] }, { ...context, endpoint: '/api/agents/a1/chat' })
    })
    await act(async () => completeStream('chat-1', 'done'))
    expect(getChatRunState).not.toHaveBeenCalled()
    expect(sentInputs()).toEqual(['agent'])
    await act(async () => finishSend('done'))
  })

  it('keeps the next message from overtaking a handed-over one while it is on its way back', async () => {
    getChatRunState.mockResolvedValue('running')
    await queueBehindReply('first', 'second')
    await act(async () => completeStream('chat-1', 'done'))
    // The chat opens and hands the first message back, then is left again at once.
    await act(async () => {
      setQueueForeground(view, 'chat-1')
      expect(detachStream('chat-1')).toBe(true)
      setQueueForeground(view, null)
    })
    expect(fetchAiResponse).not.toHaveBeenCalled() // the second did not go out in the gap
    // (The chat is free for a moment here, but under load the hand-back can already be done,
    // so that in-between state is not asserted.)
    // Wait for the first message to be reclaimed: back at the front, the background takes it
    // again and reserves the chat once more. The second still waits behind it.
    // (Generous timeout: under a full test run the hand-back and remount can take a while.)
    await vi.waitFor(() => {
      expect(isStreamActive('chat-1')).toBe(true)
      expect(getChatRunState.mock.calls.length).toBeGreaterThan(1) // a fresh worker is checking for it
    }, { timeout: 5000 })
    expect(getChatQueue('chat-1')?.messages.map((m) => m.content)).toEqual(['second'])
  })

  it('does not hand over a message once it is being sent', async () => {
    await queueBehindReply('first')
    await act(async () => completeStream('chat-1', 'done'))
    expect(fetchAiResponse).toHaveBeenCalledOnce()
    expect(detachStream('chat-1')).toBe(false)
    expect(getChatQueue('chat-1')).toBeUndefined()
    await act(async () => finishSend('done'))
  })

  it('puts a message back if the runner goes away before its worker mounts', async () => {
    getChatRunState.mockResolvedValue('running')
    await queueBehindReply('first')
    // The reply ends and the app unmounts in the same update: the worker never mounts.
    await act(async () => { completeStream('chat-1', 'done'); root.unmount() })
    await act(async () => { await Promise.resolve() })
    expect(getChatQueue('chat-1')?.messages.map((m) => m.content)).toEqual(['first'])
    expect(isStreamActive('chat-1')).toBe(false)
    expect(fetchAiResponse).not.toHaveBeenCalled()
    root = createRoot(container) // for teardown
  })

  it("puts back only its own reservations when another runner is taking messages meanwhile", async () => {
    const other = createRoot(document.createElement('div'))
    await act(async () => other.render(<MessageQueueRunner />)) // a second runner, mounted alongside
    try {
      await queueBehindReply('first')
      // The first runner takes the message and goes away before its worker mounts. Its message
      // goes back, the second runner takes it: that reservation is the second runner's own.
      await act(async () => { completeStream('chat-1', 'done'); root.unmount() })
      await act(async () => { await Promise.resolve() })
      expect(getChatQueue('chat-1')).toBeUndefined()
      expect(sentInputs()).toEqual(['first']) // sent once, by the second runner
      await act(async () => finishSend('done'))
    } finally {
      await act(async () => other.unmount()) // even if an assertion failed: it shares the queue
      root = createRoot(container) // for teardown
    }
  })

  it('with two runners, sends one message per reply for a chat', async () => {
    const other = createRoot(document.createElement('div'))
    await act(async () => other.render(<MessageQueueRunner />))
    try {
      await queueBehindReply('first', 'second')
      await act(async () => completeStream('chat-1', 'done'))
      expect(sentInputs()).toEqual(['first']) // only one runner took a message
      expect(getChatQueue('chat-1')?.messages.map((m) => m.content)).toEqual(['second'])
      await act(async () => finishSend('done'))
      expect(sentInputs()).toEqual(['first', 'second']) // the next goes once the first is done
      await act(async () => finishSend('done'))
    } finally {
      await act(async () => other.unmount()) // even if an assertion failed: it shares the queue
    }
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

  // Unmounting stops a wait at once: no timer has to run out, no request has to answer.
  for (const [label, check] of [
    ['during the pause between checks', () => Promise.resolve('running')],
    ['while a check is still out', () => new Promise(() => {})],
  ] as const) {
    it(`stops at once when unmounted ${label}`, async () => {
      vi.useFakeTimers({ toFake: ['setTimeout'] })
      try {
        getChatRunState.mockImplementation(check)
        await act(async () => {
          queueMessage('chat-1', { content: 'and then this', attachments: [], mentionedPins: [] }, context)
        })
        await act(async () => { await Promise.resolve() })
        expect(isStreamActive('chat-1')).toBe(true)
        await act(async () => root.unmount())
        // No timers advanced: only microtasks run.
        for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve() })
        expect(fetchAiResponse).not.toHaveBeenCalled()
        expect(getChatQueue('chat-1')?.messages.map((m) => m.content)).toEqual(['and then this'])
        expect(isStreamActive('chat-1')).toBe(false)
      } finally {
        vi.useRealTimers()
      }
      root = createRoot(container)
    })
  }

  it('still sends exactly once under Strict Mode (mount, cleanup, mount is not an unmount)', async () => {
    await act(async () => root.unmount())
    root = createRoot(container)
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    try {
      await act(async () => root.render(<React.StrictMode><MessageQueueRunner /></React.StrictMode>))
      // The run is still going at the first check, so the send has to wait through a
      // pause: a Strict Mode cleanup taken for an unmount would cancel it there.
      getChatRunState.mockResolvedValueOnce('running').mockResolvedValue('idle')
      await queueBehindReply('and then this')
      await act(async () => completeStream('chat-1', 'done'))
      await act(async () => { await vi.advanceTimersByTimeAsync(RUN_POLL_MS) })
      expect(sentInputs()).toEqual(['and then this'])
    } finally {
      vi.useRealTimers()
    }
    await act(async () => finishSend('done'))
  })

  it('keeps a message queued, unsent, if credits run out while it waits, and sends it once they are back', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    try {
      getChatRunState.mockResolvedValue('running')
      await act(async () => {
        queueMessage('chat-1', { content: 'and then this', attachments: [], mentionedPins: [] }, context)
      })
      await act(async () => { await Promise.resolve() })
      // Credits run out while it waits; then the run ends.
      creditsBlocked = true
      await act(async () => root.render(<MessageQueueRunner />))
      getChatRunState.mockResolvedValue('idle')
      await act(async () => { await vi.advanceTimersByTimeAsync(RUN_POLL_MS) })
      expect(fetchAiResponse).not.toHaveBeenCalled()
      // Still queued, not held, and the chat no longer reserved.
      expect(getChatQueue('chat-1')).toMatchObject({ messages: [{ content: 'and then this' }] })
      expect(getChatQueue('chat-1')?.heldBy).toBeUndefined()
      expect(isStreamActive('chat-1')).toBe(false)
      // Credits back: the runner sends it.
      creditsBlocked = false
      await act(async () => root.render(<MessageQueueRunner />))
      await act(async () => { await vi.advanceTimersByTimeAsync(0) })
      expect(sentInputs()).toEqual(['and then this'])
    } finally {
      vi.useRealTimers()
    }
    await act(async () => finishSend('done'))
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
