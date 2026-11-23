'use client'

import { useState } from 'react'
import { Calendar, ChevronDown } from 'lucide-react'
import { Dropdown } from '@/components/Dropdown'
import { PopoverContent, PopoverRoot, PopoverTrigger } from '@/components/Popover'
import { Tooltip } from '@/components/Tooltip'
import { cn } from '@/lib/utils'
import { RotateCwClockIcon, SOURCE_NAMES, SourceLogo } from './icons'
import { COMPARISONS, PERIODS, type SyncStatus } from './mock-data'
import { PersonAvatar } from './tabs/BoardMenus'
import type { Person } from './tabs/board-state'
import type { MetricSource } from './types'

// The right side of the board panel's header (Figma 17:889, 6D 73:20404): who shared the board,
// the period menu, and the sync button with Data sources. The tab row on the left is tabs/TabRow.

const FOCUS = 'outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]'

interface PeriodMenuProps {
  period: string
  compare: string
  onChange: (dates: { period?: string; compare?: string }) => void
}

/** "Last 7 days vs previous": the period, borderless, with the comparison in its menu (TAB-7, BS-3). */
export function PeriodMenu({ period, compare, onChange }: PeriodMenuProps) {
  const [open, setOpen] = useState(false)
  const periodLabel = PERIODS.find((p) => p.id === period)?.label
  const compareLabel = COMPARISONS.find((c) => c.id === compare)?.label
  return (
    <Dropdown.Float autoFlipVertical
      open={open}
      onOpenChange={setOpen}
      placement="bottom-end"
      trigger={
        // eslint-disable-next-line no-restricted-syntax -- ds-allow: two-tone Geist label (period + comparison) that Button's single-label Google Sans style can't express
        <button
          type="button"
          aria-label={`Period: ${periodLabel}, ${compareLabel}`}
          className={cn(
            'flex h-8 cursor-pointer items-center gap-1.5 rounded-full border-0 bg-transparent px-2.5 text-[13px] leading-5',
            'transition-colors duration-fast hover:bg-[var(--dashboard-tabs-track)]',
            open && 'bg-[var(--dashboard-tabs-track)]',
            FOCUS,
          )}
        >
          <Calendar aria-hidden size={16} strokeWidth={1.5} absoluteStrokeWidth className="shrink-0 text-[var(--dashboard-label)]" />
          <span className="font-medium text-[var(--dashboard-figure)]">{periodLabel}</span>
          {compare !== 'none' && <span className="text-[var(--dashboard-muted)]">{compareLabel}</span>}
          <ChevronDown aria-hidden size={12} strokeWidth={1.75} absoluteStrokeWidth className="shrink-0 text-[var(--dashboard-muted)]" />
        </button>
      }
    >
      <Dropdown size="md" maxHeight={false}>
        <Dropdown.Section label="Period" fluid>
          {PERIODS.map((p) => (
            <Dropdown.Item key={p.id} label={p.label} selected={p.id === period} onClick={() => { onChange({ period: p.id }); setOpen(false) }} fluid />
          ))}
        </Dropdown.Section>
        <Dropdown.Section label="Compare to" fluid>
          {COMPARISONS.map((c) => (
            <Dropdown.Item
              key={c.id}
              label={c.menuLabel ?? c.label}
              selected={c.id === compare}
              onClick={() => { onChange({ compare: c.id }); setOpen(false) }}
              fluid
            />
          ))}
        </Dropdown.Section>
      </Dropdown>
    </Dropdown.Float>
  )
}

/** The sharer's avatar, left of the dates, on a board shared with you (TAB-51). */
export function SharedByAvatar({ person }: { person: Person }) {
  return (
    <Tooltip content={`Shared by ${person.name}`} side="bottom">
      <span tabIndex={0} aria-label={`Shared by ${person.name}`} className={cn('mr-1 inline-flex rounded-full', FOCUS)}>
        <PersonAvatar initials={person.initials} color={person.color} size={24} />
      </span>
    </Tooltip>
  )
}

// ── Sync button and Data sources (BS-11 – BS-16) ──────────────────────────────

export interface SourceState {
  source: MetricSource
  /** When it last synced, ms since epoch. */
  syncedAt: number
  status: SyncStatus
}

/** "2 min ago", "Just now", "1 h ago". */
export function agoLabel(at: number, now: number): string {
  const min = Math.floor((now - at) / 60_000)
  if (min < 1) return 'Just now'
  if (min < 60) return `${min} min ago`
  return `${Math.floor(min / 60)} h ago`
}

/** The board's status: failed beats behind beats fresh; none for a board with no apps (TAB-8). */
export function boardSyncStatus(sources: SourceState[]): SyncStatus | null {
  if (!sources.length) return null
  if (sources.some((s) => s.status === 'failed')) return 'failed'
  if (sources.some((s) => s.status === 'behind')) return 'behind'
  return 'fresh'
}

const DOT: Record<SyncStatus, string> = {
  fresh: 'bg-[var(--dashboard-positive)]',
  behind: 'bg-[var(--dashboard-sync-behind)]',
  failed: 'bg-[var(--dashboard-sync-failed)]',
}
const STATUS_WORDS: Record<SyncStatus, string> = {
  fresh: 'all apps up to date',
  behind: 'an app is behind',
  failed: 'an app failed to sync',
}
const AGO_TONE: Record<SyncStatus, string> = {
  fresh: 'text-[var(--dashboard-muted)]',
  behind: 'text-[var(--dashboard-sync-behind)]',
  failed: 'text-[var(--dashboard-sync-failed)]',
}

interface SyncStatusButtonProps {
  /** The apps this board's cards use (BS-15). Empty for a board with no cards. */
  sources: SourceState[]
  now: number
  refreshing: boolean
  onRefresh: () => void
}

/**
 * The sync button (Figma 6D-1 / 6D-3): the rotate-cw-clock icon on a soft fill, with a dot on its
 * top-right edge (green fresh, amber behind, red failed). It opens Data sources under it and is
 * white with a fine border while that's open. Hovering says when the board last synced.
 */
export function SyncStatusButton({ sources, now, refreshing, onRefresh }: SyncStatusButtonProps) {
  const [open, setOpen] = useState(false)
  const oldest = sources.length ? Math.min(...sources.map((s) => s.syncedAt)) : null
  const synced = oldest == null ? null : `Synced ${agoLabel(oldest, now).toLowerCase()}`
  const status = boardSyncStatus(sources)
  return (
    <PopoverRoot open={open} onOpenChange={setOpen}>
      <Tooltip content={synced ?? 'No apps yet'} side="bottom" disabled={open}>
        <PopoverTrigger asChild>
          {/* eslint-disable-next-line no-restricted-syntax -- ds-allow: a 32px status button with a dot on its edge and an open (white + border) state IconButton doesn't have */}
          <button
            type="button"
            aria-label={`Data sources${status ? `: ${STATUS_WORDS[status]}` : ''}`}
            className={cn(
              'relative flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-solid transition-colors duration-fast',
              open
                ? 'border-[var(--border-default)] bg-[var(--dashboard-card-bg)] text-[var(--dashboard-figure)] shadow-[var(--dashboard-control-shadow)]'
                : 'border-transparent bg-[var(--dashboard-sync-bg)] text-[var(--dashboard-sync-icon)] hover:bg-[var(--dashboard-tabs-track)]',
              FOCUS,
            )}
          >
            <RotateCwClockIcon aria-hidden size={16} strokeWidth={1.5} absoluteStrokeWidth className={refreshing ? 'animate-spin' : undefined} />
            {status && (
              <span aria-hidden className={cn('pointer-events-none absolute -right-px -top-px size-2 rounded-full shadow-[0_0_0_2px_var(--dashboard-panel-bg)]', DOT[status])} />
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
            <span className="text-[12px] font-medium leading-4 text-[var(--neutral-700)]">Data sources</span>
            <span className="flex h-[18px] items-center rounded-full bg-[var(--dashboard-sync-bg)] px-1.5 text-[11px] font-medium leading-[14px] text-[var(--neutral-700)]">
              {sources.length}
            </span>
          </div>
          {sources.length === 0 ? (
            <p className="m-0 px-2.5 py-2 text-[13px] leading-5 text-[var(--dashboard-muted)]">No apps yet. Add a card to connect one.</p>
          ) : (
            <ul className="m-0 list-none p-0">
              {sources.map((s) => (
                <li key={s.source} className="flex h-9 items-center gap-2.5 rounded-lg px-2.5">
                  <SourceLogo source={s.source} className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-[13px] leading-5 text-[var(--dashboard-figure)]">{SOURCE_NAMES[s.source]}</span>
                  <span className={cn('shrink-0 text-[12px] leading-4', AGO_TONE[s.status])}>
                    {refreshing ? 'Syncing…' : agoLabel(s.syncedAt, now)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {sources.length > 0 && (
            <>
              <div className="px-1 py-1.5"><div className="h-px bg-[var(--neutral-200)]" /></div>
              <div className="flex items-center justify-between pb-1 pl-1 pr-2.5 pt-0.5">
                {/* eslint-disable-next-line no-restricted-syntax -- ds-allow: the outlined Refresh pill of Figma 75:21078 (white, hairline ring, 13px Geist) */}
                <button
                  type="button"
                  onClick={onRefresh}
                  disabled={refreshing}
                  className={cn(
                    'flex h-8 cursor-pointer items-center gap-1.5 rounded-full border-0 bg-[var(--dashboard-card-bg)] pl-2.5 pr-3.5 text-[13px] font-medium leading-5 text-[var(--dashboard-figure)]',
                    'shadow-[var(--dashboard-control-shadow)] transition-colors duration-fast hover:bg-[var(--neutral-100)] disabled:cursor-progress',
                    FOCUS,
                  )}
                >
                  <RotateCwClockIcon aria-hidden size={14} strokeWidth={1.5} absoluteStrokeWidth className={refreshing ? 'animate-spin' : undefined} />
                  {refreshing ? 'Refreshing…' : 'Refresh'}
                </button>
                <span aria-live="polite" className="text-[12px] leading-4 text-[var(--dashboard-muted)]">{refreshing ? '' : synced}</span>
              </div>
            </>
          )}
        </div>
      </PopoverContent>
    </PopoverRoot>
  )
}
