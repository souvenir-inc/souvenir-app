'use client'

import { ChevronDown, SlidersHorizontal } from 'lucide-react'
import { Dropdown } from '@/components/Dropdown'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Board } from './board-state'
import { FOCUS_RING, SEGMENT } from './tab-styles'

// "N more" at the end of the tab row (TAB-18, TAB-33): the boards that don't fit, and Manage tabs.
// While a tab is dragged over it, a plain list with a drop line between rows.

interface MoreCountProps {
  ref: React.Ref<HTMLButtonElement>
  boards: Board[]
  open: boolean
  onOpenChange: (open: boolean) => void
  tabIndex: number
  onFocus: () => void
  onKeyDown: (e: React.KeyboardEvent) => void
  onPick: (id: string) => void
  onManage: () => void
  /** While a tab is dragged over the count: a plain list with a drop line between rows. */
  dragList: { line: number | null } | null
  dragListRef: React.Ref<HTMLDivElement>
}

export function MoreCount({ ref, boards, open, onOpenChange, tabIndex, onFocus, onKeyDown, onPick, onManage, dragList, dragListRef }: MoreCountProps) {
  const lifted = open || !!dragList
  const trigger = (
    // A segment of the tab capsule: the capsule's font, no raised shadow or press scale, its own fills.
    <Button
      ref={ref}
      variant="ghost"
      size="sm"
      tabIndex={tabIndex}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      aria-label={`${boards.length} more boards`}
      rightIcon={<ChevronDown aria-hidden strokeWidth={1.75} absoluteStrokeWidth />}
      iconSize={12}
      className={cn(
        SEGMENT, FOCUS_RING, 'gap-1 pl-3.5 pr-3 shadow-none [font-family:inherit] [--hv:transparent] active:scale-100 [&>span]:px-0 transition-colors duration-fast',
        lifted
          ? 'border-[var(--border-default)] bg-[var(--dashboard-tab-lifted)] text-[var(--dashboard-figure)] hover:border-[var(--border-default)]'
          : 'border-transparent bg-transparent text-[var(--dashboard-label)] hover:border-transparent hover:bg-[var(--dashboard-tab-hover)] hover:text-[var(--dashboard-figure)]',
      )}
    >
      {boards.length} more
    </Button>
  )

  if (dragList) {
    return (
      <div className="relative shrink-0">
        {trigger}
        <div ref={dragListRef} className="absolute left-0 top-[calc(100%+8px)] z-[var(--z-popover)]">
          <Dropdown size="md" maxHeight={false}>
            <Dropdown.Section fluid>
              {boards.map((b, i) => (
                <div key={b.id} data-more-row className="relative">
                  {dragList.line === i && <ListDropLine />}
                  <Dropdown.Item label={b.label} fluid />
                </div>
              ))}
              {dragList.line === boards.length && <div className="relative h-0"><ListDropLine /></div>}
            </Dropdown.Section>
          </Dropdown>
        </div>
      </div>
    )
  }

  return (
    <Dropdown.Float autoFlipVertical open={open} onOpenChange={onOpenChange} placement="bottom-start" trigger={trigger}>
      <Dropdown size="md">
        <Dropdown.Section fluid>
          {boards.map((b) => <Dropdown.Item key={b.id} label={b.label} onClick={() => onPick(b.id)} fluid />)}
        </Dropdown.Section>
        <Dropdown.Section divider fluid>
          <Dropdown.Item icon={<SlidersHorizontal />} label="Manage tabs" onClick={onManage} fluid />
        </Dropdown.Section>
      </Dropdown>
    </Dropdown.Float>
  )
}

function ListDropLine() {
  return (
    <span aria-hidden className="pointer-events-none absolute -top-px left-1 right-1 z-10 h-0.5 rounded-hairline bg-[var(--dashboard-drop-line)]">
      <span className="absolute -left-1 -top-[3px] size-2 rounded-full bg-[var(--dashboard-drop-line)]" />
    </span>
  )
}
