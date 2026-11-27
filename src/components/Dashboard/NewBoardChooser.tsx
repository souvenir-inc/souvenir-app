'use client'

import { useLayoutEffect, useRef } from 'react'
import { ChevronRight, Copy, LayoutTemplate, Plus, Sparkles, SquareDashed } from 'lucide-react'
import { PopoverAnchor, PopoverContent, PopoverRoot } from '@/components/Popover'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import { PLAIN_BUTTON } from './plain-button'

// The New board chooser (Figma 170:36729; 08-new-board-rules.md NB-4 – NB-6), Option A: three ways
// up front (Template, Ask the AI, Empty board) and Copy a board under them. It opens above the + (or
// the edit bar), right-aligned, as a non-modal popover (the Popover primitive: Esc or a click outside
// closes it, focus goes back to what opened it). ← → move across the cards, ↓ goes to Copy a board,
// Enter picks.

export type Way = 'template' | 'ai' | 'empty' | 'copy'

const FOCUS = 'outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]'

interface NewBoardChooserProps {
  onPick: (way: Way) => void
  onClose: () => void
  /** Clicks here don't count as outside (the + or the New board segment that toggles it). */
  ignore?: string
  /** Where the chooser's bottom-right corner goes, relative to the caller's positioned box. */
  className?: string
  /** Which side of that corner it opens on. */
  side?: 'top' | 'bottom'
}

export function NewBoardChooser({ onPick, onClose, ignore, className, side = 'top' }: NewBoardChooserProps) {
  const ref = useRef<HTMLDivElement>(null)
  // What had focus when it opened, so closing gives it back (A11Y-FO-02); a click outside keeps the new focus.
  const returnTo = useRef<HTMLElement | null>(null)
  const interactedOutside = useRef(false)
  useLayoutEffect(() => {
    const active = document.activeElement
    returnTo.current = active instanceof HTMLElement && active !== document.body ? active : null
  }, [])

  const move = (e: React.KeyboardEvent, i: number) => {
    const ways = [...(ref.current?.querySelectorAll<HTMLElement>('[data-way]') ?? [])]
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      ways[(i + (e.key === 'ArrowRight' ? 1 : -1) + ways.length) % ways.length]?.focus()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      ref.current?.querySelector<HTMLElement>('[data-copy]')?.focus()
    }
  }

  return (
    <PopoverRoot open onOpenChange={(open) => { if (!open) onClose() }}>
      <PopoverAnchor asChild>
        <span aria-hidden className={cn('pointer-events-none block size-0', className)} />
      </PopoverAnchor>
      <PopoverContent
        ref={ref}
        side={side}
        align="end"
        sideOffset={0}
        collisionPadding={16}
        maxHeight={false}
        aria-label="New board"
        data-new-board-chooser
        style={{ width: 526, maxWidth: 'calc(100vw - 32px)', background: 'var(--dashboard-card-bg)', border: '1px solid var(--dashboard-list-border)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--dashboard-chooser-shadow)' }}
        onOpenAutoFocus={(e) => { e.preventDefault(); ref.current?.querySelector<HTMLElement>('[data-way]')?.focus() }}
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          if (!interactedOutside.current && returnTo.current?.isConnected) returnTo.current.focus()
        }}
        // Esc closes the chooser only (NB-5); the caller closes the dial with it.
        onEscapeKeyDown={(e) => e.stopPropagation()}
        onInteractOutside={(e) => {
          const target = e.detail.originalEvent.target
          if (ignore && target instanceof Element && target.closest(ignore)) { e.preventDefault(); return }
          interactedOutside.current = true
        }}
      >
        <div className="flex flex-col gap-2 px-3 pb-2 pt-3">
          <p className="m-0 text-[length:var(--font-size-body)] font-semibold leading-[var(--line-height-body)] text-[var(--dashboard-figure)]">What do you want to start with?</p>
          <div className="flex gap-2">
            {([
              ['template', 'Template', <LayoutTemplate key="i" />, <TemplateArt key="a" />],
              ['ai', 'Ask the AI', <Sparkles key="i" />, <AiArt key="a" />],
              ['empty', 'Empty board', <SquareDashed key="i" />, <EmptyArt key="a" />],
            ] as const).map(([way, label, icon, art], i) => (
              // A chooser card (Figma 170:36732).
              <Button
                key={way}
                variant="link"
                data-way={way}
                onClick={() => onPick(way)}
                onKeyDown={(e) => move(e, i)}
                className={cn(
                  PLAIN_BUTTON,
                  'group/way flex min-w-0 flex-1 cursor-pointer flex-col items-stretch justify-start gap-2 whitespace-normal !rounded-xl border border-solid border-[var(--neutral-200)] bg-[var(--dashboard-panel-bg)] px-2 pb-2.5 pt-2 text-left',
                  'transition-colors duration-fast hover:border-[var(--dashboard-way-border)] hover:bg-[var(--dashboard-hover-band)] focus-visible:border-[var(--dashboard-way-border)] focus-visible:bg-[var(--dashboard-hover-band)]',
                  FOCUS,
                )}
              >
                <span aria-hidden className="relative block h-[76px] w-full overflow-hidden rounded-lg bg-[var(--dashboard-hover-band)]">{art}</span>
                <span className="flex items-center gap-1.5 text-[length:var(--font-size-body)] font-medium leading-5 text-[var(--dashboard-figure)] [&_svg]:size-4 [&_svg]:stroke-[1.5]">{icon}{label}</span>
              </Button>
            ))}
          </div>
          <span aria-hidden className="h-px bg-[var(--dashboard-rail-rule)]" />
          {/* The chooser's Copy a board row (Figma 170:36758). */}
          <Button
            variant="link"
            data-copy
            onClick={() => onPick('copy')}
            onKeyDown={(e) => { if (e.key === 'ArrowUp') { e.preventDefault(); ref.current?.querySelector<HTMLElement>('[data-way]')?.focus() } }}
            className={cn(PLAIN_BUTTON, 'flex w-full cursor-pointer items-center justify-start gap-2 !rounded-lg border-0 bg-transparent px-2 py-1 text-left text-[length:var(--font-size-body)] font-medium leading-[var(--line-height-body)] text-[var(--neutral-700)] hover:bg-[var(--dashboard-hover-band)] focus-visible:bg-[var(--dashboard-hover-band)]', FOCUS)}
          >
            <Copy aria-hidden size={16} strokeWidth={1.5} absoluteStrokeWidth />
            <span className="flex-1">Copy a board</span>
            <ChevronRight aria-hidden size={14} strokeWidth={1.5} absoluteStrokeWidth className="text-[var(--dashboard-muted)]" />
          </Button>
        </div>
      </PopoverContent>
    </PopoverRoot>
  )
}

const tile = 'absolute rounded-xs border border-solid border-[var(--dashboard-list-border)] bg-[var(--dashboard-card-bg)]'

/** A wide card over four small ones: a template's layout in miniature. Also used on the empty board. */
export function TemplateArt() {
  return (
    <>
      <span className={cn(tile, 'left-2.5 right-2.5 top-2.5 h-[25px]')} />
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className={tile} style={{ top: 40, height: 25, left: `calc(10px + ${i} * (100% - 20px + 5px) / 4)`, width: 'calc((100% - 20px - 15px) / 4)' }} />
      ))}
    </>
  )
}

function AiArt() {
  return (
    <span className="absolute left-2 top-6 flex items-center gap-1.5 rounded-lg border border-solid border-[var(--dashboard-list-border)] bg-[var(--dashboard-card-bg)] px-2 py-1.5 text-[length:var(--dashboard-micro-size)] leading-[var(--dashboard-tag-line-height)] text-[var(--dashboard-faint)]">
      <Sparkles size={16} strokeWidth={1.5} absoluteStrokeWidth className="text-[var(--dashboard-figure)]" />Paid ads, every day
    </span>
  )
}

function EmptyArt() {
  return (
    <span className="absolute inset-x-4 inset-y-3 flex items-center justify-center rounded-md border border-dashed border-[var(--dashboard-way-border)] text-[var(--dashboard-label)]">
      <Plus size={15} strokeWidth={1.5} absoluteStrokeWidth />
    </span>
  )
}
