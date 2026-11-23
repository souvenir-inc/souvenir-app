'use client'

import { ChevronRight, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TemplateArt } from './NewBoardChooser'
import { FOR_YOUR_ROLE, TEMPLATES } from './templates'

// An empty board is never a dead end (Figma 170:72881; 08-new-board-rules.md NB-17 – NB-19): Add
// cards, or fill it from one of three templates for your role, or open the library.

const FOCUS = 'outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]'

interface EmptyBoardProps {
  onAddCards: () => void
  onFill: (templateId: string) => void
  onAllTemplates: () => void
}

export function EmptyBoard({ onAddCards, onFill, onAllTemplates }: EmptyBoardProps) {
  const templates = FOR_YOUR_ROLE.map((id) => TEMPLATES.find((t) => t.id === id)).filter((t) => !!t)
  return (
    <div data-empty-board className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[var(--dashboard-waiting-border)] px-4 py-12">
      <p className="m-0 text-[14px] leading-5 text-[var(--dashboard-figure)]">This board has no cards yet.</p>
      {/* The edit bar's segment look (NB-17). */}
      {/* eslint-disable-next-line no-restricted-syntax -- ds-allow: Add cards in the edit bar's segment look (Figma 170:72877) */}
      <button
        type="button"
        data-empty-add
        onClick={onAddCards}
        className={cn('flex h-9 cursor-pointer items-center gap-1.5 rounded-full border-0 bg-[var(--dashboard-card-bg)] pl-3 pr-3.5 text-[13px] font-medium leading-5 text-[var(--dashboard-figure)] shadow-[var(--dashboard-popover-shadow)] hover:bg-[var(--neutral-100)]', FOCUS)}
      >
        <Plus aria-hidden size={16} strokeWidth={1.5} absoluteStrokeWidth />Add cards
      </button>

      <div className="mt-6 flex w-full max-w-[560px] flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="m-0 text-[13px] font-medium leading-5 text-[var(--dashboard-label)]">Or start from a template</p>
          {/* eslint-disable-next-line no-restricted-syntax -- ds-allow: a text link (Figma 170:72881) */}
          <button
            type="button"
            data-all-templates
            onClick={onAllTemplates}
            className={cn('flex cursor-pointer items-center gap-0.5 rounded-sm border-0 bg-transparent p-0 text-[13px] font-medium leading-5 text-[var(--neutral-700)] hover:text-[var(--dashboard-figure)]', FOCUS)}
          >
            All templates<ChevronRight aria-hidden size={14} strokeWidth={1.5} absoluteStrokeWidth />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {templates.map((t) => (
            // eslint-disable-next-line no-restricted-syntax -- ds-allow: a template tile, as in the chooser (Figma 170:72881)
            <button
              key={t.id}
              type="button"
              data-fill={t.id}
              onClick={() => onFill(t.id)}
              className={cn(
                'flex min-w-0 cursor-pointer flex-col gap-2 rounded-xl border border-solid border-[var(--neutral-200)] bg-[var(--dashboard-card-bg)] px-2 pb-2.5 pt-2 text-left transition-colors duration-fast hover:border-[var(--dashboard-way-border)] hover:bg-[var(--dashboard-hover-band)]',
                FOCUS,
              )}
            >
              <span aria-hidden className="relative block h-[76px] w-full overflow-hidden rounded-lg bg-[var(--dashboard-hover-band)]"><TemplateArt /></span>
              <span className="truncate text-[14px] font-medium leading-5 text-[var(--dashboard-figure)]">{t.role}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
