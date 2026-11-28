import { beforeEach, describe, expect, it, vi } from 'vitest'

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }))

vi.mock('./client', async importOriginal => {
  const actual = await importOriginal<typeof import('./client')>()
  return { ...actual, apiFetch }
})
vi.mock('@/lib/analytics/events', () => ({ trackBrowserEvent: vi.fn(), trackFeature: vi.fn() }))

import { ApiError } from './client'
import { blockingProjects, leaveOrganization, removeMember, UNRESOLVED_OWNERSHIP } from './organization'

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

// souvenir-server#640: removing (or leaving as) someone who owns workspace or shared projects is refused
// with 409 and an object `detail`. It used to be dropped and read as a generic "out of date" conflict.
describe('offboarding errors', () => {
  beforeEach(() => apiFetch.mockReset())

  it('reads the ownership refusal on remove, with how many projects block it', async () => {
    apiFetch.mockResolvedValue(reply(409, {
      detail: { code: 'unresolved_ownership', message: 'Resolve owned shared or workspace projects before leaving', projectIds: ['p1', 'p2'] },
    }))
    const error = await removeMember('org-1', 'auth0|abc').catch(e => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.code).toBe(UNRESOLVED_OWNERSHIP)
    expect(error.retryable).toBe(false)
    expect(blockingProjects(error)).toBe(2)
    expect(error.message).not.toMatch(/out of date|Resolve owned/i)
  })

  it('reads the same refusal when leaving', async () => {
    apiFetch.mockResolvedValue(reply(409, { detail: { code: 'unresolved_ownership', message: 'x', projectIds: ['p1'] } }))
    const error = await leaveOrganization('org-1').catch(e => e)
    expect(blockingProjects(error)).toBe(1)
  })

  it('keeps the string-detail path for other refusals', async () => {
    apiFetch.mockResolvedValue(reply(409, { detail: 'Must promote a replacement admin' }))
    const error = await removeMember('org-1', 'auth0|abc').catch(e => e)
    expect(error.code).toBe('remove_member_failed')
    expect(error.rawMessage).toBe('Must promote a replacement admin')
    expect(blockingProjects(error)).toBeNull()
  })

  it('is not an ownership refusal for a non-API error', () => {
    expect(blockingProjects(new Error('boom'))).toBeNull()
  })
})
