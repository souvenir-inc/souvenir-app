import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { activityBannerOf, bannersOf, dotOf, footerOf, hoverOf, type Activity, type AppSync } from '@/lib/warehouse/sync'
import { SyncStatusValueProvider, reconnectHref, type SyncStatus } from './SyncStatusProvider'
import { SyncBanners } from './SyncBanners'
import { DataSources, SyncButton } from './SyncButton'
import { SyncDot } from './CardSync'
import { OfflineBar } from './OfflineBar'

vi.mock('@/context/nav-guard-context', () => ({ useGuardedRouter: () => ({ push: vi.fn() }) }))
// The offline bar reads the browser's connection and the board's data time; the tests set both.
const connection = vi.hoisted(() => ({ online: true, shownFrom: null as string | null }))
vi.mock('./connection', () => ({
  useOnline: () => connection.online,
  useShownDataFrom: () => connection.shownFrom,
  setShownDataFrom: () => {},
}))

const NOW = Date.parse('2026-11-18T10:24:00Z')
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString()

function status(apps: AppSync[], over: Partial<SyncStatus> = {}): SyncStatus {
  const online = over.online ?? true
  const role = over.role ?? 'admin'
  return {
    ready: true, apps, online, now: NOW, role, canReconnect: role === 'admin',
    dot: dotOf(apps, online), hover: hoverOf(apps, online, NOW, 'UTC'), footer: footerOf(apps, NOW),
    footerState: 'fine', footerSyncing: false,
    // Built without the offline rule: SyncBanners must not draw these offline because the provider drops them
    // (visibleBannersOf, tested in sync.test.ts), not because this helper did.
    banners: bannersOf(apps, { role, now: NOW, timeZone: 'UTC' }),
    scope: null, setScope: () => {}, setListOpen: () => {},
    refreshing: false, refreshHint: null, refreshDisabled: false, refresh: async () => {}, reconnectHref, logoOf: () => null,
    syncingNow: [], startedAtOf: () => undefined, syncPending: false, syncApps: async () => {}, isCooling: () => false,
    restHint: () => 'Checked just now • Sync again in a minute', dismissActivity: () => {}, reconnect: () => {},
    ...over,
  }
}

const shopify: AppSync = { name: 'Shopify', slug: 'shopify', categories: ['store'], state: 'up_to_date', lastSyncedAt: ago(3) }
const metaFailed: AppSync = { name: 'Meta Ads', slug: 'metaads', categories: ['ads'], state: 'failed', lastSyncedAt: ago(42) }
const metaBehind: AppSync = { ...metaFailed, state: 'behind', lastSyncedAt: ago(3 * 24 * 60) }

const render = (value: SyncStatus, node: React.ReactNode) =>
  renderToStaticMarkup(<SyncStatusValueProvider value={value}>{node}</SyncStatusValueProvider>)
const plain = (html: string) => html.replace(/<[^>]+>/g, '')

describe('SyncButton', () => {
  it('names the state for screen readers and shows its dot', () => {
    const html = render(status([metaFailed, shopify]), <SyncButton />)
    expect(html).toContain('aria-label="Data sources: Sync failed"')
    expect(html).toContain('data-state="failed"')
  })

  it('spins with no dot while syncing', () => {
    const html = render(status([{ ...shopify, state: 'syncing' }]), <SyncButton />)
    expect(html).toContain('aria-busy="true"')
    expect(html).not.toContain('buttonDot')
  })

  it('has no dot on a board with no apps', () => {
    const html = render(status([]), <SyncButton />)
    expect(html).toContain('Data sources: No apps')
    expect(html).not.toContain('buttonDot')
  })
})

describe('SyncBanners', () => {
  it('puts the red banner above the amber one, app names set apart, Reconnect for admins', () => {
    const html = render(status([metaFailed, { ...shopify, state: 'behind', lastSyncedAt: ago(3 * 24 * 60) }]), <SyncBanners />)
    const text = plain(html)
    expect(text.indexOf('Meta Ads sync failed. Showing data from 9:42 am.')).toBeLessThan(text.indexOf('Shopify hasn’t synced in 3 days.'))
    expect(text).toContain('Reconnect')
  })

  it('gives a member the sentence instead of the action', () => {
    const html = render(status([metaFailed], { role: 'member' }), <SyncBanners />)
    expect(plain(html)).toContain('Only an admin can reconnect Meta Ads.')
    expect(plain(html)).not.toContain('Reconnect')
  })

  it('offers Sync on the amber banner, to admins and members alike', () => {
    const behind = { ...shopify, state: 'behind' as const, lastSyncedAt: ago(3 * 24 * 60) }
    expect(plain(render(status([behind]), <SyncBanners />))).toContain('Sync')
    expect(plain(render(status([behind], { role: 'member' }), <SyncBanners />))).toContain('Sync')
  })

  it('shows a sync you started as a grey banner, then a green one', () => {
    const start = NOW - 5_000
    const running: Activity = { kind: 'sync', apps: ['Meta Ads'], startedAt: start, pending: true, baseline: { 'Meta Ads': metaBehind.lastSyncedAt } }
    const grey = activityBannerOf(running, [metaBehind], NOW)!
    const html = render(status([metaBehind], { banners: [grey] }), <SyncBanners />)
    expect(html).toContain('data-kind="syncing"')
    expect(plain(html)).toContain('Syncing Meta Ads. Cards using this app refresh when done.')
    const synced = { ...metaBehind, state: 'up_to_date' as const, lastSyncedAt: new Date(NOW).toISOString() }
    const green = activityBannerOf({ ...running, pending: false }, [synced], NOW)!
    expect(plain(render(status([synced], { banners: [green] }), <SyncBanners />))).toContain('Meta Ads synced just now. Data is up to date.')
  })

  it('greys the amber Sync while another Sync is out', () => {
    const html = render(status([metaBehind], { syncPending: true }), <SyncBanners />)
    expect(html).toMatch(/<button[^>]*aria-disabled="true"[^>]*>.*Sync<\/button>/)
  })
})

describe('cards', () => {
  it('marks a card that reads a failed app, and leaves the others alone', () => {
    const value = status([metaFailed, shopify])
    expect(render(value, <SyncDot categories={['ads']} />)).toContain('aria-label="Sync failed • Data from')
    expect(render(value, <SyncDot categories={['store']} />)).toBe('')
  })
})

describe('OfflineBar', () => {
  it('on the dashboard, says how old the numbers on screen are and that it is reconnecting', () => {
    Object.assign(connection, { online: false, shownFrom: ago(3) })
    const html = renderToStaticMarkup(<OfflineBar />)
    expect(plain(html)).toContain('You’re offline. Showing data from')
    expect(plain(html)).toContain('Reconnecting…')
  })

  it('on any other page, says only that you are offline', () => {
    Object.assign(connection, { online: false, shownFrom: null })
    const text = plain(renderToStaticMarkup(<OfflineBar />))
    expect(text).toContain('You’re offline.')
    expect(text).not.toContain('Showing data')
  })

  it('online, keeps only its empty live region (so the bar is announced when it appears)', () => {
    Object.assign(connection, { online: true, shownFrom: null })
    const html = renderToStaticMarkup(<OfflineBar />)
    expect(html).toContain('aria-live="polite"')
    expect(plain(html)).toBe('')
  })
})

describe('Sync you started', () => {
  it('spins the button while it runs', () => {
    const html = render(status([metaBehind], { syncingNow: ['Meta Ads'] }), <SyncButton />)
    expect(html).toContain('aria-busy="true"')
  })
})

describe('Data sources', () => {
  const panel = (value: SyncStatus) => render(value, <DataSources sync={value} />)

  it('offers a Sync on a behind row, greyed while it rests', () => {
    expect(panel(status([metaBehind]))).toMatch(/aria-label="Sync Meta Ads"(?![^>]*disabled)/)
    expect(panel(status([metaBehind], { isCooling: () => true }))).toMatch(/aria-label="Sync Meta Ads"[^>]*aria-disabled="true"/)
  })

  it('gives a greyed control its reason for screen readers, always there', () => {
    const html = panel(status([metaBehind], { isCooling: () => true, refreshDisabled: true, refreshHint: 'Checked just now • Refresh again in a minute' }))
    const described = [...html.matchAll(/aria-describedby="([^"]+)"/g)].map(m => m[1])
    expect(described).toHaveLength(2)
    for (const id of described) expect(html).toContain(`id="${id}"`)
    expect(plain(html)).toContain('Checked just now • Sync again in a minute')
    expect(plain(html)).toContain('Checked just now • Refresh again in a minute')
  })

  it('keeps the row Sync mounted, greyed, while that app syncs', () => {
    const html = panel(status([metaBehind], { syncingNow: ['Meta Ads'] }))
    expect(html).toMatch(/aria-label="Sync Meta Ads"[^>]*aria-disabled="true"/)
    expect(plain(html)).toContain('Syncing…')
  })

  it('greys Refresh when the provider says so', () => {
    const html = panel(status([shopify], { refreshDisabled: true, refreshHint: 'Syncing… • Refresh once the sync finishes' }))
    expect(html).toMatch(/<button[^>]*aria-disabled="true"[^>]*>.*Refresh<\/button>/)
    // Greyed with aria-disabled, never disabled, so the button keeps the keyboard focus.
    expect(html).not.toMatch(/<button[^>]*\sdisabled=""/)
  })

  it('gives the plug to admins only', () => {
    expect(panel(status([metaFailed]))).toContain('aria-label="Reconnect Meta Ads"')
    expect(panel(status([metaFailed], { role: 'member' }))).not.toContain('Reconnect Meta Ads')
  })
})

describe('reconnectHref', () => {
  it('opens the app on Connectors for one app, the Connectors page for several', () => {
    expect(reconnectHref(['Meta Ads'])).toBe('/connectors?q=Meta%20Ads')
    expect(reconnectHref(['Meta Ads', 'Shopify'])).toBe('/connectors')
  })
})
