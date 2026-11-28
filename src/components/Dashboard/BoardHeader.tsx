'use client'

import { useState } from 'react'
import { Calendar, CalendarRange, ChevronDown } from 'lucide-react'
import { Dropdown } from '@/components/Dropdown'
import { Tooltip } from '@/components/Tooltip'
import { Button } from '@/components/ui/button'
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
        // Borderless and two-tone (the period, then the comparison), in the header's body font.
        <Button
          variant="ghost"
          size="sm"
          active={open}
          aria-label={`Period: ${periodLabel}, ${compareLabel}`}
          leftIcon={<Calendar aria-hidden strokeWidth={1.5} absoluteStrokeWidth className="text-[var(--dashboard-label)]" />}
          iconSize={16}
          className={cn(
            'h-8 min-h-8 gap-1.5 rounded-full border-0 bg-transparent px-2.5 text-[length:var(--font-size-body-sm)] leading-5 shadow-none [font-family:inherit]',
            '[--hv:var(--dashboard-tabs-track)] hover:border-transparent active:scale-100 transition-colors duration-fast [&>span]:flex [&>span]:items-center [&>span]:gap-1.5 [&>span]:px-0',
            FOCUS,
          )}
        >
          <span className="font-medium text-[var(--dashboard-figure)]">{periodLabel}</span>
          {compare !== 'none' && <span className="font-normal text-[var(--dashboard-muted)]">{compareLabel}</span>}
          <ChevronDown aria-hidden size={12} strokeWidth={1.75} absoluteStrokeWidth className="shrink-0 text-[var(--dashboard-muted)]" />
        </Button>
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
      {/* A picture with a name, not a control: it isn't a tab stop. Keyboard users find the sharer
          at the foot of the board's tab menu (SharedByFooter). */}
      <span role="img" aria-label={`Shared by ${person.name}`} className="mr-1 inline-flex rounded-full">
        <PersonAvatar initials={person.initials} color={person.color} size={24} />
      </span>
    </Tooltip>
  )
}
