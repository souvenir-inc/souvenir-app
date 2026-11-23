import { describe, expect, it } from 'vitest'
import { fileBase, numbersCsv, periodRange, stamp } from './export'
import { ME, boardLink, cantSeeOn, datesLabel, linkCaption, loseCount, matches, outsideEmail, roleFor, sortGrants, type Share } from './share-model'

// 09-share-export-rules.md
const mine: Share = { owner: ME, grants: [], general: { to: 'none' } }

describe('adding people (SH-10, SH-13)', () => {
  it('lists teams first, then people, by any word of the name', () => {
    expect(matches('gr', mine, []).map((m) => m.member.name)).toEqual(['Growth team', 'Grace Kim', 'Greg Alvarez'])
  })
  it('matches by email too, and leaves out who is picked', () => {
    expect(matches('priya@', mine, []).map((m) => m.member.id)).toEqual(['priya'])
    expect(matches('gr', mine, ['grace']).map((m) => m.member.id)).toEqual(['growth-team', 'greg'])
  })
  it('shows the role of someone who already has access', () => {
    const sh: Share = { ...mine, grants: [{ id: 'greg', role: 'edit' }] }
    expect(matches('greg', sh, [])[0].has).toBe('edit')
    expect(matches('dev', sh, [])[0].has).toBe('owner')
  })
  it('knows an email from outside the workspace', () => {
    expect(outsideEmail('anna@northwind.co')).toBe('anna@northwind.co')
    expect(outsideEmail('sam@lumenco.com')).toBeNull()
    expect(outsideEmail('Jordan')).toBeNull()
  })
})

describe('access (SH-1, SH-12, SH-16, SH-19)', () => {
  it('names who can’t see a metric on the board, teams opened up', () => {
    expect(cantSeeOn(['priya'], ['contribution-margin', 'revenue']).map((x) => x.person.name)).toEqual(['Priya Nair'])
    expect(cantSeeOn(['finance-team'], ['contribution-margin']).map((x) => x.person.id)).toEqual(['priya'])
    expect(cantSeeOn(['priya'], ['revenue'])).toEqual([])
  })
  it('gives the highest of their own, their team’s and the workspace’s role', () => {
    const sh: Share = { owner: ME, grants: [{ id: 'growth-team', role: 'view' }, { id: 'sam', role: 'edit' }], general: { to: 'none' } }
    expect(roleFor(sh, 'sam')).toBe('edit')
    expect(roleFor(sh, 'grace')).toBe('view')
    expect(roleFor(sh, 'maya')).toBeNull()
    expect(roleFor({ ...sh, general: { to: 'workspace', role: 'view' } }, 'maya')).toBe('view')
    expect(roleFor(sh, ME)).toBe('owner')
  })
  it('counts who loses access going back to Only people added', () => {
    expect(loseCount({ owner: ME, grants: [{ id: 'growth-team', role: 'view' }, { id: 'priya', role: 'view' }], general: { to: 'workspace', role: 'view' } })).toBe(8)
  })
  it('lists teams first, then people by name', () => {
    expect(sortGrants([{ id: 'sam', role: 'view' }, { id: 'growth-team', role: 'view' }, { id: 'priya', role: 'view' }]).map((g) => g.id)).toEqual(['growth-team', 'priya', 'sam'])
  })
})

describe('the link (SH-20, SH-21)', () => {
  it('opens on the dates you’re looking at', () => {
    expect(boardLink('https://x', 'store-overview', '30d', 'previous')).toBe('https://x/dashboard?board=store-overview&period=30d')
    expect(boardLink('https://x', 'growth', '7d', 'last-year')).toBe('https://x/dashboard?board=growth&period=7d&compare=last-year')
  })
  it('says what it opens on', () => {
    expect(linkCaption('30d', 'previous')).toBe('Opens on Last 30 days • Previous period, for people who can see this board.')
    expect(datesLabel('7d', 'none')).toBe('Last 7 days')
  })
})

describe('downloads (SH-33 – SH-37)', () => {
  it('names files after the board or card and the days on screen', () => {
    expect(fileBase('Store overview', '7d')).toBe('store-overview-2025-11-08-to-2025-11-14')
    expect(fileBase('Email & SMS', '30d')).toBe('email-and-sms-2025-10-16-to-2025-11-14')
    expect(periodRange('yesterday').to.getDate()).toBe(13)
  })
  it('stamps the image', () => {
    expect(stamp('Store overview', '7d', 'previous', 'Dev Shah')).toBe('Store overview · Last 7 days • Previous period · Dev Shah · 14 Nov 2025')
  })
  it('writes one sheet: title, who, blank, header, a row per day', () => {
    const csv = numbersCsv({ title: 'Revenue', metricIds: ['revenue'], period: '7d', compare: 'previous', by: 'Dev Shah' })
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    const lines = csv.slice(1).trim().split('\r\n')
    expect(lines[0]).toBe('Revenue · Last 7 days · vs previous 7 days')
    expect(lines[1]).toBe('Exported by Dev Shah on 14 November 2025')
    expect(lines[2]).toBe('')
    expect(lines[3]).toBe('Date,Revenue,Previous 7 days date,"Revenue, previous 7 days"')
    expect(lines).toHaveLength(4 + 7)
    expect(lines[4].startsWith('2025-11-08,')).toBe(true)
    // Exact: the seven days add up to the card's $48.2k.
    const sum = lines.slice(4).reduce((s, l) => s + Number(l.split(',')[1]), 0)
    expect(Math.round(sum / 100) * 100).toBe(48200)
    expect(lines[4]).not.toMatch(/k|\$/)
  })
  it('puts every card side by side, rates with (%), no comparison columns without a comparison', () => {
    const csv = numbersCsv({ title: 'Store overview', metricIds: ['orders', 'refund-rate'], period: '7d', compare: 'none', by: 'Dev Shah' })
    const header = csv.slice(1).split('\r\n')[3]
    expect(header).toBe('Date,Orders,Refund rate (%)')
  })
})
