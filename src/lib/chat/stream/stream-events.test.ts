// @vitest-environment jsdom
//
// The stream's event handlers, driven with real AG-UI frames (stream-fixtures)
// through the SSE decoder and a fake hook context that applies every update
// to a plain messages array.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AguiSSEDecoder } from '@/lib/sse-decoder'
import { messageParts } from '@/lib/reasoning'
import type { UIMessage } from '@/types/chat'
import { STREAM_FIXTURES } from './stream-fixtures'
import { processStreamEvents } from './stream-events'
import { createStreamTurn, finishTurn, type StreamEventContext, type StreamTurn } from './stream-turn'
import { SESSION_EXPIRED_MESSAGE } from './stream-errors'
import { handleToolComplete, handleToolExecuting, handleToolFinished } from './tool-events'

const toast = vi.hoisted(() => vi.fn())
const shareToast = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast }))
vi.mock('@/components/Library/chat/library-share-toast', () => ({ showLibraryShareToast: shareToast }))

let messages: UIMessage[]
let calls: string[]
let ctx: StreamEventContext
let turn: StreamTurn
let msgId: string | null
let chatId: string | null

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  toast.mockClear()
  shareToast.mockClear()
  messages = [
    { id: 'user-1', role: 'user', content: 'q', created_at: '', chat_id: 'chat-1', attachments: [{ id: 'a1', file_name: 'notes.txt', file_type: 'text/plain', file_size: 1 }] } as UIMessage,
    { id: 'loading-1', role: 'assistant', content: '', created_at: '', chat_id: 'chat-1', isLoading: true },
  ]
  calls = []
  msgId = 'loading-1'
  chatId = 'chat-1'
  turn = createStreamTurn()
  ctx = {
    setMessages: (u) => { calls.push('set'); messages = typeof u === 'function' ? u(messages) : u },
    queueUpdate: (fields, immediate) => {
      calls.push(immediate ? 'queue!' : 'queue')
      messages = messages.map((m) => (m.id === msgId ? { ...m, ...fields } : m))
    },
    flushPending: () => calls.push('flush'),
    messageId: () => msgId,
    setMessageId: (id) => { msgId = id },
    userMessageId: () => 'user-1',
    chatId: () => chatId,
    adoptChatId: vi.fn((id: string) => { if (!chatId || chatId.startsWith('temp-')) chatId = id }),
    onRunStarted: vi.fn(),
    onTitleUpdate: vi.fn(),
    onChatMoveToTop: vi.fn(),
    saveToLibrary: undefined,
  }
})

function play(events: object[]) {
  const decoder = new AguiSSEDecoder()
  processStreamEvents(ctx, turn, decoder.push(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')))
  return messages.find((m) => m.role === 'assistant')!
}

describe('stream events', () => {
  it('streams text, picks the model and swaps in the saved id', () => {
    const reply = play(STREAM_FIXTURES.longText)
    expect(ctx.onRunStarted).toHaveBeenCalledOnce()
    expect(reply).toMatchObject({
      id: 'real-msg-1',
      content: 'Hello there, this is a long answer. More after save.',
      modelName: 'GPT-4o',
      modelMeta: { modelId: 'gpt-4o', modelName: 'GPT-4o', deploymentName: 'gpt-4o-dep', company: 'openai' },
      isLoading: false,
      isError: false,
    })
    // The batched text is committed under the temp id before the id changes.
    const swap = calls.indexOf('set', calls.indexOf('flush'))
    expect(calls.slice(0, swap + 1)).toContain('flush')
    expect(ctx.onChatMoveToTop).toHaveBeenCalledWith('chat-1')
  })

  it('keeps reasoning in the timeline and ends the thinking span', () => {
    const reply = play(STREAM_FIXTURES.reasoning)
    expect(reply.thinking).toContain('First I consider the question.')
    expect(reply.reasoningTimeline?.map((item) => item.kind)).toEqual(['reasoning', 'text'])
    expect(reply.isThinkingInProgress).toBe(false)
    expect(reply.content).toBe('The answer is 42.')
    expect(ctx.onTitleUpdate).toHaveBeenCalledWith('chat-1', 'Meaning of life')
    // The first reasoning chunk and the first answer token flush right away.
    expect(calls.filter((c) => c === 'queue!').length).toBeGreaterThanOrEqual(3)
  })

  it('reads a leading <think> block as reasoning', () => {
    const reply = play(STREAM_FIXTURES.thinkTag)
    expect(reply.content).toBe('Visible answer.')
    expect(reply.thinking).toBe('Hidden reasoning')
  })

  it('adds a web search row, its citations, and the saved sources', () => {
    const reply = play(STREAM_FIXTURES.webSearch)
    expect(reply.activities?.[0]).toMatchObject({ type: 'web-search', detail: 'weather in Ames', status: 'done' })
    expect(reply.webCitations).toEqual([
      { title: 'Ames forecast', url: 'https://www.weather.example.com/ames', domain: 'weather.example.com' },
      { title: 'https://news.example.org/a', url: 'https://news.example.org/a', domain: 'news.example.org' },
    ])
    expect(reply.reasoningTimeline?.map((item) => item.kind)).toEqual(['activity', 'text'])
  })

  it('keeps text, tool calls and more text in the order they happened, timed by the server', () => {
    const at = (timestamp: number, event: object) => ({ ...event, timestamp })
    const reply = play([
      { type: 'RUN_STARTED', threadId: 'chat-1', runId: 'run-1' },
      at(1_000, { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1', delta: 'Looking it up.' }),
      at(2_000, { type: 'TOOL_CALL_START', toolCallId: 'call-a', toolCallName: 'search_web' }),
      at(2_000, { type: 'TOOL_CALL_START', toolCallId: 'call-b', toolCallName: 'search_web' }),
      at(2_100, { type: 'TOOL_CALL_END', toolCallId: 'call-a' }),
      at(2_100, { type: 'TOOL_CALL_END', toolCallId: 'call-b' }),
      at(4_500, { type: 'TOOL_CALL_RESULT', messageId: 't1', toolCallId: 'call-a', content: 'raw' }),
      at(4_500, { type: 'CUSTOM', name: 'tool_finished', value: {
        tool_call_id: 'call-a', failed: false,
        results: [{ title: 'Ames forecast', url: 'https://weather.example.com/ames', snippet: 'Sunny' }],
      } }),
      at(5_000, { type: 'TOOL_CALL_RESULT', messageId: 't2', toolCallId: 'call-b', content: 'raw' }),
      at(5_000, { type: 'CUSTOM', name: 'tool_finished', value: { tool_call_id: 'call-b', failed: true, results: [] } }),
      at(6_000, { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1', delta: '\n\nIt is sunny.' }),
      { type: 'RUN_FINISHED', threadId: 'chat-1', runId: 'run-1' },
    ])

    expect(reply.content).toBe('Looking it up.\n\nIt is sunny.')
    expect(reply.reasoningTimeline).toEqual([
      { kind: 'text', id: 'text-0', start: 0 },
      { kind: 'activity', id: 'activity-1', activityId: 'call-a', roundIndex: undefined, at: 2_000, endAt: 4_500 },
      { kind: 'activity', id: 'activity-2', activityId: 'call-b', roundIndex: undefined, at: 2_000, endAt: 5_000 },
      { kind: 'text', id: 'text-3', start: 14 },
    ])
    const [first, second] = reply.activities!
    expect(first).toMatchObject({
      id: 'call-a', type: 'web-search', status: 'done', durationS: 2.5,
      results: [{ title: 'Ames forecast', url: 'https://weather.example.com/ames', domain: 'weather.example.com' }],
    })
    expect(second).toMatchObject({ id: 'call-b', status: 'error', durationS: 3 })
    expect(messageParts(reply.reasoningTimeline!, reply.content)).toEqual([
      { kind: 'text', id: 'text-0', content: 'Looking it up.' },
      { kind: 'work', id: 'activity-1', items: reply.reasoningTimeline!.slice(1, 3), durationMs: 3_000 },
      { kind: 'text', id: 'text-3', content: 'It is sunny.' },
    ])
  })

  it('carries on after the trace earlier stretches of the run left on the reply', () => {
    turn = createStreamTurn({
      id: 'loading-1', role: 'assistant', content: 'Before the question.', created_at: '', chat_id: 'chat-1',
      reasoningTimeline: [{ kind: 'text', id: 'text-0', start: 0 }, { kind: 'activity', id: 'activity-1', activityId: 'call-0', at: 1, endAt: 2 }],
    })
    const reply = play([
      { type: 'RUN_STARTED', threadId: 'chat-1', runId: 'run-1' },
      { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1', delta: 'After the answer.' },
      { type: 'RUN_FINISHED', threadId: 'chat-1', runId: 'run-1' },
    ])
    expect(reply.content).toBe('Before the question.\n\nAfter the answer.')
    expect(reply.reasoningTimeline?.map((item) => item.id)).toEqual(['text-0', 'activity-1', 'text-2'])
    expect(messageParts(reply.reasoningTimeline!, reply.content).map((part) => part.kind === 'text' ? part.content : part.kind))
      .toEqual(['Before the question.', 'work', 'After the answer.'])
  })

  it('reads a <think> block at the start of a later stretch as reasoning, not answer', () => {
    turn = createStreamTurn({ id: 'loading-1', role: 'assistant', content: 'Before.', created_at: '', chat_id: 'chat-1' })
    const reply = play([
      { type: 'RUN_STARTED', threadId: 'chat-1', runId: 'run-1' },
      { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1', delta: '<think>Hidden reasoning</think>' },
      { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1', delta: 'Answer' },
      { type: 'RUN_FINISHED', threadId: 'chat-1', runId: 'run-1' },
    ])
    expect(reply.content).toBe('Before.\n\nAnswer')
    expect(reply.content).not.toContain('think')
    expect(reply.thinking).toBe('Hidden reasoning')
  })

  it('places a later stretch after an earlier reply that has no text marker', () => {
    turn = createStreamTurn({
      id: 'loading-1', role: 'assistant', content: 'Before.', created_at: '', chat_id: 'chat-1',
      reasoningTimeline: [{ kind: 'activity', id: 'activity-0', activityId: 'call-0', at: 1, endAt: 2 }],
    })
    const reply = play([
      { type: 'RUN_STARTED', threadId: 'chat-1', runId: 'run-1' },
      { type: 'CUSTOM', name: 'reasoning_body', value: { content: 'Thinking again.', round_index: 0 } },
      { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1', delta: 'After.' },
      { type: 'RUN_FINISHED', threadId: 'chat-1', runId: 'run-1' },
    ])
    expect(messageParts(reply.reasoningTimeline!, reply.content).map((part) => part.kind === 'text' ? part.content : part.kind))
      .toEqual(['work', 'Before.', 'work', 'After.'])
  })

  it('keeps a second same-name call findable when the first completes', () => {
    handleToolExecuting(ctx, turn, { content: 'search', tool_call: { name: 'search', tool_call_id: 'a' } })
    handleToolExecuting(ctx, turn, { content: 'search', tool_call: { name: 'search', tool_call_id: 'b' } })
    handleToolComplete(ctx, turn, { content: 'search', tool_call: { name: 'search', tool_call_id: 'a' } })
    expect(turn.toolCallIdByName.get('search')).toBe('b')
    handleToolComplete(ctx, turn, { content: 'search', tool_call: { name: 'search', tool_call_id: 'b' } })
    expect(turn.toolCallIdByName.has('search')).toBe(false)
  })

  it('keeps the duration tool_complete gave when tool_finished has no timestamps', () => {
    handleToolExecuting(ctx, turn, { content: 'lookup', tool_call: { name: 'lookup', tool_call_id: 'lk' } })
    handleToolComplete(ctx, turn, { content: 'lookup', tool_call: { name: 'lookup', tool_call_id: 'lk', duration_s: 1.5 } })
    handleToolFinished(ctx, turn, { tool_call_id: 'lk', failed: false })
    expect(messages[1].activities?.[0]).toMatchObject({ id: 'lk', status: 'done', durationS: 1.5 })
  })

  it('follows a tool call from streamed arguments to done', () => {
    const reply = play(STREAM_FIXTURES.toolCall)
    expect(reply.activities).toHaveLength(1)
    expect(reply.activities?.[0]).toMatchObject({ id: 'call-1', toolName: 'web_search', status: 'done', label: 'Searching', progressMessage: 'Fetching' })
    expect(reply.content).toBe('Found it.')
  })

  it('creates a row from tool_progress alone and keeps an error status through tool_complete', () => {
    const reply = play(STREAM_FIXTURES.toolProgressOnly)
    expect(reply.activities).toEqual([expect.objectContaining({ id: 'tp-code_interpreter-a.py', status: 'error', label: 'Run', codePreview: undefined })])
  })

  it('marks a failed tool as error and a finished one as done', () => {
    const reply = play(STREAM_FIXTURES.toolError)
    const [email, lookup] = reply.activities!
    expect(email).toMatchObject({ toolName: 'send_email', status: 'error', detail: 'SMTP down' })
    expect(lookup).toMatchObject({ id: 'lk-1', status: 'done', durationS: 0.2, label: 'Looked up' })
  })

  it('previews an image call while it streams, then shows the image once', () => {
    const reply = play(STREAM_FIXTURES.image)
    expect(reply.activities?.[0]).toMatchObject({ id: 'call-img', toolName: 'execute', status: 'done', generatesImage: true, imageHints: { prompt: 'a red apple', aspect: 1 } })
    expect(reply.images).toEqual([
      { url: 'https://cdn.test/apple.png', s3Key: 'img/apple.png' },
      { url: 'https://cdn.test/a2.png' },
      { url: 'https://cdn.test/new.png' },
    ])
    expect(reply).toMatchObject({ id: 'real-msg-3', isError: false })
  })

  it('collects generated files and gives the user message its stored links', () => {
    const reply = play(STREAM_FIXTURES.files)
    expect(reply.activities?.[0]).toMatchObject({ id: 'docx-report.docx', type: 'docx-progress', status: 'done', detail: 'Writing', codePreview: 'doc()' })
    expect(reply.generatedFiles?.map((f) => f.url)).toEqual(['https://cdn.test/report.docx', 'https://cdn.test/sheet.csv', 'https://cdn.test/extra.pdf'])
    expect(messages[0].attachments?.[0]).toMatchObject({ id: 'a1', url: 'https://cdn.test/up/notes2.txt', uploading: false })
    expect(ctx.onTitleUpdate).toHaveBeenCalledWith('chat-1', 'Report chat')
  })

  it('handles agents, plans, prompts, blocks and Library events', () => {
    const memory = vi.fn()
    window.addEventListener('souvenir:memory-updated', memory)
    const reply = play(STREAM_FIXTURES.extras)
    window.removeEventListener('souvenir:memory-updated', memory)
    const agents = reply.activities!.filter((a) => a.type === 'agent')
    expect(agents.map((a) => [a.label, a.status, a.output])).toEqual([['Researcher', 'done', 'Looking more'], ['Writer', 'error', undefined]])
    expect(reply.plan).toHaveLength(2)
    expect(reply.browserView).toEqual({ url: 'https://live.test/v', pageUrl: 'https://site.test', control: true })
    expect(reply.responseBlocks).toHaveLength(1)
    expect(reply.libraryCitations).toEqual([{ id: 'L1', fileId: 'f1', state: 'locked' }])
    expect(reply.connectorConnectPrompts).toHaveLength(1)
    expect(reply.connectorPermissionPrompts).toHaveLength(1)
    expect(reply.chatPrompts?.map((p) => p.request_id)).toEqual(['qp-1', 'ap-1', 'up-1'])
    expect(toast).toHaveBeenCalledOnce()
    expect(shareToast).toHaveBeenCalledWith({ fileId: 'f1', grantId: 'g1', label: 'Weekly', personName: 'Maya' })
    expect(memory).toHaveBeenCalledOnce()
  })

  it('does not warn about chat-only files when the send asked not to save', () => {
    ctx.saveToLibrary = false
    play([{ type: 'CUSTOM', name: 'library_files', value: { chatOnlyFileIds: ['f'] } }])
    expect(toast).not.toHaveBeenCalled()
  })

  it('keeps streamed text when the run errors, and ignores the done that follows', () => {
    const reply = play(STREAM_FIXTURES.runError)
    expect(reply).toMatchObject({ content: 'Half an answer', isError: false, isLoading: false })
    expect(reply.errorNotice).toBeTruthy()
    expect(turn).toMatchObject({ terminalErrorSeen: true, streamFinished: true, turnFailed: true })
    expect(ctx.onChatMoveToTop).not.toHaveBeenCalled()
  })

  it('shows an error as the reply when nothing streamed', () => {
    const reply = play(STREAM_FIXTURES.errorOnly)
    expect(reply).toMatchObject({ isError: true, isLoading: false })
  })

  it('signs out on an auth error event', () => {
    const expired = vi.fn()
    window.addEventListener('auth:session-expired', expired)
    const reply = play(STREAM_FIXTURES.authError)
    window.removeEventListener('auth:session-expired', expired)
    expect(expired).toHaveBeenCalledOnce()
    expect(reply).toMatchObject({ content: SESSION_EXPIRED_MESSAGE, isError: true, isLoading: false })
  })

  it('leaves a turn without done open, for the hook to finish as ended', () => {
    const reply = play(STREAM_FIXTURES.endedWithoutDone)
    expect(reply).toMatchObject({ content: 'Cut off mid', isLoading: true })
    expect(turn.streamFinished).toBe(false)
    finishTurn(ctx, turn, 'ended')
    expect(messages[1]).toMatchObject({ content: 'Cut off mid', isLoading: false })
  })

  it('adopts a new chat id and keeps the first title', () => {
    chatId = 'temp-abc'
    play(STREAM_FIXTURES.metadataNewChat)
    expect(chatId).toBe('new-chat-9')
    expect(ctx.onTitleUpdate).toHaveBeenCalledTimes(1)
    expect(ctx.onTitleUpdate).toHaveBeenCalledWith('new-chat-9', 'Fresh chat')
  })
})
