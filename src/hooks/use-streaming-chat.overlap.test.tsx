// @vitest-environment jsdom
//
// One hook instance, two overlapping streams: chat A's recovery follow is still
// reading when chat B's starts. The hook keeps one set of refs (reply id, chat id,
// transport, flush buffer), so B taking them over must stop A reading into them —
// otherwise A's finish lands on B's reply and clears B's registry entry.

import React, { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStreamingChat } from '@/hooks/use-streaming-chat'
import { isStreamActive } from '@/lib/stream-registry'
import { resetStreamStore } from '@/lib/chat/stream-store'
import type { UIMessage } from '@/types/chat'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

class FakeXHR {
  static HEADERS_RECEIVED = 2
  static DONE = 4
  static all: FakeXHR[] = []
  readyState = 0
  status = 0
  responseText = ''
  withCredentials = false
  aborted = false
  upload = { addEventListener: () => {} }
  onprogress: (() => void) | null = null
  onreadystatechange: (() => void) | null = null
  onabort: (() => void) | null = null
  onerror: (() => void) | null = null
  url = ''
  open(_method: string, url: string) { this.url = url }
  setRequestHeader() {}
  getResponseHeader() { return null }
  abort() { this.aborted = true }
  send() { FakeXHR.all.push(this) }
  start() {
    this.status = 200
    this.readyState = FakeXHR.HEADERS_RECEIVED
    this.onreadystatechange?.()
  }
  push(...events: object[]) {
    this.responseText += events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')
    this.onprogress?.()
  }
  end() {
    this.readyState = FakeXHR.DONE
    this.onreadystatechange?.()
  }
}

const runA = { threadId: 'chat-A', runId: 'run-A' }
const runB = { threadId: 'chat-B', runId: 'run-B' }

let container: HTMLDivElement
let root: Root
let messages: UIMessage[]
let hook: ReturnType<typeof useStreamingChat>

function Harness({ onReady, liveOverlay = false }: { onReady: (api: ReturnType<typeof useStreamingChat>) => void; liveOverlay?: boolean }) {
  const api = useStreamingChat({
    setMessages: (update) => {
      messages = typeof update === 'function' ? update(messages) : update
    },
    liveOverlay,
  })
  useEffect(() => onReady(api))
  return null
}

const reply = (id: string) => messages.find((message) => message.id === id)!

beforeEach(() => {
  vi.stubGlobal('XMLHttpRequest', FakeXHR)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  FakeXHR.all = []
  messages = [
    { id: 'reply-A', role: 'assistant', content: '', created_at: '', chat_id: 'chat-A', isLoading: true },
    { id: 'reply-B', role: 'assistant', content: '', created_at: '', chat_id: 'chat-B', isLoading: true },
  ]
  container = document.createElement('div')
  root = createRoot(container)
  act(() => root.render(<Harness onReady={(api) => { hook = api }} />))
})

afterEach(() => {
  act(() => root.unmount())
  resetStreamStore()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('useStreamingChat with overlapping follows', () => {
  it("keeps the older stream from finishing onto the newer stream's reply", async () => {
    const doneA = hook.followStream('chat-A', 'reply-A')
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(1))
    const xhrA = FakeXHR.all[0]
    xhrA.start()
    xhrA.push({ type: 'RUN_STARTED', ...runA }, { type: 'TEXT_MESSAGE_CONTENT', messageId: 'a', delta: 'From A. ' })

    // Chat B opens while A is still reading.
    const doneB = hook.followStream('chat-B', 'reply-B')
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(2))
    const xhrB = FakeXHR.all[1]
    expect(xhrA.aborted).toBe(true)
    // Dropped through the registry: chat A is not left looking busy, so it follows afresh.
    expect(isStreamActive('chat-A')).toBe(false)

    xhrB.start()
    xhrB.push({ type: 'RUN_STARTED', ...runB }, { type: 'TEXT_MESSAGE_CONTENT', messageId: 'b', delta: 'From B.' })

    // A's server keeps talking and then ends — after it was detached.
    xhrA.push({ type: 'TEXT_MESSAGE_CONTENT', messageId: 'a', delta: 'More A.' }, { type: 'RUN_FINISHED', ...runA })
    xhrA.end()
    await act(async () => { await doneA })

    // B's reply is still B's, still live, and still registered.
    expect(reply('reply-B').content).toBe('From B.')
    expect(reply('reply-B').content).not.toContain('A.')
    expect(reply('reply-B').isLoading).toBe(true)
    expect(isStreamActive('chat-B')).toBe(true)

    xhrB.push({ type: 'RUN_FINISHED', ...runB })
    xhrB.end()
    expect(await doneB).toBe('done')
    expect(reply('reply-B')).toMatchObject({ content: 'From B.', isLoading: false })
    // A was left as it was for its chat to follow again, not finished with B's text.
    expect(reply('reply-A').content).not.toContain('B.')
  })

  it('commits the old call\'s buffered text to its own reply, not the next one (live overlay)', async () => {
    // ChatInterface runs with liveOverlay: streamed fields stay in a buffer until a commit.
    act(() => root.render(<Harness liveOverlay onReady={(api) => { hook = api }} />))
    const doneA = hook.followStream('chat-A', 'reply-A')
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(1))
    const xhrA = FakeXHR.all[0]
    xhrA.start()
    xhrA.push({ type: 'RUN_STARTED', ...runA }, { type: 'TEXT_MESSAGE_CONTENT', messageId: 'a', delta: 'From A.' })
    // The first stretch commits at once; this one stays in the buffer, uncommitted.
    xhrA.push({ type: 'TEXT_MESSAGE_CONTENT', messageId: 'a', delta: ' Still A.' })

    // B takes over before A's text was committed, and its turn ends with no text at all.
    const doneB = hook.followStream('chat-B', 'reply-B')
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(2))
    const xhrB = FakeXHR.all[1]
    xhrB.start()
    xhrB.push({ type: 'RUN_STARTED', ...runB }, { type: 'RUN_FINISHED', ...runB })
    xhrB.end()
    await act(async () => { await doneB })
    xhrA.end()
    await act(async () => { await doneA })

    expect(JSON.stringify(reply('reply-B'))).not.toContain('Still A.')
    expect(reply('reply-A').content).toContain('Still A.')
  })

  it('never drops a send the backend has not accepted; a follow waits for its run to start', async () => {
    // A message sent in chat A, still waiting for the backend to start its run.
    const doneA = hook.fetchAiResponse('hello', 'chat-A', 'reply-A')
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(1))
    const send = FakeXHR.all[0]
    send.start()

    // Chat B, with a reply still running, is opened meanwhile.
    const doneB = hook.followStream('chat-B', 'reply-B')
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 150)) })
    expect(FakeXHR.all).toHaveLength(1)
    expect(send.aborted).toBe(false)

    // The backend accepts the send: now B may take the hook, dropping A's connection
    // (the run goes on server-side) and A's registry entry with it.
    send.push({ type: 'RUN_STARTED', ...runA })
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(2))
    expect(send.aborted).toBe(true)
    expect(isStreamActive('chat-A')).toBe(false)
    send.end()
    await act(async () => { await doneA })

    const xhrB = FakeXHR.all[1]
    xhrB.start()
    xhrB.push({ type: 'RUN_STARTED', ...runB }, { type: 'TEXT_MESSAGE_CONTENT', messageId: 'b', delta: 'From B.' }, { type: 'RUN_FINISHED', ...runB })
    xhrB.end()
    expect(await doneB).toBe('done')
    expect(reply('reply-B')).toMatchObject({ content: 'From B.', isLoading: false })
  })

  it('lets a waiting call go once a dropped send has handed off to its recovery follow', async () => {
    // A send whose connection drops before its run starts: not droppable, so B waits.
    const doneA = hook.fetchAiResponse('hello', 'chat-A', 'reply-A')
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(1))
    const send = FakeXHR.all[0]
    send.start()
    send.status = 0
    send.end()
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)) })
    const doneB = hook.followStream('chat-B', 'reply-B')

    // After its retry wait, A's recovery follow takes the hook: A has handed off, so B goes
    // now — dropping that follow — instead of waiting for the whole recovery to finish.
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(3), { timeout: 4000 })
    const recovery = FakeXHR.all[1]
    const xhrB = FakeXHR.all[2]
    expect(recovery.url).toContain('chat-A')
    expect(recovery.aborted).toBe(true)
    expect(xhrB.url).toContain('chat-B')

    xhrB.start()
    xhrB.push({ type: 'RUN_STARTED', ...runB }, { type: 'TEXT_MESSAGE_CONTENT', messageId: 'b', delta: 'From B.' }, { type: 'RUN_FINISHED', ...runB })
    xhrB.end()
    expect(await doneB).toBe('done')
    recovery.end()
    await act(async () => { await doneA })
    expect(reply('reply-B')).toMatchObject({ content: 'From B.', isLoading: false })
  }, 10000)

  it('does not retry a dropped follow that another chat took over during the wait', async () => {
    const doneA = hook.followStream('chat-A', 'reply-A')
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(1))
    const xhrA = FakeXHR.all[0]
    xhrA.start()
    xhrA.push({ type: 'RUN_STARTED', ...runA }, { type: 'TEXT_MESSAGE_CONTENT', messageId: 'a', delta: 'From A.' })
    xhrA.status = 0
    xhrA.end() // dropped: A waits before retrying
    // Let A reach its retry wait; starting B synchronously would detach A before it got there.
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)) })

    // Chat B opens inside A's wait and takes the hook's refs.
    const doneB = hook.followStream('chat-B', 'reply-B')
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(2))
    const xhrB = FakeXHR.all[1]
    xhrB.start()
    xhrB.push({ type: 'RUN_STARTED', ...runB }, { type: 'TEXT_MESSAGE_CONTENT', messageId: 'b', delta: 'From B.' })

    // A's wait ends: it must stand down, not open a third request into B's reply.
    // doneA settles only after A's retry wait has run out and A has decided, so once it
    // has, no later request can come from A: no extra sleep is needed.
    await act(async () => { await doneA })
    expect(FakeXHR.all).toHaveLength(2)
    expect(isStreamActive('chat-B')).toBe(true)

    xhrB.push({ type: 'RUN_FINISHED', ...runB })
    xhrB.end()
    expect(await doneB).toBe('done')
    expect(reply('reply-B')).toMatchObject({ content: 'From B.', isLoading: false })
  }, 10000)

  it('lets a follow that drops reconnect without detaching itself', async () => {
    const done = hook.followStream('chat-A', 'reply-A')
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(1))
    const first = FakeXHR.all[0]
    first.start()
    first.push({ type: 'RUN_STARTED', ...runA }, { type: 'TEXT_MESSAGE_CONTENT', messageId: 'a', delta: 'Part one.' })
    first.status = 0
    first.end() // dropped mid-turn: the hook retries the same follow after a pause

    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(2), { timeout: 5000 })
    const retry = FakeXHR.all[1]
    retry.start()
    retry.push(
      { type: 'RUN_STARTED', ...runA },
      { type: 'TEXT_MESSAGE_CONTENT', messageId: 'a', delta: 'Part one. Part two.' },
      { type: 'RUN_FINISHED', ...runA },
    )
    retry.end()
    expect(await done).toBe('done')
    expect(reply('reply-A')).toMatchObject({ isLoading: false })
    expect(reply('reply-A').content).toContain('Part two.')
  })
})
