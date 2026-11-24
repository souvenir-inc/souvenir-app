import { describe, expect, it } from 'vitest'
import { CONNECTIONS, TOTAL, metrics } from './live/live-fixtures'
import { Apps } from './live/apps'
import { boardReducer, type Board } from './tabs/board-state'
import { TEMPLATES, draftFor, hasTopic, measurable, starterState, templateFor, toBoardCards } from './templates'

// 08-new-board-rules.md, with the fixture store: Shopify and Meta Ads, no shipping app.
const tpl = (id: string) => TEMPLATES.find((t) => t.id === id)!
const ids = () => { let n = 0; return () => `board-${++n}` }
/** The same store with Meta Ads disconnected: the warehouse can't measure anything built on ads. */
const NO_ADS = 'needs ad_insights, which no connection in this store fills'
const shopifyOnly = () => metrics({
  apps: new Apps(CONNECTIONS.slice(0, 1)),
  total: { ...TOTAL, unavailable: { ...TOTAL.unavailable, ...Object.fromEntries(['ad_spend', 'platform_roas', 'platform_cpa', 'mer', 'net_after_ads'].map((n) => [n, NO_ADS])) } },
})

describe('templates (NB-7 – NB-13)', () => {
  it('lists six, your role first', () => {
    expect(TEMPLATES.map((t) => t.role)).toEqual(['Founder or CEO', 'Head of e-commerce', 'Growth or ads lead', 'Ops lead', 'Finance or fractional CFO', 'Agency'])
  })
  it('leaves out what the store can’t measure: not in its library, no app feeding it, or unavailable (NB-9)', () => {
    const used = templateFor(tpl('ecommerce').cards, metrics())
    expect(used.cards.map((c) => c.metricId)).toEqual(['revenue', 'orders', 'aov', 'cancellation_rate', 'refund_rate'])
    expect(used.leftOut).toEqual(['new_customers'])
    expect(templateFor(tpl('agency').cards, shopifyOnly()).cards).toEqual([])
  })
  it('measurable: an app feeds it, or it is the workspace’s own', () => {
    const m = metrics()
    expect(measurable(m.get('revenue'))).toBe(true)
    expect(measurable(m.get('net_after_ads'))).toBe(true)
    expect(measurable(m.get('shipping_cost'))).toBe(false)
    expect(measurable(m.get('nope'))).toBe(false)
  })
  it('lays the cards out in the template’s order (NB-12)', () => {
    const cards = toBoardCards(templateFor(tpl('founder').cards, metrics()).cards)
    expect(cards[0]).toEqual({ metricId: 'revenue', size: 'full', x: 0, y: 0 })
    expect(cards.slice(1).map((c) => c.metricId)).toEqual(['mer', 'aov'])
  })
})

describe('board actions for New board', () => {
  const s = starterState(metrics(), ids())
  const ads = s.tabs[1]
  it('update-board patches a board’s own fields', () => {
    const next = boardReducer(s, { type: 'update-board', id: ads, patch: { label: 'Grow', draft: true } })
    expect(next.boards[ads].label).toBe('Grow')
    expect(next.boards[ads].draft).toBe(true)
    expect(next.boards[ads].cards).toBe(s.boards[ads].cards)
  })
  it('replace swaps the whole state (first visit, NB-32)', () => {
    const start = starterState(metrics(), ids())
    expect(boardReducer(s, { type: 'replace', state: start })).toBe(start)
  })
  it('a new board lands as the last tab, open (NB-12, NB-34)', () => {
    const b: Board = { id: 'x', label: 'Founder', cards: [], initialCards: [], period: '7d', compare: 'previous', access: 'owner', shared: false }
    const next = boardReducer(s, { type: 'add-board', board: b, index: s.tabs.length, open: true })
    expect(next.tabs.at(-1)).toBe('x')
    expect(next.openId).toBe('x')
  })
})

describe('first visit (NB-31 – NB-33)', () => {
  it('Store overview always, then each board whose lead metric the store measures', () => {
    const st = starterState(metrics(), ids())
    expect(st.tabs.map((id) => st.boards[id].label)).toEqual(['Store overview', 'Ads'])
    expect(st.openId).toBe(st.tabs[0])
    expect(Object.values(st.boards).every((b) => b.access === 'owner' && !b.shared)).toBe(true)
  })
  it('a card the store can’t measure gives way to a store one, never twice on a board', () => {
    const st = starterState(metrics(), ids())
    const cards = st.boards[st.tabs[0]].cards.map((c) => c.metricId)
    expect(cards).not.toContain('new_customers')
    expect(cards).toContain('cancellation_rate')
    expect(new Set(cards).size).toBe(cards.length)
  })
  it('with only Shopify: Store overview alone, from store metrics', () => {
    const st = starterState(shopifyOnly(), ids())
    expect(st.tabs).toHaveLength(1)
    expect(st.boards[st.tabs[0]].cards.map((c) => c.metricId)).not.toContain('ad_spend')
  })
})

describe('the stand-in AI (NB-20 – NB-29)', () => {
  it('drafts paid ads on Today vs last year, and names what it left out with why', () => {
    const d = draftFor('My paid ads every morning, vs last year', metrics())
    expect(d).toMatchObject({ status: 'ready', name: 'Paid ads, every morning', period: 'today', compare: 'last-year' })
    if (d.status === 'ready') {
      expect(d.cards.map((c) => c.metricId)).toEqual(['ad_spend', 'platform_roas', 'platform_cpa', 'mer'])
      expect(d.leftOut).toEqual(['ctr'])
    }
  })
  it('drafts weekly check-ins', () => {
    expect(draftFor('Weekly store check-in', metrics())).toMatchObject({ status: 'ready', name: 'Weekly check-in', period: '7d' })
  })
  it('never drafts an empty board: says why instead (NB-29)', () => {
    const d = draftFor('ads', shopifyOnly())
    expect(d.status).toBe('empty')
    if (d.status === 'empty') expect(d.reason).toContain(`Ad spend: ${NO_ADS}`)
  })
  it('knows when a change names a new topic (NB-24)', () => {
    expect(hasTopic('make it about margin')).toBe(true)
    expect(hasTopic('fewer cards')).toBe(false)
  })
})
