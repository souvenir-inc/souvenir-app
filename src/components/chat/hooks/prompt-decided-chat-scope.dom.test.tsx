// @vitest-environment jsdom
//
// A connector card keeps the callback it was rendered with. If its answer lands after the
// user switched chats, it must not be written into the chat now on screen.

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMessageActions, type TurnKit } from './use-chat-turns'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type Decide = ReturnType<typeof useMessageActions>['handlePromptDecided']
let container: HTMLDivElement
let root: Root
let latest: Decide
const setMessages = vi.fn()

function Harness({ chatId }: { chatId: string | undefined }) {
  const kit = { chatId, setMessages } as unknown as TurnKit
  const decide = useMessageActions(kit, {
    isStreaming: false, isSendingRef: { current: false }, personaConfigLoading: false, messages: [], enableReasoning: false,
  }).handlePromptDecided
  React.useEffect(() => { latest = decide }, [decide])
  return null
}

beforeEach(() => {
  setMessages.mockReset()
  container = document.createElement('div')
  root = createRoot(container)
})
afterEach(() => act(() => root.unmount()))

describe('handlePromptDecided', () => {
  it('drops an answer from a card rendered in another chat', () => {
    act(() => root.render(<Harness chatId="chat-A" />))
    const fromA = latest
    act(() => root.render(<Harness chatId="chat-B" />)) // the user switched chats
    act(() => fromA('m1', 'p1', 'connected')) // A's card answers late
    expect(setMessages).not.toHaveBeenCalled()
  })

  it('records an answer in the chat that asked', () => {
    act(() => root.render(<Harness chatId="chat-A" />))
    act(() => latest('m1', 'p1', 'connected'))
    expect(setMessages).toHaveBeenCalledTimes(1)
  })

  it('records an answer from a new chat that got its id mid-turn', () => {
    act(() => root.render(<Harness chatId={undefined} />))
    const fromNew = latest
    act(() => root.render(<Harness chatId="chat-A" />))
    act(() => fromNew('m1', 'p1', 'connected'))
    expect(setMessages).toHaveBeenCalledTimes(1)
  })
})
