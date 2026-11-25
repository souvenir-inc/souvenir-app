// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { forgetReturn, rememberReturn, safeReturnPath, takeReturn } from './connector-return'

describe('connector-return', () => {
  beforeEach(() => forgetReturn())

  it('only goes back to a path on this site', () => {
    expect(safeReturnPath('/dashboard?board=b1')).toBe('/dashboard?board=b1')
    expect(safeReturnPath('https://evil.example/x')).toBeNull()
    expect(safeReturnPath('//evil.example/x')).toBeNull()
    expect(safeReturnPath('/\\evil.example')).toBeNull()
    expect(safeReturnPath('dashboard')).toBeNull()
    expect(safeReturnPath(null)).toBeNull()
  })

  it('takes the return once, for the app that was signing in', () => {
    rememberReturn('shopify_app', '/dashboard?board=b1')
    expect(takeReturn('klaviyo')).toBeNull()
    expect(takeReturn('shopify_app')).toBe('/dashboard?board=b1')
    expect(takeReturn('shopify_app')).toBeNull()
  })

  it('forgets a sign-in that took too long', () => {
    rememberReturn('shopify_app', '/dashboard')
    expect(takeReturn('shopify_app', Date.now() + 31 * 60_000)).toBeNull()
  })
})
