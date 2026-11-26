'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { LayoutDashboard, RotateCw } from 'lucide-react'
import { WorkspaceEmpty } from '@/components/Dashboard'
import { SyncBanners, SyncButton, SyncStatusProvider, useSyncStatus } from '@/components/SyncStatus'
import { PeriodFilter } from '@/components/PeriodFilter'
import { HeaderSlotProvider, useHeaderSlotRef } from '@/components/Canvas/HeaderSlot'
import { useGuardedRouter } from '@/context/nav-guard-context'
import { useOrgIdentity } from '@/context/org-context'
import { ApiError } from '@/lib/api/client'
import { orgScope, queryKeys } from '@/lib/query-keys'
import { DASHBOARD_METRICS_ROUTE, DASHBOARD_ROUTE } from '@/lib/routes'
import { dataUntil, sourcesOf, storeDate } from '@/lib/warehouse/freshness'
import { useWorkspace } from '@/lib/warehouse/queries'
import styles from './DashboardShell.module.css'

// One metric's page (/dashboard/metrics/[name]) links back to the dashboard. The metric definitions live in
// Settings → Metrics, so the dashboard itself has no extra link.
function secondaryLink(pathname: string) {
  return pathname.startsWith(DASHBOARD_METRICS_ROUTE)
    ? { label: 'Dashboard', href: DASHBOARD_ROUTE, Icon: LayoutDashboard }
    : null
}

/**
 * The dashboard's header, one row (6D, D39). Left: the open page's own controls, put there through `HeaderSlot` (a
 * board's tabs). Right: the period every page reads, and on the boards what it's compared with (`PeriodFilter`; on a
 * metric's page, a link back to the dashboard first), then the sync button (D41, D42): its dot shows the worst state
 * among the apps, its hover the state and time, and a click opens Data sources with Refresh. Under the header, a banner
 * per kind of sync problem; a lost connection shows as the app-wide bar above the page (AppLayout). Figma: "Header ·
 * Tabs", "Header · Period filter (final, 19 Nov)", "Header · Sync button (final, 18 Nov)".
 */
export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <SyncStatusProvider>
      <HeaderSlotProvider>
        <Shell>{children}</Shell>
      </HeaderSlotProvider>
    </SyncStatusProvider>
  )
}

function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? DASHBOARD_ROUTE
  const { push } = useGuardedRouter()
  const client = useQueryClient()
  const { orgId } = useOrgIdentity()
  const [refreshing, setRefreshing] = useState(false)
  const workspace = useWorkspace()
  const link = secondaryLink(pathname)
  const offline = useSyncStatus()?.online === false
  const slotRef = useHeaderSlotRef()
  // Whether the page has scrolled under the header, for the fade below it. The page scrolls in the app's panel.
  const headerRef = useRef<HTMLElement>(null)
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const scroller = headerRef.current?.closest('main')
    if (!scroller) return
    const onScroll = () => setScrolled(scroller.scrollTop > 0)
    onScroll()
    scroller.addEventListener('scroll', onScroll, { passive: true })
    return () => scroller.removeEventListener('scroll', onScroll)
  }, [])

  // When the workspace itself didn't load there's no sync button yet; this fetches everything again.
  const refresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      await client.invalidateQueries({ queryKey: queryKeys.warehouse.all(orgScope(orgId)) })
    } finally {
      setRefreshing(false)
    }
  }

  if (workspace.isError && workspace.error instanceof ApiError && workspace.error.status === 404) {
    return <div className={styles.page}><WorkspaceEmpty /></div>
  }

  const data = workspace.data
  const today = storeDate(new Date().toISOString(), data?.timezone ?? 'UTC')
  // Rolling periods end on each app's last synced day, card by card. The header's period moves only when every app is
  // behind: then it ends on the latest of their days ("7 days to 13 Nov").
  const synced = data ? sourcesOf(data).map(source => dataUntil(data, source.category)).filter((d): d is string => d !== null) : []
  const latest = synced.length > 0 ? synced.reduce((a, b) => (a > b ? a : b)) : null
  const everyAppBehind = latest !== null && latest < today ? latest : null

  return (
    <div className={styles.page}>
      <header ref={headerRef} className={styles.header} data-scrolled={scrolled || undefined}>
        <div className={styles.start}>
          <div ref={slotRef} className={styles.slot} />
          {workspace.isError && (
            <>
              <span className={styles.note}>Couldn&apos;t load your numbers.</span>
              <button
                type="button"
                className={styles.refresh}
                onClick={() => void refresh()}
                aria-label="Try again"
                title="Try again"
                aria-busy={refreshing}
                data-spinning={refreshing || undefined}
              >
                <RotateCw size={14} strokeWidth={1.75} aria-hidden />
              </button>
            </>
          )}
        </div>
        <div className={styles.end}>
          {link && (
            <a
              href={link.href}
              className={styles.navLink}
              onClick={event => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
                event.preventDefault()
                push(link.href)
              }}
            >
              <link.Icon size={14} strokeWidth={1.75} aria-hidden />
              {link.label}
            </a>
          )}
          <PeriodFilter
            today={today}
            until={everyAppBehind}
            // The first day with data isn't known yet (G11): the calendar's "before your data" days wait on it.
            dataFrom={null}
            withComparison={pathname === DASHBOARD_ROUTE}
            offline={offline}
          />
          <SyncButton />
        </div>
      </header>

      <SyncBanners fallbackScope={pathname} />

      {children}
    </div>
  )
}
