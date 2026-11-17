import React from 'react'
import { Meter } from '@/components/ui/meter'

export interface UsageMeterProps {
  /** How full the meter is, 0–100. Values outside the range are clamped. */
  value: number
  /** Accessible name for the progress bar, e.g. "Credits used". */
  label: string
  /** Optional text above the bar on the left, e.g. "12,538 of 20,000 credits used". */
  caption?: React.ReactNode
  /** Optional text above the bar on the right, e.g. "63%". */
  trailing?: React.ReactNode
  /** Bar thickness: 4, 6 or 10 px. @default 6 */
  height?: 4 | 6 | 10
  style?: React.CSSProperties
}

const SIZE = { 4: 'xs', 6: 'sm', 10: 'lg' } as const

/**
 * The settings-wide progress meter: a neutral track with a near-black fill, so a usage bar reads the same
 * on every page (credits, storage, seats). A non-zero value always shows a small sliver.
 * Built on the shared Meter (components/ui/meter).
 */
export function UsageMeter({ value, label, caption, trailing, height = 6, style }: UsageMeterProps) {
  return <Meter label={label} value={value} max={100} tone="neutral" size={SIZE[height]} caption={caption} trailing={trailing} style={style} />
}

export default UsageMeter
