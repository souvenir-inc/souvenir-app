import React from 'react'
import { cn } from '@/lib/utils'

// Meter: how full something is (credits, storage, seats, a budget). A rounded neutral track with a
// fill; `tone="neutral"` is the settings meter (near-black fill), `tone="auto"` colours the fill by how
// full it is (green, then amber from 60%, red from 85%), as the credit-budget bar did.
//
//   <Meter label="Credits used" value={12538} max={20000} caption="12,538 of 20,000" trailing="63%" />

import { meterToneFor, type MeterTone } from './meter-tone'
export type { MeterTone } from './meter-tone'

const FILL: Record<Exclude<MeterTone, 'auto'>, string> = {
  neutral: 'bg-[var(--neutral-900)]',
  success: 'bg-[var(--success-500)]',
  warning: 'bg-[var(--warning-500)]',
  danger:  'bg-[var(--red-400)]',
}

export interface MeterProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Accessible name, e.g. "Credits used". */
  label: string
  value: number
  /** @default 100 */
  max?: number
  tone?: MeterTone
  /** xs = 4px (inline in a row), sm = 6px (cards, settings), lg = 10px (drawers). @default 'sm' */
  size?: 'xs' | 'sm' | 'lg'
  /** Text above the bar, left. */
  caption?: React.ReactNode
  /** Text above the bar, right (a percentage, say). */
  trailing?: React.ReactNode
  ref?: React.Ref<HTMLDivElement>
}

export function Meter({ label, value, max = 100, tone = 'neutral', size = 'sm', caption, trailing, className, ref, ...props }: MeterProps) {
  const fraction = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0
  const resolved = tone === 'auto' ? meterToneFor(fraction) : tone
  const track = { xs: 'h-1', sm: 'h-1.5', lg: 'h-2.5' }[size]
  const sliver = { xs: 'min-w-1', sm: 'min-w-1.5', lg: 'min-w-2.5' }[size]
  return (
    <div ref={ref} className={cn('flex w-full flex-col gap-2', className)} {...props}>
      {(caption || trailing) && (
        <div className="flex items-baseline justify-between gap-3 text-body-sm text-[var(--neutral-600)]">
          <span className="min-w-0">{caption}</span>
          {trailing && <span className="shrink-0 tabular-nums">{trailing}</span>}
        </div>
      )}
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.min(max, Math.max(0, value))}
        className={cn('w-full overflow-hidden rounded-full bg-[var(--neutral-100)]', track)}
      >
        {/* A non-zero value always shows a sliver. */}
        <div
          className={cn('h-full rounded-full transition-[width,background-color] duration-slow ease-standard', FILL[resolved], fraction > 0 && sliver)}
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
    </div>
  )
}
