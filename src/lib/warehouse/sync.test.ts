import { describe, expect, it } from 'vitest'
import type { Workspace } from '@/lib/api/warehouse'
import {
  BEHIND_AFTER_MS, LONG_SYNC_MS, RECONNECT_WATCH_MS, SYNC_WATCH_MS, activityBannerOf, appsForCategories, appsOf,
  bannersOf, busyAppsOf, cardHoverOf, dotOf, failureToastOf, footerOf, footerSyncingOf, formatAgo, formatClock,
  formatDuration, hoverOf, isClosed, newlyFailed, restHintOf, rowStatusOf, visibleBannersOf, type Activity, type AppSync,
  type Segment,
} from './sync'

const NOW = Date.parse('2026-11-18T10:24:00Z')
const TZ = 'UTC'
const ago = (ms: number) => new Date(NOW - ms).toISOString()
const MIN = 60_000
const HOUR = 60 * MIN

function workspace(categories: Workspace['categories'], connectors = ['shopify', 'metaads']): Workspace {
  return { id: 'w', name: 'Store', slug: 'store', timezone: 'UTC', connectors, categories }
}
const text = (segments: Segment[]) => segments.map(s => s.text).join('')

describe('appsOf', () => {
  it('names each app and orders failed, behind, syncing, up to date', () => {
    const apps = appsOf(workspace([
      { category: 'store', status: 'ready', lastSyncedAt: ago(3 * MIN) },
      { category: 'ads', status: 'failed', lastSyncedAt: ago(HOUR) },
    ]), NOW)
    expect(apps.map(a => [a.name, a.state, a.slug])).toEqual([['Meta Ads', 'failed', 'metaads'], ['Shopify', 'up_to_date', 'shopify']])
  })

  it('is behind after twice the usual interval without a successful sync', () => {
    const apps = appsOf(workspace([
      { category: 'store', status: 'ready', lastSyncedAt: ago(BEHIND_AFTER_MS + MIN) },
      { category: 'ads', status: 'ready', lastSyncedAt: ago(BEHIND_AFTER_MS - MIN) },
    ]), NOW)
    expect(apps.map(a => [a.name, a.state])).toEqual([['Shopify', 'behind'], ['Meta Ads', 'up_to_date']])
  })

  it('tells a first sync from a sync of an app that already has data', () => {
    const apps = appsOf(workspace([
      { category: 'store', status: 'syncing', lastSyncedAt: ago(5 * MIN) },
      { category: 'ads', status: 'building', lastSyncedAt: null },
    ]), NOW)
    expect(apps.map(a => [a.name, a.state])).toEqual([['Shopify', 'syncing'], ['Meta Ads', 'first_sync']])
  })

  it('lists a connected app whose first sync failed', () => {
    const apps = appsOf(workspace([
      { category: 'store', status: 'ready', lastSyncedAt: ago(MIN) },
      { category: 'ads', status: 'failed', lastSyncedAt: null },
    ]), NOW)
    expect(apps.map(a => [a.name, a.state, a.lastSyncedAt])).toEqual([['Meta Ads', 'failed', null], ['Shopify', 'up_to_date', ago(MIN)]])
  })

  it('leaves out areas that do not apply and areas with no app that failed without ever syncing', () => {
    const apps = appsOf(workspace([
      { category: 'store', status: 'ready', lastSyncedAt: ago(MIN) },
      { category: 'reviews', status: 'not_applicable', lastSyncedAt: null },
      { category: 'ab_testing', status: 'failed', lastSyncedAt: null },
    ]), NOW)
    expect(apps.map(a => a.name)).toEqual(['Shopify'])
  })
})

describe('the dot and its hover', () => {
  const apps = (states: Array<[string, AppSync['state'], number | null]>): AppSync[] =>
    states.map(([name, state, msAgo]) => ({ name, slug: null, categories: [name], state, lastSyncedAt: msAgo === null ? null : ago(msAgo) }))

  it('shows the worst state; a first sync does not count', () => {
    expect(dotOf(apps([['A', 'up_to_date', MIN], ['B', 'first_sync', null]]), true)).toBe('up_to_date')
    expect(dotOf(apps([['A', 'behind', 3 * 24 * HOUR], ['B', 'syncing', MIN]]), true)).toBe('behind')
    expect(dotOf(apps([['A', 'behind', 3 * 24 * HOUR], ['B', 'failed', HOUR]]), true)).toBe('failed')
    expect(dotOf(apps([['A', 'failed', HOUR]]), false)).toBe('offline')
    expect(dotOf([], true)).toBe('none')
    expect(dotOf(apps([['A', 'first_sync', null]]), true)).toBe('syncing')
  })

  it('reads "State • Time"', () => {
    expect(hoverOf(apps([['A', 'up_to_date', 3 * MIN]]), true, NOW, TZ)).toBe('Up to date • Synced 3 min ago')
    expect(hoverOf(apps([['A', 'failed', 42 * MIN]]), true, NOW, TZ)).toBe('Sync failed • Data from 9:42 am')
    expect(hoverOf(apps([['A', 'behind', 3 * 24 * HOUR]]), true, NOW, TZ)).toBe('Out of date • Data from 15 Nov, 10:24 am')
    expect(hoverOf(apps([['A', 'up_to_date', 0]]), false, NOW, TZ)).toBe('Offline • Data from 10:24 am')
    expect(hoverOf([], true, NOW, TZ)).toBe('No apps on this board yet')
    expect(hoverOf(apps([['A', 'syncing', MIN]]), true, NOW, TZ)).toBe('Syncing…')
  })

  it('gives a card the state of the apps it reads', () => {
    const all = apps([['Meta Ads', 'failed', 42 * MIN], ['Shopify', 'up_to_date', MIN]])
    expect(cardHoverOf(appsForCategories(all, ['Meta Ads']), NOW, TZ)).toEqual({ state: 'failed', text: 'Sync failed • Data from 9:42 am' })
    expect(cardHoverOf(appsForCategories(all, ['Shopify']), NOW, TZ)).toBeNull()
  })
})

describe('Data sources', () => {
  const app = (state: AppSync['state'], msAgo: number | null): AppSync => ({ name: 'A', slug: null, categories: [], state, lastSyncedAt: msAgo === null ? null : ago(msAgo) })

  it('says each row’s status', () => {
    expect(rowStatusOf(app('up_to_date', 2 * MIN), NOW)).toBe('2 min ago')
    expect(rowStatusOf(app('up_to_date', 10_000), NOW)).toBe('Just now')
    expect(rowStatusOf(app('behind', 3 * 24 * HOUR), NOW)).toBe('3 d ago')
    expect(rowStatusOf(app('failed', HOUR), NOW)).toBe('Sync failed')
    expect(rowStatusOf(app('syncing', HOUR), NOW)).toBe('Syncing…')
    expect(rowStatusOf(app('first_sync', null), NOW)).toBe('First sync…')
  })

  it('sums up in counts, never names', () => {
    expect(footerOf([app('failed', HOUR), app('behind', 3 * 24 * HOUR)], NOW)).toBe('1 failed • 1 behind')
    expect(footerOf([app('failed', HOUR), app('failed', HOUR), app('failed', HOUR)], NOW)).toBe('3 apps failed')
    expect(footerOf([app('behind', 3 * 24 * HOUR)], NOW)).toBe('1 app behind')
    expect(footerOf([app('syncing', MIN), app('up_to_date', MIN)], NOW)).toBe('Syncing 1 app…')
    expect(footerOf([app('up_to_date', 3 * MIN)], NOW)).toBe('Synced 3 min ago')
    expect(footerOf([app('up_to_date', 1000)], NOW)).toBe('Synced just now')
  })
})

describe('banners', () => {
  const named = (name: string, state: AppSync['state'], msAgo: number): AppSync => ({ name, slug: null, categories: [], state, lastSyncedAt: ago(msAgo) })

  it('puts failed above behind, one banner each', () => {
    const banners = bannersOf([named('Meta Ads', 'failed', 42 * MIN), named('Shopify', 'behind', 3 * 24 * HOUR)], { role: 'admin', now: NOW, timeZone: TZ })
    expect(banners.map(b => [b.kind, text(b.segments)])).toEqual([
      ['failed', 'Meta Ads sync failed. Showing data from 9:42 am.'],
      ['behind', 'Shopify hasn’t synced in 3 days. Some data may be out of date.'],
    ])
  })

  it('names the app with the problem longest and counts the rest', () => {
    const [banner] = bannersOf([named('Google Ads', 'failed', HOUR), named('Meta Ads', 'failed', 5 * HOUR), named('TikTok Ads', 'failed', 2 * HOUR)], { role: 'admin', now: NOW, timeZone: TZ })
    expect(text(banner.segments)).toBe('Meta Ads & 2 more apps failed to sync. Showing their last synced data.')
    expect(banner.segments.find(s => s.more)?.more).toEqual(['TikTok Ads', 'Google Ads'])
  })

  it('joins two apps with "&"', () => {
    const [banner] = bannersOf([named('Shopify', 'behind', 4 * 24 * HOUR), named('Meta Ads', 'behind', 3 * 24 * HOUR)], { role: 'admin', now: NOW, timeZone: TZ })
    expect(text(banner.segments)).toBe('Shopify & Meta Ads haven’t synced in over 3 days. Some data may be out of date.')
  })

  it('tells a member who can reconnect', () => {
    const [banner] = bannersOf([named('Meta Ads', 'failed', 42 * MIN)], { role: 'member', now: NOW, timeZone: TZ })
    expect(text(banner.segments)).toBe('Meta Ads sync failed. Showing data from 9:42 am. Only an admin can reconnect Meta Ads.')
  })

  it('says nothing about who can reconnect until the role is known', () => {
    const [banner] = bannersOf([named('Meta Ads', 'failed', 42 * MIN)], { role: 'unknown', now: NOW, timeZone: TZ })
    expect(text(banner.segments)).toBe('Meta Ads sync failed. Showing data from 9:42 am.')
  })

  it('reads in days once behind (behind starts after two days)', () => {
    const [banner] = bannersOf([named('Meta Ads', 'behind', 49 * HOUR)], { role: 'admin', now: NOW })
    expect(text(banner.segments)).toBe('Meta Ads hasn’t synced in 2 days. Some data may be out of date.')
    expect(formatDuration(26 * HOUR)).toBe('26 hours')
  })

  it('changes signature when the apps change, so a closed banner comes back', () => {
    const one = bannersOf([named('Meta Ads', 'behind', 3 * 24 * HOUR)], { role: 'admin', now: NOW })[0].signature
    const two = bannersOf([named('Meta Ads', 'behind', 3 * 24 * HOUR), named('Shopify', 'behind', 3 * 24 * HOUR)], { role: 'admin', now: NOW })[0].signature
    expect(one).not.toBe(two)
  })

  it('changes signature when an app recovers and breaks again', () => {
    const before = bannersOf([named('Meta Ads', 'behind', 3 * 24 * HOUR)], { role: 'admin', now: NOW })[0].signature
    const later = bannersOf([named('Meta Ads', 'behind', 2 * 24 * HOUR + HOUR)], { role: 'admin', now: NOW })[0].signature
    expect(before).not.toBe(later)
  })
})

describe('after a refresh', () => {
  const named = (name: string, state: AppSync['state']): AppSync => ({ name, slug: null, categories: [], state, lastSyncedAt: ago(HOUR) })

  it('names only the apps that newly failed', () => {
    const before = [named('Meta Ads', 'up_to_date'), named('Shopify', 'up_to_date')]
    const after = [named('Meta Ads', 'failed'), named('Shopify', 'up_to_date')]
    const failed = newlyFailed(before, after)
    expect(failed.map(a => a.name)).toEqual(['Meta Ads'])
    expect(text(failureToastOf(failed, after))).toBe('Meta Ads sync failed • Other apps synced')
    expect(newlyFailed(after, after)).toEqual([])
  })
})

describe('time words', () => {
  it('formats clock times and ages', () => {
    expect(formatClock(ago(42 * MIN), NOW, TZ)).toBe('9:42 am')
    expect(formatClock(ago(26 * HOUR), NOW, TZ)).toBe('17 Nov, 8:24 am')
    expect(formatAgo(ago(30_000), NOW)).toBe('just now')
    expect(formatAgo(ago(5 * HOUR), NOW)).toBe('5 h ago')
  })
})

describe('what you started', () => {
  const text = (segments: Segment[] | undefined) => (segments ?? []).map(s => s.text).join('')
  const behind: AppSync = { name: 'Meta Ads', slug: 'metaads', categories: ['ads'], state: 'behind', lastSyncedAt: ago(3 * 24 * HOUR) }
  const failed: AppSync = { ...behind, state: 'failed', lastSyncedAt: ago(42 * MIN) }
  const CLICK = NOW - 5_000
  const sync = (over: Partial<Activity> = {}): Activity => ({
    kind: 'sync', apps: ['Meta Ads'], startedAt: CLICK, pending: true, baseline: { 'Meta Ads': behind.lastSyncedAt }, ...over,
  })
  const upToDate = (at: string): AppSync => ({ ...behind, state: 'up_to_date', lastSyncedAt: at })

  it('is grey while the request is out, and those apps leave their problem banner', () => {
    const banner = activityBannerOf(sync(), [behind], NOW)
    expect(banner?.kind).toBe('syncing')
    expect(banner?.source).toBe('sync')
    expect(text(banner?.segments)).toBe('Syncing Meta Ads. Cards using this app refresh when done.')
    expect(busyAppsOf(sync(), [behind], NOW)).toEqual(['Meta Ads'])
  })

  it('says a long sync is taking longer than usual', () => {
    const banner = activityBannerOf(sync({ startedAt: NOW - LONG_SYNC_MS - MIN }), [{ ...behind, state: 'syncing' }], NOW)
    expect(text(banner?.segments)).toBe('Meta Ads is taking longer than usual. Cards using this app refresh when done.')
  })

  it('turns green only when the last sync moved on, and from the click or later', () => {
    const done = sync({ pending: false })
    // After the click, or within the minute's leeway for clocks: green.
    expect(text(activityBannerOf(done, [upToDate(ago(1_000))], NOW)?.segments)).toBe('Meta Ads synced just now. Data is up to date.')
    expect(activityBannerOf(done, [upToDate(new Date(CLICK - 30_000).toISOString())], NOW)?.kind).toBe('synced')
    // Two minutes before the click (newer than the board knew, but not "just now"): no banner of its own.
    expect(activityBannerOf(done, [upToDate(new Date(CLICK - 2 * MIN).toISOString())], NOW)).toBeNull()
    // The re-read changed nothing: the same last sync as at the click.
    const same = sync({ pending: false, baseline: { 'Meta Ads': ago(MIN) } })
    expect(activityBannerOf(same, [upToDate(ago(MIN))], NOW)).toBeNull()
  })

  it('gives way to the problem banner when the app is still behind', () => {
    expect(activityBannerOf(sync({ pending: false }), [behind], NOW)).toBeNull()
    expect(busyAppsOf(sync({ pending: false }), [behind], NOW)).toEqual([])
  })

  it('is forgotten after an hour, even with the request still out', () => {
    const old = sync({ startedAt: NOW - SYNC_WATCH_MS - MIN })
    expect(activityBannerOf(old, [behind], NOW)).toBeNull()
    expect(busyAppsOf(old, [behind], NOW)).toEqual([])
  })

  describe('after a Reconnect', () => {
    const watch = (over: Partial<Activity> = {}): Activity => ({
      kind: 'reconnect', apps: ['Meta Ads'], startedAt: NOW - 10 * MIN, pending: false, baseline: { 'Meta Ads': failed.lastSyncedAt }, ...over,
    })

    it('says nothing while the app is still failed, then reconnected and syncing, then synced', () => {
      expect(activityBannerOf(watch(), [failed], NOW)).toBeNull()
      const syncing = activityBannerOf(watch(), [{ ...failed, state: 'syncing' }], NOW)
      expect(text(syncing?.segments)).toBe('Meta Ads reconnected. Syncing the latest data.')
      expect(syncing?.source).toBe('reconnect')
      expect(text(activityBannerOf(watch(), [upToDate(ago(MIN))], NOW)?.segments)).toBe('Meta Ads reconnected and synced. Data is up to date.')
    })

    it('counts each app that comes back, while another is still failed', () => {
      const shopifyFailed: AppSync = { ...failed, name: 'Shopify', slug: 'shopify' }
      const both = watch({ apps: ['Meta Ads', 'Shopify'], baseline: { 'Meta Ads': failed.lastSyncedAt, Shopify: failed.lastSyncedAt } })
      const banner = activityBannerOf(both, [{ ...failed, state: 'syncing' }, shopifyFailed], NOW)
      expect(text(banner?.segments)).toBe('Meta Ads reconnected. Syncing the latest data.')
    })

    it('gives each app its own grey banner, so closing one app’s doesn’t hide the next', () => {
      const both = watch({ apps: ['Meta Ads', 'Klaviyo'], baseline: { 'Meta Ads': failed.lastSyncedAt, Klaviyo: failed.lastSyncedAt } })
      const klaviyo: AppSync = { ...failed, name: 'Klaviyo', slug: 'klaviyo' }
      const first = activityBannerOf(both, [{ ...failed, state: 'syncing' }, klaviyo], NOW)!
      const later = activityBannerOf(watch({ apps: ['Klaviyo'], baseline: both.baseline }), [{ ...klaviyo, state: 'syncing' }], NOW)!
      expect(later.signature).not.toBe(first.signature)
      expect(isClosed(later, [first.signature])).toBe(false)
    })

    it('is forgotten after half an hour', () => {
      expect(activityBannerOf(watch({ startedAt: NOW - RECONNECT_WATCH_MS - MIN }), [{ ...failed, state: 'syncing' }], NOW)).toBeNull()
    })
  })
})

describe('board banners', () => {
  const behind = (name: string, at: string): AppSync => ({ name, slug: null, categories: [], state: 'behind', lastSyncedAt: at })
  const amber = (...apps: AppSync[]) => bannersOf(apps, { role: 'admin', now: NOW })[0]
  const meta = behind('Meta Ads', ago(3 * 24 * HOUR))
  const shopify = behind('Shopify', ago(4 * 24 * HOUR))

  it('shows none offline: the bar above the window replaces them', () => {
    expect(visibleBannersOf(false, [amber(meta)], [])).toEqual([])
  })

  it('puts red first, then what you started, then amber', () => {
    const red = bannersOf([{ ...meta, state: 'failed' }], { role: 'admin', now: NOW })[0]
    const grey = { kind: 'syncing' as const, apps: ['Shopify'], segments: [], signature: 'sync:1:running', source: 'sync' as const }
    expect(visibleBannersOf(true, [amber(shopify), red], [grey]).map(b => b.kind)).toEqual(['failed', 'syncing', 'behind'])
  })

  it('keeps a closed banner closed when an app leaves it', () => {
    const closed = [amber(meta, shopify).signature]
    expect(isClosed(amber(shopify), closed)).toBe(true)
  })

  it('brings a closed banner back when another app joins, the kind changes, or an app breaks again', () => {
    const closed = [amber(meta).signature]
    expect(isClosed(amber(meta, shopify), closed)).toBe(false)
    expect(isClosed(bannersOf([{ ...meta, state: 'failed' }], { role: 'admin', now: NOW })[0], closed)).toBe(false)
    expect(isClosed(amber(behind('Meta Ads', ago(2 * 24 * HOUR + HOUR))), closed)).toBe(false)
  })
})

describe('long syncs and rests', () => {
  const syncing: AppSync = { name: 'Meta Ads', slug: null, categories: [], state: 'syncing', lastSyncedAt: ago(3 * 24 * HOUR) }

  it('says "Still syncing…" and "Syncing since" once a sync you started passes 10 minutes', () => {
    const started = NOW - LONG_SYNC_MS - MIN
    expect(rowStatusOf(syncing, NOW, started)).toBe('Still syncing…')
    expect(rowStatusOf(syncing, NOW, NOW - MIN)).toBe('Syncing…')
    expect(footerOf([syncing], NOW, { startedAt: started, timeZone: TZ })).toBe('Syncing since 10:13 am')
    expect(footerOf([syncing], NOW)).toBe('Syncing 1 app…')
  })

  it('gives the footer a spinner only for a syncing line', () => {
    expect(footerSyncingOf([syncing])).toBe(true)
    expect(footerSyncingOf([syncing, { ...syncing, name: 'Shopify', state: 'behind' }])).toBe(false)
  })

  it('says "Synced just now" only when an app really synced', () => {
    expect(restHintOf(true, 'Sync')).toBe('Synced just now • Sync again in a minute')
    expect(restHintOf(false, 'Refresh')).toBe('Checked just now • Refresh again in a minute')
  })
})
