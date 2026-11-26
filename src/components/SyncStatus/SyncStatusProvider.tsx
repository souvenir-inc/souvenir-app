'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQueries, useQueryClient } from '@tanstack/react-query'
import { useGuardedRouter } from '@/context/nav-guard-context'
import { getConnector, resolveConnector } from '@/lib/api/connectors'
import { useOrgIdentity } from '@/context/org-context'
import type { Workspace } from '@/lib/api/warehouse'
import { orgScope, queryKeys } from '@/lib/query-keys'
import { ORG_CONNECTORS_ROUTE } from '@/lib/routes'
import {
  RECONNECT_WATCH_MS, SYNC_COOLDOWN_MS, SYNC_WATCH_MS, activityBannerOf, appsForCategories, appsOf, bannersOf, baselineOf, busyAppsOf,
  cardHoverOf, dotOf, failureToastOf, footerOf, footerSyncingOf, hoverOf, isLive, newlyFailed, restHintOf, syncedAfter,
  visibleBannersOf, type Activity, type AppSync, type Banner, type DotState, type ReconnectRole,
} from '@/lib/warehouse/sync'
import { useWorkspace } from '@/lib/warehouse/queries'
import { setShownDataFrom, useOnline } from './connection'
import { showSyncErrorToast } from './SyncToast'

/** While an app syncs on the server, or a Reconnect waits for its app, the workspace is read again this often. */
const SYNCING_POLL_MS = 45_000
/** The grey "Syncing" banner stays at least this long, so the step can be read even when the answer is quick. */
const MIN_SYNCING_MS = 1_200
const RECONNECT_KEY = 'sync-reconnect-watch'

export interface SyncStatus {
  /** False until the workspace has loaded. */
  ready: boolean
  apps: AppSync[]
  online: boolean
  now: number
  /** Who may reconnect; `unknown` while the role loads (no member sentence then, no Reconnect either). */
  role: ReconnectRole
  /** Reconnect is shown: an admin, or a role that failed to load (the back end enforces the rule). */
  canReconnect: boolean
  dot: DotState
  hover: string
  /** Data sources' footer, counting the apps you're syncing as syncing. */
  footer: string
  /** The footer's colour: red with a failed app, amber with a behind one. */
  footerState: 'failed' | 'behind' | 'fine'
  /** The footer is a "Syncing …" line, so it gets a spinner. */
  footerSyncing: boolean
  banners: Banner[]
  /** Which board the banners belong to: closing one hides it on that board only. */
  scope: string | null
  setScope: (scope: string | null) => void
  refreshing: boolean
  /** Why Refresh can't run now (its hover while greyed); null when it can, or while it runs. */
  refreshHint: string | null
  /** Refresh is greyed: offline, running, an app syncing (req. 10) or an app resting (req. 9). */
  refreshDisabled: boolean
  /** The apps syncing because you asked (a Sync, a Reconnect, or every app while Refresh runs): their rows spin. */
  syncingNow: string[]
  /** When the Sync you started on this app began, for "Still syncing…" and "Syncing since …". */
  startedAtOf: (app: string) => number | undefined
  /** A Sync you started is still out: other Syncs wait for it. */
  syncPending: boolean
  /** Sync on a banner or a row: syncs these apps. */
  syncApps: (apps: string[]) => Promise<void>
  /** This app synced less than a minute ago, so its Sync rests. */
  isCooling: (app: string) => boolean
  /** A resting app's hover: "Synced just now • Sync again in a minute" only when it really synced. */
  restHint: (app: string) => string
  /**
   * Clears the grey or green banner for what you started (its ×, or the green banner's 4 s). For a Reconnect, only
   * the banner's apps: the others stay watched until they come back.
   */
  dismissActivity: (source: 'sync' | 'reconnect', apps?: string[]) => void
  /** Reconnect: opens Connectors and watches these apps, so the board says so when they come back. */
  reconnect: (apps: string[]) => void
  /**
   * Reads every number again. The API can't start an app's sync yet (S8c), so this is what Refresh does today;
   * syncs themselves run on the server.
   */
  refresh: () => Promise<void>
  /** Data sources tells the provider when it opens and closes, so a failure toast knows whether the list shows it. */
  setListOpen: (open: boolean) => void
  /** Where Reconnect goes: the app on Connectors for one app, the Connectors page for several. */
  reconnectHref: (apps: string[]) => string
  /** The app's logo from the connector catalog; null draws a letter tile. */
  logoOf: (app: AppSync) => string | null
}

const SyncContext = createContext<SyncStatus | null>(null)

/** A Reconnect you started, kept for the trip to Connectors and back (the board unmounts on the way). */
interface StoredWatch {
  /** The org it was started in: another org's board ignores it. */
  orgId: string | null
  apps: string[]
  at: number
  baseline: Record<string, string | null>
}

function readReconnectWatch(): StoredWatch | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(RECONNECT_KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<StoredWatch>
    const valid = Array.isArray(value.apps) && typeof value.at === 'number' && typeof value.baseline === 'object' && value.baseline !== null
    if (!valid || Date.now() - (value.at as number) > RECONNECT_WATCH_MS) {
      window.sessionStorage.removeItem(RECONNECT_KEY)
      return null
    }
    return { orgId: value.orgId ?? null, apps: value.apps as string[], at: value.at as number, baseline: value.baseline as Record<string, string | null> }
  } catch {
    return null
  }
}

function writeReconnectWatch(value: StoredWatch | null) {
  try {
    if (value) window.sessionStorage.setItem(RECONNECT_KEY, JSON.stringify(value))
    else window.sessionStorage.removeItem(RECONNECT_KEY)
  } catch { /* the board just won't say "reconnected" */ }
}

const wait = (ms: number) => new Promise<void>(resolve => window.setTimeout(resolve, ms))

export function reconnectHref(apps: string[]): string {
  return apps.length === 1 ? `${ORG_CONNECTORS_ROUTE}?q=${encodeURIComponent(apps[0])}` : ORG_CONNECTORS_ROUTE
}

const unsettled = (app: AppSync) => app.state === 'syncing' || app.state === 'first_sync'

/**
 * The sync status of the apps behind the board, for the header's sync button, the banners and the card dots.
 * Every board reads the same apps until the back end says which apps each metric reads (S21).
 */
export function SyncStatusProvider({ children }: { children: ReactNode }) {
  const workspace = useWorkspace()
  const online = useOnline()
  const client = useQueryClient()
  const { orgId, caps, orgReady, orgRoleResolved, roleError } = useOrgIdentity()
  const { push } = useGuardedRouter()
  const role: ReconnectRole = roleError ? 'admin' : !orgReady || !orgRoleResolved ? 'unknown' : caps.canManageOrg ? 'admin' : 'member'
  const canReconnect = role === 'admin'
  const [refreshing, setRefreshing] = useState(false)
  // When Refresh last ran: it rests a minute after.
  const [refreshedAt, setRefreshedAt] = useState(0)
  // Each app's Sync rests a minute after it ran (Refresh sets every app's), and whether that run really synced it.
  const [cooldowns, setCooldowns] = useState<Record<string, number>>({})
  const [synced, setSynced] = useState<Record<string, boolean>>({})
  // A Sync you started, shown on the board until it settles.
  const [activity, setActivity] = useState<Activity | null>(null)
  // A Reconnect you're coming back from, kept apart from a Sync so one never replaces the other.
  const [stored, setStored] = useState<StoredWatch | null>(readReconnectWatch)
  const [scope, setScope] = useState<string | null>(null)
  const listOpen = useRef(false)
  const setListOpen = useCallback((open: boolean) => { listOpen.current = open }, [])
  // The current time, ticking every minute, so "3 min ago" and "behind" stay true while the page is open.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  const apps = useMemo(() => (workspace.data ? appsOf(workspace.data, now) : []), [workspace.data, now])
  // The workspace lists connector slugs only; the catalog has their logos. Each is looked up once per session:
  // from the catalog cache when the cards' source marks already loaded it, else fetched. A slug the catalog
  // doesn't know (404) keeps its letter tile, with no retry and nothing on screen.
  const slugs = useMemo(() => workspace.data?.connectors ?? [], [workspace.data])
  const logoList = useQueries({
    queries: slugs.map(slug => ({
      queryKey: ['sync-status', 'connector-logo', slug],
      queryFn: async () => resolveConnector(slug).logo ?? (await getConnector(slug)).logoUrl ?? null,
      staleTime: Infinity,
      gcTime: Infinity,
      retry: false,
      retryOnMount: false,
      refetchOnWindowFocus: false,
    })),
    combine: results => results.map(r => r.data ?? '').join('\n'),
  })
  const logos = useMemo(() => {
    const urls = logoList.split('\n')
    return new Map(slugs.map((slug, i) => [slug, urls[i] || null]))
  }, [slugs, logoList])
  const logoOf = useCallback((app: AppSync) => (app.slug ? logos.get(app.slug) ?? null : null), [logos])

  const scopeKey = useMemo(() => queryKeys.warehouse.all(orgScope(orgId)), [orgId])
  const workspaceKey = useMemo(() => queryKeys.warehouse.workspace(orgScope(orgId)), [orgId])

  // The Reconnect watch counts on its own org's board only, once the org is known.
  const watch = useMemo<Activity | null>(() => (
    stored && orgReady && stored.orgId === (orgId ?? null)
      ? { kind: 'reconnect', apps: stored.apps, startedAt: stored.at, pending: false, baseline: stored.baseline }
      : null
  ), [stored, orgReady, orgId])

  // Back from Connectors: the board's numbers are from before the trip, so read them again once per watch.
  const rereadFor = useRef<number | null>(null)
  useEffect(() => {
    if (!watch || rereadFor.current === watch.startedAt) return
    rereadFor.current = watch.startedAt
    void client.invalidateQueries({ queryKey: scopeKey })
  }, [watch, client, scopeKey])

  const anySyncing = apps.some(unsettled)
  const waitingForReconnect = watch !== null && isLive(watch, now) && apps.some(a => watch.apps.includes(a.name) && a.state === 'failed')

  // An app syncing on the server, or a Reconnect waiting for its app: read the workspace again every 45 s. This
  // poll reads only the workspace, so when it sees a failed app come back (a sync that ran between two polls), it
  // reads the cards too. Every other read (mount, Refresh, Sync, back online) already reads them.
  useEffect(() => {
    if ((!anySyncing && !waitingForReconnect) || !online) return
    const failedNow = () => {
      const data = client.getQueryData<Workspace>(workspaceKey)
      return new Set(data ? appsOf(data, Date.now()).filter(a => a.state === 'failed').map(a => a.name) : [])
    }
    const id = window.setInterval(async () => {
      const before = failedNow()
      await client.invalidateQueries({ queryKey: workspaceKey })
      const after = failedNow()
      if ([...before].some(name => !after.has(name))) void client.invalidateQueries({ queryKey: scopeKey })
    }, SYNCING_POLL_MS)
    return () => window.clearInterval(id)
  }, [anySyncing, waitingForReconnect, online, client, workspaceKey, scopeKey])

  // When a sync settles, the numbers it brought are read again. (A failed app that comes back is the poll's job.)
  const wasSyncing = useRef<Set<string>>(new Set())
  useEffect(() => {
    const syncing = new Set(apps.filter(unsettled).map(a => a.name))
    const settled = [...wasSyncing.current].some(name => !syncing.has(name))
    wasSyncing.current = syncing
    if (settled) void client.invalidateQueries({ queryKey: scopeKey })
  }, [apps, client, scopeKey])

  // Back online: read everything again (fresh queries skip React Query's own refetch on reconnect).
  const wasOnline = useRef(online)
  useEffect(() => {
    if (online && !wasOnline.current) void client.invalidateQueries({ queryKey: scopeKey })
    wasOnline.current = online
  }, [online, client, scopeKey])

  // Refresh and Sync rest for a minute after each run; this wakes them when the next rest ends, one after another.
  useEffect(() => {
    const next = [...Object.values(cooldowns), refreshedAt + SYNC_COOLDOWN_MS].filter(at => at > now).sort((a, b) => a - b)[0]
    if (next === undefined) return
    const id = window.setTimeout(() => setNow(Date.now()), next - Date.now() + 50)
    return () => window.clearTimeout(id)
  }, [cooldowns, refreshedAt, now])

  // The offline bar sits above every page; while the board is open it says how old the numbers on it are.
  const oldestShown = useMemo(() => apps.map(a => a.lastSyncedAt).filter((at): at is string => at !== null).sort()[0] ?? null, [apps])
  useEffect(() => {
    setShownDataFrom(oldestShown)
    return () => setShownDataFrom(null)
  }, [oldestShown])

  const syncPending = activity !== null && activity.pending && isLive(activity, now)
  // One sync at a time (req. 10): a server sync or a Sync you started greys Refresh. A first sync doesn't (req. 7).
  const syncBusy = syncPending || apps.some(a => a.state === 'syncing')
  const coolingApps = useMemo(() => Object.entries(cooldowns).filter(([, at]) => at > now).map(([name]) => name), [cooldowns, now])
  const refreshHint = !online
    ? 'Offline • Refresh once you’re back online'
    : refreshing ? null
    : syncBusy ? 'Syncing… • Refresh once the sync finishes'
    : refreshedAt + SYNC_COOLDOWN_MS > now ? 'Refreshed just now • Refresh again in a minute'
    : coolingApps.length > 0 ? restHintOf(coolingApps.some(name => synced[name]), 'Refresh')
    : null
  const refreshDisabled = refreshing || refreshHint !== null

  const reconnect = useCallback((names: string[]) => {
    const value: StoredWatch = { orgId: orgId ?? null, apps: names, at: Date.now(), baseline: baselineOf(apps, names) }
    // This board is about to leave for Connectors: the re-read is for when it comes back.
    rereadFor.current = value.at
    writeReconnectWatch(value)
    setStored(value)
    push(reconnectHref(names))
  }, [orgId, apps, push])

  const refresh = useCallback(async () => {
    if (refreshDisabled) return
    const start = Date.now()
    const stale = client.getQueryData<Workspace>(workspaceKey)
    const before = stale ? appsOf(stale, start) : apps
    let after = before
    setRefreshing(true)
    try {
      // A request that hangs ends the run after an hour, as a sync attempt does (req. 8), so Refresh and Sync come
      // back. Only reads that can fall back to numbers they already had are cancelled: a card's first load is left
      // to finish rather than stranded empty.
      let timedOut = false
      let timer = 0
      await Promise.race([
        client.invalidateQueries({ queryKey: scopeKey }),
        new Promise<void>(resolve => { timer = window.setTimeout(() => { timedOut = true; resolve() }, SYNC_WATCH_MS) }),
      ])
      window.clearTimeout(timer)
      if (timedOut) void client.cancelQueries({ queryKey: scopeKey, predicate: query => query.state.data !== undefined })
      const fresh = client.getQueryData<Workspace>(workspaceKey)
      after = fresh ? appsOf(fresh, Date.now()) : before
      const failed = newlyFailed(before, after)
      // With Data sources open, the list shows the failure itself; closed by the time the run ends, a toast too.
      if (failed.length > 0 && !listOpen.current) {
        const names = failed.map(a => a.name)
        showSyncErrorToast(failureToastOf(failed, after), canReconnect ? { label: 'Reconnect', onClick: () => reconnect(names) } : null)
      }
    } finally {
      const end = Date.now()
      const baseline = baselineOf(before, before.map(a => a.name))
      setRefreshing(false)
      setRefreshedAt(end)
      setCooldowns(prev => ({ ...prev, ...Object.fromEntries(after.map(a => [a.name, end + SYNC_COOLDOWN_MS])) }))
      setSynced(prev => ({ ...prev, ...Object.fromEntries(after.map(a => [a.name, syncedAfter(a, baseline, start)])) }))
      setNow(end)
    }
  }, [refreshDisabled, client, workspaceKey, scopeKey, apps, canReconnect, reconnect])

  const isCooling = useCallback((app: string) => (cooldowns[app] ?? 0) > now, [cooldowns, now])
  const restHint = useCallback((app: string) => restHintOf(synced[app] === true, 'Sync'), [synced])

  /**
   * Sync from a banner or a row. The API can't start one app's sync yet (S8c), so today this reads those apps'
   * state and numbers again, like Refresh; the banner shows the run and then how the apps stand.
   */
  const syncApps = useCallback(async (names: string[]) => {
    const start = Date.now()
    const ready = names.filter(name => (cooldowns[name] ?? 0) <= start)
    const pending = activity !== null && activity.pending && isLive(activity, start)
    if (ready.length === 0 || !online || refreshing || pending) return
    const stale = client.getQueryData<Workspace>(workspaceKey)
    const before = stale ? appsOf(stale, start) : apps
    const run: Activity = { kind: 'sync', apps: ready, startedAt: start, pending: true, baseline: baselineOf(before, ready) }
    setActivity(run)
    try {
      await Promise.all([client.invalidateQueries({ queryKey: scopeKey }), wait(MIN_SYNCING_MS)])
    } finally {
      const end = Date.now()
      // Still syncing on the server, or synced since the click: the banner follows it. Anything else ends it here,
      // and the apps' problem banner says how they stand.
      const fresh = client.getQueryData<Workspace>(workspaceKey)
      const after = fresh ? appsOf(fresh, end) : []
      const done: Activity = { ...run, pending: false }
      const follow = busyAppsOf(done, after, end).length > 0 || activityBannerOf(done, after, end) !== null
      setCooldowns(prev => ({ ...prev, ...Object.fromEntries(ready.map(name => [name, end + SYNC_COOLDOWN_MS])) }))
      setSynced(prev => ({ ...prev, ...Object.fromEntries(ready.map(name => [name, after.some(a => a.name === name && syncedAfter(a, run.baseline, start))])) }))
      setActivity(prev => (prev?.startedAt === start ? (follow ? done : null) : prev))
      setNow(end)
    }
  }, [cooldowns, activity, online, refreshing, client, workspaceKey, scopeKey, apps])

  const dismissActivity = useCallback((source: 'sync' | 'reconnect', done?: string[]) => {
    if (source === 'sync') {
      setActivity(null)
      return
    }
    setStored(prev => {
      const left = prev ? prev.apps.filter(app => !(done ?? prev.apps).includes(app)) : []
      const next = prev && left.length > 0 ? { ...prev, apps: left } : null
      writeReconnectWatch(next)
      return next
    })
  }, [])

  // While you watch a sync or a Reconnect, the board shows its banner in place of those apps' problem banner.
  const activityBusy = useMemo(() => busyAppsOf(activity, apps, now), [activity, apps, now])
  const busy = useMemo(() => [...new Set([...busyAppsOf(watch, apps, now), ...activityBusy])], [watch, apps, now, activityBusy])
  // Offline nothing counts as syncing: the dot is grey and the rows keep their times (req. 23).
  const syncingNow = useMemo(
    () => (!online ? [] : refreshing ? apps.filter(a => a.state !== 'failed').map(a => a.name) : busy),
    [online, refreshing, apps, busy],
  )
  // The click time counts only while that Sync still works on the app, and not during a Refresh of everything.
  const syncStartedAt = !refreshing && activity !== null && activityBusy.length > 0 ? activity.startedAt : null
  const startedAtOf = useCallback(
    (app: string) => (syncStartedAt !== null && activityBusy.includes(app) ? syncStartedAt : undefined),
    [syncStartedAt, activityBusy],
  )

  const watchBanner = useMemo(() => activityBannerOf(watch, apps, now), [watch, apps, now])
  const syncBanner = useMemo(() => activityBannerOf(activity, apps, now), [activity, apps, now])
  // Once a reconnected app has synced, its trip is over: a later visit to the board doesn't say so again. Only the
  // apps in the green banner leave the stored watch; this visit keeps showing the banner for its 4 s.
  useEffect(() => {
    if (watchBanner?.kind !== 'synced' || !stored) return
    const left = stored.apps.filter(app => !watchBanner.apps.includes(app))
    writeReconnectWatch(left.length > 0 ? { ...stored, apps: left } : null)
  }, [watchBanner, stored])

  // A Sync that ended without a banner of its own (still behind, failed again) is over: forget it, so a later
  // server sync of the same app isn't shown as the one you started.
  if (activity !== null && !activity.pending && activityBusy.length === 0 && syncBanner === null) setActivity(null)

  const banners = useMemo(
    () => visibleBannersOf(online, bannersOf(apps.filter(a => !busy.includes(a.name)), { role, now }), [watchBanner, syncBanner]),
    [online, apps, busy, role, now, watchBanner, syncBanner],
  )

  // The footer counts the apps you're syncing as syncing, like their rows.
  const footerApps = useMemo(
    () => apps.map(a => (syncingNow.includes(a.name) ? { ...a, state: 'syncing' as const } : a)),
    [apps, syncingNow],
  )
  const footerState = footerApps.some(a => a.state === 'failed') ? 'failed' : footerApps.some(a => a.state === 'behind') ? 'behind' : 'fine'

  const value = useMemo<SyncStatus>(() => ({
    ready: workspace.data !== undefined,
    apps,
    online,
    now,
    role,
    canReconnect,
    dot: dotOf(apps, online),
    hover: syncingNow.length > 0 ? 'Syncing…' : hoverOf(apps, online, now),
    footer: footerOf(footerApps, now, { startedAt: syncStartedAt ?? undefined }),
    footerState,
    footerSyncing: online && footerSyncingOf(footerApps),
    banners,
    scope,
    setScope,
    refreshing,
    refreshHint,
    refreshDisabled,
    syncingNow,
    startedAtOf,
    syncPending,
    syncApps,
    isCooling,
    restHint,
    dismissActivity,
    reconnect,
    refresh,
    setListOpen,
    reconnectHref,
    logoOf,
  }), [
    workspace.data, apps, online, now, role, canReconnect, syncingNow, footerApps, syncStartedAt, footerState, banners,
    scope, refreshing, refreshHint, refreshDisabled, startedAtOf, syncPending, syncApps, isCooling, restHint,
    dismissActivity, reconnect, refresh, setListOpen, logoOf,
  ])

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}

/** A fixed status, for tests and playgrounds. */
export function SyncStatusValueProvider({ value, children }: { value: SyncStatus; children: ReactNode }) {
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}

/** The board's sync status; null outside a `SyncStatusProvider`. */
export function useSyncStatus(): SyncStatus | null {
  return useContext(SyncContext)
}

export interface CardSync {
  /** The card's dot: red or amber when an app it reads failed or is behind. */
  dot: 'failed' | 'behind' | null
  hover: string | null
  /** An app the card reads is syncing: its number shimmers. */
  syncing: boolean
  /** Every app the card reads is on its first sync: the card shows the loading skeleton. */
  firstSync: boolean
}

/** What a card shows about the apps it reads, from the warehouse areas its metric comes from. */
export function useCardSync(categories: readonly string[]): CardSync {
  const sync = useSyncStatus()
  return useMemo(() => {
    if (!sync || !sync.online) return { dot: null, hover: null, syncing: false, firstSync: false }
    const apps = appsForCategories(sync.apps, categories)
    const flag = cardHoverOf(apps, sync.now)
    return {
      dot: flag?.state ?? null,
      hover: flag?.text ?? null,
      syncing: apps.some(a => a.state === 'syncing' || sync.syncingNow.includes(a.name)),
      firstSync: apps.length > 0 && apps.every(a => a.state === 'first_sync'),
    }
  }, [sync, categories])
}
