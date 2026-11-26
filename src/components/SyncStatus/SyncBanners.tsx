'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Check, Plug, TriangleAlert, X } from 'lucide-react'
import { Spinner } from '@/components/Spinner'
import { Tooltip } from '@/components/Tooltip'
import { SYNCED_BANNER_MS, isClosed, type Banner } from '@/lib/warehouse/sync'
import { RotateCwClock } from './RotateCwClock'
import { Segments } from './Segments'
import { SYNC_BUTTON_ID } from './SyncButton'
import { useSyncStatus, type SyncStatus } from './SyncStatusProvider'
import styles from './SyncStatus.module.css'

const STORAGE_PREFIX = 'sync-banners-closed:'

/** Closed banners, per board, by signature: a banner comes back only when what it's about changes. */
function readClosed(key: string): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.sessionStorage.getItem(key)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function useClosed(scope: string): [Set<string>, (signature: string) => void] {
  const key = STORAGE_PREFIX + scope
  // Banners only draw once the workspace has loaded in the browser, so reading storage on the first render
  // can't differ from the server's (empty) render.
  const [state, setState] = useState(() => ({ key, closed: readClosed(key) }))
  const closed = state.key === key ? state.closed : readClosed(key)
  const close = useCallback((signature: string) => {
    setState(prev => {
      const next = new Set(prev.key === key ? prev.closed : readClosed(key)).add(signature)
      try { window.sessionStorage.setItem(key, JSON.stringify([...next])) } catch { /* the banner still closes for this visit */ }
      return { key, closed: next }
    })
  }, [key])
  return [closed, close]
}

/**
 * The board's banners (D48, D55, req. 12–18): red (failed) above what you started (grey while it syncs, green when
 * it's done) above amber (behind). Each has one action and its own ×. Offline, the bar above the window replaces
 * them.
 *
 * Closed banners are kept per board: the board sets its id with `setScope`; until it does, `fallbackScope`.
 * × on a grey banner hides it while the sync runs on; × on a green one (or its 4 s) clears what you started.
 *
 * When an action or × removes the banner that had keyboard focus, focus moves to the next banner (the grey one a
 * Sync just started, first), or back to the sync button when none is left.
 */
export function SyncBanners({ fallbackScope = 'board' }: { fallbackScope?: string }) {
  const sync = useSyncStatus()
  const [closed, close] = useClosed(sync?.scope ?? fallbackScope)
  const containerRef = useRef<HTMLDivElement>(null)
  const refocus = useRef(false)
  // Only keyboard focus is moved on. In Chrome a mouse click focuses the button too, but a mouse user's focus
  // shouldn't jump into another banner (where it would also hold a green banner open).
  const keepFocus = useCallback((row: HTMLElement | null) => {
    if (row?.contains(document.activeElement) && isKeyboardFocus(document.activeElement)) refocus.current = true
  }, [])
  // The banner element that last had focus. A banner that goes by itself (a sync ends, a problem clears) takes it
  // out of the page, and the effect below moves focus on. Tabbing or clicking away clears it: the focusout's target
  // is still in the page a tick later (a removed one isn't, though Chrome fires focusout for both).
  const lastFocused = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const onIn = (event: FocusEvent) => {
      const target = event.target as HTMLElement
      lastFocused.current = containerRef.current?.contains(target) && isKeyboardFocus(target) ? target : null
    }
    const onOut = (event: FocusEvent) => {
      const target = event.target as HTMLElement
      if (event.relatedTarget || lastFocused.current !== target) return
      window.setTimeout(() => { if (target.isConnected && lastFocused.current === target) lastFocused.current = null }, 0)
    }
    document.addEventListener('focusin', onIn)
    document.addEventListener('focusout', onOut)
    return () => { document.removeEventListener('focusin', onIn); document.removeEventListener('focusout', onOut) }
  }, [])
  useEffect(() => {
    const lost = lastFocused.current !== null && !lastFocused.current.isConnected
    if (!refocus.current && !lost) return
    refocus.current = false
    const active = document.activeElement
    if (active && active !== document.body) return
    lastFocused.current = null
    const next = containerRef.current?.querySelector<HTMLElement>('[data-activity] button:not(:disabled)')
      ?? containerRef.current?.querySelector<HTMLElement>('button:not(:disabled)')
      ?? document.getElementById(SYNC_BUTTON_ID)
    next?.focus()
  })

  if (!sync || !sync.ready) return null
  const shown = sync.banners.filter(b => !isClosed(b, closed))
  if (shown.length === 0) return null
  return (
    <div className={styles.banners} ref={containerRef}>
      {shown.map(banner => {
        if (banner.kind === 'syncing' || banner.kind === 'synced') {
          const source = banner.source ?? 'sync'
          // × on the grey banner hides it while the sync runs on; the green one is the end, so × clears it.
          const onClose = banner.kind === 'synced' ? () => sync.dismissActivity(source, banner.apps) : () => close(banner.signature)
          // One key from grey to green: the row stays mounted, so its live region announces the result, a resting
          // pointer keeps it open, and focus on its × isn't lost.
          return <ActivityRow key={`activity:${source}`} banner={banner} onClose={onClose} keepFocus={keepFocus} />
        }
        return (
          <BannerRow
            key={banner.kind}
            banner={banner}
            action={actionOf(banner, sync)}
            onClose={() => close(banner.signature)}
            keepFocus={keepFocus}
          />
        )
      })}
    </div>
  )
}

/** Focus the keyboard put there (`:focus-visible`), not the focus Chrome gives a clicked button. */
function isKeyboardFocus(element: Element | null): boolean {
  try {
    return !!element?.matches(':focus-visible')
  } catch {
    return true
  }
}

type Action = { label: 'Reconnect' | 'Sync'; onClick: () => void; disabled?: boolean; hint?: string }

function actionOf(banner: Banner, sync: SyncStatus): Action | null {
  if (banner.kind === 'failed') return sync.canReconnect ? { label: 'Reconnect', onClick: () => sync.reconnect(banner.apps) } : null
  // Behind: "Sync" whatever the number of apps; it syncs only the apps that are behind (D54). Anyone can sync.
  const ready = banner.apps.filter(app => !sync.isCooling(app))
  // A greyed Sync says why, and when it's back (rule 18).
  const hint = sync.refreshing ? 'Refreshing… • Sync once the refresh finishes'
    : sync.syncPending ? 'Syncing… • Sync once the current sync finishes'
    : ready.length === 0 ? sync.restHint(banner.apps[0])
    : undefined
  return { label: 'Sync', onClick: () => { if (hint === undefined) void sync.syncApps(ready) }, disabled: hint !== undefined, hint }
}

function BannerRow({ banner, action, onClose, keepFocus }: {
  banner: Banner
  action: Action | null
  onClose: () => void
  keepFocus: (row: HTMLElement | null) => void
}) {
  const rowRef = useRef<HTMLDivElement>(null)
  const reasonId = useId()
  const reason = action?.disabled ? action.hint : undefined
  const button = action && (
    <button
      type="button"
      className={styles.bannerAction}
      // Greyed: nothing runs, and preventDefault keeps the hover open (Radix would close it on the click).
      onClick={event => {
        if (action.disabled) { event.preventDefault(); return }
        keepFocus(rowRef.current)
        action.onClick()
      }}
      aria-disabled={action.disabled || undefined}
      aria-describedby={reason ? reasonId : undefined}
    >
      {action.label === 'Reconnect'
        ? <Plug size={14} strokeWidth={2.5} aria-hidden />
        : <RotateCwClock size={14} strokeWidth={2.5} />}
      {action.label}
    </button>
  )
  return (
    <div className={styles.banner} data-kind={banner.kind} role="status" ref={rowRef}>
      {banner.kind === 'failed'
        ? <TriangleAlert size={14} strokeWidth={2.5} className={styles.bannerIcon} aria-hidden />
        : <RotateCwClock size={14} strokeWidth={2.5} className={styles.bannerIcon} />}
      <p className={styles.bannerText}><Segments segments={banner.segments} /></p>
      {/* The same tree whether greyed or not; greyed with aria-disabled, so it keeps focus and its hover says why. */}
      {button && (
        <Tooltip content={action?.hint ?? ''} disabled={!action?.hint} side="bottom" align="end">
          {button}
        </Tooltip>
      )}
      {/* Why it's greyed, always there for screen readers (the hover closes when focus moves). */}
      {reason && <span id={reasonId} className={styles.srOnly}>{reason}</span>}
      <button type="button" className={styles.bannerClose} aria-label="Close" onClick={() => { keepFocus(rowRef.current); onClose() }}>
        <X size={14} strokeWidth={2.5} aria-hidden />
      </button>
    </div>
  )
}

/**
 * Grey while what you started runs; green when it's done, which hides after 4 s and stays while hovered or while
 * the keyboard is on it.
 */
function ActivityRow({ banner, onClose, keepFocus }: {
  banner: Banner
  onClose: () => void
  keepFocus: (row: HTMLElement | null) => void
}) {
  const rowRef = useRef<HTMLDivElement>(null)
  const done = banner.kind === 'synced'
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  // The latest close, so the board re-rendering doesn't restart the 4 s.
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose })
  useEffect(() => {
    if (!done || hovered || focused) return
    const id = window.setTimeout(() => { keepFocus(rowRef.current); closeRef.current() }, SYNCED_BANNER_MS)
    return () => window.clearTimeout(id)
  }, [done, hovered, focused, keepFocus])
  return (
    <div
      ref={rowRef}
      className={styles.banner}
      data-kind={banner.kind}
      data-activity=""
      role="status"
      aria-live="polite"
      aria-atomic="true"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      // Keyboard focus pauses the 4 s; focus that followed a mouse click (Chrome) doesn't.
      onFocus={event => setFocused(isKeyboardFocus(event.target as Element))}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false) }}
    >
      {done
        ? <Check size={14} strokeWidth={2.5} className={styles.bannerIcon} aria-hidden />
        : <Spinner size={14} className={styles.bannerSpinner} />}
      <p className={styles.bannerText}><Segments segments={banner.segments} /></p>
      <button type="button" className={styles.bannerClose} aria-label="Close" onClick={() => { keepFocus(rowRef.current); onClose() }}>
        <X size={14} strokeWidth={2.5} aria-hidden />
      </button>
    </div>
  )
}
