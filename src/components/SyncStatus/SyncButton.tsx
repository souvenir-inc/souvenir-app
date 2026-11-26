'use client'

import { useId, useRef, useState } from 'react'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { Plug, TriangleAlert } from 'lucide-react'
import { ConnectorGlyph } from '@/components/ConnectorGlyph'
import { Spinner } from '@/components/Spinner'
import { Tooltip } from '@/components/Tooltip'
import { rowStatusOf, VISIBLE_ROWS, type AppSync } from '@/lib/warehouse/sync'
import { RotateCwClock } from './RotateCwClock'
import { useSyncStatus, type SyncStatus } from './SyncStatusProvider'
import styles from './SyncStatus.module.css'

const ROW_HEIGHT = 36
/** The sync button's id: the banners hand focus back to it when the last banner goes. */
export const SYNC_BUTTON_ID = 'sync-status-button'

const DOT_LABEL: Record<string, string> = {
  up_to_date: 'Up to date', behind: 'Out of date', failed: 'Sync failed', syncing: 'Syncing', offline: 'Offline', none: 'No apps',
}

/**
 * The board header's sync button (D41, D42): an icon button whose dot shows the worst state among the board's
 * apps. Hover says the state and the time; a click opens Data sources. Data sources is a popover, not a menu,
 * so Tab moves through Reconnect, the rows' Sync and Refresh.
 */
export function SyncButton() {
  const sync = useSyncStatus()
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  if (!sync || !sync.ready) return null

  // Offline the dot is grey, whatever was running when the connection went (req. 23).
  const spinning = sync.online && (sync.refreshing || sync.dot === 'syncing' || sync.syncingNow.length > 0)
  const showDot = !spinning && sync.dot !== 'none'
  const onOpenChange = (next: boolean) => {
    setOpen(next)
    sync.setListOpen(next)
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {/* The hover steps aside while the panel is open (a tooltip already showing would otherwise stay on top). */}
      <Tooltip content={sync.hover} side="bottom" align="end" open={open ? false : undefined}>
        <PopoverPrimitive.Trigger asChild>
          <button
            id={SYNC_BUTTON_ID}
            type="button"
            className={styles.button}
            data-open={open || undefined}
            aria-label={`Data sources: ${DOT_LABEL[sync.dot]}`}
            aria-busy={spinning}
          >
            {spinning ? <Spinner size={16} className={styles.buttonSpinner} /> : <RotateCwClock size={16} strokeWidth={2.25} />}
            {showDot && <span className={styles.buttonDot} data-state={sync.dot} aria-hidden />}
          </button>
        </PopoverPrimitive.Trigger>
      </Tooltip>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="end"
          side="bottom"
          sideOffset={8}
          collisionPadding={16}
          aria-label="Data sources"
          style={{ zIndex: 50, outline: 'none' }}
          ref={panelRef}
          // Opening puts focus on the panel itself, not its first button: a focused plug would show its "Reconnect"
          // hover over the next row. Tab still goes straight to the plugs, the rows' Sync and Refresh.
          onOpenAutoFocus={event => {
            event.preventDefault()
            panelRef.current?.focus({ preventScroll: true })
          }}
        >
          <DataSources sync={sync} />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

/**
 * A row's Sync goes when its app stops being behind (a sync that worked, or one the server took up). If it had the
 * keyboard focus, the focus moves to the panel instead of falling to the page (the panel doesn't trap focus).
 */
function keepPanelFocus(node: HTMLElement | null) {
  if (!node) return
  const panel = node.closest<HTMLElement>('[role="dialog"]')
  return () => {
    if (node.contains(document.activeElement)) panel?.focus({ preventScroll: true })
  }
}

/** This board's apps, problems first, each with its time; Refresh reads every app again. */
export function DataSources({ sync }: { sync: SyncStatus }) {
  const scrolls = sync.apps.length > VISIBLE_ROWS
  const [atEnd, setAtEnd] = useState(false)
  const refreshReasonId = useId()
  const refreshReason = sync.refreshDisabled ? sync.refreshHint : null

  return (
    <div className={styles.panel}>
      <div className={styles.heading}>
        Data sources
        <span className={styles.count}>{sync.apps.length}</span>
      </div>
      {sync.apps.length === 0 ? (
        <p className={styles.empty}>No apps yet</p>
      ) : (
        <ul
          className={styles.list}
          data-scrolls={(scrolls && !atEnd) || undefined}
          style={{ maxHeight: scrolls ? VISIBLE_ROWS * ROW_HEIGHT : undefined }}
          // A list that scrolls takes focus, so the keyboard can reach the rows past the fifth (Safari won't on its own).
          tabIndex={scrolls ? 0 : undefined}
          aria-label={scrolls ? 'Apps' : undefined}
          onScroll={event => {
            const el = event.currentTarget
            setAtEnd(el.scrollTop + el.clientHeight >= el.scrollHeight - 1)
          }}
        >
          {sync.apps.map(app => (
            <li key={app.name} className={styles.row}>
              <ConnectorGlyph slug={app.slug ?? app.name.toLowerCase()} name={app.name} logoUrl={sync.logoOf(app)} size={16} />
              <span className={styles.rowName}>{app.name}</span>
              {app.state === 'failed' && sync.canReconnect && (
                <Tooltip content={`Reconnect ${app.name}`} side="bottom" align="center">
                  <button type="button" className={styles.rowAction} aria-label={`Reconnect ${app.name}`} onClick={() => sync.reconnect([app.name])}>
                    <Plug size={14} strokeWidth={2.5} aria-hidden />
                  </button>
                </Tooltip>
              )}
              {/* Stays mounted while it runs (greyed), so the keyboard focus on it isn't lost. */}
              {app.state === 'behind' && <RowSync app={app} sync={sync} />}
              <span className={styles.rowSpacer} />
              <RowStatus app={app} sync={sync} />
            </li>
          ))}
        </ul>
      )}
      <div className={styles.divider} />
      <div className={styles.footer}>
        {/*
          Greyed with aria-disabled, not disabled: the button keeps the keyboard focus in every state and its hover
          says why it's greyed (rule 18), so nothing remounts or toggles focusability as it runs and rests.
        */}
        <Tooltip content={sync.refreshHint ?? ''} disabled={!sync.refreshHint} side="bottom" align="start">
          <button
            type="button"
            className={styles.refresh}
            aria-disabled={sync.refreshDisabled || undefined}
            aria-describedby={refreshReason ? refreshReasonId : undefined}
            // Greyed: nothing runs, and preventDefault keeps the hover open (Radix would close it on the click).
            onClick={event => {
              if (sync.refreshDisabled) { event.preventDefault(); return }
              void sync.refresh()
            }}
          >
            {sync.refreshing && sync.online
              ? <Spinner size={14} className={styles.spinner} />
              : <RotateCwClock size={14} strokeWidth={2.5} />}
            Refresh
          </button>
        </Tooltip>
        {/* Why it's greyed, always there for screen readers (the hover closes when focus moves). */}
        {refreshReason && <span id={refreshReasonId} className={styles.srOnly}>{refreshReason}</span>}
        <span className={styles.footerText} data-state={sync.footerState}>
          {sync.footerSyncing && <Spinner size={12} className={styles.spinner} />}
          {sync.footer}
        </span>
      </div>
    </div>
  )
}

/** A behind app's own Sync, right after its name: syncs that app only. Greyed controls say why (rule 18). */
function RowSync({ app, sync }: { app: AppSync; sync: SyncStatus }) {
  const reasonId = useId()
  const running = sync.syncingNow.includes(app.name) || sync.syncPending
  const cooling = sync.isCooling(app.name)
  const disabled = !sync.online || sync.refreshing || running || cooling
  const hint = !sync.online
    ? 'Offline • Sync once you’re back online'
    : sync.refreshing ? 'Refreshing… • Sync once the refresh finishes'
    : running ? 'Syncing… • Sync once the current sync finishes'
    : cooling ? sync.restHint(app.name)
    : `Sync ${app.name}`
  return (
    <span ref={keepPanelFocus} className={styles.rowActionWrap}>
      <Tooltip content={hint} side="bottom" align="center">
        {/* Greyed with aria-disabled: still focusable, so the keyboard keeps its place and the hover says why. */}
        <button
          type="button"
          className={styles.rowAction}
          aria-label={`Sync ${app.name}`}
          aria-disabled={disabled || undefined}
          aria-describedby={disabled ? reasonId : undefined}
          // Greyed: nothing runs, and preventDefault keeps the hover open (Radix would close it on the click).
          onClick={event => {
            if (disabled) { event.preventDefault(); return }
            void sync.syncApps([app.name])
          }}
        >
          <RotateCwClock size={14} strokeWidth={2.5} />
        </button>
      </Tooltip>
      {disabled && <span id={reasonId} className={styles.srOnly}>{hint}</span>}
    </span>
  )
}

function RowStatus({ app, sync }: { app: AppSync; sync: SyncStatus }) {
  // Syncing because you asked (a Sync, a Reconnect, or Refresh): the row spins until the run is back, and says
  // "Still syncing…" once a Sync you started passes 10 minutes.
  if (sync.syncingNow.includes(app.name)) {
    return (
      <span className={styles.rowStatus} data-state="syncing">
        <Spinner size={12} className={styles.spinner} />
        {rowStatusOf({ ...app, state: 'syncing' }, sync.now, sync.startedAtOf(app.name))}
      </span>
    )
  }
  const text = rowStatusOf(app, sync.now)
  if (app.state === 'failed') {
    const member = sync.role === 'member'
    const status = (
      <span className={styles.rowStatus} data-state="failed" tabIndex={member ? 0 : undefined}>
        <TriangleAlert size={14} strokeWidth={2.5} aria-hidden />
        {text}
      </span>
    )
    // A member has no plug; the status says who can fix it.
    return member ? <Tooltip content="Only admins can reconnect apps" side="bottom" align="end">{status}</Tooltip> : status
  }
  const spinning = (app.state === 'syncing' || app.state === 'first_sync') && sync.online
  return (
    <span className={styles.rowStatus} data-state={app.state}>
      {spinning && <Spinner size={12} className={styles.spinner} />}
      {text}
    </span>
  )
}
