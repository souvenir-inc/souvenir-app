// @vitest-environment jsdom
//
// useFollowRunningReply: a chat opened with a reply still running follows it, with a
// bounded budget for refusals, and never follows a reply a newer run has superseded.

import React, { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const getChatRunState = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api/chat', () => ({ getChatRunState }))
import { FOLLOW_REFUSED_ATTEMPTS, FOLLOW_REFUSED_BACKOFF_MS, RUN_ENDED_POLL_MS, useFollowRunningReply } from './use-follow-running-reply'
import type { UIMessage } from '@/types/chat'
import type { StreamOutcome } from '@/lib/stream-registry'
import { completeStream, registerStream } from '@/lib/stream-registry'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type Props = { chatId: string | null; runningMessageId: string | null; historyLoadId: number; enabled?: boolean; messages?: UIMessage[] }
const onRunEnded = vi.fn()

let root: Root
let container: HTMLDivElement
// Each follow is refused (it never reaches the stream) unless a test says otherwise.
type FollowStreamMock = (chatId: string, id: string, prior?: unknown, onRefused?: () => void, stillWanted?: () => boolean, onRunGone?: () => void, onIncomplete?: () => void) => Promise<StreamOutcome>
const followStream = vi.fn<FollowStreamMock>(async (_chatId, _id, _prior, onRefused) => {
  onRefused?.()
  return 'done'
})

let reset: (chatId: string) => void
function Harness({ enabled = true, messages = [], onReset, ...props }: Props & { onReset: (fn: (chatId: string) => void) => void }) {
  const resetBudget = useFollowRunningReply({ ...props, enabled, messages, followStream, onRunEnded })
  useEffect(() => onReset(resetBudget))
  return null
}
const render = (props: Props) => act(async () => { root.render(<Harness {...props} onReset={(fn) => { reset = fn }} />) })

beforeEach(() => {
  vi.useFakeTimers()
  followStream.mockClear()
  onRunEnded.mockClear()
  getChatRunState.mockReset()
  getChatRunState.mockResolvedValue("running")
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

  it('resets only the budget of the chat whose prompt was answered', async () => {
    const load = await spendBudget('r1')
    reset('chat-B') // answered in another chat: chat A's budget stands
    await render({ chatId: 'chat-A', runningMessageId: 'r1', historyLoadId: load })
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(followStream).toHaveBeenCalledTimes(FOLLOW_REFUSED_ATTEMPTS)
    reset('chat-A') // answered here: followed afresh on the next load
    await render({ chatId: 'chat-A', runningMessageId: 'r1', historyLoadId: load + 1 })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(followStream).toHaveBeenCalledTimes(FOLLOW_REFUSED_ATTEMPTS + 1)
  })

  it('cancels a waiting follow when following is turned off', async () => {
    await render({ chatId: 'chat-A', runningMessageId: 'r1', historyLoadId: 1 })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    await render({ chatId: 'chat-A', runningMessageId: 'r1', historyLoadId: 2 }) // backing off
    await render({ chatId: 'chat-A', runningMessageId: 'r1', historyLoadId: 2, enabled: false })
    await act(async () => { await vi.advanceTimersByTimeAsync(FOLLOW_REFUSED_BACKOFF_MS * 2) })
    expect(followStream).toHaveBeenCalledTimes(1)
  })

  it('follows the earlier reply after all when the send that cancelled it fails', async () => {
    await render({ chatId: 'chat-A', runningMessageId: 'r1', historyLoadId: 1 })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    await render({ chatId: 'chat-A', runningMessageId: 'r1', historyLoadId: 2 }) // backing off
    await act(async () => { registerStream('chat-A') }) // a send starts: the follow is cancelled
    await act(async () => { completeStream('chat-A', 'error') }) // and fails before its run
    await act(async () => { await vi.advanceTimersByTimeAsync(0) }) // the follow starts just after
    expect(followStream).toHaveBeenCalledTimes(2)
    expect(followStream.mock.calls[1][1]).toBe('r1')
  })

  it("does not restart on the end of its own follow's stream", async () => {
    // This follow registers its own stream (as the real one does) and then fails.
    followStream.mockImplementationOnce(async () => {
      registerStream('chat-A')
      completeStream('chat-A', 'error')
      return 'error'
    })
    await render({ chatId: 'chat-A', runningMessageId: 'r1', historyLoadId: 1 })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(followStream).toHaveBeenCalledTimes(1)
  })

  it('follows with the reply as it is when the follow starts, not when it was scheduled', async () => {
    const unanswered = { id: 'r1', role: 'assistant', content: '', created_at: '', chat_id: 'chat-A' } as UIMessage
    const answered = { ...unanswered, content: 'answered meanwhile' } as UIMessage
    await render({ chatId: 'chat-A', runningMessageId: 'r1', historyLoadId: 1, messages: [unanswered] })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    await render({ chatId: 'chat-A', runningMessageId: 'r1', historyLoadId: 2, messages: [unanswered] }) // backing off
    await render({ chatId: 'chat-A', runningMessageId: 'r1', historyLoadId: 2, messages: [answered] }) // answered during it
    await act(async () => { await vi.advanceTimersByTimeAsync(FOLLOW_REFUSED_BACKOFF_MS) })
    expect(followStream).toHaveBeenCalledTimes(2)
    expect(followStream.mock.calls[1][2]).toBe(answered)
  })

  it('once the attempts are spent, asks the backend until the run has ended, then reloads', async () => {
    const load = await spendBudget('r1')
    getChatRunState.mockResolvedValueOnce('running').mockResolvedValue('idle')
    await render({ chatId: 'chat-A', runningMessageId: 'r1', historyLoadId: load })
    await act(async () => { await vi.advanceTimersByTimeAsync(RUN_ENDED_POLL_MS) })
    expect(onRunEnded).not.toHaveBeenCalled() // still running
    await act(async () => { await vi.advanceTimersByTimeAsync(RUN_ENDED_POLL_MS) })
    expect(onRunEnded).toHaveBeenCalledTimes(1)
    // That reload failed: the history still names the reply. The next check reloads again.
    await act(async () => { await vi.advanceTimersByTimeAsync(RUN_ENDED_POLL_MS) })
    expect(onRunEnded).toHaveBeenCalledTimes(2)
    // A reload succeeds and shows nothing running: the checks stop.
    await render({ chatId: 'chat-A', runningMessageId: null, historyLoadId: load + 1 })
    const lookups = getChatRunState.mock.calls.length
    await act(async () => { await vi.advanceTimersByTimeAsync(RUN_ENDED_POLL_MS * 3) })
    expect(onRunEnded).toHaveBeenCalledTimes(2)
    expect(getChatRunState.mock.calls.length).toBe(lookups) // no more lookups either
  })

  it('does not reload over a stream that has started in the chat', async () => {
    const load = await spendBudget('r1')
    getChatRunState.mockResolvedValue('idle')
    await render({ chatId: 'chat-A', runningMessageId: 'r1', historyLoadId: load })
    await act(async () => { registerStream('chat-A') }) // a send is under way
    await act(async () => { await vi.advanceTimersByTimeAsync(RUN_ENDED_POLL_MS * 2) })
    expect(onRunEnded).not.toHaveBeenCalled()
  })

  it('follows the earlier reply if a stream already going at load ends without finishing', async () => {
    registerStream('chat-A') // a send made as the history loaded
    await render({ chatId: 'chat-A', runningMessageId: 'r1', historyLoadId: 1 })
    await act(async () => { await vi.advanceTimersByTimeAsync(FOLLOW_REFUSED_BACKOFF_MS * 2) })
    expect(followStream).not.toHaveBeenCalled() // that stream owns the chat for now
    await act(async () => { completeStream('chat-A', 'error') })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(followStream).toHaveBeenCalledTimes(1)
    expect(followStream.mock.calls[0][1]).toBe('r1')
  })

  it('leaves the earlier reply when a stream already going at load finishes its turn', async () => {
    registerStream('chat-A')
    await render({ chatId: 'chat-A', runningMessageId: 'r1', historyLoadId: 1 })
    await act(async () => { completeStream('chat-A', 'done') })
    await act(async () => { await vi.advanceTimersByTimeAsync(FOLLOW_REFUSED_BACKOFF_MS * 2) })
    expect(followStream).not.toHaveBeenCalled()
  })

  it('follows again at once when a prompt answer resets a spent budget', async () => {
    const load = await spendBudget('r1')
    await render({ chatId: 'chat-A', runningMessageId: 'r1', historyLoadId: load }) // only polling now
    expect(followStream).toHaveBeenCalledTimes(FOLLOW_REFUSED_ATTEMPTS)
    await act(async () => { reset('chat-A') }) // the reply's prompt was answered
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(followStream).toHaveBeenCalledTimes(FOLLOW_REFUSED_ATTEMPTS + 1)
  })

  it('with its budget spent, a failed stream from load sends it back to polling, not following', async () => {
    const load = await spendBudget('r1')
    registerStream('chat-A') // a send going as the next history load lands
    await render({ chatId: 'chat-A', runningMessageId: 'r1', historyLoadId: load })
    getChatRunState.mockResolvedValue('idle')
    await act(async () => { completeStream('chat-A', 'error') })
    expect(followStream).toHaveBeenCalledTimes(FOLLOW_REFUSED_ATTEMPTS) // no fourth follow
    await act(async () => { await vi.advanceTimersByTimeAsync(RUN_ENDED_POLL_MS) })
    expect(onRunEnded).toHaveBeenCalledTimes(1) // polling for the end instead
  })

  it('reloads when a stream from before the load finishes the reply it was showing as running', async () => {
    registerStream('chat-A') // a background send, going as the history loaded
    await render({ chatId: 'chat-A', runningMessageId: 'r1', historyLoadId: 1 })
    await act(async () => { completeStream('chat-A', 'done') })
    expect(onRunEnded).toHaveBeenCalledTimes(1)
    expect(followStream).not.toHaveBeenCalled()
  })

  it('does not reload after a send made from the view itself finishes', async () => {
    getChatRunState.mockResolvedValue('running')
    await render({ chatId: 'chat-A', runningMessageId: 'r1', historyLoadId: 1 })
    followStream.mockClear()
    await act(async () => { registerStream('chat-A') }) // the view sends after the load
    await act(async () => { completeStream('chat-A', 'done') })
    expect(onRunEnded).not.toHaveBeenCalled()
  })

  it("does not start the earlier reply's follow from inside the end notification", async () => {
    await render({ chatId: 'chat-A', runningMessageId: 'r1', historyLoadId: 1 })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    await render({ chatId: 'chat-A', runningMessageId: 'r1', historyLoadId: 2 }) // backing off
    await act(async () => { registerStream('chat-A') }) // a send supersedes the follow
    // The user stops it: while Stop's own end notification runs, no follow may start yet.
    let duringEnd = -1
    await act(async () => {
      completeStream('chat-A', 'aborted')
      duringEnd = followStream.mock.calls.length
    })
    expect(duringEnd).toBe(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(followStream).toHaveBeenCalledTimes(2) // then it does
  })

  it('leaves no deferred follow behind when two streams end before it runs and the effect goes', async () => {
    await render({ chatId: 'chat-A', runningMessageId: 'r1', historyLoadId: 1 })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    await render({ chatId: 'chat-A', runningMessageId: 'r1', historyLoadId: 2 }) // backing off
    await act(async () => {
      registerStream('chat-A'); completeStream('chat-A', 'error') // one deferred follow…
      registerStream('chat-A'); completeStream('chat-A', 'error') // …replaced by another
    })
    await render({ chatId: 'chat-A', runningMessageId: 'r1', historyLoadId: 2, enabled: false }) // the effect goes
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })
    expect(followStream).toHaveBeenCalledTimes(1) // neither deferred follow ran
  })

  it('cancels a deferred follow when a newer stream starts before it runs', async () => {
    await render({ chatId: 'chat-A', runningMessageId: 'r1', historyLoadId: 1 })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    await render({ chatId: 'chat-A', runningMessageId: 'r1', historyLoadId: 2 }) // backing off
    await act(async () => {
      registerStream('chat-A'); completeStream('chat-A', 'error') // a failed send schedules recovery…
      registerStream('chat-A'); completeStream('chat-A', 'done') // …then a newer send starts and finishes
    })
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })
    expect(followStream).toHaveBeenCalledTimes(1) // the obsolete reply is not followed
  })

  it('goes on recovering after another reader ends inconclusively', async () => {
    await render({ chatId: 'chat-A', runningMessageId: 'r1', historyLoadId: 1 })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    await render({ chatId: 'chat-A', runningMessageId: 'r1', historyLoadId: 2 }) // backing off
    await act(async () => {
      registerStream('chat-A') // another reader starts: the scheduled follow is cancelled
      completeStream('chat-A', 'done', { inconclusive: true }) // and is refused before it attaches
    })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(followStream).toHaveBeenCalledTimes(2) // recovery went on
  })

  it('passes a stillWanted check that turns false once the effect is gone', async () => {
    await render({ chatId: 'chat-A', runningMessageId: 'r1', historyLoadId: 1 })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    const stillWanted = followStream.mock.calls[0][4] as () => boolean
    expect(stillWanted()).toBe(true)
    await render({ chatId: 'chat-A', runningMessageId: null, historyLoadId: 2 }) // reloaded: not running
    expect(stillWanted()).toBe(false)
  })

  it('tries again after a refusal even when no history load follows it', async () => {
    await render({ chatId: 'chat-A', runningMessageId: 'r1', historyLoadId: 1 })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(followStream).toHaveBeenCalledTimes(1) // refused; its history reload fails (no rerender)
    await act(async () => { await vi.advanceTimersByTimeAsync(FOLLOW_REFUSED_BACKOFF_MS) })
    expect(followStream).toHaveBeenCalledTimes(2) // tried again after the back-off
  })

  it('recovers, not reloads, when a stream from before the load ends inconclusively', async () => {
    registerStream('chat-A')
    await render({ chatId: 'chat-A', runningMessageId: 'r1', historyLoadId: 1 })
    await act(async () => { completeStream('chat-A', 'done', { inconclusive: true }) })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(onRunEnded).not.toHaveBeenCalled()
    expect(followStream).toHaveBeenCalledTimes(1)
  })

  it('does not reload for a later send once the stream from before the load ended inconclusively', async () => {
    registerStream('chat-A') // going as the history loaded
    await render({ chatId: 'chat-A', runningMessageId: 'r1', historyLoadId: 1 })
    await act(async () => { completeStream('chat-A', 'done', { inconclusive: true }) }) // it ends without its turn
    await act(async () => { await vi.advanceTimersByTimeAsync(0) }) // recovery's follow (refused, mocked)
    await act(async () => { registerStream('chat-A') }) // a send from this view, after the load
    await act(async () => { completeStream('chat-A', 'done') }) // finishes its own reply
    expect(onRunEnded).not.toHaveBeenCalled() // not taken for the background stream: no reload
  })

  it('resumes recovery when a send that interrupted the retry after a refusal fails', async () => {
    await render({ chatId: 'chat-A', runningMessageId: 'r1', historyLoadId: 1 })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) }) // refused; its reload fails
    expect(followStream).toHaveBeenCalledTimes(1)
    await act(async () => { registerStream('chat-A') }) // a send is going when the retry comes due
    await act(async () => { await vi.advanceTimersByTimeAsync(FOLLOW_REFUSED_BACKOFF_MS) })
    expect(followStream).toHaveBeenCalledTimes(1) // the retry stood aside for it
    await act(async () => { completeStream('chat-A', 'error', { inconclusive: true }) }) // the send fails before its run
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(followStream).toHaveBeenCalledTimes(2) // recovery resumed
  })

  it('keeps asking for a reload after a background stream finished until a history load lands', async () => {
    registerStream('chat-A') // a background send, going as the history loaded
    await render({ chatId: 'chat-A', runningMessageId: 'r1', historyLoadId: 1 })
    await act(async () => { completeStream('chat-A', 'done') }) // it finishes the shown reply
    expect(onRunEnded).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(RUN_ENDED_POLL_MS) }) // that reload failed
    expect(onRunEnded).toHaveBeenCalledTimes(2)
    await render({ chatId: 'chat-A', runningMessageId: null, historyLoadId: 2 }) // a load lands
    await act(async () => { await vi.advanceTimersByTimeAsync(RUN_ENDED_POLL_MS * 3) })
    expect(onRunEnded).toHaveBeenCalledTimes(2)
  })

  it("keeps asking for a reload when a follow's reconnect finds the run over", async () => {
    // The follow attaches, drops, and its reconnect gets a 404: the run is over.
    followStream.mockImplementationOnce(async (_c, _i, _p, _r, _w, onRunGone) => { onRunGone?.(); return 'done' })
    await render({ chatId: 'chat-A', runningMessageId: 'r1', historyLoadId: 1 })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(followStream).toHaveBeenCalledTimes(1)
    // Its reload failed: no new history load. The reload is asked for again, not the stream.
    await act(async () => { await vi.advanceTimersByTimeAsync(RUN_ENDED_POLL_MS) })
    expect(onRunEnded).toHaveBeenCalledTimes(1)
    expect(followStream).toHaveBeenCalledTimes(1)
    await render({ chatId: 'chat-A', runningMessageId: null, historyLoadId: 2 }) // a load lands
    await act(async () => { await vi.advanceTimersByTimeAsync(RUN_ENDED_POLL_MS * 3) })
    expect(onRunEnded).toHaveBeenCalledTimes(1)
  })

  it("does not mark a reload pending for the chat opened since a late 404", async () => {
    let gone!: () => void
    followStream.mockImplementationOnce((_c, _i, _p, _r, _w, onRunGone) => new Promise(() => { gone = () => onRunGone?.() }))
    await render({ chatId: 'chat-A', runningMessageId: 'r1', historyLoadId: 1 })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    await render({ chatId: 'chat-B', runningMessageId: null, historyLoadId: 2 }) // the user opens chat B
    await act(async () => { gone() }) // A's reconnect then finds its run over
    await act(async () => { await vi.advanceTimersByTimeAsync(RUN_ENDED_POLL_MS * 3) })
    expect(onRunEnded).not.toHaveBeenCalled() // B's history is not reloaded for it
  })

  it("follows again, within the budget, when its own follow closes without an end event", async () => {
    followStream.mockImplementationOnce(async (_c, _i, _p, _r, _w, _g, onIncomplete) => { onIncomplete?.(); return 'error' })
    await render({ chatId: 'chat-A', runningMessageId: 'r1', historyLoadId: 1 })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(followStream).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(FOLLOW_REFUSED_BACKOFF_MS) })
    expect(followStream).toHaveBeenCalledTimes(2) // recovery tried again
  })

  it('holds the background reload while a newer stream is going, then sends it', async () => {
    registerStream('chat-A')
    await render({ chatId: 'chat-A', runningMessageId: 'r1', historyLoadId: 1 })
    await act(async () => { completeStream('chat-A', 'done') }) // background stream finished: reload #1 (fails)
    expect(onRunEnded).toHaveBeenCalledTimes(1)
    // The running owner is cleared; the refresh failed, so no new history load arrived.
    await render({ chatId: 'chat-A', runningMessageId: null, historyLoadId: 1 })
    await act(async () => { registerStream('chat-A') }) // the user sends again
    await act(async () => { await vi.advanceTimersByTimeAsync(RUN_ENDED_POLL_MS * 2) })
    expect(onRunEnded).toHaveBeenCalledTimes(1) // not over the newer stream
    await act(async () => { completeStream('chat-A', 'done') })
    expect(onRunEnded).toHaveBeenCalledTimes(1) // the send's own end is not a reload
    await act(async () => { await vi.advanceTimersByTimeAsync(RUN_ENDED_POLL_MS) })
    expect(onRunEnded).toHaveBeenCalledTimes(2) // the retry timer sends it once idle
  })
})
