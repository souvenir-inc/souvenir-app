'use client'

import React from 'react'
import { PenOneIcon } from '@strange-huge/icons'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────────────

export type OptionBadgeVariant = 'number' | 'edit'

export interface OptionBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 'number' - numbered single-select / rank badge. 'edit' - pencil for open-ended footer row. */
  variant?: OptionBadgeVariant
  num?: number
}

// ── Constants ─────────────────────────────────────────────────────────────────

const OUTER_SHADOW  = 'var(--shadow-chip)'
const INNER_SHADOW  = 'var(--shadow-badge-inner)'

// ── Component ──────────────────────────────────────────────────────────────────

export function OptionBadge({ ref, variant = 'number', num = 1, className, ...props }: OptionBadgeProps & { ref?: React.Ref<HTMLDivElement> }) {
    return (
      <div
        ref={ref}
        className={cn(className)}
        style={{
          position:        'relative',
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'center',
          width:           28,
          height:          28,
          flexShrink:      0,
          borderRadius:    'var(--radius-md)',
          overflow:        'clip',
          boxShadow:       OUTER_SHADOW,
          padding:         'var(--space-1) var(--space-2)',
        }}
        {...props}
      >
        {/* Warm beige fill */}
        <div
          aria-hidden
          style={{
            position:        'absolute',
            inset:           0,
            borderRadius:    'var(--radius-md)',
            backgroundColor: 'color-mix(in srgb, var(--neutral-100) 60%, transparent)',
            pointerEvents:   'none',
          }}
        />

        {variant === 'number' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 var(--space-0-5)', position: 'relative', flexShrink: 0 }}>
            <p style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-medium)', fontSize: 'var(--font-size-body, 14px)', lineHeight: 'var(--line-height-body, 22px)', color: 'var(--neutral-700)', margin: 0, whiteSpace: 'nowrap' }}>
              {num}
            </p>
          </div>
        )}

        {variant === 'edit' && (
          <div style={{ width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', flexShrink: 0, overflow: 'clip' }}>
            <PenOneIcon size={16} color="var(--neutral-600)" />
          </div>
        )}

        {/* Inner depth shadow */}
        <div
          aria-hidden
          style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', boxShadow: INNER_SHADOW, pointerEvents: 'none' }}
        />
      </div>
    )
}

OptionBadge.displayName = 'OptionBadge'
export default OptionBadge
