import { describe, expect, it } from 'vitest'
import { ROLE_METRICS, catalogOf, groupOf, landingSize, matchOf, nameList } from './catalog'
import { fitAtEnd, toItems } from './grid-layout'
import { apps, metrics } from './__fixtures__/live'
import { Metrics } from './live/metrics'
import { addCardsAtEnd, cardIdsFor } from './tabs/board-state'
import type { BoardCard } from './types'

const m = metrics()
const get = (id: string) => m.get(id)!

describe('landing size (AC-16)', () => {
  it('sums and counts land 6 × 1, rates and multiples 3 × 1', () => {
    expect(landingSize(get('revenue'))).toBe('md')
    expect(landingSize(get('orders'))).toBe('md')
    expect(landingSize(get('net_after_ads'))).toBe('md')
    expect(landingSize(get('cancellation_rate'))).toBe('sm')
    expect(landingSize(get('mer'))).toBe('sm')
  })
})

describe('search (AC-13, AC-14)', () => {
  it('matches the name with its span, short forms, the app and the definition', () => {
    expect(matchOf(get('cancellation_rate'), 'rate', apps())).toEqual({ at: 13, length: 4 })
    expect(matchOf(get('aov'), 'aov', apps())).toBeNull()          // a short form: found, nothing to bold
    expect(matchOf(get('platform_roas'), 'roas', apps())).toEqual({ at: 9, length: 4 })
    expect(matchOf(get('ad_spend'), 'meta', apps())).toBeNull()    // the app
    expect(matchOf(get('revenue'), 'paid', apps())).toBeNull()     // the definition: "What customers paid"
    expect(matchOf(get('revenue'), 'cogs', apps())).toBe(false)
  })
  it('lists the catalog A–Z', () => {
    expect(catalogOf(m.all).slice(0, 3).map((x) => x.label)).toEqual(['Ad spend', 'Average order value', 'Cancellation rate'])
  })
  it('groups: the app, the apps it blends, custom metrics, metrics no app feeds', () => {
    expect(groupOf(get('ad_spend'), apps())).toBe('Meta Ads')
    expect(groupOf(get('mer'), apps())).toBe('Shopify + Meta Ads')
    expect(groupOf(get('net_after_ads'), apps())).toBe('Custom metrics')
    expect(groupOf(get('shipping_cost'), apps())).toBe('Not connected')
  })
  it('roles name library metrics', () => {
    expect(ROLE_METRICS.founder.slice(0, 4)).toEqual(['revenue', 'net_sales', 'orders', 'aov'])
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
    expect(Metrics.base('revenue#2')).toBe('revenue')
    expect(metrics().get('revenue#2')?.label).toBe('Revenue')
  })
})
