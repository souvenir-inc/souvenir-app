'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { Meter, meterToneFor } from '@/components/ui/meter'

export type TokenBudgetBarSize = 'sm' | 'lg'

export interface TokenBudgetBarProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Tokens consumed so far. */
  used:  number
  /** Total budget. */
  limit: number
  /** sm = 6px track (in-card), lg = 10px track (in-drawer). */
  size?: TokenBudgetBarSize
  /** When true, renders the `64% used · 32K / 50K tok` row beneath the bar. */
  showLabel?: boolean
}

function fmtK(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K'
  return String(n)
}

// The percentage text takes the deeper step of the fill's colour.
const TEXT = { success: 'text-[var(--success-700)]', warning: 'text-[var(--warning-700)]', danger: 'text-[var(--red-500)]' } as const

/** A credit budget: the shared Meter with its fill coloured by how much is used (green, amber, red). */
export function TokenBudgetBar({ ref, used, limit, size = 'sm', showLabel = false, className, ...props }: TokenBudgetBarProps & { ref?: React.Ref<HTMLDivElement> }) {
  const fraction = limit > 0 ? Math.max(0, Math.min(used / limit, 1)) : 0
  return (
    <div ref={ref} className={cn('flex w-full flex-col', showLabel && 'gap-1', className)} {...props}>
      <Meter label={`${Math.round(fraction * 100)}% of credit budget used`} value={used} max={limit} tone="auto" size={size} />
      {showLabel && (
        <div className="flex justify-between text-caption">
          <span className={cn('font-medium', TEXT[meterToneFor(fraction)])}>{Math.round(fraction * 100)}% used</span>
          <span className="text-[var(--neutral-500)]">{fmtK(used)} / {fmtK(limit)} credits</span>
        </div>
      )}
    </div>
  )
}

TokenBudgetBar.displayName = 'TokenBudgetBar'
export default TokenBudgetBar
