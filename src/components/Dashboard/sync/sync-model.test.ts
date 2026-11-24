import { describe, expect, it } from 'vitest'
import { META, SHOP, connectionState } from '../live/live-fixtures'
import { AppSync, appNames, banners, buttonState, footerText, hoverText, sortApps } from './sync-model'

// 04-sync-rules.md, read off the warehouse's board status.
const NOW = new Date('2025-11-14T12:00:00Z').getTime()
const HOUR = 3_600_000

const shop = (over = {}) => new AppSync(connectionState(over))
const meta = (over = {}) => new AppSync(connectionState({ connectionId: META, connectorSlug: 'metaads', name: 'Meta Ads', ...over }))
const iso = (ms: number) => new Date(ms).toISOString()

describe('app state, as the warehouse says it', () => {
  it('maps every server state', () => {
    expect(shop({ state: 'up_to_date' }).state).toBe('fresh')
    expect(shop({ state: 'behind' }).state).toBe('behind')
    expect(shop({ state: 'failed' }).state).toBe('failed')
    expect(shop({ state: 'reconnect' }).state).toBe('failed')
    expect(shop({ state: 'reconnect' }).needsReconnect).toBe(true)
    expect(shop({ state: 'syncing' }).state).toBe('syncing')
    expect(shop({ state: 'slow' })).toMatchObject({ state: 'syncing', slow: true })
    expect(shop({ state: 'first_sync' }).state).toBe('first')
  })
  it('reads its times as milliseconds', () => {
    expect(shop({ lastSyncedAt: iso(NOW) }).syncedAt).toBe(NOW)
    expect(shop({ lastSyncedAt: null }).syncedAt).toBeNull()
  })
})

describe('sync button (SY-2)', () => {
  it('shows the worst state: red › amber › spinner › green', () => {
    const apps = { [SHOP]: shop({ state: 'behind' }), [META]: meta({ state: 'failed' }) }
    expect(buttonState([SHOP, META], apps, true)).toBe('failed')
    expect(buttonState([SHOP], apps, true)).toBe('behind')
    expect(buttonState([SHOP], { [SHOP]: shop({ state: 'syncing' }) }, true)).toBe('syncing')
    expect(buttonState([SHOP], { [SHOP]: shop() }, true)).toBe('fresh')
  })
  it('is grey offline, has no dot with no apps, and ignores first syncs', () => {
    expect(buttonState([SHOP], { [SHOP]: shop() }, false)).toBe('offline')
    expect(buttonState([], {}, true)).toBe('none')
    expect(buttonState([SHOP], {}, true)).toBe('none')
    expect(buttonState([SHOP, META], { [SHOP]: shop(), [META]: meta({ state: 'first_sync' }) }, true)).toBe('fresh')
  })
})

describe('hover (SY-3)', () => {
  it('gives the oldest app, so the board never looks fresher than it is', () => {
    const apps = { [SHOP]: shop({ lastSyncedAt: iso(NOW - 2 * 60_000) }), [META]: meta({ lastSyncedAt: iso(NOW - 9 * 60_000) }) }
    expect(hoverText([SHOP, META], apps, NOW, true, null)).toBe('Up to date • Synced 9 min ago')
  })
  it('a failed app with nothing synced says so', () => {
    expect(hoverText([SHOP], { [SHOP]: shop({ state: 'failed', lastSyncedAt: null }) }, NOW, true, null)).toBe('Sync failed • Data from its first sync')
  })
})

describe('Data sources order (SY-6)', () => {
  it('puts failed, then behind (longest first), then the most-used apps', () => {
    const apps = {
      [SHOP]: shop(),
      [META]: meta({ state: 'behind', lastSyncedAt: iso(NOW - 3 * HOUR) }),
      x: new AppSync(connectionState({ connectionId: 'x', name: 'Klaviyo', state: 'failed' })),
    }
    expect(sortApps([SHOP, META, 'x'], apps, {}, () => 0)).toEqual(['x', META, SHOP])
  })
})

describe('footer (SY-8)', () => {
  it('counts problems, in the worst colour', () => {
    const apps = { [SHOP]: shop({ state: 'behind' }), [META]: meta({ state: 'failed' }) }
    expect(footerText([SHOP, META], apps, NOW, false)).toEqual({ text: '1 failed • 1 behind', tone: 'failed' })
  })
  it('says what is syncing, and since when once it runs long', () => {
    expect(footerText([SHOP], { [SHOP]: shop({ state: 'syncing' }) }, NOW, false).text).toBe('Syncing 1 app…')
    const slow = { [SHOP]: shop({ state: 'slow', syncingSince: iso(NOW - HOUR) }) }
    expect(footerText([SHOP], slow, NOW, false).text).toMatch(/^Syncing since /)
  })
})

describe('banners (SY-14 – SY-18)', () => {
  it('one per kind of problem, red above amber', () => {
    const apps = { [SHOP]: shop({ state: 'behind' }), [META]: meta({ state: 'reconnect' }) }
    expect(banners([SHOP, META], apps, {}).map((b) => b.kind)).toEqual(['failed', 'behind'])
  })
  it('a syncing banner only for a Sync this viewer pressed, not a scheduled sync or Refresh', () => {
    const apps = { [SHOP]: shop({ state: 'syncing', syncingSince: iso(NOW) }) }
    expect(banners([SHOP], apps, {})).toEqual([])
    expect(banners([SHOP], apps, { [SHOP]: 'refresh' })).toEqual([])
    expect(banners([SHOP], apps, { [SHOP]: 'sync' })[0]).toMatchObject({ kind: 'syncing', apps: [SHOP], long: false })
  })
  it('names two apps, or the first and a count', () => {
    expect(appNames(['Shopify', 'Meta Ads']).lead).toBe('Shopify & Meta Ads')
    expect(appNames(['Shopify', 'Meta Ads', 'Klaviyo', 'Gorgias'])).toEqual({ lead: 'Shopify', more: '3 more apps', rest: 'Meta Ads, Klaviyo & Gorgias' })
  })
})
