import { describe, expect, it } from 'vitest'
import { CATALOG, ROLE_METRICS, groupOf, landingSize, matchOf, nameList } from './catalog'
import { fitAtEnd, toItems } from './grid-layout'
import { METRICS, baseMetricId } from './mock-data'
import { addCardsAtEnd, cardIdsFor } from './tabs/board-state'
import type { BoardCard } from './types'

describe('landing size (AC-16)', () => {
  it('sums and counts land 6 × 1, rates and multiples 3 × 1', () => {
    expect(landingSize(METRICS['revenue-per-customer'])).toBe('md') // as drawn in A-5
    expect(landingSize(METRICS.orders)).toBe('md')
    expect(landingSize(METRICS['cancellation-rate'])).toBe('sm')
    expect(landingSize(METRICS.mer)).toBe('sm')
    expect(landingSize(METRICS['ga-sessions'])).toBe('md')
  })
})

describe('search (AC-13, AC-14)', () => {
  it('matches the name with its span, short forms, the app and the definition', () => {
    expect(matchOf(METRICS['cancellation-rate'], 'rate')).toEqual({ at: 13, length: 4 })
    expect(matchOf(METRICS.aov, 'aov')).toBeNull()             // a short form: found, nothing to bold
    expect(matchOf(METRICS.ctr, 'meta')).toBeNull()            // the app
    expect(matchOf(METRICS['gross-margin'], 'margin')).toEqual({ at: 6, length: 6 })
    expect(matchOf(METRICS.revenue, 'cogs')).toBe(false)
  })
  it('nothing matches "cogs"… except Cost of goods by its short form', () => {
    expect(CATALOG.filter((m) => matchOf(m, 'cogs') !== false).map((m) => m.label)).toEqual(['Cost of goods'])
  })
  it('groups: the app, the blended pair, custom metrics', () => {
    expect(groupOf(METRICS.mer)).toBe('Shopify + Meta Ads')
    expect(groupOf(METRICS['contribution-margin'])).toBe('Custom metrics')
    expect(groupOf(METRICS.ctr)).toBe('Meta Ads')
  })
  it('Founder or CEO lists the drawn metrics, in order (A-2)', () => {
    expect(ROLE_METRICS.founder.map((id) => METRICS[id].label)).toEqual([
      'Revenue', 'Net sales', 'Orders', 'Average order value', 'New customers', 'Revenue per customer', 'MER', 'Ad spend', 'Gross margin', 'Sessions', 'Conversion rate',
    ])
  })
  it('names in a sentence', () => {
    expect(nameList(['Revenue'])).toBe('Revenue')
    expect(nameList(['Revenue', 'Orders'])).toBe('Revenue and Orders')
    expect(nameList(['Revenue', 'Orders', 'MER'])).toBe('Revenue, Orders and MER')
  })
})

describe('landing at the end (AC-16, AC-6)', () => {
  const board: BoardCard[] = [
    { metricId: 'aov', size: 'sm', x: 0, y: 0 }, { metricId: 'orders', size: 'lg', x: 1, y: 0 }, { metricId: 'revenue', size: 'sm', x: 3, y: 0 },
    { metricId: 'roas', size: 'sm', x: 0, y: 1 }, { metricId: 'ctr', size: 'sm', x: 3, y: 1 },
  ]
  it('fits after the last card in reading order, never in an earlier gap', () => {
    expect(fitAtEnd(toItems(board), 1, 1)).toEqual({ x: 0, y: 2 })
    expect(fitAtEnd(toItems(board.slice(0, 4)), 1, 1)).toEqual({ x: 3, y: 1 })
  })
  it('several cards land in the order picked, each at its size', () => {
    const next = addCardsAtEnd(board, [{ metricId: 'cancellation-rate', size: 'sm' }, { metricId: 'revenue-per-customer', size: 'md' }, { metricId: 'mer', size: 'sm' }])
    const added = next.slice(-3)
    expect(added.map((c) => `${c.metricId}@${c.x},${c.y}`)).toEqual(['cancellation-rate@0,2', 'revenue-per-customer@1,2', 'mer@3,2'])
  })
  it('a metric already on the board gets a second card', () => {
    expect(cardIdsFor(['revenue', 'orders'], ['revenue', 'mer', 'revenue'])).toEqual(['revenue#2', 'mer', 'revenue#3'])
    expect(baseMetricId('revenue#2')).toBe('revenue')
    expect(METRICS['revenue#2'].label).toBe('Revenue')
  })
})
