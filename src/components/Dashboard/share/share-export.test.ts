import { describe, expect, it } from 'vitest'
import { metrics, TODAY } from '../__fixtures__/live'
import { fileBase, numbersCsv, stamp } from './export'
import { People, boardLink, datesLabel, linkCaption, roleFor, type Share } from './share-model'

// 09-share-export-rules.md, with a five-person workspace.
const people = new People([
  { id: 'u-owner', name: 'Avery Stone', email: 'avery@example.com' },
  { id: 'u-gr1', name: 'Grace Kim', email: 'grace@example.com' },
  { id: 'u-gr2', name: 'Greg Alvarez', email: 'greg@example.com' },
  { id: 'u-sam', name: 'Sam Lee', email: 'sam@example.com' },
  { id: 'u-noname', name: '', email: 'ops@example.com' },
], 'u-owner', 'Example Co')
const mine: Share = { ownerId: 'u-owner', grants: [], general: 'none' }

describe('the workspace’s people', () => {
  it('names the viewer as you, and someone who left the workspace plainly', () => {
    expect(people.displayName('u-owner')).toBe('Avery Stone (you)')
    expect(people.displayName('u-sam')).toBe('Sam Lee')
    expect(people.name('u-gone')).toBe('A former member')
  })
  it('gives initials and falls back to the email for a member with no name', () => {
    expect(people.get('u-gr1')?.initials).toBe('GK')
    expect(people.get('u-noname')).toMatchObject({ name: 'ops@example.com', initials: 'O' })
  })
})

describe('adding people (SH-10, SH-13)', () => {
  it('finds people by the start of any word of the name', () => {
    expect(people.matches('gr', mine, []).map((m) => m.person.name)).toEqual(['Grace Kim', 'Greg Alvarez'])
    expect(people.matches('kim', mine, []).map((m) => m.person.name)).toEqual(['Grace Kim'])
  })
  it('matches by email too, and leaves out who is picked', () => {
    expect(people.matches('sam@', mine, []).map((m) => m.person.id)).toEqual(['u-sam'])
    expect(people.matches('gr', mine, ['u-gr1']).map((m) => m.person.id)).toEqual(['u-gr2'])
  })
  it('shows the role of someone who already has access', () => {
    const share: Share = { ...mine, grants: [{ userId: 'u-gr1', role: 'edit' }] }
    expect(people.matches('grace', share, [])[0].has).toBe('edit')
    expect(people.matches('avery', share, [])[0].has).toBe('owner')
  })
  it('knows an email from outside the workspace', () => {
    expect(people.outsideEmail('new@elsewhere.com')).toBe('new@elsewhere.com')
    expect(people.outsideEmail('Sam@Example.com')).toBeNull()
    expect(people.outsideEmail('sam')).toBeNull()
  })
})

describe('access (SH-1, SH-16, SH-19)', () => {
  it('gives the higher of their own and the workspace’s role', () => {
    const share: Share = { ownerId: 'u-owner', grants: [{ userId: 'u-sam', role: 'edit' }], general: 'view' }
    expect(roleFor(share, 'u-owner')).toBe('owner')
    expect(roleFor(share, 'u-sam')).toBe('edit')
    expect(roleFor(share, 'u-gr1')).toBe('view')
    expect(roleFor({ ...share, general: 'none' }, 'u-gr1')).toBeNull()
  })
  it('counts who loses access going back to Only people added', () => {
    expect(people.loseCount({ ...mine, general: 'view' })).toBe(4)
    expect(people.loseCount({ ownerId: 'u-owner', grants: [{ userId: 'u-sam', role: 'view' }], general: 'view' })).toBe(3)
  })
  it('lists people by name', () => {
    const grants = [{ userId: 'u-sam', role: 'view' as const }, { userId: 'u-gr2', role: 'view' as const }, { userId: 'u-gr1', role: 'edit' as const }]
    expect(people.sortGrants(grants).map((g) => g.userId)).toEqual(['u-gr1', 'u-gr2', 'u-sam'])
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
  const m = metrics()
  it('names files after the board or card and the days on screen', () => {
    expect(fileBase('Store overview', '7d', TODAY)).toBe('store-overview-2025-11-08-to-2025-11-14')
    expect(fileBase('Email & SMS', '30d', TODAY)).toBe('email-and-sms-2025-10-16-to-2025-11-14')
    expect(fileBase('Daily', 'yesterday', TODAY)).toBe('daily-2025-11-13-to-2025-11-13')
  })
  it('stamps the image', () => {
    expect(stamp('Store overview', '7d', 'previous', 'A member', TODAY)).toBe('Store overview · Last 7 days • Previous period · A member · 14 Nov 2025')
  })
  it('writes one sheet: title, who, blank, header, a row per measured day', () => {
    const csv = numbersCsv({ title: 'Revenue', metrics: [m.get('revenue')!], period: '7d', compare: 'previous', by: 'A member', on: TODAY })
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    const lines = csv.slice(1).trim().split('\r\n')
    expect(lines[0]).toBe('Revenue · Last 7 days · vs previous 7 days')
    expect(lines[1]).toBe('Exported by A member on 14 November 2025')
    expect(lines[2]).toBe('')
    expect(lines[3]).toBe('Date,Revenue,Previous 7 days date,"Revenue, previous 7 days"')
    expect(lines).toHaveLength(4 + 7)
    expect(lines[4]).toBe('2025-11-08,6100,2025-11-01,')
    expect(lines[10]).toBe('2025-11-14,7000,2025-11-07,6200')
  })
  it('gives Today one row, compared with the day before', () => {
    const m = metrics()
    const csv = numbersCsv({ title: 'Revenue', metrics: [m.get('revenue')!], period: 'today', compare: 'previous', by: 'A member', on: TODAY })
    const lines = csv.slice(1).trim().split('\r\n')
    expect(lines[0]).toBe('Revenue · Today · vs the day before')
    expect(lines[3]).toBe('Date,Revenue,Day before date,"Revenue, day before"')
    expect(lines).toHaveLength(5)
    expect(lines[4]).toMatch(/^2025-11-14,7000,2025-11-13,\d/)
  })
  it('marks multiples with (x) in the header', () => {
    const m = metrics()
    const csv = numbersCsv({ title: 'Ads', metrics: [m.get('mer')!], period: '7d', compare: 'none', by: 'A member', on: TODAY })
    expect(csv.slice(1).split('\r\n')[3]).toBe('Date,MER (x)')
  })
  it('keeps a board name in any script, and never leaves the name empty', () => {
    expect(fileBase('Продажи', '7d', TODAY)).toBe('продажи-2025-11-08-to-2025-11-14')
    expect(fileBase('🚀', '7d', TODAY)).toBe('board-2025-11-08-to-2025-11-14')
  })
  it('quotes out a board name that would run as a spreadsheet formula', () => {
    const m = metrics()
    const csv = numbersCsv({ title: '=HYPERLINK("http://x")', metrics: [m.get('revenue')!], period: '7d', compare: 'previous', by: '@someone', on: TODAY })
    const lines = csv.slice(1).split('\r\n')
    expect(lines[0].replace(/^"/, '')).toMatch(/^'=HYPERLINK/)
    expect(lines[1]).not.toMatch(/^[=+\-@]/)
  })
  it('puts every card side by side, rates with (%), no comparison columns without a comparison', () => {
    const none = metrics({ totalBefore: undefined, dailyBefore: undefined, chartBefore: null, compare: 'none' })
    const csv = numbersCsv({ title: 'Store overview', metrics: [none.get('orders')!, none.get('refund_rate')!], period: '7d', compare: 'none', by: 'A member', on: TODAY })
    expect(csv.slice(1).split('\r\n')[3]).toBe('Date,Orders,Refund rate (%)')
  })
})
