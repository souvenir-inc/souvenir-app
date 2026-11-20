// @vitest-environment jsdom
//
// useFollowRunningReply: a chat opened with a reply still running follows it, with a
// bounded budget for refusals, and never follows a reply a newer run has superseded.

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FOLLOW_REFUSED_ATTEMPTS, FOLLOW_REFUSED_BACKOFF_MS, useFollowRunningReply } from './use-follow-running-reply'
import { completeStream, registerStream } from '@/lib/stream-registry'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type Props = { chatId: string | null; runningMessageId: string | null; historyLoadId: number }

let root: Root
let container: HTMLDivElement
// Each follow is refused (it never reaches the stream) unless a test says otherwise.
const followStream = vi.fn(async (_chatId: string, _id: string, _prior?: unknown, onRefused?: () => void) => {
  onRefused?.()
  return 'done' as const
})

function Harness(props: Props) {
  useFollowRunningReply({ ...props, enabled: true, messages: [], followStream })
  return null
}
const render = (props: Props) => act(async () => { root.render(<Harness {...props} />) })

beforeEach(() => {
  vi.useFakeTimers()
  followStream.mockClear()
  container = document.createElement('div')
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  completeStream('chat-A')
  vi.useRealTimers()
})

// Runs the refusals a reply's budget allows: each refusal reloads the history (a new
// historyLoadId) still showing the reply running, and the next attempt backs off.
async function spendBudget(runningMessageId: string, from = 1) {
  let load = from
  for (let i = 0; i < FOLLOW_REFUSED_ATTEMPTS; i++) {
    await render({ chatId: 'chat-A', runningMessageId, historyLoadId: load++ })
    await act(async () => { await vi.advanceTimersByTimeAsync(FOLLOW_REFUSED_BACKOFF_MS * i) })
  }
  return load
}

describe('useFollowRunningReply', () => {
  it('stops after its refusal budget, across history reloads that still show the reply running', async () => {
    const load = await spendBudget('r1')
    expect(followStream).toHaveBeenCalledTimes(FOLLOW_REFUSED_ATTEMPTS)
    await render({ chatId: 'chat-A', runningMessageId: 'r1', historyLoadId: load })
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(followStream).toHaveBeenCalledTimes(FOLLOW_REFUSED_ATTEMPTS)
  })

  it('follows the same reply afresh once a finished load showed it no longer running', async () => {
    let load = await spendBudget('r1')
    // A load finishes with no running reply (it paused for a prompt, say)…
    await render({ chatId: 'chat-A', runningMessageId: null, historyLoadId: load++ })
    // …and a later one shows it running again (answered in another tab).
    await render({ chatId: 'chat-A', runningMessageId: 'r1', historyLoadId: load++ })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(followStream).toHaveBeenCalledTimes(FOLLOW_REFUSED_ATTEMPTS + 1)
  })

  it('drops a scheduled follow once a newer run starts in the chat, even if it has ended again', async () => {
    await render({ chatId: 'chat-A', runningMessageId: 'r1', historyLoadId: 1 })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(followStream).toHaveBeenCalledTimes(1) // refused: the next attempt backs off
    await render({ chatId: 'chat-A', runningMessageId: 'r1', historyLoadId: 2 })
    // During the back-off the user sends: a newer run starts, and ends before the wait does.
    await act(async () => { registerStream('chat-A'); completeStream('chat-A', 'done') })
    await act(async () => { await vi.advanceTimersByTimeAsync(FOLLOW_REFUSED_BACKOFF_MS * 2) })
    expect(followStream).toHaveBeenCalledTimes(1)
  })
})
