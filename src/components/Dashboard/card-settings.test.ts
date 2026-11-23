import { describe, expect, it } from 'vitest'
import { barsBySize } from './MetricCard'
import { cardIdsFor } from './tabs/board-state'

// 10-cards-reference-rules.md
describe('card charts and settings (CS-5, CS-6)', () => {
  it('draws weekly bars on tall wide cards and the line on the rest', () => {
    expect(barsBySize('lg')).toBe(true)
    expect(barsBySize('full-lg')).toBe(true)
    expect(barsBySize('md')).toBe(false)
    expect(barsBySize('full')).toBe(false)
    expect(barsBySize('sm')).toBe(false)
  })
  it('a swapped-in metric already on the board gets its own card id', () => {
    expect(cardIdsFor(['revenue', 'orders'], ['revenue'])).toEqual(['revenue#2'])
    expect(cardIdsFor(['orders'], ['revenue'])).toEqual(['revenue'])
  })
})
