import { describe, expect, it } from 'vitest'
import { cardBody } from './card-states'
import { initialDashboardState } from './mock-data'
import type { AppId } from './sync/sync-model'
import { boardReducer, type Board } from './tabs/board-state'
import { TEMPLATES, appsNeeded, callOutTitle, draftFor, hasTopic, starterState, templateFor, toBoardCards } from './templates'

// 08-new-board-rules.md
const NOT_CONNECTED: AppId[] = ['google-analytics', 'zendesk']
const connected = (app: AppId) => !NOT_CONNECTED.includes(app)
const shopifyOnly = (app: AppId) => app === 'shopify'
const tpl = (id: string) => TEMPLATES.find((t) => t.id === id)!

describe('templates (NB-7 – NB-13)', () => {
  it('lists six, your role first', () => {
    expect(TEMPLATES.map((t) => t.role)).toEqual(['Founder or CEO', 'Head of e-commerce', 'Growth or ads lead', 'Ops lead', 'Finance or fractional CFO', 'Agency'])
  })
  it('leaves a metric the store can’t measure out quietly (NB-9)', () => {
    const used = templateFor(tpl('ecommerce').cards, connected)
    expect(used.leftOut).toEqual(['gross-margin'])
    expect(used.cards).toHaveLength(5)
  })
  it('keeps cards whose app isn’t connected, marked to wait for it (NB-10, NB-13)', () => {
    const used = templateFor(tpl('growth').cards, connected)
    expect(used.cards.filter((c) => c.needsApp).map((c) => c.metricId)).toEqual(['ga-conversion-rate', 'ga-sessions'])
    expect(appsNeeded(used)).toEqual([{ app: 'google-analytics', count: 2 }])
  })
  it('words the call-out for one, some and all (NB-10)', () => {
    expect(callOutTitle(2, 6, 1)).toBe('2 of these 6 cards need apps you haven’t connected')
    expect(callOutTitle(1, 6, 1)).toBe('1 of these 6 cards needs an app you haven’t connected')
    expect(callOutTitle(6, 6, 1)).toBe('Every card in this template needs an app you haven’t connected')
  })
  it('lays the cards out in the template’s order, without the waiting mark (NB-12)', () => {
    const cards = toBoardCards(templateFor(tpl('founder').cards, connected).cards)
    expect(cards[0]).toEqual({ metricId: 'revenue', size: 'full', x: 0, y: 0 })
    expect(cards.slice(1).map((c) => [c.x, c.y])).toEqual([[0, 1], [1, 1], [2, 1], [3, 1]])
    expect(cards.every((c) => !('needsApp' in c))).toBe(true)
  })
})

describe('a card waiting for its app (NB-13)', () => {
  it('waits before anything but a load', () => {
    expect(cardBody({ needsApp: true, couldntLoad: true })).toBe('needs-app')
    expect(cardBody({ needsApp: true, loading: true })).toBe('loading')
  })
})

describe('board actions for New board', () => {
  const s = initialDashboardState(0)
  it('update-board patches a board’s own fields', () => {
    const next = boardReducer(s, { type: 'update-board', id: 'growth', patch: { label: 'Grow', draft: true } })
    expect(next.boards.growth.label).toBe('Grow')
    expect(next.boards.growth.draft).toBe(true)
    expect(next.boards.growth.cards).toBe(s.boards.growth.cards)
  })
  it('replace swaps the whole state (first visit, NB-32)', () => {
    const start = starterState(s, connected)
    expect(boardReducer(s, { type: 'replace', state: start })).toBe(start)
  })
  it('a new board lands as the last tab, open (NB-12, NB-34)', () => {
    const b: Board = { id: 'x', label: 'Founder', cards: [], initialCards: [], period: '7d', compare: 'previous', access: 'owner' }
    const next = boardReducer(s, { type: 'add-board', board: b, index: s.tabs.length, open: true })
    expect(next.tabs.at(-1)).toBe('x')
    expect(next.openId).toBe('x')
  })
})

describe('first visit (NB-31 – NB-33)', () => {
  const full = initialDashboardState(0)
  it('with an ad app: Store overview, Growth, Ads, Contribution margin', () => {
    expect(starterState(full, connected).tabs).toEqual(['store-overview', 'growth', 'ads', 'contribution-margin'])
  })
  it('with only Shopify: Store overview and Growth, from Shopify metrics alone', () => {
    const st = starterState(full, shopifyOnly)
    expect(st.tabs).toEqual(['store-overview', 'growth'])
    expect(st.openId).toBe('store-overview')
    for (const id of st.tabs) {
      const ids = st.boards[id].cards.map((c) => c.metricId)
      expect(ids.length).toBeGreaterThan(0)
      expect(new Set(ids).size).toBe(ids.length) // no card twice on the same board
    }
  })
})

describe('the stand-in AI (NB-20 – NB-29)', () => {
  it('drafts paid ads on Today vs last year, and names what it left out', () => {
    const d = draftFor('My paid ads every morning, vs last year, and sessions', connected)
    expect(d).toMatchObject({ status: 'ready', name: 'Paid ads, every morning', period: 'today', compare: 'last-year' })
    if (d.status === 'ready') expect(d.leftOut).toEqual(['Sessions, which this store can’t measure yet'])
  })
  it('drafts margin and weekly check-ins', () => {
    expect(draftFor('Where my margin goes', connected)).toMatchObject({ name: 'Where my margin goes', period: '7d' })
    expect(draftFor('Weekly store check-in', connected)).toMatchObject({ name: 'Weekly check-in' })
  })
  it('never drafts an empty board: says why instead (NB-29)', () => {
    expect(draftFor('Email revenue and open rate', connected)).toEqual({ status: 'empty', reason: 'Email revenue and open rate need an email app, and none is connected.' })
  })
  it('leaves out cards whose app isn’t connected (NB-23)', () => {
    const d = draftFor('ads', shopifyOnly)
    expect(d.status).toBe('empty')
  })
  it('knows when a change names a new topic (NB-24)', () => {
    expect(hasTopic('make it about margin')).toBe(true)
    expect(hasTopic('fewer cards')).toBe(false)
  })
})
