'use client'

import { useState } from 'react'
import { Calendar, CalendarRange, ChevronDown } from 'lucide-react'
import { Dropdown } from '@/components/Dropdown'
import { Tooltip } from '@/components/Tooltip'
import { cn } from '@/lib/utils'
import { CustomRange } from './CustomRange'
import { COMPARISONS, PERIODS } from './period'
import { isCustom, periodName } from './period'
import { PersonAvatar } from './tabs/BoardMenus'
import type { Person } from './tabs/board-state'

// The right side of the board panel's header (Figma 17:889, 6D 73:20404): who shared the board,
// and the period menu. The sync button and Data sources are sync/SyncButton. The tab row on the left is tabs/TabRow.

const FOCUS = 'outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]'

interface PeriodMenuProps {
  period: string
  compare: string
  onChange: (dates: { period?: string; compare?: string }) => void
}

/** "Last 7 days vs previous": the period, borderless, with the comparison in its menu (TAB-7, BS-3). */
export function PeriodMenu({ period, compare, onChange }: PeriodMenuProps) {
  const [open, setOpen] = useState(false)
  // Custom range… opens its own panel under the period (11 DT-2).
  const [ranging, setRanging] = useState(false)
  const periodLabel = periodName(period)
  const compareLabel = COMPARISONS.find((c) => c.id === compare)?.label
  return (
    <div className="relative">
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
          <Dropdown.Item icon={<CalendarRange />} label={isCustom(period) ? `${periodLabel}…` : 'Custom range…'} selected={isCustom(period)} onClick={() => { setOpen(false); setRanging(true) }} fluid />
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
    {ranging && (
      <CustomRange
        period={period}
        compare={compare}
        className="absolute right-0 top-[calc(100%+8px)] z-[var(--z-popover)]"
        onClose={() => setRanging(false)}
        onApply={(id) => { setRanging(false); onChange({ period: id }) }}
      />
    )}
    </div>
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
