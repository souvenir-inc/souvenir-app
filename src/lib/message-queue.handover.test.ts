// While a chat's front message is being handed back (see MessageQueueRunner), nothing is
// taken from its queue — by the background or by the chat itself — or it would overtake it.
import { afterEach, describe, expect, it } from 'vitest'
import { beginHandOver, endHandOver, getChatQueue, queueMessage, takeAllQueuedMessages, takeNextQueuedMessage } from './message-queue'

const context = { settings: { pinsEnabled: true, webSearch: true }, modelId: 1 } as never
afterEach(() => { endHandOver('c1'); takeAllQueuedMessages('c1') })

describe('hand-over', () => {
  it('gives out nothing from the queue until the hand-over ends', () => {
    queueMessage('c1', { content: 'second', attachments: [], mentionedPins: [] }, context)
    beginHandOver('c1')
    expect(takeNextQueuedMessage('c1')).toBeUndefined()
    expect(getChatQueue('c1')?.messages.map((m) => m.content)).toEqual(['second'])
    endHandOver('c1')
    expect(takeNextQueuedMessage('c1')?.content).toBe('second')
  })
})
