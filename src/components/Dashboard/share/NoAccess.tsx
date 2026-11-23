'use client'

import { useState } from 'react'
import { Check, Lock } from 'lucide-react'
import { Button } from '@/components/ui'
import { nameOf } from './share-model'

// Opened from a link, without access (Figma 170:85604; 09 SH-24): the board's name, one line, Request
// access and Back to your boards. Request access is a stand-in until the back end can send it.

export function NoAccess({ label, owner, onBack }: { label: string; owner: string; onBack: () => void }) {
  const [sent, setSent] = useState(false)
  return (
    <div data-no-access className="flex min-h-[420px] flex-col items-center justify-center gap-2 text-center">
      <span aria-hidden className="mb-2 flex size-10 items-center justify-center rounded-xl bg-[var(--dashboard-sync-bg)] text-[var(--neutral-700)]">
        <Lock size={18} strokeWidth={1.5} absoluteStrokeWidth />
      </span>
      <h2 className="m-0 text-[16px] font-semibold leading-6 text-[var(--dashboard-figure)]">You don’t have access to {label}</h2>
      <p className="m-0 text-[13px] leading-5 text-[var(--dashboard-label)]">Request access and {nameOf(owner)}, who owns it, will be told.</p>
      <div className="mt-3 flex gap-2">
        {sent ? (
          <span role="status" data-request-sent className="flex h-8 items-center gap-1.5 px-2 text-[13px] font-medium text-[var(--dashboard-positive)]">
            <Check aria-hidden size={14} strokeWidth={1.5} absoluteStrokeWidth />Request sent
          </span>
        ) : (
          <Button size="sm" onClick={() => setSent(true)}>Request access</Button>
        )}
        <Button size="sm" variant="outline" onClick={onBack}>Back to your boards</Button>
      </div>
    </div>
  )
}
