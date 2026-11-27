import { describe, expect, it } from 'vitest'
import { judge, needsAttention, statusReason } from './status'

const up = (target: number, tolerance = 0.1) => ({ target, direction: 'up' as const, tolerance })
const down = (target: number, tolerance = 0.1) => ({ target, direction: 'down' as const, tolerance })
const pct = (n: number) => `${Math.round(n)}%`

describe('judge: higher is better', () => {
  it('is on track at the target and past it', () => {
    expect(judge(100, up(100))?.status).toBe('on_track')
    expect(judge(130, up(100))?.status).toBe('on_track')
  })

  it('is at risk when short but within the tolerance, including its edge', () => {
    expect(judge(95, up(100))?.status).toBe('at_risk')
    expect(judge(90, up(100))?.status).toBe('at_risk')
  })

  it('is off track past the tolerance', () => {
    expect(judge(89.99, up(100))?.status).toBe('off_track')
  })

  it('treats float noise at the edge as on the edge', () => {
    expect(judge(0.3, up(0.1 + 0.2, 0))?.status).toBe('on_track')
    expect(judge(100 * (1 - 0.1) - 1e-12, up(100))?.status).toBe('at_risk')
  })
})

describe('judge: lower is better', () => {
  it('is on track at or under the target', () => {
    expect(judge(0.05, down(0.05))?.status).toBe('on_track')
    expect(judge(0.03, down(0.05))?.status).toBe('on_track')
  })

  it('is at risk over it within the tolerance, off track beyond', () => {
    expect(judge(0.054, down(0.05))?.status).toBe('at_risk')
    expect(judge(0.056, down(0.05))?.status).toBe('off_track')
  })
})

describe('judge: edges', () => {
  it('with no tolerance, any miss is off track', () => {
    expect(judge(99.9, up(100, 0))?.status).toBe('off_track')
  })

  it('a negative tolerance is read as none', () => {
    expect(judge(99, up(100, -0.5))?.status).toBe('off_track')
  })

  it('a zero target judges by side alone and has no share', () => {
    expect(judge(0, up(0))).toEqual({ status: 'on_track', gap: 0, gapShare: null })
    expect(judge(-5, up(0))?.status).toBe('off_track')
    expect(judge(5, down(0))?.status).toBe('off_track')
  })

  it('a negative target uses its size for the tolerance band', () => {
    // Net after ads aiming for no worse than −1,000: −1,050 is 5% short, within 10%.
    expect(judge(-1050, up(-1000))?.status).toBe('at_risk')
    expect(judge(-1200, up(-1000))?.status).toBe('off_track')
  })

  it('missing data is not judged, never read as zero', () => {
    expect(judge(null, up(100))).toBeNull()
    expect(judge(undefined, up(100))).toBeNull()
    expect(judge(Number.NaN, up(100))).toBeNull()
  })
})

describe('needsAttention', () => {
  it('lists off track only; at risk still counts as on track', () => {
    expect(needsAttention(judge(80, up(100)))).toBe(true)
    expect(needsAttention(judge(95, up(100)))).toBe(false)
    expect(needsAttention(null)).toBe(false)
  })
})

describe('statusReason', () => {
  it('says how far and which side, with the tolerance on a miss', () => {
    expect(statusReason(judge(88, up(100))!, up(100), pct)).toBe('12% below the target, past the 10% tolerance')
    expect(statusReason(judge(95, up(100))!, up(100), pct)).toBe('5% below the target, within the 10% tolerance')
    expect(statusReason(judge(120, up(100))!, up(100), pct)).toBe('20% above the target')
    expect(statusReason(judge(0.06, down(0.05, 0))!, down(0.05, 0), pct)).toBe('20% above the target')
    expect(statusReason(judge(100, up(100))!, up(100), pct)).toBe('Right on the target')
  })

  it('a zero target has no percentage to give', () => {
    expect(statusReason(judge(-5, up(0, 0))!, up(0, 0), pct)).toBe('Below the target')
  })
})
