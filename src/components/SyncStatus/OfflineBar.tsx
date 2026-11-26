'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Check, WifiOff } from 'lucide-react'
import { Spinner } from '@/components/Spinner'
import { formatClock } from '@/lib/warehouse/sync'
import { useOnline, useShownDataFrom } from './connection'
import styles from './SyncStatus.module.css'

const BACK_ONLINE_MS = 3_000

/**
 * Losing the connection is shown for the whole app, on every page: a bar across the top of the window that can't
 * be closed (D61). Nothing turns red, and the cards keep their numbers. When the connection is back, "You’re back
 * online." for 3 seconds. On the dashboard it also says how old the numbers on screen are.
 *
 * The live region is always there (empty while online), so screen readers announce the bar when it appears.
 */
export function OfflineBar() {
  const online = useOnline()
  const shownFrom = useShownDataFrom()
  const [backOnline, setBackOnline] = useState(false)
  // Ticks while offline, so the time gains its date once the day changes (as the sync button's hover does).
  const [now, setNow] = useState(() => Date.now())

  // The browser's own online event marks the moment the connection came back.
  useEffect(() => {
    let id: number | undefined
    const on = () => {
      setBackOnline(true)
      window.clearTimeout(id)
      id = window.setTimeout(() => setBackOnline(false), BACK_ONLINE_MS)
    }
    const off = () => { window.clearTimeout(id); setBackOnline(false); setNow(Date.now()) }
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.clearTimeout(id); window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  useEffect(() => {
    if (online) return
    const id = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [online])

  return (
    <div className={styles.offlineRegion} role="status" aria-live="polite" aria-atomic="true">
      {!online ? (
        <div className={styles.offline}>
          <WifiOff size={14} strokeWidth={2.5} aria-hidden />
          <span>You’re offline.{shownFrom ? ` Showing data from ${formatClock(shownFrom, now)}.` : ''}</span>
          <span className={styles.offlineRetry}><Spinner size={12} className={styles.offlineSpinner} />Reconnecting…</span>
        </div>
      ) : backOnline ? (
        <div className={styles.offline} data-state="back">
          <Check size={14} strokeWidth={2.5} aria-hidden />
          <span>You’re back online.</span>
        </div>
      ) : null}
    </div>
  )
}

/**
 * The window with the offline bar across its top (Figma "window bar"): the bar, then the page, pushed down while
 * the bar shows. Used by every signed-in layout.
 *
 * - `scroll="frame"` (AppLayout): the frame is the window's height and the page fills it; the app scrolls inside
 *   its own panes.
 * - `scroll="document"` (standalone pages, onboarding): the page keeps its height and the document scrolls, as it
 *   did before the bar, so Space and PageDown work before any click. The bar sticks to the top.
 *
 * While the bar shows, a page that's 100vh tall scrolls by the bar's height.
 */
export function OfflineFrame({ children, scroll = 'frame' }: { children: ReactNode; scroll?: 'frame' | 'document' }) {
  return (
    <div className={scroll === 'document' ? `${styles.frame} ${styles.frameDocument}` : styles.frame}>
      <OfflineBar />
      <div className={styles.frameBody}>{children}</div>
    </div>
  )
}
