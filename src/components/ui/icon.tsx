import React from 'react'
import { cn } from '@/lib/utils'

// Icon: renders an icon component at a size from the scale, in a tone, and decides its accessibility:
// decorative (aria-hidden) by default, or a labelled image when it carries meaning on its own.
//
//   <Icon as={FolderOneIcon} size={16} tone="muted" />
//   <Icon as={AlertCircleIcon} tone="danger" label="Failed" />

export type IconSize = 12 | 14 | 16 | 20 | 24

const TONE = {
  current: 'text-current',
  default: 'text-[var(--neutral-900)]',
  muted:   'text-[var(--neutral-500)]',
  subtle:  'text-[var(--neutral-400)]',
  danger:  'text-[var(--red-600)]',
  success: 'text-[var(--green-600)]',
  inverse: 'text-[var(--neutral-white)]',
} as const

type IconComponent = React.ComponentType<{ size?: number; color?: string; className?: string }>

export interface IconProps {
  as: IconComponent
  /** @default 16 */
  size?: IconSize
  /** @default 'current' (inherits the text colour) */
  tone?: keyof typeof TONE
  /** Give it a label when the icon alone carries meaning (no visible text next to it). */
  label?: string
  className?: string
}

export function Icon({ as: Glyph, size = 16, tone = 'current', label, className }: IconProps) {
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn('inline-flex shrink-0 leading-none', TONE[tone], className)}
    >
      <Glyph size={size} color="currentColor" />
    </span>
  )
}
