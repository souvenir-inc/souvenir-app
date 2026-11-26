'use client'

import { Plug, TriangleAlert } from 'lucide-react'
import { PopoverContent, PopoverRoot, PopoverTrigger } from '@/components/Popover'
import { Tooltip } from '@/components/Tooltip'
import { cn } from '@/lib/utils'
import { RotateCwClockIcon, SourceLogo } from '../icons'
import { useDashboardData } from '../live/dashboard-data'
import type { AppId } from '../types'
import { ago, buttonState, footerText, hoverText, sortApps, type AppState, type ButtonState } from './sync-model'
import { blockedReason, reconnect, refreshAll, refreshRunning, syncApps, useSyncSnapshot } from './sync-store'
import { Spinner } from './Spinner'

// The sync button and Data sources (Figma 95:18703; 04-sync-rules.md SY-1 – SY-12, SY-25).

const FOCUS = 'outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]'

const DOT: Partial<Record<ButtonState, string>> = {
  fresh: 'bg-[var(--dashboard-sync-fresh)]',
  behind: 'bg-[var(--dashboard-sync-behind)]',
  failed: 'bg-[var(--dashboard-sync-failed)]',
  offline: 'bg-[var(--dashboard-sync-offline)]',
}
const STATE_WORDS: Record<ButtonState, string> = {
  none: 'no apps on this board yet',
  offline: 'offline',
  failed: 'an app failed to sync',
  behind: 'an app is behind',
  syncing: 'syncing',
  fresh: 'all apps up to date',
}
const TONE = {
  muted: 'font-normal text-[var(--dashboard-muted)]',
  behind: 'font-medium text-[var(--dashboard-sync-behind)]',
  failed: 'font-medium text-[var(--dashboard-sync-failed)]',
}

const ROW_ACTION = cn(
  'flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-[var(--dashboard-sync-bg)] p-0 text-[var(--dashboard-sync-icon)]',
  'transition-colors duration-fast hover:bg-[var(--dashboard-tabs-track)] disabled:cursor-default disabled:opacity-50',
  FOCUS,
)

interface SyncButtonProps {
  /** The apps this board's cards read (SY-1), with how many cards read each (SY-6). */
  apps: AppId[]
  uses: Partial<Record<AppId, number>>
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SyncButton({ apps: ids, uses, open, onOpenChange }: SyncButtonProps) {
  const s = useSyncSnapshot()
  const { apps } = useDashboardData()
  const now = s.now
  const state = buttonState(ids, s.apps, s.online)
  const hover = hoverText(ids, s.apps, now, s.online, s.offlineSince)
  const blocked = blockedReason(s, now)
  const footer = footerText(ids, s.apps, now, refreshRunning(s))
  const rows = sortApps(ids, s.apps, uses, (id) => apps.rank(id))
  const refreshTip =
    blocked === 'cooldown' ? 'Synced just now • Refresh again in a minute'
    : blocked === 'offline' ? 'Refresh waits for the connection'
    : null

  return (
    <PopoverRoot open={open} onOpenChange={onOpenChange}>
      <Tooltip content={hover} side="bottom" disabled={open}>
        <PopoverTrigger asChild>
          {/* eslint-disable-next-line no-restricted-syntax -- ds-allow: a 32px status button with a dot on its edge and an open (white + border) state IconButton doesn't have */}
          <button
            type="button"
            data-sync-state={state}
            aria-label={`Data sources: ${STATE_WORDS[state]}`}
            className={cn(
              'relative flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-solid transition-colors duration-fast',
              open
                ? 'border-[var(--border-default)] bg-[var(--dashboard-card-bg)] text-[var(--dashboard-figure)] shadow-[var(--dashboard-control-shadow)]'
                : 'border-transparent bg-[var(--dashboard-sync-bg)] text-[var(--dashboard-sync-icon)] hover:bg-[var(--dashboard-tabs-track)]',
              FOCUS,
            )}
          >
            {/* Syncing: a spinner takes the icon's place and the dot goes (SY-2). */}
            {state === 'syncing'
              ? <Spinner size={14} />
              : <RotateCwClockIcon aria-hidden size={16} strokeWidth={1.5} absoluteStrokeWidth />}
            {DOT[state] && (
              <span aria-hidden data-sync-dot className={cn('pointer-events-none absolute -right-px -top-px size-2.5 rounded-full shadow-[0_0_0_2px_var(--dashboard-panel-bg)]', DOT[state])} />
            )}
          </button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent
        side="bottom" align="end" sideOffset={6} collisionPadding={8} variant="dropdown" maxHeight={false}
        aria-label="Data sources"
        style={{ width: 320, maxWidth: 'calc(100vw - 16px)', boxShadow: 'var(--dashboard-popover-shadow)' }}
      >
        <div className="flex flex-col p-1.5">
          <div className="flex items-center gap-1.5 px-2.5 pb-1 pt-2">
            <span className="text-[length:var(--font-size-small)] font-medium leading-4 text-[var(--neutral-700)]">Data sources</span>
            <span className="flex h-[18px] items-center rounded-full bg-[var(--dashboard-sync-bg)] px-1.5 text-[length:var(--font-size-caption)] font-medium leading-[var(--dashboard-tag-line-height)] text-[var(--neutral-700)]">
              {ids.length}
            </span>
          </div>
          {ids.length === 0 ? (
            <p className="m-0 px-2.5 py-2 text-[length:var(--font-size-body-sm)] leading-5 text-[var(--dashboard-muted)]">No apps on this board yet. Add a card to use one.</p>
          ) : (
            <AppList ids={rows} blocked={blocked} />
          )}
          <div className="px-1 py-1.5"><div className="h-px bg-[var(--neutral-200)]" /></div>
          <div className="flex items-center justify-between gap-3 pb-1 pl-1 pr-2.5 pt-0.5">
            <Tooltip content={refreshTip} disabled={!refreshTip} side="bottom" align="start">
              {/* The tooltip needs a hoverable box: a disabled button gets no pointer events. */}
              <span className="inline-flex rounded-full" tabIndex={blocked ? 0 : -1}>
                {/* eslint-disable-next-line no-restricted-syntax -- ds-allow: the outlined Refresh pill of Figma 123:20854 (white, hairline ring, 13px Geist) */}
                <button
                  type="button"
                  onClick={() => { void refreshAll() }}
                  disabled={blocked !== null}
                  className={cn(
                    'flex h-8 cursor-pointer items-center gap-1.5 rounded-full border-0 bg-[var(--dashboard-card-bg)] pl-2.5 pr-3.5 text-[length:var(--font-size-body-sm)] font-medium leading-5 text-[var(--dashboard-figure)]',
                    'shadow-[var(--dashboard-control-shadow)] transition-[background-color,opacity] duration-fast hover:bg-[var(--neutral-100)]',
                    'disabled:pointer-events-none disabled:opacity-50',
                    FOCUS,
                  )}
                >
                  <RotateCwClockIcon aria-hidden size={14} strokeWidth={1.5} absoluteStrokeWidth />
                  Refresh
                </button>
              </span>
            </Tooltip>
            <span aria-live="polite" data-sync-footer className={cn('truncate text-[length:var(--font-size-small)] leading-4', TONE[footer.tone])}>{footer.text}</span>
          </div>
        </div>
      </PopoverContent>
    </PopoverRoot>
  )
}

/** The first 5 apps, then a scroll with a fade over the fifth and a thin bar (SY-6). */
function AppList({ ids, blocked }: { ids: AppId[]; blocked: ReturnType<typeof blockedReason> }) {
  const more = ids.length > 5
  return (
    <div className="relative">
      <ul
        className={cn('m-0 list-none p-0', more && 'dashboard-thin-scroll max-h-[180px] overflow-y-auto')}
        aria-label="Apps on this board"
      >
        {ids.map((id) => <AppRow key={id} id={id} blocked={blocked} />)}
      </ul>
      {more && <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-b from-transparent to-[var(--dashboard-card-bg)]" />}
    </div>
  )
}

function AppRow({ id, blocked }: { id: AppId; blocked: ReturnType<typeof blockedReason> }) {
  const s = useSyncSnapshot()
  const now = s.now
  const a = s.apps[id]
  const state = a.state
  const name = a.name
  return (
    <li data-app-row={id} data-app-state={state} className="flex h-9 items-center gap-2.5 rounded-lg px-2.5">
      <SourceLogo app={{ id, slug: a.slug, name }} className="size-4 shrink-0" />
      <span className="min-w-0 truncate text-[length:var(--font-size-body-sm)] leading-5 text-[var(--dashboard-figure)]">{name}</span>
      {(state === 'behind' || (state === 'failed' && !a.needsReconnect)) && (
        <Tooltip content={blocked === 'cooldown' ? 'Synced just now • Sync again in a minute' : `Sync ${name} now`} side="top">
          <span className="inline-flex rounded-full">
            {/* eslint-disable-next-line no-restricted-syntax -- ds-allow: 24px round row action on the soft fill (Figma 123:20927) */}
            <button type="button" aria-label={`Sync ${name} now`} disabled={blocked !== null} onClick={() => { void syncApps([id]) }} className={ROW_ACTION}>
              <RotateCwClockIcon aria-hidden size={14} strokeWidth={1.5} absoluteStrokeWidth />
            </button>
          </span>
        </Tooltip>
      )}
      {state === 'failed' && a.needsReconnect && a.yours && (
        <Tooltip content={`Reconnect ${name}`} side="top">
          <span className="inline-flex rounded-full">
            {/* eslint-disable-next-line no-restricted-syntax -- ds-allow: 24px round row action on the soft fill (Figma 123:20845) */}
            <button type="button" aria-label={`Reconnect ${name}`} disabled={blocked === 'offline' || blocked === 'busy'} onClick={() => reconnect([id])} className={ROW_ACTION}>
              <Plug aria-hidden size={14} strokeWidth={1.5} absoluteStrokeWidth />
            </button>
          </span>
        </Tooltip>
      )}
      <span className="min-w-0 flex-1" />
      <RowStatus id={id} state={state} now={now} yours={a.yours} />
    </li>
  )
}

function RowStatus({ id, state, now, yours }: { id: AppId; state: AppState; now: number; yours: boolean }) {
  const s = useSyncSnapshot()
  const a = s.apps[id]
  const text = 'shrink-0 whitespace-nowrap text-[length:var(--font-size-small)] leading-4'
  switch (state) {
    case 'syncing':
    case 'first': {
      const label = state === 'first' ? 'First sync…' : a.slow ? 'Still syncing…' : 'Syncing…'
      return <span className={cn(text, 'flex items-center gap-1.5 text-[var(--dashboard-muted)]')}><Spinner />{label}</span>
    }
    case 'failed': {
      // Hover says what the provider said; someone else's account is reconnected by its owner (SY-25).
      const tip = [a.error, yours || !a.needsReconnect ? null : 'Only the person who connected it can reconnect it'].filter(Boolean).join(' • ')
      const status = (
        <span tabIndex={tip ? 0 : undefined} className={cn(text, 'flex items-center gap-[var(--space-1-25)] rounded-sm font-medium text-[var(--dashboard-sync-failed)]', tip && FOCUS)}>
          <TriangleAlert aria-hidden size={14} strokeWidth={1.5} absoluteStrokeWidth />{a.needsReconnect ? 'Reconnect needed' : 'Sync failed'}
        </span>
      )
      return tip ? <Tooltip content={tip} side="top" align="end">{status}</Tooltip> : status
    }
    case 'behind':
      return <span className={cn(text, 'font-medium text-[var(--dashboard-sync-behind)]')}>{a.syncedAt == null ? '' : ago(a.syncedAt, now)}</span>
    default:
      return <span className={cn(text, 'text-[var(--dashboard-muted)]')}>{a.syncedAt == null ? '' : ago(a.syncedAt, now)}</span>
  }
}
