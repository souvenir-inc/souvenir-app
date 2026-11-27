'use client'

import { Button } from '@/components/ui/button'

/** Button with this row's own look: body font, no raised shadow, no press scale, no hover layer. */
const QUIET = 'h-8 min-h-8 rounded-lg border-0 bg-transparent px-2 shadow-none [font-family:inherit] [--hv:transparent] active:scale-100 hover:border-transparent hover:bg-[var(--dashboard-sync-bg)] text-[length:var(--font-size-body-sm)] [&>span]:px-0'

/**
 * Dates that aren't the board's own (a link's or the viewer's): back to the board's, or, for people
 * who can edit, keep them for the board (Period row P-5, SH-23).
 */
export function DatesActions({ canSave, onReset, onSave }: { canSave: boolean; onReset: () => void; onSave: () => void }) {
  return (
    <span data-own-dates className="flex items-center gap-0.5 text-[length:var(--font-size-body-sm)] leading-5">
      <Button variant="ghost" size="sm" onClick={onReset} className={`${QUIET} font-normal text-[var(--neutral-700)]`}>Reset</Button>
      {canSave && (
        <>
          <span aria-hidden className="text-[var(--dashboard-faint)]">·</span>
          <Button variant="ghost" size="sm" onClick={onSave} className={`${QUIET} font-medium text-[var(--dashboard-figure)]`}>Save for board</Button>
        </>
      )}
    </span>
  )
}
