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
    expect(seen.filter((e) => e.chatId === 'b').every((e) => e.running === null)).toBe(true)
    expect(seen.at(-1)).toEqual({ chatId: 'a', running: 'turn-A' })
  })
})
