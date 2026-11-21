// @vitest-environment jsdom
//
// One hook instance, two overlapping streams: chat A's recovery follow is still
// reading when chat B's starts. The hook keeps one set of refs (reply id, chat id,
// transport, flush buffer), so B taking them over must stop A reading into them —
// otherwise A's finish lands on B's reply and clears B's registry entry.

import React, { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// The token wait before a direct send: held open by a test that needs to act during it.
// Off localhost a new chat's send goes straight to the backend, after that wait.
const token = vi.hoisted(() => ({ gate: null as Promise<string | null> | null, direct: false }))
vi.mock('@/lib/config', async (orig) => {
  const actual = await orig<typeof import('@/lib/config')>()
  return { ...actual, shouldUseDirectBackend: () => token.direct || actual.shouldUseDirectBackend() }
})
// Whether the backend still runs a chat's turn (a dropped call asks): running, unless a test says.
type RunStateLookup = (chatId: string) => Promise<'running' | 'idle'>
const runState = vi.hoisted(() => ({ get: (() => Promise.resolve('running')) as RunStateLookup }))
vi.mock('@/lib/api/chat', async (orig) => ({
  ...(await orig<typeof import('@/lib/api/chat')>()),
  getChatRunState: (chatId: string) => runState.get(chatId),
}))
vi.mock('@/lib/jwt-utils', async (orig) => {
  const actual = await orig<typeof import('@/lib/jwt-utils')>()
  return { ...actual, ensureFreshToken: () => token.gate ?? actual.ensureFreshToken() }
})
import { DROPPED_RUN_POLL_MS, useStreamingChat } from '@/hooks/use-streaming-chat'
import { completeStream, detachStream, isStreamActive, registerStream, stopStream, subscribeStreams } from '@/lib/stream-registry'
import { getChatQueue, queueMessage, queuedChatsReadyForBackground, takeAllQueuedMessages } from '@/lib/message-queue'
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
  headers: Record<string, string> = {}
  getResponseHeader(name: string) { return this.headers[name] ?? null }
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

type View = { currentChatIdRef: React.RefObject<string | undefined>; setStreamState: (state: string) => void }
function Harness({ onReady, liveOverlay = false, view }: { onReady: (api: ReturnType<typeof useStreamingChat>) => void; liveOverlay?: boolean; view?: View }) {
  const api = useStreamingChat({
    setMessages: (update) => {
      messages = typeof update === 'function' ? update(messages) : update
    },
    liveOverlay,
    // Stop reaches the backend through this: a spy by default, so no test sends a real
    // request (a view can still pass its own, as the backend-stop test does).
    onStopBackend: defaultStopBackend,
    ...(view as object),
  })
  useEffect(() => onReady(api))
  return null
}

const defaultStopBackend = vi.fn()
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

// Every chat and queue the tests use, cleared whatever a test left behind (a failed
// assertion included), so no test's busy-state check can pass on another's entry.
const FIXTURE_CHATS = ['chat-A', 'chat-B', 'chat-C', 'chat-N', 'chat-T', 'chat-H', 'temp-1']
afterEach(() => {
  act(() => root.unmount())
  for (const id of FIXTURE_CHATS) { completeStream(id); takeAllQueuedMessages(id) }
  runState.get = () => Promise.resolve('running')
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
    // A's run is still going on the backend, so A must still look busy (or its message
    // queue would send into that run). Reopening A clears the entry, as use-chat-state does,
    // and the chat then follows its run afresh.
    expect(isStreamActive('chat-A')).toBe(true)
    // So a message queued for A is not sent in the background into A's running turn...
    queueMessage('chat-A', { content: 'next', attachments: [], mentionedPins: [] }, { settings: { pinsEnabled: true } })
    expect(queuedChatsReadyForBackground()).not.toContain('chat-A')
    expect(detachStream('chat-A')).toBe(true)
    expect(isStreamActive('chat-A')).toBe(false)
    // ...and once A is reopened (and followed afresh), its queue is no longer held by it.
    expect(queuedChatsReadyForBackground()).toContain('chat-A')
    takeAllQueuedMessages('chat-A')

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

    // The backend accepts the send: now B may take the hook, dropping A's connection.
    // A's run goes on server-side, so A still looks busy until it is reopened.
    send.push({ type: 'RUN_STARTED', ...runA })
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(2))
    expect(send.aborted).toBe(true)
    expect(isStreamActive('chat-A')).toBe(true)
    send.end()
    await act(async () => { await doneA })

    const xhrB = FakeXHR.all[1]
    xhrB.start()
    xhrB.push({ type: 'RUN_STARTED', ...runB }, { type: 'TEXT_MESSAGE_CONTENT', messageId: 'b', delta: 'From B.' }, { type: 'RUN_FINISHED', ...runB })
    xhrB.end()
    expect(await doneB).toBe('done')
    expect(reply('reply-B')).toMatchObject({ content: 'From B.', isLoading: false })
  })

  it("keeps a follow's states off a new, unsaved chat's view; that view's own send still shows them", async () => {
    const states: string[] = []
    const view: View = { currentChatIdRef: { current: undefined }, setStreamState: (state) => { states.push(state) } }
    act(() => root.render(<Harness view={view} onReady={(api) => { hook = api }} />))

    const doneB = hook.followStream('chat-B', 'reply-B')
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(1))
    const xhrB = FakeXHR.all[0]
    xhrB.start()
    xhrB.push({ type: 'RUN_STARTED', ...runB }, { type: 'TEXT_MESSAGE_CONTENT', messageId: 'b', delta: 'B.' }, { type: 'RUN_FINISHED', ...runB })
    xhrB.end()
    await act(async () => { await doneB })
    expect(states).toEqual([])

    const doneNew = hook.fetchAiResponse('hello', null, 'reply-A')
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(2))
    const send = FakeXHR.all[1]
    send.start()
    send.push({ type: 'RUN_STARTED', ...runA }, { type: 'TEXT_MESSAGE_CONTENT', messageId: 'a', delta: 'A.' }, { type: 'RUN_FINISHED', ...runA })
    send.end()
    await act(async () => { await doneNew })
    expect(states[0]).toBe('waiting')
    expect(states.at(-1)).toBe('done')
  })

  it("does not mark another chat's view done when a follow ends", async () => {
    const states: string[] = []
    const view: View = { currentChatIdRef: { current: 'chat-A' }, setStreamState: (state) => { states.push(state) } }
    act(() => root.render(<Harness view={view} onReady={(api) => { hook = api }} />))
    const doneB = hook.followStream('chat-B', 'reply-B')
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(1))
    FakeXHR.all[0].start()
    FakeXHR.all[0].push({ type: 'RUN_STARTED', ...runB }, { type: 'RUN_FINISHED', ...runB })
    FakeXHR.all[0].end()
    await act(async () => { await doneB })
    expect(states).toEqual([])
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
    // The follow is dropped before its request goes out, so it never opens one.
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(2), { timeout: 4000 })
    const xhrB = FakeXHR.all[1]
    expect(xhrB.url).toContain('chat-B')

    xhrB.start()
    xhrB.push({ type: 'RUN_STARTED', ...runB }, { type: 'TEXT_MESSAGE_CONTENT', messageId: 'b', delta: 'From B.' }, { type: 'RUN_FINISHED', ...runB })
    xhrB.end()
    expect(await doneB).toBe('done')
    await act(async () => { await doneA })
    expect(FakeXHR.all).toHaveLength(2)
    expect(reply('reply-B')).toMatchObject({ content: 'From B.', isLoading: false })
  }, 10000)

  it('does not retry a dropped follow that another chat took over during the wait', async () => {
    const doneA = hook.followStream('chat-A', 'reply-A')
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(1))
    const xhrA = FakeXHR.all[0]
    xhrA.start()
    xhrA.push({ type: 'RUN_STARTED', ...runA }, { type: 'TEXT_MESSAGE_CONTENT', messageId: 'a', delta: 'From A.' })
    xhrA.status = 0
    // Watch for A's retry timer, so B starts once A is in its wait (starting B before
    // would detach A before it got there) and while the 1 s wait is still pending.
    const timers = vi.spyOn(globalThis, 'setTimeout')
    xhrA.end() // dropped: A waits before retrying
    await vi.waitFor(() => expect(timers.mock.calls.some(([, ms]) => ms === 1000)).toBe(true))
    timers.mockRestore()

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

  it('reports a send the backend refused outright, and only that', async () => {
    const run = async (status: number) => {
      const refused = vi.fn()
      const done = hook.fetchAiResponse('hi', 'chat-A', 'reply-A', null, { onSendRefused: refused })
      await vi.waitFor(() => expect(FakeXHR.all.length).toBeGreaterThan(0))
      const xhr = FakeXHR.all.at(-1)!
      FakeXHR.all = []
      xhr.status = status
      xhr.responseText = status ? '{"detail":"no"}' : ''
      xhr.end()
      await act(async () => { await done })
      return refused.mock.calls.length
    }
    expect(await run(402)).toBe(1)
    expect(await run(500)).toBe(0) // may have taken it
  })

  it('tells a 409 "already sent" (the backend has it) from a 409 refusal (a paused agent)', async () => {
    const run = async (body: string) => {
      const refused = vi.fn()
      const done = hook.fetchAiResponse('hi', 'chat-A', 'reply-A', null, { onSendRefused: refused })
      await vi.waitFor(() => expect(FakeXHR.all.length).toBeGreaterThan(0))
      const xhr = FakeXHR.all.at(-1)!
      FakeXHR.all = []
      xhr.status = 409
      xhr.responseText = body
      xhr.end()
      await act(async () => { await done })
      return refused.mock.calls.length
    }
    expect(await run('{"detail":{"code":"already_sent"}}')).toBe(0)
    expect(await run('{"detail":"This agent is not published"}')).toBe(1)
  })

  it('sends nothing when Stop is pressed while the send is still getting its token', async () => {
    let release!: (value: string) => void
    token.gate = new Promise((resolve) => { release = resolve })
    token.direct = true
    try {
      const done = hook.fetchAiResponse('hi', null, 'reply-A')
      await act(async () => { await Promise.resolve() })
      act(() => hook.handleStopGeneration())
      release('tok')
      expect(await done).toBe('aborted')
      expect(FakeXHR.all).toHaveLength(0)
    } finally {
      token.gate = null
      token.direct = false
    }
  })

  it("keeps a saved chat's send off a new chat's composer opened before its run started", async () => {
    const states: string[] = []
    const view: View = { currentChatIdRef: { current: 'chat-A' }, setStreamState: (state) => { states.push(state) } }
    act(() => root.render(<Harness view={view} onReady={(api) => { hook = api }} />))
    const done = hook.fetchAiResponse('hi', 'chat-A', 'reply-A')
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(1))
    const send = FakeXHR.all[0]
    send.start()
    expect(states).toEqual(['waiting'])
    view.currentChatIdRef.current = undefined // the user opens a new chat
    send.push({ type: 'RUN_STARTED', ...runA }, { type: 'RUN_FINISHED', ...runA })
    send.end()
    await act(async () => { await done })
    expect(states).toEqual(['waiting'])
  })

  it('does not cut the stream of a chat the user went back to while a follow waited', async () => {
    const view: View = { currentChatIdRef: { current: 'chat-A' }, setStreamState: () => {} }
    act(() => root.render(<Harness view={view} onReady={(api) => { hook = api }} />))
    const doneA = hook.fetchAiResponse('hi', 'chat-A', 'reply-A')
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(1))
    const send = FakeXHR.all[0]
    send.start()
    view.currentChatIdRef.current = 'chat-B' // B opens; its follow waits for A's run to start
    const doneB = hook.followStream('chat-B', 'reply-B')
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)) })
    view.currentChatIdRef.current = 'chat-A' // and the user goes back to A
    send.push({ type: 'RUN_STARTED', ...runA })
    expect(await doneB).toBe('done')
    expect(send.aborted).toBe(false)
    expect(FakeXHR.all).toHaveLength(1)
    send.push({ type: 'TEXT_MESSAGE_CONTENT', messageId: 'a', delta: 'From A.' }, { type: 'RUN_FINISHED', ...runA })
    send.end()
    await act(async () => { await doneA })
    expect(reply('reply-A')).toMatchObject({ content: 'From A.', isLoading: false })
  })

  it('ends as stopped, not as an error, when Stop is pressed during the reconnect pause', async () => {
    const states: string[] = []
    const view: View = { currentChatIdRef: { current: 'chat-A' }, setStreamState: (state) => { states.push(state) } }
    act(() => root.render(<Harness view={view} onReady={(api) => { hook = api }} />))
    const done = hook.followStream('chat-A', 'reply-A')
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(1))
    const xhr = FakeXHR.all[0]
    xhr.start()
    xhr.push({ type: 'RUN_STARTED', ...runA }, { type: 'TEXT_MESSAGE_CONTENT', messageId: 'a', delta: 'Part.' })
    const timers = vi.spyOn(globalThis, 'setTimeout')
    xhr.status = 0
    xhr.end() // dropped: the reconnect waits a moment first
    await vi.waitFor(() => expect(timers.mock.calls.some(([, ms]) => ms === 1000)).toBe(true))
    timers.mockRestore()
    act(() => hook.handleStopGeneration())
    expect(await done).toBe('aborted')
    expect(FakeXHR.all).toHaveLength(1)
    expect(states.at(-1)).toBe('aborted')
    expect(reply('reply-A')).toMatchObject({ isLoading: false, stoppedByUser: true })
  })

  it("keeps a new chat's send, still without an id, off a saved chat opened meanwhile", async () => {
    const states: string[] = []
    const view: View = { currentChatIdRef: { current: undefined }, setStreamState: (state) => { states.push(state) } }
    act(() => root.render(<Harness view={view} onReady={(api) => { hook = api }} />))
    const done = hook.fetchAiResponse('hi', null, 'reply-A')
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(1))
    expect(states).toEqual(['waiting'])
    view.currentChatIdRef.current = 'chat-C' // a saved chat opens before the new chat's id arrives
    const send = FakeXHR.all[0]
    send.status = 0
    send.end() // the upload ends there
    await act(async () => { await done })
    expect(states).toEqual(['waiting'])
  })

  it('gives a new chat’s reply and message its chat id once the chat has one', async () => {
    messages = [
      { id: 'user-new', role: 'user', content: 'hi', created_at: '', chat_id: '' },
      { id: 'reply-new', role: 'assistant', content: '', created_at: '', chat_id: '', isLoading: true },
      { id: 'other', role: 'assistant', content: '', created_at: '', chat_id: '' },
    ]
    const done = hook.fetchAiResponse('hi', null, 'reply-new', null, { userMessageId: 'user-new' })
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(1))
    const send = FakeXHR.all[0]
    send.start()
    send.push({ type: 'RUN_STARTED', threadId: 'chat-N', runId: 'run-N' }, { type: 'RUN_FINISHED', threadId: 'chat-N', runId: 'run-N' })
    send.end()
    await act(async () => { await done })
    expect(messages.find((m) => m.id === 'user-new')?.chat_id).toBe('chat-N')
    expect(messages.find((m) => m.id === 'reply-new')?.chat_id).toBe('chat-N')
    expect(messages.find((m) => m.id === 'other')?.chat_id).toBe('')
  })

  it('gives a reply made under a temp- chat id the real one too', async () => {
    messages = [{ id: 'reply-t', role: 'assistant', content: '', created_at: '', chat_id: 'temp-1', isLoading: true }]
    const done = hook.fetchAiResponse('hi', 'temp-1', 'reply-t')
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(1))
    const send = FakeXHR.all[0]
    send.start()
    send.push({ type: 'RUN_STARTED', threadId: 'chat-T', runId: 'run-T' }, { type: 'RUN_FINISHED', threadId: 'chat-T', runId: 'run-T' })
    send.end()
    await act(async () => { await done })
    expect(messages.find((m) => m.id === 'reply-t')?.chat_id).toBe('chat-T')
  })

  it('does not retry into a chat another reader took during the reconnect pause', async () => {
    const done = hook.followStream('chat-A', 'reply-A')
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(1))
    const xhr = FakeXHR.all[0]
    xhr.start()
    xhr.push({ type: 'RUN_STARTED', ...runA })
    const timers = vi.spyOn(globalThis, 'setTimeout')
    xhr.status = 0
    xhr.end() // dropped: the reconnect waits a moment first
    await vi.waitFor(() => expect(timers.mock.calls.some(([, ms]) => ms === 1000)).toBe(true))
    timers.mockRestore()
    registerStream('chat-A') // the chat's own view, another hook, follows it meanwhile
    expect(await done).toBe('done')
    expect(FakeXHR.all).toHaveLength(1)
    expect(isStreamActive('chat-A')).toBe(true) // still that reader's
    completeStream('chat-A')
  })

  it("ends a refused follow without failing it, so the chat's queue is not held", async () => {
    const ends: string[] = []
    const unsubscribe = subscribeStreams((event) => { if (event.type === 'end' && event.chatId === 'chat-A') ends.push(event.outcome) })
    const refused = vi.fn()
    try {
      const done = hook.followStream('chat-A', 'reply-A', undefined, refused)
      await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(1))
      const xhr = FakeXHR.all[0]
      xhr.status = 404 // the turn has ended
      xhr.responseText = '{"detail":"no stream"}'
      xhr.end()
      expect(await done).toBe('done')
    } finally {
      unsubscribe() // before teardown ends chat-A, whatever happened above
    }
    expect(ends).toEqual(['done'])
    expect(refused).toHaveBeenCalledTimes(1) // its own result reached its caller
  })

  it("does not end a reservation made right after a refused follow ended", async () => {
    // As the refused follow ends, the chat's next queued message reserves the chat (once).
    let reserved = false
    const unsubscribe = subscribeStreams((event) => {
      if (event.type === 'end' && event.chatId === 'chat-A' && !reserved) { reserved = true; registerStream('chat-A') }
    })
    try {
      const done = hook.followStream('chat-A', 'reply-A')
      await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(1))
      const xhr = FakeXHR.all[0]
      xhr.status = 404
      xhr.responseText = '{"detail":"no stream"}'
      xhr.end()
      await done
    } finally {
      unsubscribe() // before teardown ends chat-A: a leaked listener would reserve it again
    }
    expect(isStreamActive('chat-A')).toBe(true) // the reservation stands
    completeStream('chat-A')
  })

  it("lifts the queue's hold once a dropped connection is recovered to the turn's end", async () => {
    queueMessage('chat-A', { content: 'next', attachments: [], mentionedPins: [] }, { settings: { pinsEnabled: true, webSearch: true }, modelId: 1 } as never)
    try {
      const done = hook.followStream('chat-A', 'reply-A')
      await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(1))
      const xhr = FakeXHR.all[0]
      xhr.start()
      xhr.push({ type: 'RUN_STARTED', ...runA })
      xhr.status = 0
      xhr.end() // dropped: held as an error for now, and a reconnect follows
      await vi.waitFor(() => expect(getChatQueue('chat-A')?.heldBy).toBe('error'))
      await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(2), { timeout: 3000 })
      const retry = FakeXHR.all[1]
      retry.start()
      retry.push({ type: 'RUN_STARTED', ...runA }, { type: 'TEXT_MESSAGE_CONTENT', messageId: 'a', delta: 'Whole.' }, { type: 'RUN_FINISHED', ...runA })
      retry.end()
      expect(await done).toBe('done')
      expect(getChatQueue('chat-A')?.heldBy).toBeUndefined()
      expect(getChatQueue('chat-A')?.messages.map((m) => m.content)).toEqual(['next']) // and its message stays
    } finally {
      takeAllQueuedMessages('chat-A')
    }
  }, 10000)

  it("lifts the drop's hold when the reconnect finds the turn already over", async () => {
    queueMessage('chat-A', { content: 'next', attachments: [], mentionedPins: [] }, { settings: { pinsEnabled: true, webSearch: true }, modelId: 1 } as never)
    try {
      const done = hook.followStream('chat-A', 'reply-A')
      await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(1))
      const xhr = FakeXHR.all[0]
      xhr.start()
      xhr.push({ type: 'RUN_STARTED', ...runA })
      xhr.status = 0
      xhr.end()
      await vi.waitFor(() => expect(getChatQueue('chat-A')?.heldBy).toBe('error'))
      await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(2), { timeout: 3000 })
      const retry = FakeXHR.all[1]
      retry.status = 404 // the turn ended meanwhile
      retry.responseText = '{"detail":"no stream"}'
      retry.end()
      expect(await done).toBe('done')
      expect(getChatQueue('chat-A')?.heldBy).toBeUndefined()
    } finally {
      takeAllQueuedMessages('chat-A')
    }
  }, 10000)

  it('keeps a prompt answer given while the follow was connecting', async () => {
    const card = { request_id: 'p1', card: 'chat' } as never
    const prior = { id: 'reply-A', role: 'assistant', content: 'earlier', created_at: '', chat_id: 'chat-A', chatPrompts: [card] } as UIMessage
    messages = [{ ...prior, isLoading: true }]
    const done = hook.followStream('chat-A', 'reply-A', prior)
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(1))
    // Answered before the stream answers.
    messages = messages.map((m) => ({ ...m, chatPrompts: [{ ...(card as object), decision: 'yes' } as never] }))
    const xhr = FakeXHR.all[0]
    xhr.start() // attaches: the reply goes back to the prior
    expect(messages[0].chatPrompts?.[0]).toMatchObject({ request_id: 'p1', decision: 'yes' })
    xhr.push({ type: 'RUN_STARTED', ...runA }, { type: 'RUN_FINISHED', ...runA })
    xhr.end()
    await act(async () => { await done })
  })

  it("finishes a failed reconnect on its own reply and composer, not on a newer call's", async () => {
    const states: string[] = []
    const view: View = { currentChatIdRef: { current: 'chat-A' }, setStreamState: (state) => { states.push(state) } }
    act(() => root.render(<Harness view={view} onReady={(api) => { hook = api }} />))
    let doneB: Promise<unknown> | undefined
    const unsubscribe = subscribeStreams((event) => {
      // As the refused reconnect ends, the user is on chat B, whose follow takes the hook.
      if (event.type === 'end' && event.chatId === 'chat-A' && FakeXHR.all.length === 2 && !doneB) {
        view.currentChatIdRef.current = 'chat-B'
        doneB = hook.followStream('chat-B', 'reply-B')
      }
    })
    try {
      const done = hook.followStream('chat-A', 'reply-A')
      await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(1))
      const xhr = FakeXHR.all[0]
      xhr.start()
      xhr.push({ type: 'RUN_STARTED', ...runA }, { type: 'TEXT_MESSAGE_CONTENT', messageId: 'a', delta: 'Part.' })
      xhr.status = 0
      xhr.end()
      await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(2), { timeout: 3000 })
      const retry = FakeXHR.all[1]
      retry.status = 500 // refused, not gone: this call finishes its reply as failed
      retry.responseText = '{"detail":"boom"}'
      retry.end()
      await act(async () => { await done })
      // B's follow really started, and took nothing of A's failure.
      await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(3))
      expect(FakeXHR.all[2].url).toContain('chat-B')
      expect(reply('reply-A').errorNotice).toBeTruthy()
      expect(reply('reply-B').errorNotice).toBeFalsy()
      expect(reply('reply-B').isLoading).toBe(true)
      const afterSwitch = states.slice(states.lastIndexOf('waiting'))
      expect(afterSwitch).not.toContain('error')
      // And B runs to its end.
      const xhrB = FakeXHR.all[2]
      xhrB.start()
      xhrB.push({ type: 'RUN_STARTED', ...runB }, { type: 'TEXT_MESSAGE_CONTENT', messageId: 'b', delta: 'From B.' }, { type: 'RUN_FINISHED', ...runB })
      xhrB.end()
      expect(await doneB).toBe('done')
      expect(reply('reply-B')).toMatchObject({ content: 'From B.', isLoading: false })
    } finally {
      unsubscribe()
      completeStream('chat-B')
    }
  }, 10000)

  it("finishes a new chat's composer when its id came only from the response header", async () => {
    const states: string[] = []
    const view: View = { currentChatIdRef: { current: undefined }, setStreamState: (state) => { states.push(state) } }
    act(() => root.render(<Harness view={view} onReady={(api) => { hook = api }} />))
    const done = hook.fetchAiResponse('hi', null, 'reply-A')
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(1))
    const send = FakeXHR.all[0]
    send.headers['X-Chat-Id'] = 'chat-H'
    send.start() // the header names the new chat
    view.currentChatIdRef.current = 'chat-H' // and the view moves to it
    send.end() // ended with no event carrying the id
    await act(async () => { await done })
    expect(states.at(-1)).toBe('done')
  })

  it('keeps prompt cards and their answers when a follow without a prior attaches', async () => {
    messages = [{ id: 'reply-A', role: 'assistant', content: 'old', created_at: '', chat_id: 'chat-A', isLoading: true,
      chatPrompts: [{ request_id: 'p1', card: 'chat', decision: 'yes' } as never] }]
    const done = hook.followStream('chat-A', 'reply-A')
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(1))
    const xhr = FakeXHR.all[0]
    xhr.start() // attaches without a prior: the text is reset
    expect(messages[0].content).toBe('')
    expect(messages[0].chatPrompts?.[0]).toMatchObject({ request_id: 'p1', decision: 'yes' })
    xhr.push({ type: 'RUN_STARTED', ...runA }, { type: 'RUN_FINISHED', ...runA })
    xhr.end()
    await act(async () => { await done })
  })

  it("does not let a send keep the detach of the follow it replaced", async () => {
    const doneA = hook.followStream('chat-A', 'reply-A') // a follow: droppable, with a detach
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(1))
    FakeXHR.all[0].start()
    FakeXHR.all[0].push({ type: 'RUN_STARTED', ...runA })
    const send = hook.fetchAiResponse('hi', 'chat-A', 'reply-B') // a send takes over before its run starts
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(2))
    expect(detachStream('chat-A')).toBe(false) // reopening waits for the send, as for any unstarted send
    expect(isStreamActive('chat-A')).toBe(true)
    const xhr = FakeXHR.all[1]
    xhr.start()
    xhr.push({ type: 'RUN_STARTED', ...runA }, { type: 'RUN_FINISHED', ...runA })
    xhr.end()
    FakeXHR.all[0].end() // the dropped follow's connection closes
    await act(async () => { await send; await doneA })
  })

  it("commits a call's buffered text to its own reply when it is detached from outside (live overlay)", async () => {
    act(() => root.render(<Harness liveOverlay onReady={(api) => { hook = api }} />))
    const doneA = hook.followStream('chat-A', 'reply-A')
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(1))
    const xhrA = FakeXHR.all[0]
    xhrA.start()
    xhrA.push({ type: 'RUN_STARTED', ...runA }, { type: 'TEXT_MESSAGE_CONTENT', messageId: 'a', delta: 'From A.' })
    xhrA.push({ type: 'TEXT_MESSAGE_CONTENT', messageId: 'a', delta: ' Still A.' }) // buffered, uncommitted
    // The chat reopens: A is detached from outside, not by a takeover.
    expect(detachStream('chat-A')).toBe(true)
    xhrA.end()
    await act(async () => { await doneA })
    // Another call then has the hook, and its turn ends with no text at all.
    const doneB = hook.followStream('chat-B', 'reply-B')
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(2))
    const xhrB = FakeXHR.all[1]
    xhrB.start()
    xhrB.push({ type: 'RUN_STARTED', ...runB }, { type: 'RUN_FINISHED', ...runB })
    xhrB.end()
    await act(async () => { await doneB })
    expect(JSON.stringify(reply('reply-B'))).not.toContain('Still A.')
    expect(reply('reply-A').content).toContain('Still A.')
  })

  it("frees a dropped chat once its run ends, so its queue can go on", async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] })
    try {
      const doneA = hook.followStream('chat-A', 'reply-A')
      await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(1))
      FakeXHR.all[0].start()
      FakeXHR.all[0].push({ type: 'RUN_STARTED', ...runA })
      const doneB = hook.followStream('chat-B', 'reply-B') // B takes the hook: A is dropped, still busy
      await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(2))
      expect(isStreamActive('chat-A')).toBe(true)
      await act(async () => { await vi.advanceTimersByTimeAsync(DROPPED_RUN_POLL_MS) })
      expect(isStreamActive('chat-A')).toBe(true) // still running on the backend
      runState.get = () => Promise.resolve('idle')
      await act(async () => { await vi.advanceTimersByTimeAsync(DROPPED_RUN_POLL_MS) })
      expect(isStreamActive('chat-A')).toBe(false) // its run ended: the chat is free
      FakeXHR.all[0].end()
      const xhrB = FakeXHR.all[1]
      xhrB.start()
      xhrB.push({ type: 'RUN_STARTED', ...runB }, { type: 'RUN_FINISHED', ...runB })
      xhrB.end()
      await act(async () => { await doneA; await doneB })
    } finally {
      vi.useRealTimers()
    }
  })

  it("lifts the drop's hold when another reader takes the chat and reads the turn to its end", async () => {
    queueMessage('chat-A', { content: 'next', attachments: [], mentionedPins: [] }, { settings: { pinsEnabled: true, webSearch: true }, modelId: 1 } as never)
    const timers = vi.spyOn(globalThis, 'setTimeout')
    const done = hook.followStream('chat-A', 'reply-A')
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(1))
    const xhr = FakeXHR.all[0]
    xhr.start()
    xhr.push({ type: 'RUN_STARTED', ...runA })
    xhr.status = 0
    xhr.end() // dropped: held, and the reconnect waits a moment
    await vi.waitFor(() => expect(getChatQueue('chat-A')?.heldBy).toBe('error'))
    await vi.waitFor(() => expect(timers.mock.calls.some(([, ms]) => ms === 1000)).toBe(true))
    timers.mockRestore()
    // Fake from here, before the stand-down: its run-state lookups run on this clock.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] })
    try {
      registerStream('chat-A') // the chat's own view (another hook) follows it meanwhile
      expect(await done).toBe('done') // this retry stands down
      expect(getChatQueue('chat-A')?.heldBy).toBe('error') // nothing recovered yet
      completeStream('chat-A', 'done') // that reader reads the turn to its end…
      runState.get = () => Promise.resolve('idle') // …and the backend confirms the run is over
      await act(async () => { await vi.advanceTimersByTimeAsync(DROPPED_RUN_POLL_MS) })
      expect(getChatQueue('chat-A')?.heldBy).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it("keeps the drop's hold while the run goes on when the other reader's follow is refused", async () => {
    queueMessage('chat-A', { content: 'next', attachments: [], mentionedPins: [] }, { settings: { pinsEnabled: true, webSearch: true }, modelId: 1 } as never)
    // A second hook: the chat's own view, which follows it while this one's reconnect waits.
    let other!: ReturnType<typeof useStreamingChat>
    const otherRoot = createRoot(document.createElement('div'))
    act(() => otherRoot.render(<Harness onReady={(api) => { other = api }} />))
    try {
      const timers = vi.spyOn(globalThis, 'setTimeout')
      const done = hook.followStream('chat-A', 'reply-A')
      await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(1))
      const xhr = FakeXHR.all[0]
      xhr.start()
      xhr.push({ type: 'RUN_STARTED', ...runA })
      xhr.status = 0
      xhr.end()
      await vi.waitFor(() => expect(getChatQueue('chat-A')?.heldBy).toBe('error'))
      await vi.waitFor(() => expect(timers.mock.calls.some(([, ms]) => ms === 1000)).toBe(true))
      timers.mockRestore()
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] })
      try {
        const otherDone = other.followStream('chat-A', 'reply-A')
        await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(2))
        expect(await done).toBe('done') // the reconnect stands down for the other reader
        const refused = FakeXHR.all[1]
        refused.status = 500 // the other reader's follow is refused: it ends as "done", recovering nothing
        refused.responseText = '{"detail":"boom"}'
        refused.end()
        await act(async () => { await otherDone })
        await act(async () => { await vi.advanceTimersByTimeAsync(DROPPED_RUN_POLL_MS * 2) })
        expect(getChatQueue('chat-A')?.heldBy).toBe('error') // the run is still going
        runState.get = () => Promise.resolve('idle')
        await act(async () => { await vi.advanceTimersByTimeAsync(DROPPED_RUN_POLL_MS) })
        expect(getChatQueue('chat-A')?.heldBy).toBeUndefined() // released once it has ended
      } finally {
        vi.useRealTimers()
      }
    } finally {
      act(() => otherRoot.unmount())
    }
  }, 10000)

  it("keeps the drop's hold when the other reader fails", async () => {
    queueMessage('chat-A', { content: 'next', attachments: [], mentionedPins: [] }, { settings: { pinsEnabled: true, webSearch: true }, modelId: 1 } as never)
    const timers = vi.spyOn(globalThis, 'setTimeout')
    const done = hook.followStream('chat-A', 'reply-A')
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(1))
    const xhr = FakeXHR.all[0]
    xhr.start()
    xhr.push({ type: 'RUN_STARTED', ...runA })
    xhr.status = 0
    xhr.end()
    await vi.waitFor(() => expect(timers.mock.calls.some(([, ms]) => ms === 1000)).toBe(true))
    timers.mockRestore()
    registerStream('chat-A')
    await done
    completeStream('chat-A', 'error')
    expect(getChatQueue('chat-A')?.heldBy).toBe('error')
  })

  it("keeps a dropped chat's reservation when its run is on the chat's own endpoint", async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] })
    try {
      act(() => root.render(<Harness view={{ endpoint: '/api/agents/a1/chat' } as never} onReady={(api) => { hook = api }} />))
      const doneA = hook.followStream('chat-A', 'reply-A')
      await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(1))
      FakeXHR.all[0].start()
      FakeXHR.all[0].push({ type: 'RUN_STARTED', ...runA })
      const doneB = hook.followStream('chat-B', 'reply-B') // A is dropped
      await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(2))
      runState.get = () => Promise.resolve('idle') // the chat API knows nothing of the agent run
      await act(async () => { await vi.advanceTimersByTimeAsync(DROPPED_RUN_POLL_MS * 2) })
      expect(isStreamActive('chat-A')).toBe(true) // not released on the chat API's word
      FakeXHR.all[0].end()
      FakeXHR.all[1].start()
      FakeXHR.all[1].push({ type: 'RUN_STARTED', ...runB }, { type: 'RUN_FINISHED', ...runB })
      FakeXHR.all[1].end()
      await act(async () => { await doneA; await doneB })
    } finally {
      vi.useRealTimers()
    }
  })

  it("lifts the drop's hold once the run ends when the reconnect was taken over", async () => {
    queueMessage('chat-A', { content: 'next', attachments: [], mentionedPins: [] }, { settings: { pinsEnabled: true, webSearch: true }, modelId: 1 } as never)
    const timers = vi.spyOn(globalThis, 'setTimeout')
    const doneA = hook.followStream('chat-A', 'reply-A')
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(1))
    const xhr = FakeXHR.all[0]
    xhr.start()
    xhr.push({ type: 'RUN_STARTED', ...runA })
    xhr.status = 0
    xhr.end() // dropped: held, reconnect waits
    await vi.waitFor(() => expect(getChatQueue('chat-A')?.heldBy).toBe('error'))
    await vi.waitFor(() => expect(timers.mock.calls.some(([, ms]) => ms === 1000)).toBe(true))
    timers.mockRestore()
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] })
    try {
      const doneB = hook.followStream('chat-B', 'reply-B') // another chat takes the hook in the wait
      await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(2), { timeout: 3000 })
      expect(await doneA).toBe('done') // the reconnect stood down
      expect(getChatQueue('chat-A')?.heldBy).toBe('error') // run still going
      runState.get = (id) => Promise.resolve(id === 'chat-A' ? 'idle' : 'running')
      await act(async () => { await vi.advanceTimersByTimeAsync(DROPPED_RUN_POLL_MS) })
      expect(getChatQueue('chat-A')?.heldBy).toBeUndefined()
      FakeXHR.all[1].start()
      FakeXHR.all[1].push({ type: 'RUN_STARTED', ...runB }, { type: 'RUN_FINISHED', ...runB })
      FakeXHR.all[1].end()
      await act(async () => { await doneB })
    } finally {
      vi.useRealTimers()
    }
  }, 10000)

  it("leaves a newer failure's hold alone when the older drop's run ends", async () => {
    queueMessage('chat-A', { content: 'next', attachments: [], mentionedPins: [] }, { settings: { pinsEnabled: true, webSearch: true }, modelId: 1 } as never)
    const timers = vi.spyOn(globalThis, 'setTimeout')
    const doneA = hook.followStream('chat-A', 'reply-A')
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(1))
    const xhr = FakeXHR.all[0]
    xhr.start()
    xhr.push({ type: 'RUN_STARTED', ...runA })
    xhr.status = 0
    xhr.end() // dropped: hold #1
    await vi.waitFor(() => expect(getChatQueue('chat-A')?.heldBy).toBe('error'))
    await vi.waitFor(() => expect(timers.mock.calls.some(([, ms]) => ms === 1000)).toBe(true))
    timers.mockRestore()
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] })
    try {
      const doneB = hook.followStream('chat-B', 'reply-B') // the reconnect is taken over: it waits for the run's end
      await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(2), { timeout: 3000 })
      await doneA
      // Meanwhile the user queues again (hold #1 lifted) and a newer reply fails: hold #2.
      takeAllQueuedMessages('chat-A')
      queueMessage('chat-A', { content: 'later', attachments: [], mentionedPins: [] }, { settings: { pinsEnabled: true, webSearch: true }, modelId: 1 } as never)
      registerStream('chat-A')
      completeStream('chat-A', 'error')
      expect(getChatQueue('chat-A')?.heldBy).toBe('error')
      runState.get = (id) => Promise.resolve(id === 'chat-A' ? 'idle' : 'running')
      await act(async () => { await vi.advanceTimersByTimeAsync(DROPPED_RUN_POLL_MS * 2) })
      expect(getChatQueue('chat-A')?.heldBy).toBe('error') // hold #2 stays
      FakeXHR.all[1].start()
      FakeXHR.all[1].push({ type: 'RUN_STARTED', ...runB }, { type: 'RUN_FINISHED', ...runB })
      FakeXHR.all[1].end()
      await act(async () => { await doneB })
    } finally {
      vi.useRealTimers()
    }
  }, 10000)

  it("lifts the drop's hold after the run ends even if the other reader is detached silently", async () => {
    queueMessage('chat-A', { content: 'next', attachments: [], mentionedPins: [] }, { settings: { pinsEnabled: true, webSearch: true }, modelId: 1 } as never)
    const timers = vi.spyOn(globalThis, 'setTimeout')
    const done = hook.followStream('chat-A', 'reply-A')
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(1))
    const xhr = FakeXHR.all[0]
    xhr.start()
    xhr.push({ type: 'RUN_STARTED', ...runA })
    xhr.status = 0
    xhr.end()
    await vi.waitFor(() => expect(getChatQueue('chat-A')?.heldBy).toBe('error'))
    await vi.waitFor(() => expect(timers.mock.calls.some(([, ms]) => ms === 1000)).toBe(true))
    timers.mockRestore()
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] })
    try {
      registerStream('chat-A', () => {}, () => {}) // another reader, which can be detached
      expect(await done).toBe('done') // the reconnect stands down
      expect(detachStream('chat-A')).toBe(true) // the chat reopens: that reader goes, with no end event
      runState.get = () => Promise.resolve('idle') // and the run has ended
      await act(async () => { await vi.advanceTimersByTimeAsync(DROPPED_RUN_POLL_MS) })
      expect(getChatQueue('chat-A')?.heldBy).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  }, 10000)

  it("keeps the drop's hold until the run ends when the reconnect is detached after attaching", async () => {
    queueMessage('chat-A', { content: 'next', attachments: [], mentionedPins: [] }, { settings: { pinsEnabled: true, webSearch: true }, modelId: 1 } as never)
    const timers = vi.spyOn(globalThis, 'setTimeout')
    const doneA = hook.followStream('chat-A', 'reply-A')
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(1))
    const xhr = FakeXHR.all[0]
    xhr.start()
    xhr.push({ type: 'RUN_STARTED', ...runA })
    xhr.status = 0
    xhr.end() // dropped: held, reconnect waits
    await vi.waitFor(() => expect(getChatQueue('chat-A')?.heldBy).toBe('error'))
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(2), { timeout: 3000 })
    timers.mockRestore()
    const retry = FakeXHR.all[1]
    retry.start() // the reconnect attaches…
    retry.push({ type: 'RUN_STARTED', ...runA })
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] })
    try {
      const doneB = hook.followStream('chat-B', 'reply-B') // …and is then taken over
      await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(3))
      retry.end()
      expect(await doneA).toBe('done')
      expect(getChatQueue('chat-A')?.heldBy).toBe('error') // the run is still going: kept
      runState.get = (id) => Promise.resolve(id === 'chat-A' ? 'idle' : 'running')
      await act(async () => { await vi.advanceTimersByTimeAsync(DROPPED_RUN_POLL_MS) })
      expect(getChatQueue('chat-A')?.heldBy).toBeUndefined() // lifted once it has ended
      FakeXHR.all[2].start()
      FakeXHR.all[2].push({ type: 'RUN_STARTED', ...runB }, { type: 'RUN_FINISHED', ...runB })
      FakeXHR.all[2].end()
      await act(async () => { await doneB })
    } finally {
      vi.useRealTimers()
    }
  }, 10000)

  it("keeps the first drop's hold until the run ends when the second drop's reconnect is detached", async () => {
    queueMessage('chat-A', { content: 'next', attachments: [], mentionedPins: [] }, { settings: { pinsEnabled: true, webSearch: true }, modelId: 1 } as never)
    const timers = vi.spyOn(globalThis, 'setTimeout')
    const doneA = hook.followStream('chat-A', 'reply-A')
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(1))
    FakeXHR.all[0].start()
    FakeXHR.all[0].push({ type: 'RUN_STARTED', ...runA })
    FakeXHR.all[0].status = 0
    FakeXHR.all[0].end() // first drop: hold set, owned by this call
    await vi.waitFor(() => expect(getChatQueue('chat-A')?.heldBy).toBe('error'))
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(2), { timeout: 3000 })
    const retry = FakeXHR.all[1]
    retry.start()
    retry.push({ type: 'RUN_STARTED', ...runA })
    timers.mockClear()
    retry.status = 0
    retry.end() // second drop: the retry waits to reconnect again
    await vi.waitFor(() => expect(timers.mock.calls.some(([, ms]) => ms === 1000)).toBe(true))
    timers.mockRestore()
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] })
    try {
      const doneB = hook.followStream('chat-B', 'reply-B') // taken over during that wait
      await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(3), { timeout: 3000 })
      expect(await doneA).toBe('done')
      expect(getChatQueue('chat-A')?.heldBy).toBe('error') // run still going: kept
      runState.get = (id) => Promise.resolve(id === 'chat-A' ? 'idle' : 'running')
      await act(async () => { await vi.advanceTimersByTimeAsync(DROPPED_RUN_POLL_MS) })
      expect(getChatQueue('chat-A')?.heldBy).toBeUndefined() // lifted once it ended
      FakeXHR.all[2].start()
      FakeXHR.all[2].push({ type: 'RUN_STARTED', ...runB }, { type: 'RUN_FINISHED', ...runB })
      FakeXHR.all[2].end()
      await act(async () => { await doneB })
    } finally {
      vi.useRealTimers()
    }
  }, 15000)

  it("keeps the drop's hold when a reader that took over from a nested reconnect fails", async () => {
    queueMessage('chat-A', { content: 'next', attachments: [], mentionedPins: [] }, { settings: { pinsEnabled: true, webSearch: true }, modelId: 1 } as never)
    const timers = vi.spyOn(globalThis, 'setTimeout')
    const doneA = hook.followStream('chat-A', 'reply-A')
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(1))
    FakeXHR.all[0].start()
    FakeXHR.all[0].push({ type: 'RUN_STARTED', ...runA })
    FakeXHR.all[0].status = 0
    FakeXHR.all[0].end() // first drop: the hold, owned by the top call
    await vi.waitFor(() => expect(getChatQueue('chat-A')?.heldBy).toBe('error'))
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(2), { timeout: 3000 })
    FakeXHR.all[1].start() // the reconnect attaches…
    FakeXHR.all[1].push({ type: 'RUN_STARTED', ...runA })
    timers.mockClear()
    FakeXHR.all[1].status = 0
    FakeXHR.all[1].end() // …and drops: the nested reconnect waits
    await vi.waitFor(() => expect(timers.mock.calls.some(([, ms]) => ms === 1000)).toBe(true))
    timers.mockRestore()
    registerStream('chat-A', () => {}, () => {}) // another reader takes the chat during that wait
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] })
    try {
      await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
      expect(await doneA).toBe('done') // stood down for that reader
      completeStream('chat-A', 'error') // the reader fails
      runState.get = () => Promise.resolve('idle')
      await act(async () => { await vi.advanceTimersByTimeAsync(DROPPED_RUN_POLL_MS * 2) })
      expect(getChatQueue('chat-A')?.heldBy).toBe('error') // a failed reply keeps the queue held
    } finally {
      vi.useRealTimers()
    }
  }, 15000)

  it("passes a detached reconnect's signal up through every level to the hold's owner", async () => {
    queueMessage('chat-A', { content: 'next', attachments: [], mentionedPins: [] }, { settings: { pinsEnabled: true, webSearch: true }, modelId: 1 } as never)
    const doneA = hook.followStream('chat-A', 'reply-A')
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(1))
    FakeXHR.all[0].start()
    FakeXHR.all[0].push({ type: 'RUN_STARTED', ...runA })
    FakeXHR.all[0].status = 0
    FakeXHR.all[0].end() // drop 1: the hold, owned by the top call
    await vi.waitFor(() => expect(getChatQueue('chat-A')?.heldBy).toBe('error'))
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(2), { timeout: 3000 })
    FakeXHR.all[1].start() // reconnect 1 attaches…
    FakeXHR.all[1].push({ type: 'RUN_STARTED', ...runA })
    FakeXHR.all[1].status = 0
    FakeXHR.all[1].end() // …and drops
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(3), { timeout: 3000 })
    const second = FakeXHR.all[2]
    second.start() // reconnect 2 attaches…
    second.push({ type: 'RUN_STARTED', ...runA })
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] })
    try {
      const doneB = hook.followStream('chat-B', 'reply-B') // …and is taken over
      await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(4))
      second.end()
      expect(await doneA).toBe('done')
      expect(getChatQueue('chat-A')?.heldBy).toBe('error') // the run may still be going: kept
      runState.get = (id) => Promise.resolve(id === 'chat-A' ? 'idle' : 'running')
      await act(async () => { await vi.advanceTimersByTimeAsync(DROPPED_RUN_POLL_MS) })
      expect(getChatQueue('chat-A')?.heldBy).toBeUndefined()
      FakeXHR.all[3].start()
      FakeXHR.all[3].push({ type: 'RUN_STARTED', ...runB }, { type: 'RUN_FINISHED', ...runB })
      FakeXHR.all[3].end()
      await act(async () => { await doneB })
    } finally {
      vi.useRealTimers()
    }
  }, 15000)

  it("keeps the hold when the user stops a taken-over attached reconnect before the run reports idle", async () => {
    queueMessage('chat-A', { content: 'next', attachments: [], mentionedPins: [] }, { settings: { pinsEnabled: true, webSearch: true }, modelId: 1 } as never)
    const doneA = hook.followStream('chat-A', 'reply-A')
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(1))
    FakeXHR.all[0].start()
    FakeXHR.all[0].push({ type: 'RUN_STARTED', ...runA })
    FakeXHR.all[0].status = 0
    FakeXHR.all[0].end() // dropped: held
    await vi.waitFor(() => expect(getChatQueue('chat-A')?.heldBy).toBe('error'))
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(2), { timeout: 3000 })
    const reconnect = FakeXHR.all[1]
    reconnect.start() // the reconnect attaches…
    reconnect.push({ type: 'RUN_STARTED', ...runA })
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] })
    try {
      const doneB = hook.followStream('chat-B', 'reply-B') // …and is taken over
      await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(3))
      reconnect.end()
      expect(await doneA).toBe('done')
      runState.get = (id) => Promise.resolve(id === 'chat-A' ? 'running' : 'idle')
      await act(async () => { await vi.advanceTimersByTimeAsync(DROPPED_RUN_POLL_MS) }) // still running
      act(() => { stopStream('chat-A') }) // the user stops chat A before the run reports idle
      runState.get = () => Promise.resolve('idle')
      await act(async () => { await vi.advanceTimersByTimeAsync(DROPPED_RUN_POLL_MS * 2) })
      expect(getChatQueue('chat-A')?.heldBy).toBe('error') // the Stop keeps it held
      FakeXHR.all[2].start()
      FakeXHR.all[2].push({ type: 'RUN_STARTED', ...runB }, { type: 'RUN_FINISHED', ...runB })
      FakeXHR.all[2].end()
      await act(async () => { await doneB })
    } finally {
      vi.useRealTimers()
    }
  }, 15000)

  it("tells the follow's caller when a reconnect after a drop finds the run over", async () => {
    const onRunGone = vi.fn()
    const done = hook.followStream('chat-A', 'reply-A', undefined, undefined, undefined, onRunGone)
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(1))
    FakeXHR.all[0].start()
    FakeXHR.all[0].push({ type: 'RUN_STARTED', ...runA })
    FakeXHR.all[0].status = 0
    FakeXHR.all[0].end() // dropped: a reconnect follows
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(2), { timeout: 3000 })
    FakeXHR.all[1].status = 404 // the run is over
    FakeXHR.all[1].responseText = '{"detail":"no running turn"}'
    FakeXHR.all[1].end()
    expect(await done).toBe('done')
    expect(onRunGone).toHaveBeenCalledOnce()
  })

  it("tells the follow's caller when a reconnect after a drop fails before it attaches", async () => {
    const incomplete = vi.fn()
    const done = hook.followStream('chat-A', 'reply-A', undefined, undefined, undefined, undefined, incomplete)
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(1))
    FakeXHR.all[0].start()
    FakeXHR.all[0].push({ type: 'RUN_STARTED', ...runA })
    FakeXHR.all[0].status = 0
    FakeXHR.all[0].end() // dropped: a reconnect follows
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(2), { timeout: 3000 })
    FakeXHR.all[1].status = 503 // the reconnect fails before attaching
    FakeXHR.all[1].responseText = 'Service Unavailable'
    FakeXHR.all[1].end()
    await act(async () => { await done })
    expect(incomplete).toHaveBeenCalledOnce() // its caller can try again
  })

  it('records a clean close with no terminal event as an inconclusive end', async () => {
    const ends: { outcome: string; inconclusive?: boolean }[] = []
    const off = subscribeStreams((e) => { if (e.type === 'end' && e.chatId === 'chat-A') ends.push({ outcome: e.outcome, inconclusive: e.inconclusive }) })
    const done = hook.followStream('chat-A', 'reply-A')
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(1))
    FakeXHR.all[0].start()
    FakeXHR.all[0].push({ type: 'RUN_STARTED', ...runA }, { type: 'TEXT_MESSAGE_CONTENT', messageId: 'a', delta: 'Part of it.' })
    FakeXHR.all[0].end() // 200, closed, no RUN_FINISHED or error
    await act(async () => { await done })
    off()
    // Shown as cut off (not a finished turn), and recorded as inconclusive: the run may go on.
    expect(ends).toEqual([{ outcome: 'error', inconclusive: true }])
  })

  it("tells the follow's caller when its stream closes with no end event, not when the run finished", async () => {
    const incomplete = vi.fn()
    const first = hook.followStream('chat-A', 'reply-A', undefined, undefined, undefined, undefined, incomplete)
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(1))
    FakeXHR.all[0].start()
    FakeXHR.all[0].push({ type: 'RUN_STARTED', ...runA }, { type: 'TEXT_MESSAGE_CONTENT', messageId: 'a', delta: 'Part.' })
    FakeXHR.all[0].end() // closed, no end event
    await act(async () => { await first })
    expect(incomplete).toHaveBeenCalledOnce()
    const finished = vi.fn()
    const second = hook.followStream('chat-B', 'reply-B', undefined, undefined, undefined, undefined, finished)
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(2))
    FakeXHR.all[1].start()
    FakeXHR.all[1].push({ type: 'RUN_STARTED', ...runB }, { type: 'TEXT_MESSAGE_CONTENT', messageId: 'b', delta: 'All.' }, { type: 'RUN_FINISHED', ...runB })
    FakeXHR.all[1].end()
    await act(async () => { await second })
    expect(finished).not.toHaveBeenCalled()
  })

  it('records a run that finished as a conclusive end', async () => {
    const ends: { outcome: string; inconclusive?: boolean }[] = []
    const off = subscribeStreams((e) => { if (e.type === 'end' && e.chatId === 'chat-A') ends.push({ outcome: e.outcome, inconclusive: e.inconclusive }) })
    const done = hook.followStream('chat-A', 'reply-A')
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(1))
    FakeXHR.all[0].start()
    FakeXHR.all[0].push({ type: 'RUN_STARTED', ...runA }, { type: 'TEXT_MESSAGE_CONTENT', messageId: 'a', delta: 'All of it.' }, { type: 'RUN_FINISHED', ...runA })
    FakeXHR.all[0].end()
    await act(async () => { await done })
    off()
    expect(ends).toEqual([{ outcome: 'done', inconclusive: undefined }])
  })

  it("leaves a newer registration alone when a stopped call's transport settles", async () => {
    const done = hook.followStream('chat-A', 'reply-A')
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(1))
    FakeXHR.all[0].start()
    FakeXHR.all[0].push({ type: 'RUN_STARTED', ...runA })
    const newer = vi.fn()
    // An end listener registers the chat again as soon as Stop has ended its entry.
    const off = subscribeStreams((event) => { if (event.type === 'end' && event.chatId === 'chat-A') registerStream('chat-A', newer) })
    act(() => { stopStream('chat-A') })
    off()
    FakeXHR.all[0].end() // the stopped request settles afterwards
    await act(async () => { await done })
    expect(isStreamActive('chat-A')).toBe(true) // the newer entry is still there…
    expect(stopStream('chat-A')).toBe(true) // …and Stop still reaches it
    expect(newer).toHaveBeenCalledOnce()
    completeStream('chat-A', 'done')
  })

  it("lifts its own chat's drop hold when an end listener starts another chat on the hook", async () => {
    queueMessage('chat-A', { content: 'next', attachments: [], mentionedPins: [] }, { settings: { pinsEnabled: true, webSearch: true }, modelId: 1 } as never)
    const doneA = hook.followStream('chat-A', 'reply-A')
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(1))
    FakeXHR.all[0].start()
    FakeXHR.all[0].push({ type: 'RUN_STARTED', ...runA })
    let doneB: Promise<unknown> | undefined
    // The drop's end starts chat B on the same hook, from inside the notification.
    const off = subscribeStreams((event) => {
      if (event.type === 'end' && event.chatId === 'chat-A' && !doneB) doneB = hook.followStream('chat-B', 'reply-B')
    })
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] })
    try {
      FakeXHR.all[0].status = 0
      FakeXHR.all[0].end() // dropped: A held
      await vi.waitFor(() => expect(doneB).toBeDefined())
      off()
      expect(getChatQueue('chat-A')?.heldBy).toBe('error')
      await act(async () => { await vi.advanceTimersByTimeAsync(1000) }) // the reconnect wait ends: taken over
      expect(await doneA).toBe('done')
      runState.get = (id) => Promise.resolve(id === 'chat-A' ? 'idle' : 'running')
      await act(async () => { await vi.advanceTimersByTimeAsync(DROPPED_RUN_POLL_MS * 2) })
      expect(getChatQueue('chat-A')?.heldBy).toBeUndefined() // A's own hold went once its run ended
      await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(2))
      FakeXHR.all[1].start()
      FakeXHR.all[1].push({ type: 'RUN_STARTED', ...runB }, { type: 'RUN_FINISHED', ...runB })
      FakeXHR.all[1].end()
      await act(async () => { await doneB })
    } finally {
      vi.useRealTimers()
    }
  }, 15000)

  it('a follow that waited stands down if its caller no longer wants it, and leaves the holder alone', async () => {
    const doneA = hook.fetchAiResponse('hello', 'chat-A', 'reply-A') // a send not yet accepted
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(1))
    const send = FakeXHR.all[0]
    send.start()
    let wanted = true
    const doneB = hook.followStream('chat-B', 'reply-B', undefined, undefined, () => wanted) // waits behind it
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)) })
    wanted = false // B reloaded: that reply is no longer running
    send.push({ type: 'RUN_STARTED', ...runA }) // the send is accepted: the follow's wait is over
    expect(await doneB).toBe('done')
    expect(FakeXHR.all).toHaveLength(1) // no stale follow request
    expect(send.aborted).toBe(false) // and A's reader was not dropped for it
    send.push({ type: 'RUN_FINISHED', ...runA })
    send.end()
    await act(async () => { await doneA })
  })

  it("keeps the drop's hold when the user pressed Stop before another chat took over", async () => {
    queueMessage('chat-A', { content: 'next', attachments: [], mentionedPins: [] }, { settings: { pinsEnabled: true, webSearch: true }, modelId: 1 } as never)
    const timers = vi.spyOn(globalThis, 'setTimeout')
    const doneA = hook.followStream('chat-A', 'reply-A')
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(1))
    FakeXHR.all[0].start()
    FakeXHR.all[0].push({ type: 'RUN_STARTED', ...runA })
    FakeXHR.all[0].status = 0
    FakeXHR.all[0].end() // dropped: held, reconnect waits
    await vi.waitFor(() => expect(getChatQueue('chat-A')?.heldBy).toBe('error'))
    await vi.waitFor(() => expect(timers.mock.calls.some(([, ms]) => ms === 1000)).toBe(true))
    timers.mockRestore()
    act(() => hook.handleStopGeneration()) // the user stops during the wait…
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] })
    try {
      const doneB = hook.followStream('chat-B', 'reply-B') // …and another chat then takes over
      await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(2), { timeout: 3000 })
      await doneA
      runState.get = () => Promise.resolve('idle')
      await act(async () => { await vi.advanceTimersByTimeAsync(DROPPED_RUN_POLL_MS * 2) })
      expect(getChatQueue('chat-A')?.heldBy).toBe('error') // the Stop keeps it held
      FakeXHR.all[1].start()
      FakeXHR.all[1].push({ type: 'RUN_STARTED', ...runB }, { type: 'RUN_FINISHED', ...runB })
      FakeXHR.all[1].end()
      await act(async () => { await doneB })
    } finally {
      vi.useRealTimers()
    }
  }, 10000)

  it("keeps the first drop's hold when the user stops during a nested reconnect's wait before a takeover", async () => {
    queueMessage('chat-A', { content: 'next', attachments: [], mentionedPins: [] }, { settings: { pinsEnabled: true, webSearch: true }, modelId: 1 } as never)
    const timers = vi.spyOn(globalThis, 'setTimeout')
    const doneA = hook.followStream('chat-A', 'reply-A')
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(1))
    FakeXHR.all[0].start()
    FakeXHR.all[0].push({ type: 'RUN_STARTED', ...runA })
    FakeXHR.all[0].status = 0
    FakeXHR.all[0].end() // drop 1: hold owned by the top call
    await vi.waitFor(() => expect(getChatQueue('chat-A')?.heldBy).toBe('error'))
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(2), { timeout: 3000 })
    FakeXHR.all[1].start() // reconnect 1 attaches…
    FakeXHR.all[1].push({ type: 'RUN_STARTED', ...runA })
    timers.mockClear()
    FakeXHR.all[1].status = 0
    FakeXHR.all[1].end() // …and drops: reconnect 2 waits
    await vi.waitFor(() => expect(timers.mock.calls.some(([, ms]) => ms === 1000)).toBe(true))
    timers.mockRestore()
    act(() => hook.handleStopGeneration()) // the user stops during that wait…
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] })
    try {
      const doneB = hook.followStream('chat-B', 'reply-B') // …then another chat takes over
      await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(3), { timeout: 3000 })
      await doneA
      runState.get = () => Promise.resolve('idle')
      await act(async () => { await vi.advanceTimersByTimeAsync(DROPPED_RUN_POLL_MS * 2) })
      expect(getChatQueue('chat-A')?.heldBy).toBe('error') // the Stop keeps it
      FakeXHR.all[2].start()
      FakeXHR.all[2].push({ type: 'RUN_STARTED', ...runB }, { type: 'RUN_FINISHED', ...runB })
      FakeXHR.all[2].end()
      await act(async () => { await doneB })
    } finally {
      vi.useRealTimers()
    }
  }, 15000)

  it("stops a dropped chat's run through the backend without touching the call that took over", async () => {
    const stopBackend = vi.fn()
    act(() => root.render(<Harness view={{ onStopBackend: stopBackend } as never} onReady={(api) => { hook = api }} />))
    const doneA = hook.followStream('chat-A', 'reply-A')
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(1))
    FakeXHR.all[0].start()
    FakeXHR.all[0].push({ type: 'RUN_STARTED', ...runA })
    const doneB = hook.followStream('chat-B', 'reply-B') // B takes over: A is dropped, still busy
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(2))
    expect(isStreamActive('chat-A')).toBe(true)
    expect(stopStream('chat-A')).toBe(true) // Stop on chat A
    expect(stopBackend).toHaveBeenCalledWith('chat-A')
    expect(reply('reply-A')).toMatchObject({ isLoading: false, stoppedByUser: true })
    expect(isStreamActive('chat-A')).toBe(false)
    expect(FakeXHR.all[1].aborted).toBe(false) // B's stream goes on
    FakeXHR.all[0].end()
    FakeXHR.all[1].start()
    FakeXHR.all[1].push({ type: 'RUN_STARTED', ...runB }, { type: 'RUN_FINISHED', ...runB })
    FakeXHR.all[1].end()
    await act(async () => { await doneA; await doneB })
    expect(stopBackend).not.toHaveBeenCalledWith('chat-B')
  })

  it("ends as stopped, keeping the hold, when Stop came before another reader took the chat", async () => {
    queueMessage('chat-A', { content: 'next', attachments: [], mentionedPins: [] }, { settings: { pinsEnabled: true, webSearch: true }, modelId: 1 } as never)
    const timers = vi.spyOn(globalThis, 'setTimeout')
    const doneA = hook.followStream('chat-A', 'reply-A')
    await vi.waitFor(() => expect(FakeXHR.all).toHaveLength(1))
    FakeXHR.all[0].start()
    FakeXHR.all[0].push({ type: 'RUN_STARTED', ...runA })
    FakeXHR.all[0].status = 0
    FakeXHR.all[0].end()
    await vi.waitFor(() => expect(getChatQueue('chat-A')?.heldBy).toBe('error'))
    await vi.waitFor(() => expect(timers.mock.calls.some(([, ms]) => ms === 1000)).toBe(true))
    timers.mockRestore()
    act(() => hook.handleStopGeneration()) // Stop during the wait…
    registerStream('chat-A') // …then another view's reader registers the chat
    expect(await doneA).toBe('aborted')
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] })
    try {
      runState.get = () => Promise.resolve('idle')
      await act(async () => { await vi.advanceTimersByTimeAsync(DROPPED_RUN_POLL_MS * 2) })
      expect(getChatQueue('chat-A')?.heldBy).toBe('error')
    } finally {
      vi.useRealTimers()
    }
  }, 10000)
})
