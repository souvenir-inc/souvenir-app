'use client'

import { ChevronRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { TemplateArt } from './NewBoardChooser'
import { useAuth } from '@/context/auth-context'
import { roleFor } from './catalog'
import { TEMPLATES, templatesFor } from './templates'

// An empty board is never a dead end (Figma 170:72881; 08-new-board-rules.md NB-17 – NB-19): Add
// cards, or fill it from one of three templates (your role's, when it's known), or open the library.

const FOCUS = 'outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]'
/** Button with this page's own type and fills: body font, no raised shadow, no press scale, no hover layer. */
const PLAIN = 'shadow-none [font-family:inherit] [--hv:transparent] active:scale-100 hover:border-transparent [&>span]:px-0'

interface EmptyBoardProps {
  onAddCards: () => void
  onFill: (templateId: string) => void
  onAllTemplates: () => void
}

export function EmptyBoard({ onAddCards, onFill, onAllTemplates }: EmptyBoardProps) {
  const { user } = useAuth()
  const templates = templatesFor(roleFor(user?.onboardingRole)?.id ?? null).map((id) => TEMPLATES.find((t) => t.id === id)).filter((t) => !!t)
  return (
    <div data-empty-board className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[var(--dashboard-waiting-border)] px-4 py-12">
      <p className="m-0 text-[length:var(--font-size-body)] leading-5 text-[var(--dashboard-figure)]">This board has no cards yet.</p>
      {/* The edit bar's segment look (NB-17). */}
      <Button
        variant="ghost"
        data-empty-add
        onClick={onAddCards}
        leftIcon={<Plus aria-hidden strokeWidth={1.5} absoluteStrokeWidth />}
        iconSize={16}
        className={cn(PLAIN, 'h-9 min-h-9 gap-1.5 rounded-full border-0 bg-[var(--dashboard-card-bg)] pl-3 pr-3.5 text-[length:var(--font-size-body-sm)] font-medium leading-5 text-[var(--dashboard-figure)] shadow-[var(--dashboard-popover-shadow)] hover:bg-[var(--neutral-100)]', FOCUS)}
      >
        Add cards
      </Button>

      <div className="mt-6 flex w-full max-w-[560px] flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="m-0 text-[length:var(--font-size-body-sm)] font-medium leading-5 text-[var(--dashboard-label)]">Or start from a template</p>
          {/* A quiet text action (Figma 170:72881). */}
          <Button
            variant="ghost"
            size="xs"
            data-all-templates
            onClick={onAllTemplates}
            rightIcon={<ChevronRight aria-hidden strokeWidth={1.5} absoluteStrokeWidth />}
            iconSize={14}
            className={cn(PLAIN, 'min-h-0 gap-0.5 rounded-sm border-0 bg-transparent p-0 text-[length:var(--font-size-body-sm)] font-medium leading-5 text-[var(--neutral-700)] hover:text-[var(--dashboard-figure)]', FOCUS)}
          >
            All templates
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {templates.map((t) => (
            // A template tile, as in the chooser (Figma 170:72881): art above, the role below, left-aligned.
            <Button
              key={t.id}
              variant="ghost"
              data-fill={t.id}
              onClick={() => onFill(t.id)}
              className={cn(
                PLAIN,
                'h-auto min-w-0 flex-col items-stretch justify-start gap-2 whitespace-normal rounded-xl border border-solid border-[var(--neutral-200)] bg-[var(--dashboard-card-bg)] px-2 pb-2.5 pt-2 text-left transition-colors duration-fast hover:border-[var(--dashboard-way-border)] hover:bg-[var(--dashboard-hover-band)]',
                '[&>span]:flex [&>span]:min-w-0 [&>span]:flex-col [&>span]:gap-2',
                FOCUS,
              )}
            >
              <span aria-hidden className="relative block h-[76px] w-full overflow-hidden rounded-lg bg-[var(--dashboard-hover-band)]"><TemplateArt /></span>
              <span className="truncate text-[length:var(--font-size-body)] font-medium leading-5 text-[var(--dashboard-figure)]">{t.role}</span>
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}
