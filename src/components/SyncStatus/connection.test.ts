import { describe, expect, it, vi } from 'vitest'
import { getShownDataFrom, setShownDataFrom, subscribeShownDataFrom } from './connection'

describe('the data time the offline bar shows', () => {
  it('keeps the value the board sets, tells listeners, and clears when the board goes', () => {
    const listener = vi.fn()
    const stop = subscribeShownDataFrom(listener)
    setShownDataFrom('2026-11-18T10:24:00Z')
    expect(getShownDataFrom()).toBe('2026-11-18T10:24:00Z')
    expect(listener).toHaveBeenCalledTimes(1)
    // The same value again: nothing to tell.
    setShownDataFrom('2026-11-18T10:24:00Z')
    expect(listener).toHaveBeenCalledTimes(1)
    setShownDataFrom(null)
    expect(getShownDataFrom()).toBeNull()
    expect(listener).toHaveBeenCalledTimes(2)
    stop()
    setShownDataFrom('2026-11-18T11:00:00Z')
    expect(listener).toHaveBeenCalledTimes(2)
    setShownDataFrom(null)
  })
})
