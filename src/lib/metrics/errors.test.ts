import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { ApiError } from '@/lib/api/client'
import { isPermissionDenied, isRetryable, metricErrorMessage } from './errors'

const api = (status: number, raw = 'unknown metric nope', extra = {}) => new ApiError(status, 'api_error', raw, raw, extra)

describe('metricErrorMessage', () => {
  it('never shows the warehouse’s own text', () => {
    for (const status of [400, 403, 404, 409, 422, 429, 500, 502]) {
      expect(metricErrorMessage(api(status), 'save')).not.toMatch(/unknown metric|nope/)
    }
  })

  it('says a formula the warehouse refused can’t be worked out, and what to check', () => {
    expect(metricErrorMessage(api(422), 'save')).toBe('Couldn’t save the metric. The warehouse couldn’t work it out from this store’s data. Check the metrics it uses and try again.')
  })

  it('says a metric still in use can’t be deleted yet', () => {
    expect(metricErrorMessage(api(409, 'orders is still shown on [Board]'), 'delete')).toMatch(/still uses it/)
  })

  it('names access, a missing store and when to try again', () => {
    expect(metricErrorMessage(api(403), 'load')).toMatch(/Ask a workspace admin/)
    expect(metricErrorMessage(api(404), 'load')).toMatch(/no store connected/)
    expect(metricErrorMessage(api(429, '', { retryAfterSeconds: 20 }), 'save')).toBe('Too many requests. Try again in 20 seconds.')
    expect(metricErrorMessage(api(503), 'draft')).toBe('Souvenir didn’t answer. Try again, and contact support if it keeps happening.')
  })

  it('falls back to plain copy for a malformed answer or a dropped connection', () => {
    const shape = z.object({ a: z.string() }).safeParse({})
    expect(metricErrorMessage(shape.error, 'load')).toMatch(/contact support/)
    expect(metricErrorMessage(new TypeError('Failed to fetch'), 'measure')).toBe('Couldn’t work out the numbers. Check your connection and try again.')
  })
})

describe('retry and access', () => {
  it('offers Try again only when it can help', () => {
    expect(isRetryable(api(503))).toBe(true)
    expect(isRetryable(api(422))).toBe(false)
    expect(isRetryable(new TypeError('Failed to fetch'))).toBe(true)
    expect(isPermissionDenied(api(403))).toBe(true)
    expect(isPermissionDenied(api(404))).toBe(false)
  })
})
