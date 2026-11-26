'use client'

import { useEffect, useRef } from 'react'
import { ChevronRight, Copy, LayoutTemplate, Plus, Sparkles, SquareDashed } from 'lucide-react'
import { cn } from '@/lib/utils'

// The New board chooser (Figma 170:36729; 08-new-board-rules.md NB-4 – NB-6), Option A: three ways
// up front (Template, Ask the AI, Empty board) and Copy a board under them. It opens above the + (or
// the edit bar), right-aligned. ← → move across the cards, ↓ goes to Copy a board, Enter picks, Esc
// or a click outside closes it.

export type Way = 'template' | 'ai' | 'empty' | 'copy'

const FOCUS = 'outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]'

interface NewBoardChooserProps {
  onPick: (way: Way) => void
  onClose: () => void
  /** Clicks here don't count as outside (the + or the New board segment that toggles it). */
  ignore?: string
  className?: string
}

export function NewBoardChooser({ onPick, onClose, ignore, className }: NewBoardChooserProps) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[data-way]')?.focus()
    const down = (e: PointerEvent) => {
      const t = e.target as Element
      if (ref.current?.contains(t) || (ignore && t.closest(ignore))) return
      onClose()
    }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose() } }
    document.addEventListener('pointerdown', down)
    document.addEventListener('keydown', key, true)
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key, true) }
  }, [onClose, ignore])

  const move = (e: React.KeyboardEvent, i: number) => {
    const ways = [...(ref.current?.querySelectorAll<HTMLElement>('[data-way]') ?? [])]
    const copy = ref.current?.querySelector<HTMLElement>('[data-copy]')
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      ways[(i + (e.key === 'ArrowRight' ? 1 : -1) + ways.length) % ways.length]?.focus()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      copy?.focus()
    }
  }

  return (
    <div
      ref={ref}
      // eslint-disable-next-line no-restricted-syntax -- ds-allow: a non-modal popover anchored to the + or the edit bar (Figma 170:36729), like More's menu
      role="dialog"
      aria-label="New board"
      data-new-board-chooser
      className={cn('flex w-[526px] max-w-[calc(100vw-32px)] flex-col gap-2 rounded-xl border border-solid border-[var(--dashboard-list-border)] bg-[var(--dashboard-card-bg)] px-3 pb-2 pt-3 shadow-[var(--dashboard-chooser-shadow)]', className)}
    >
      <p className="m-0 text-[length:var(--font-size-body)] font-semibold leading-[var(--line-height-body)] text-[var(--dashboard-figure)]">What do you want to start with?</p>
      <div className="flex gap-2">
        {([
          ['template', 'Template', <LayoutTemplate key="i" />, <TemplateArt key="a" />],
          ['ai', 'Ask the AI', <Sparkles key="i" />, <AiArt key="a" />],
          ['empty', 'Empty board', <SquareDashed key="i" />, <EmptyArt key="a" />],
        ] as const).map(([way, label, icon, art], i) => (
          // eslint-disable-next-line no-restricted-syntax -- ds-allow: a chooser card (Figma 170:36732)
          <button
            key={way}
            type="button"
            data-way={way}
            onClick={() => onPick(way)}
            onKeyDown={(e) => move(e, i)}
            className={cn(
              'group/way flex min-w-0 flex-1 cursor-pointer flex-col gap-2 rounded-xl border border-solid border-[var(--neutral-200)] bg-[var(--dashboard-panel-bg)] px-2 pb-2.5 pt-2 text-left',
              'transition-colors duration-fast hover:border-[var(--dashboard-way-border)] hover:bg-[var(--dashboard-hover-band)] focus-visible:border-[var(--dashboard-way-border)] focus-visible:bg-[var(--dashboard-hover-band)]',
              FOCUS,
            )}
          >
            <span aria-hidden className="relative block h-[76px] w-full overflow-hidden rounded-lg bg-[var(--dashboard-hover-band)]">{art}</span>
            <span className="flex items-center gap-1.5 text-[length:var(--font-size-body)] font-medium leading-5 text-[var(--dashboard-figure)] [&_svg]:size-4 [&_svg]:stroke-[1.5]">{icon}{label}</span>
          </button>
        ))}
      </div>
      <span aria-hidden className="h-px bg-[var(--dashboard-rail-rule)]" />
      {/* eslint-disable-next-line no-restricted-syntax -- ds-allow: the chooser's Copy a board row (Figma 170:36758) */}
      <button
        type="button"
        data-copy
        onClick={() => onPick('copy')}
        onKeyDown={(e) => { if (e.key === 'ArrowUp') { e.preventDefault(); ref.current?.querySelector<HTMLElement>('[data-way]')?.focus() } }}
        className={cn('flex w-full cursor-pointer items-center gap-2 rounded-lg border-0 bg-transparent px-2 py-1 text-left text-[length:var(--font-size-body)] font-medium leading-[var(--line-height-body)] text-[var(--neutral-700)] hover:bg-[var(--dashboard-hover-band)] focus-visible:bg-[var(--dashboard-hover-band)]', FOCUS)}
      >
        <Copy aria-hidden size={16} strokeWidth={1.5} absoluteStrokeWidth />
        <span className="flex-1">Copy a board</span>
        <ChevronRight aria-hidden size={14} strokeWidth={1.5} absoluteStrokeWidth className="text-[var(--dashboard-muted)]" />
      </button>
    </div>
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
