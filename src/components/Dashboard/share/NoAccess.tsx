'use client'

import { Lock } from 'lucide-react'
import { Button } from '@/components/ui'

// Opened from a link, without access (Figma 170:85604; 09 SH-24): one line and Back to your boards.
// The board's name and owner aren't shown: someone who can't see a board isn't told what it is.

export function NoAccess({ onBack }: { onBack: () => void }) {
  return (
    <div data-no-access className="flex min-h-[420px] flex-col items-center justify-center gap-2 text-center">
      <span aria-hidden className="mb-2 flex size-10 items-center justify-center rounded-xl bg-[var(--dashboard-sync-bg)] text-[var(--neutral-700)]">
        <Lock size={18} strokeWidth={1.5} absoluteStrokeWidth />
      </span>
      <h2 className="m-0 text-[16px] font-semibold leading-6 text-[var(--dashboard-figure)]">You don’t have access to this board</h2>
      <p className="m-0 text-[13px] leading-5 text-[var(--dashboard-label)]">It was deleted, or its owner hasn’t shared it with you. Ask them to add you.</p>
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="outline" onClick={onBack}>Back to your boards</Button>
      </div>
    </div>
  )
}
