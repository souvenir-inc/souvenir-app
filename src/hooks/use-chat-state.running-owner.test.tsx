// @vitest-environment jsdom
//
// The running reply belongs to one chat. When chatId changes without a remount, the
// first render for the new chat runs before any reset effect can clear the old value,
// and ChatInterface would then follow chat A's reply as if it were chat B's.

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useChatState } from '@/hooks/use-chat-state'
import { clearChatHistories } from '@/lib/chat/chat-message-cache'
import { completeStream, registerStream, reportStopped } from '@/lib/stream-registry'
import type { Message } from '@/types/chat'

const getChatMessages = vi.hoisted(() => vi.fn())
const getChatStreamId = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api/chat', () => ({ getChatMessages, getChatStreamId }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const run = { id: 'turn-A', status: 'running', segments: 1, startedAt: '2026-01-01T00:00:00Z' }
const msg = (id: string, chatId: string, extra: Partial<Message> = {}): Message =>
  ({ id, role: 'user', content: id, created_at: '2026-01-01T00:00:00Z', chat_id: chatId, ...extra } as Message)

let container: HTMLDivElement
let root: Root
// Every value the hook hands out, render by render, tagged with the chat it was rendered for.
let seen: Array<{ chatId: string; running: string | null }>

function Harness({ chatId }: { chatId: string }) {
  const api = useChatState(chatId)
  seen.push({ chatId, running: api.runningMessageId })
  return null
}

beforeEach(() => {
  clearChatHistories()
  seen = []
  getChatStreamId.mockReset()
  getChatMessages.mockReset()
  container = document.createElement('div')
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  clearChatHistories()
})

describe('runningMessageId across a chat switch', () => {
  it('is never chat A\'s reply in any render for chat B', async () => {
    getChatStreamId.mockImplementation(async (chatId: string) => (chatId === 'a' ? 'turn-A' : null))
    getChatMessages.mockImplementation((chatId: string) => chatId === 'a'
      ? Promise.resolve({
          messages: [msg('m1', 'a'), msg('turn-A', 'a', { role: 'assistant', content: '', run } as Partial<Message>)],
          has_more: false, next_cursor: null,
        })
      // B's history never arrives within the test: only renders before it loads are checked.
      : new Promise(() => {}))

    await act(async () => { root.render(<Harness chatId="a" />); await Promise.resolve() })
    await act(async () => { await Promise.resolve() })
    expect(seen.at(-1)).toEqual({ chatId: 'a', running: 'turn-A' })

    await act(async () => { root.render(<Harness chatId="b" />); await Promise.resolve() })

    const forB = seen.filter((entry) => entry.chatId === 'b')
    expect(forB.length).toBeGreaterThan(0)
    expect(forB.map((entry) => entry.running)).toEqual(forB.map(() => null))
  })

  it('names the reply again on returning to the chat that owns it', async () => {
    getChatStreamId.mockImplementation(async (chatId: string) => (chatId === 'a' ? 'turn-A' : null))
    getChatMessages.mockImplementation((chatId: string) => Promise.resolve({
      messages: chatId === 'a'
        ? [msg('m1', 'a'), msg('turn-A', 'a', { role: 'assistant', content: '', run } as Partial<Message>)]
        : [msg('m9', 'b')],
      has_more: false, next_cursor: null,
    }))

    for (const chatId of ['a', 'b', 'a']) {
      await act(async () => { root.render(<Harness chatId={chatId} />); await Promise.resolve() })
      await act(async () => { await Promise.resolve() })
    }
    const onB = seen.filter((e) => e.chatId === 'b')
    expect(onB.length).toBeGreaterThan(0)
    expect(onB.every((e) => e.running === null)).toBe(true)
    expect(seen.at(-1)).toEqual({ chatId: 'a', running: 'turn-A' })
  })

  it('stops naming the running reply once a stream for the chat has ended', async () => {
    getChatStreamId.mockResolvedValue('turn-A')
    getChatMessages.mockResolvedValue({
      messages: [msg('m1', 'a'), msg('turn-A', 'a', { role: 'assistant', content: '', run } as Partial<Message>)],
      has_more: false, next_cursor: null,
    })
    await act(async () => { root.render(<Harness chatId="a" />); await Promise.resolve() })
    await act(async () => { await Promise.resolve() })
    expect(seen.at(-1)?.running).toBe('turn-A')
    // The follow that read the reply ends (another chat's end changes nothing).
    await act(async () => { registerStream('other'); completeStream('other', 'done') })
    expect(seen.at(-1)?.running).toBe('turn-A')
    await act(async () => { registerStream('a'); completeStream('a', 'done') })
    expect(seen.at(-1)?.running).toBeNull()
  })

  it('keeps naming the running reply after an end that does not show the run finished', async () => {
    getChatStreamId.mockResolvedValue('turn-A')
    getChatMessages.mockResolvedValue({
      messages: [msg('m1', 'a'), msg('turn-A', 'a', { role: 'assistant', content: '', run } as Partial<Message>)],
      has_more: false, next_cursor: null,
    })
    await act(async () => { root.render(<Harness chatId="a" />); await Promise.resolve() })
    await act(async () => { await Promise.resolve() })
    expect(seen.at(-1)?.running).toBe('turn-A')
    await act(async () => { registerStream('a'); completeStream('a', 'error', { inconclusive: true }) }) // a send that failed before its run
    await act(async () => { registerStream('a'); completeStream('a', 'done', { inconclusive: true }) }) // a follow that never attached
    await act(async () => { registerStream('a'); completeStream('a', 'error') }) // a dropped reader
    expect(seen.at(-1)?.running).toBe('turn-A')
  })

  it('stops naming the running reply when the user stops the follow of that reply, not another send', async () => {
    getChatStreamId.mockResolvedValue('turn-A')
    getChatMessages.mockResolvedValue({
      messages: [msg('m1', 'a'), msg('turn-A', 'a', { role: 'assistant', content: '', run } as Partial<Message>)],
      has_more: false, next_cursor: null,
    })
    await act(async () => { root.render(<Harness chatId="a" />); await Promise.resolve() })
    await act(async () => { await Promise.resolve() })
    expect(seen.at(-1)?.running).toBe('turn-A')
    await act(async () => { registerStream('a'); completeStream('a', 'aborted', { replyId: 'reply-new' }) }) // another send, stopped
    expect(seen.at(-1)?.running).toBe('turn-A')
    await act(async () => { registerStream('a'); completeStream('a', 'aborted', { replyId: 'turn-A' }) }) // the follow of it, stopped
    expect(seen.at(-1)?.running).toBeNull() // the queue can go on
  })

  it('stops naming the running reply on a Stop that had no stream entry to end', async () => {
    getChatStreamId.mockResolvedValue('turn-A')
    getChatMessages.mockResolvedValue({
      messages: [msg('m1', 'a'), msg('turn-A', 'a', { role: 'assistant', content: '', run } as Partial<Message>)],
      has_more: false, next_cursor: null,
    })
    await act(async () => { root.render(<Harness chatId="a" />); await Promise.resolve() })
    await act(async () => { await Promise.resolve() })
    expect(seen.at(-1)?.running).toBe('turn-A')
    await act(async () => { reportStopped('a', 'reply-new') }) // another reply stopped: kept
    expect(seen.at(-1)?.running).toBe('turn-A')
    await act(async () => { reportStopped('a', 'turn-A') }) // the follow waiting to reconnect, stopped
    expect(seen.at(-1)?.running).toBeNull()
  })
})
