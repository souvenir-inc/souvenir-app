import { describe, expect, it } from 'vitest'
import {
  appNames, appState, banners, buttonState, footerText, hoverText, sortApps,
  type AppId, type AppSync,
} from './sync-model'

const MIN = 60_000
const HOUR = 60 * MIN
const NOW = new Date(2026, 10, 23, 12, 0).getTime()
const fresh = (min: number): AppSync => ({ syncedAt: NOW - min * MIN, failed: false, syncing: null })
const make = (over: Partial<Record<AppId, AppSync>> = {}) =>
  ({ shopify: fresh(2), meta: fresh(3), 'google-ads': fresh(3), tiktok: fresh(4), ...over }) as Record<AppId, AppSync>

describe('app state', () => {
  it('is behind after more than 2 hours, failed when its sync failed, syncing while it runs', () => {
    expect(appState(fresh(119), NOW)).toBe('fresh')
    expect(appState(fresh(121), NOW)).toBe('behind')
    expect(appState({ ...fresh(5), failed: true }, NOW)).toBe('failed')
    expect(appState({ ...fresh(5), syncing: { startedAt: NOW, kind: 'sync' } }, NOW)).toBe('syncing')
    expect(appState({ syncedAt: null, failed: false, syncing: { startedAt: NOW, kind: 'first' } }, NOW)).toBe('first')
  })
})

describe('sync button (SY-2)', () => {
  it('shows the worst state: red › amber › spinner › green', () => {
    const apps = make({ meta: { ...fresh(300), failed: true }, shopify: fresh(200), tiktok: { ...fresh(1), syncing: { startedAt: NOW, kind: 'refresh' } } })
    expect(buttonState(['shopify', 'meta', 'tiktok'], apps, NOW, true)).toBe('failed')
    expect(buttonState(['shopify', 'tiktok'], apps, NOW, true)).toBe('behind')
    expect(buttonState(['tiktok', 'google-ads'], apps, NOW, true)).toBe('syncing')
    expect(buttonState(['google-ads'], apps, NOW, true)).toBe('fresh')
  })
  it('is grey offline, has no dot with no apps, and ignores first syncs', () => {
    const apps = make({ meta: { syncedAt: null, failed: false, syncing: { startedAt: NOW, kind: 'first' } } })
    expect(buttonState(['shopify'], apps, NOW, false)).toBe('offline')
    expect(buttonState([], apps, NOW, true)).toBe('none')
    expect(buttonState(['shopify', 'meta'], apps, NOW, true)).toBe('fresh')
  })
})

describe('hover (SY-3)', () => {
  it('gives the oldest app, so the board never looks fresher than it is', () => {
    expect(hoverText(['shopify', 'meta'], make(), NOW, true, null)).toBe('Up to date • Synced 3 min ago')
  })
  it('says when the data is from when behind or failed, and offline', () => {
    const apps = make({ meta: fresh(4 * 60 + 36) })
    expect(hoverText(['shopify', 'meta'], apps, NOW, true, null)).toBe('Out of date • Data from 7:24 am')
    const failed = make({ meta: { syncedAt: NOW - (2 * HOUR + 18 * MIN), failed: true, syncing: null } })
    expect(hoverText(['meta'], failed, NOW, true, null)).toBe('Sync failed • Data from 9:42 am')
    expect(hoverText(['meta'], make(), NOW, false, NOW - 96 * MIN)).toBe('Offline • Data from 10:24 am')
    expect(hoverText([], make(), NOW, true, null)).toBe('No apps on this board yet')
  })
})

describe('Data sources order (SY-6)', () => {
  it('puts failed, then behind (longest first), then the most-used apps', () => {
    const apps = make({ tiktok: { ...fresh(10), failed: true }, 'google-ads': fresh(300), meta: fresh(200) })
    expect(sortApps(['shopify', 'meta', 'google-ads', 'tiktok'], apps, NOW, { shopify: 1, meta: 4 }))
      .toEqual(['tiktok', 'google-ads', 'meta', 'shopify'])
  })
})

describe('footer (SY-8)', () => {
  it('counts problems, in the worst colour', () => {
    const apps = make({ meta: { ...fresh(300), failed: true }, shopify: fresh(200) })
    expect(footerText(['shopify', 'meta'], apps, NOW, false)).toEqual({ text: '1 failed • 1 behind', tone: 'failed' })
    expect(footerText(['shopify'], apps, NOW, false)).toEqual({ text: '1 app behind', tone: 'behind' })
    expect(footerText(['meta'], apps, NOW, false)).toEqual({ text: '1 app failed', tone: 'failed' })
  })
  it('says what is syncing, and since when after 10 minutes', () => {
    const run = (startedAt: number, kind: 'refresh' | 'sync') => ({ ...fresh(3), syncing: { startedAt, kind } })
    expect(footerText(['shopify', 'meta'], make({ shopify: run(NOW, 'refresh'), meta: run(NOW, 'refresh') }), NOW, true).text).toBe('Syncing…')
    expect(footerText(['shopify', 'meta'], make({ meta: run(NOW, 'sync') }), NOW, false).text).toBe('Syncing 1 app…')
    expect(footerText(['shopify', 'meta'], make({ meta: run(NOW - 122 * MIN, 'sync') }), NOW, false).text).toBe('Syncing since 9:58 am')
    expect(footerText(['shopify', 'meta'], make(), NOW, false)).toEqual({ text: 'Synced 3 min ago', tone: 'muted' })
  })
})

describe('banners (SY-14 – SY-18)', () => {
  it('one per kind of problem, red above amber, apps sharing a banner', () => {
    const apps = make({ meta: { ...fresh(300), failed: true }, shopify: fresh(200), tiktok: fresh(400) })
    const b = banners(['shopify', 'meta', 'tiktok'], apps, NOW)
    expect(b.map((x) => x.kind)).toEqual(['failed', 'behind'])
    expect(b[1].apps).toEqual(['tiktok', 'shopify']) // longest behind first
  })
  it('a syncing banner only for Sync and Reconnect, and its key changes with the state', () => {
    const apps = make({ meta: { ...fresh(200), syncing: { startedAt: NOW, kind: 'sync' } }, shopify: { ...fresh(2), syncing: { startedAt: NOW, kind: 'refresh' } } })
    const b = banners(['shopify', 'meta'], apps, NOW)
    expect(b).toHaveLength(1)
    expect(b[0]).toMatchObject({ kind: 'syncing', apps: ['meta'], reconnect: false, long: false })
    const behindKey = banners(['meta'], make({ meta: fresh(200) }), NOW)[0].key
    const failedKey = banners(['meta'], make({ meta: { ...fresh(200), failed: true } }), NOW)[0].key
    expect(behindKey).not.toBe(failedKey)
  })
  it('names two apps, or the first and a count', () => {
    expect(appNames(['shopify', 'meta']).lead).toBe('Shopify & Meta Ads')
    expect(appNames(['meta', 'google-ads', 'tiktok'])).toEqual({ lead: 'Meta Ads', more: '2 more apps', rest: 'Google Ads & TikTok Ads' })
  })
})
