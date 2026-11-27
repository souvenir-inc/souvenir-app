import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/client'
import { canRetry, targetErrorMessage } from './errors'

const failed = (status: number, raw = 'backend detail text') => new ApiError(status, 'x', 'Request failed', raw)

describe('targetErrorMessage', () => {
  it.each([
    [0, 'You’re offline or the connection dropped.'],
    [403, 'You don’t have access to change targets in this workspace.'],
    [404, 'may have been removed. Refresh'],
    [409, 'Targets were changed somewhere else.'],
    [422, 'Check the target and tolerance'],
    [429, 'Too many requests.'],
    [500, 'Try again, and contact support'],
  ])('status %i says what happened and what to do', (status, text) => {
    const message = targetErrorMessage(failed(status), 'save', 'Revenue')
    expect(message.startsWith('Couldn’t save the target for Revenue.')).toBe(true)
    expect(message).toContain(text)
    expect(message).not.toContain('backend detail text')
  })

  it('falls back to generic copy for something that is not an API error', () => {
    expect(targetErrorMessage(new Error('boom'), 'remove', 'Orders')).toBe('Couldn’t remove the target for Orders. Try again, and contact support if it keeps happening.')
  })
})

describe('canRetry', () => {
  it('follows the client’s retryable flag', () => {
    expect(canRetry(failed(503))).toBe(true)
    expect(canRetry(failed(403))).toBe(false)
  })
})
