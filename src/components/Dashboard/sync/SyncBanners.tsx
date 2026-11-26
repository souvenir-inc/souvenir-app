'use client'

import { useEffect, useState } from 'react'
import { Plug, TriangleAlert, X } from 'lucide-react'
import { Tooltip } from '@/components/Tooltip'
import { cn } from '@/lib/utils'
import { RotateCwClockIcon } from '../icons'
import type { AppId } from '../types'
import { appNames, banners, clock, hoursSince, type Banner } from './sync-model'
import {
  blockedReason, dismissBanner, dismissRecent, reconnect, syncApps, useSyncSnapshot, type Recent,
} from './sync-store'
import { Spinner } from './Spinner'

// The board's sync banners (Figma 202:60604, 115:20386, 115:20736; SY-13 – SY-22): failed (red)
// above behind (amber), then the grey syncing one and the green synced one. They sit above the
// cards, stay in edit mode and while Data sources is open, and wrap on narrow windows.

const FOCUS = 'outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]'
const RECENT_SHOWN_MS = 10_000
const SYNCED_HIDES_AFTER = 4_000

const LOOK = {
  failed: 'border-[var(--dashboard-banner-failed-border)] bg-[var(--dashboard-banner-failed-bg)]',
  behind: 'border-[var(--dashboard-banner-behind-border)] bg-[var(--dashboard-banner-behind-bg)]',
  syncing: 'border-[var(--dashboard-banner-syncing-border)] bg-[var(--dashboard-banner-syncing-bg)]',
  synced: 'border-[var(--dashboard-banner-synced-border)] bg-[var(--dashboard-banner-synced-bg)]',
}

interface SyncBannersProps {
  boardId: string
  apps: AppId[]
}

export function SyncBanners({ boardId, apps: ids }: SyncBannersProps) {
  const s = useSyncSnapshot()
  const now = s.now
  const shown = banners(ids, s.apps, s.started).filter((b) => !s.dismissed.includes(`${boardId}|${b.key}`))
  const recent = s.recent.filter((r) => now - r.at < RECENT_SHOWN_MS && r.apps.some((id) => ids.includes(id)))
  if (!shown.length && !recent.length) return null
  return (
    <div data-sync-banners className="flex flex-col gap-2">
      {shown.map((b) => <ProblemBanner key={b.key} banner={b} boardId={boardId} />)}
      {recent.map((r) => <SyncedBanner key={r.id} recent={r} apps={r.apps.filter((id) => ids.includes(id))} />)}
    </div>
  )
}

function Shell({ kind, children, onClose, ...rest }: { kind: keyof typeof LOOK; children: React.ReactNode; onClose: () => void } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role={kind === 'failed' ? 'alert' : 'status'}
      data-sync-banner={kind}
      className={cn('flex min-h-11 items-center gap-2.5 rounded-lg border border-solid py-[var(--space-1-25)] pl-3.5 pr-2', LOOK[kind])}
      {...rest}
    >
      {children}
      {/* eslint-disable-next-line no-restricted-syntax -- ds-allow: the 28px round × of the sync banners (Figma 202:60612) */}
      <button
        type="button"
        aria-label="Hide this banner"
        onClick={onClose}
        className={cn('flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 text-[var(--dashboard-muted)] transition-colors duration-fast hover:bg-[var(--dashboard-row-hover)] hover:text-[var(--dashboard-figure)]', FOCUS)}
      >
        <X aria-hidden size={14} strokeWidth={1.5} absoluteStrokeWidth />
      </button>
    </div>
  )
}

/** "Meta Ads", "Shopify & Meta Ads", or "Meta Ads & 2 more apps" with the rest on hover (SY-17). */
function Names({ ids }: { ids: AppId[] }) {
  const s = useSyncSnapshot()
  const { lead, more, rest } = appNames(ids.map((id) => s.apps[id]?.name ?? 'An app'))
  if (!more) return <span className="font-medium">{lead}</span>
  return (
    <>
      <span className="font-medium">{lead}</span> &amp;{' '}
      <Tooltip content={rest} side="bottom">
        <span tabIndex={0} className={cn('cursor-default rounded-sm underline decoration-1 underline-offset-2', FOCUS)}>{more}</span>
      </Tooltip>
    </>
  )
}

const TEXT = 'min-w-0 flex-1 text-[length:var(--font-size-body-sm)] leading-5 text-[var(--dashboard-figure)]'

function ProblemBanner({ banner: b, boardId }: { banner: Banner; boardId: string }) {
  const s = useSyncSnapshot()
  const now = s.now
  const blocked = blockedReason(s, now)
  const one = b.apps.length === 1
  const close = () => dismissBanner(boardId, b.key)

  if (b.kind === 'syncing') {
    const these = one ? 'this app' : 'these apps'
    return (
      <Shell kind="syncing" onClose={close}>
        <Spinner size={14} />
        <p className={cn(TEXT, 'm-0')}>
          {b.long
              ? <><Names ids={b.apps} /> {one ? 'is' : 'are'} taking longer than usual. Cards using {these} refresh when done.</>
              : <>Syncing <Names ids={b.apps} />. Cards using {these} refresh when done.</>}
        </p>
      </Shell>
    )
  }

  if (b.kind === 'failed') {
    const oldest = s.apps[b.apps[0]].syncedAt
    const yours = b.apps.some((id) => s.apps[id].yours)
    // Only a refused sign-in needs Reconnect; any other failure is worth one more sync.
    const signIn = b.apps.some((id) => s.apps[id].needsReconnect)
    return (
      <Shell kind="failed" onClose={close}>
        <TriangleAlert aria-hidden size={14} strokeWidth={1.5} absoluteStrokeWidth className="shrink-0 text-[var(--dashboard-sync-failed)]" />
        <p className={cn(TEXT, 'm-0')}>
          {one
            ? <><Names ids={b.apps} /> sync failed. Showing data from {oldest == null ? 'its first sync' : clock(oldest)}.</>
            : <><Names ids={b.apps} /> failed to sync. Showing their last synced data.</>}
          {/* Someone else's account is reconnected by its owner (SY-25). */}
          {signIn && !yours && (one ? ' Only the person who connected it can reconnect it.' : ' Only the people who connected them can reconnect them.')}
        </p>
        {signIn && yours && (
          <BannerAction tone="failed" disabled={blocked === 'offline'} onClick={() => reconnect(b.apps)} icon={<Plug aria-hidden size={14} strokeWidth={1.5} absoluteStrokeWidth />}>
            Reconnect
          </BannerAction>
        )}
        {!signIn && (
          <BannerAction tone="failed" disabled={blocked !== null} onClick={() => { void syncApps(b.apps) }} icon={<RotateCwClockIcon aria-hidden size={14} strokeWidth={1.5} absoluteStrokeWidth />}>
            Try again
          </BannerAction>
        )}
      </Shell>
    )
  }

  const hours = hoursSince(s.apps[b.apps[0]].syncedAt, now)
  return (
    <Shell kind="behind" onClose={close}>
      <RotateCwClockIcon aria-hidden size={14} strokeWidth={1.5} absoluteStrokeWidth className="shrink-0 text-[var(--dashboard-sync-behind)]" />
      <p className={cn(TEXT, 'm-0')}>
        {one
          ? <><Names ids={b.apps} /> hasn’t synced in {hours} hour{hours === 1 ? '' : 's'}. Some data may be out of date.</>
          : <><Names ids={b.apps} /> haven’t synced in over 2 hours. Some data may be out of date.</>}
      </p>
      <BannerAction
        tone="behind" disabled={blocked !== null}
        tooltip={blocked === 'cooldown' ? 'Synced just now • Sync again in a minute' : null}
        onClick={() => { void syncApps(b.apps) }}
        icon={<RotateCwClockIcon aria-hidden size={14} strokeWidth={1.5} absoluteStrokeWidth />}
      >
        Sync
      </BannerAction>
    </Shell>
  )
}

function BannerAction({ tone, disabled, onClick, icon, tooltip = null, children }: {
  tone: 'failed' | 'behind'; disabled: boolean; onClick: () => void; icon: React.ReactNode; tooltip?: string | null; children: React.ReactNode
}) {
  return (
    <Tooltip content={tooltip} disabled={!tooltip} side="bottom">
      <span className="inline-flex shrink-0 rounded-md">
        {/* eslint-disable-next-line no-restricted-syntax -- ds-allow: the banner's text action in its own colour (Figma 202:60609) */}
        <button
          type="button"
          disabled={disabled}
          onClick={onClick}
          className={cn(
            'flex h-7 cursor-pointer items-center gap-1 rounded-md border-0 bg-transparent px-1.5 text-[length:var(--font-size-body-sm)] font-medium leading-5 transition-[background-color,opacity] duration-fast',
            'hover:bg-[var(--dashboard-row-hover)] disabled:pointer-events-none disabled:opacity-50',
            tone === 'failed' ? 'text-[var(--dashboard-sync-failed)]' : 'text-[var(--dashboard-sync-behind)]',
            FOCUS,
          )}
        >
          {icon}{children}
        </button>
      </span>
    </Tooltip>
  )
}

/** Green, then gone after 4 s; stays while hovered; × sooner (SY-19). */
function SyncedBanner({ recent, apps }: { recent: Recent; apps: AppId[] }) {
  const [hovered, setHovered] = useState(false)
  useEffect(() => {
    if (hovered) return
    const t = window.setTimeout(() => dismissRecent(recent.id), SYNCED_HIDES_AFTER)
    return () => window.clearTimeout(t)
  }, [hovered, recent.id])
  return (
    <Shell kind="synced" onClose={() => dismissRecent(recent.id)} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <RotateCwClockIcon aria-hidden size={14} strokeWidth={1.5} absoluteStrokeWidth className="shrink-0 text-[var(--dashboard-sync-fresh)]" />
      <p className={cn(TEXT, 'm-0')}>
        <Names ids={apps} /> synced just now. Data is up to date.
      </p>
    </Shell>
  )
}
