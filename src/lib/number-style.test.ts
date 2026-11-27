// @vitest-environment jsdom
//
// The data preferences in browser storage (30-state.md SD-ST-13, -15, -17; 11-privacy-browser-data.md):
// values checked on every read, a bad one dropped, blocked storage never breaks the page, and
// sign-out forgets them.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { DASHBOARD_DEFAULT_PERIOD_KEY, NUMBER_STYLE_KEY, clearDataPreferences } from '@/lib/storage-keys'
import { numberStylePreference, parseNumberStyle } from '@/lib/number-style'
import { defaultPeriodPreference, newBoardPeriod, parseDefaultPeriod } from '@/components/Dashboard/default-period'

afterEach(() => {
  vi.restoreAllMocks()
  numberStylePreference.reset()
  defaultPeriodPreference.reset()
  localStorage.clear()
})

describe('number style', () => {
  it('reads rounded with nothing stored, and what was picked after', () => {
    expect(numberStylePreference.get()).toBe('rounded')
    numberStylePreference.set('exact')
    expect(localStorage.getItem(NUMBER_STYLE_KEY)).toBe('exact')
    expect(numberStylePreference.get()).toBe('exact')
  })
  it('accepts only the two styles', () => {
    expect(parseNumberStyle('exact')).toBe('exact')
    expect(parseNumberStyle('EXACT')).toBeNull()
    expect(parseNumberStyle('{"style":"exact"}')).toBeNull()
  })
  it('drops a corrupt stored value and uses the default', () => {
    localStorage.setItem(NUMBER_STYLE_KEY, 'scientific')
    expect(numberStylePreference.get()).toBe('rounded')
    expect(localStorage.getItem(NUMBER_STYLE_KEY)).toBeNull()
  })
  it('blocked storage: reads the default, and a pick still applies in this tab', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError') })
    expect(numberStylePreference.get()).toBe('rounded')
    numberStylePreference.set('exact')
    expect(numberStylePreference.get()).toBe('exact')
  })
  it('tells its readers when it changes, here or in another tab', () => {
    const seen = vi.fn()
    const stop = numberStylePreference.subscribe(seen)
    numberStylePreference.set('exact')
    window.dispatchEvent(new StorageEvent('storage', { key: NUMBER_STYLE_KEY, newValue: 'rounded' }))
    window.dispatchEvent(new StorageEvent('storage', { key: 'something-else' }))
    expect(seen).toHaveBeenCalledTimes(2)
    stop()
  })
})

describe('default period for new boards', () => {
  it('is the last 7 days until one is picked', () => {
    expect(newBoardPeriod()).toBe('7d')
    defaultPeriodPreference.set('30d')
    expect(newBoardPeriod()).toBe('30d')
  })
  it('accepts presets only: not a custom range or junk', () => {
    expect(parseDefaultPeriod('today')).toBe('today')
    expect(parseDefaultPeriod('custom:2025-10-01:2025-10-31')).toBeNull()
    localStorage.setItem(DASHBOARD_DEFAULT_PERIOD_KEY, '<img src=x>')
    expect(newBoardPeriod()).toBe('7d')
  })
})

describe('sign-out', () => {
  it('forgets both preferences, in storage and in memory, and tells readers', () => {
    numberStylePreference.set('exact')
    defaultPeriodPreference.set('90d')
    const seen = vi.fn()
    const stop = numberStylePreference.subscribe(seen)
    clearDataPreferences()
    expect(localStorage.getItem(NUMBER_STYLE_KEY)).toBeNull()
    expect(localStorage.getItem(DASHBOARD_DEFAULT_PERIOD_KEY)).toBeNull()
    expect(numberStylePreference.get()).toBe('rounded')
    expect(newBoardPeriod()).toBe('7d')
    expect(seen).toHaveBeenCalled()
    stop()
  })
  it('works with storage blocked', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('SecurityError') })
    expect(() => clearDataPreferences()).not.toThrow()
  })
})
