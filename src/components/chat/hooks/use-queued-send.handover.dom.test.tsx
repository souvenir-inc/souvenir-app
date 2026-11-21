// @vitest-environment jsdom
//
// An open chat sends its next queued message once the reply before it is done. If that moment
// lands while the front message is being handed back from a background send, nothing comes out
// of the queue yet; once the hand-over ends, the chat must still send it (nothing else will:
// the background runner leaves chats on screen alone).

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useQueuedSend } from './use-composer-queue'
import { beginHandOver, endHandOver, queueMessage, takeAllQueuedMessages } from '@/lib/message-queue'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const context = { settings: { pinsEnabled: true, webSearch: true }, modelId: 1 } as never
const sendTurn = vi.fn(async () => undefined)
let root: Root

function Harness() {
  useQueuedSend({
    queueReady: true, queueKey: 'c1', pageHidden: true,
    isSendingRef: { current: false }, askingSaveRef: { current: 0 },
    setQueuedRowExit: () => {}, sendTurn,
  })
  return null
}

beforeEach(() => { sendTurn.mockClear(); root = createRoot(document.createElement('div')) })
afterEach(() => { act(() => root.unmount()); endHandOver('c1'); takeAllQueuedMessages('c1') })

describe('useQueuedSend during a hand-over', () => {
  it('sends the queued message once the hand-over ends', async () => {
    queueMessage('c1', { content: 'next', attachments: [], mentionedPins: [] }, context)
    beginHandOver('c1')
    await act(async () => { root.render(<Harness />); await Promise.resolve() })
    expect(sendTurn).not.toHaveBeenCalled() // held for the message coming back
    await act(async () => { endHandOver('c1') })
    expect(sendTurn).toHaveBeenCalledOnce()
    expect(sendTurn.mock.calls[0][0]).toMatchObject({ content: 'next', fromQueue: true })
  })
})
