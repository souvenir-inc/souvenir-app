import { describe, expect, it } from 'vitest'
import { comparedWindow, isoDate, periodWindow, rangeDays, storeMidnight, wallClock } from './period'

// The warehouse counts days in its own zone; "today" must follow its clock, not the viewer's.
describe('store clock', () => {
  // 01:30 UTC on 25 Nov 2026: already the 25th in India and London, still the 24th in New York.
  const at = new Date(Date.UTC(2026, 10, 25, 1, 30))

  it('reads the store’s date, whatever zone the viewer is in', () => {
    expect(isoDate(wallClock('America/New_York', at))).toBe('2026-11-24')
    expect(isoDate(wallClock('Asia/Kolkata', at))).toBe('2026-11-25')
    expect(isoDate(periodWindow('today', wallClock('America/New_York', at)).from)).toBe('2026-11-24')
  })

  it('finds the instant the store’s day began', () => {
    // New York is UTC-5 in November: its 24 Nov began at 05:00 UTC.
    expect(new Date(storeMidnight('America/New_York', at)).toISOString()).toBe('2026-11-24T05:00:00.000Z')
  })

  it('falls back to the viewer’s clock for a zone it doesn’t know', () => {
    expect(wallClock('Not/AZone', at).getTime()).toBe(at.getTime())
    expect(wallClock(undefined, at).getTime()).toBe(at.getTime())
  })
})

describe('same period last year around 29 Feb', () => {
  it('compares the same number of days, day for day', () => {
    const w = periodWindow('7d', new Date(2028, 2, 2)) // 25 Feb – 2 Mar 2028, 7 days
    const c = comparedWindow(w, 'last-year')!
    expect([isoDate(c.from), isoDate(c.to), rangeDays(c.from, c.to)]).toEqual(['2027-02-25', '2027-03-03', 7])
  })
  it('compares 29 Feb with 28 Feb', () => {
    const c = comparedWindow(periodWindow('today', new Date(2028, 1, 29)), 'last-year')!
    expect([isoDate(c.from), isoDate(c.to)]).toEqual(['2027-02-28', '2027-02-28'])
  })
})
