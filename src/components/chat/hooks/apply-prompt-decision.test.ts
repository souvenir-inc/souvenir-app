// A prompt card's answer is stored on its message, so an answered card stays answered when
// its row remounts. The answer can land after the reply's temporary id was swapped for the
// backend's (message_saved): it must still reach the card.

import { describe, expect, it } from 'vitest'
import { applyPromptDecision } from './use-chat-turns'
import type { UIMessage } from '@/types/chat'

const card = (request_id: string) => ({ request_id }) as unknown as NonNullable<UIMessage['connectorConnectPrompts']>[number]
const reply = (id: string, requestId: string): UIMessage =>
  ({ id, role: 'assistant', content: '', created_at: '', chat_id: 'c1', connectorConnectPrompts: [card(requestId)] }) as UIMessage

describe('applyPromptDecision', () => {
  it('stores the answer on the card under the id the answer carries', () => {
    const [msg] = applyPromptDecision([reply('m1', 'p1')], 'm1', 'p1', 'cancel')
    expect(msg.connectorConnectPrompts?.[0]).toMatchObject({ request_id: 'p1', decision: 'cancel' })
  })

  it('still finds the card after the reply id changed while the answer was being sent', () => {
    // The card was rendered under the temporary id; message_saved has since swapped it.
    const [msg] = applyPromptDecision([reply('real-1', 'p1')], 'temp-1', 'p1', 'connected')
    expect(msg.connectorConnectPrompts?.[0]).toMatchObject({ request_id: 'p1', decision: 'connected' })
  })

  it('leaves other messages and other cards alone', () => {
    const messages = [reply('m1', 'p1'), reply('m2', 'p2')]
    const out = applyPromptDecision(messages, 'm1', 'p1', 'cancel')
    expect(out[1]).toBe(messages[1])
    expect(out[1].connectorConnectPrompts?.[0]).not.toHaveProperty('decision')
  })
})

describe('applyPromptDecision with a repeated request id', () => {
  it('answers only the owning card', () => {
    const [m1, m2] = applyPromptDecision([reply('m1', 'p1'), reply('m2', 'p1')], 'm1', 'p1', 'cancel')
    expect(m1.connectorConnectPrompts?.[0]).toMatchObject({ decision: 'cancel' })
    expect(m2.connectorConnectPrompts?.[0]).not.toHaveProperty('decision')
  })

describe('applyPromptDecision after an id swap with a repeated request id', () => {
  it('finds the owning card by its stable key', () => {
    const first = reply('m1', 'p1')
    const second = { ...reply('real-2', 'p1'), reactKey: 'temp-2' } as UIMessage // swapped from temp-2
    const [m1, m2] = applyPromptDecision([first, second], 'temp-2', 'p1', 'connected')
    expect(m1.connectorConnectPrompts?.[0]).not.toHaveProperty('decision')
    expect(m2.connectorConnectPrompts?.[0]).toMatchObject({ decision: 'connected' })
  })
})
})
