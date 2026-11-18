'use client'

import React, { useState } from 'react'
import { Slider } from '@/components/Slider'
import { clampTemperature, temperatureLabel } from '@/lib/agent-draft'
import { HINT_STYLE, LABEL_STYLE } from './styles'

export interface CreativityFieldProps {
  value:     number
  onChange:  (value: number) => void
  disabled?: boolean
}

const MIN = 0
const MAX = 1

// Radix keeps the 18px thumb inside the track, so the floating value follows its centre.
const thumbLeft = (value: number) => `calc(9px + (100% - 18px) * ${(value - MIN) / (MAX - MIN)})`

/**
 * One control for "creativity" — it is the model's temperature, not two settings.
 * Low is precise and consistent; high is imaginative and varied.
 * Layout after shadcn space's "Slider 12 - Floating Value Label": the value rides above the
 * thumb (a touch bigger while dragging), with the range's ends underneath.
 */
export function CreativityField({ value, onChange, disabled = false }: CreativityFieldProps) {
  const current = clampTemperature(value)
  const [active, setActive] = useState(false)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1-5)' }}>
      <p style={LABEL_STYLE}>Creativity</p>
      <div
        style={{
          display: 'flex', flexDirection: 'column', gap: 'var(--space-2)',
          padding: 'var(--space-3) var(--space-4) var(--space-3)',
          // Same surface and ring as every other field (white in light, a lifted grey in dark), so the card
          // reads against the page in both themes.
          borderRadius: 'var(--radius-2xl)', backgroundColor: 'var(--field-surface)',
          boxShadow: '0px 1px 1.5px 0px rgba(82,75,71,0.12), 0px 0px 0px 1px var(--text-field-ring)',
        }}
      >
        {/* Top padding makes room for the floating value. */}
        <div style={{ position: 'relative', paddingTop: 'var(--space-7)' }}>
          <span
            aria-hidden
            style={{
              position: 'absolute', top: 0, left: thumbLeft(current),
              transform: `translateX(-50%) scale(${active ? 1.1 : 1})`,
              transition: 'transform var(--duration-fast) ease',
              pointerEvents: 'none', whiteSpace: 'nowrap',
              padding: 'var(--space-0-5) var(--space-1-5)', borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--neutral-900)', color: 'var(--neutral-white)',
              fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-medium)', fontSize: 'var(--font-size-small)', lineHeight: 'var(--line-height-small)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {`${current.toFixed(2)} · ${temperatureLabel(current)}`}
          </span>
          <Slider
            value={[current]}
            onValueChange={([next]) => onChange(clampTemperature(next))}
            min={MIN}
            max={MAX}
            step={0.01}
            fillColor="var(--focus-ring)"
            trackColor="var(--field-track)"
            disabled={disabled}
            aria-label="Creativity"
            onPointerDown={() => setActive(true)}
            onPointerUp={() => setActive(false)}
            onPointerLeave={() => setActive(false)}
          />
        </div>
        <div aria-hidden style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', fontVariantNumeric: 'tabular-nums' }}>
          <span style={HINT_STYLE}>{MIN.toFixed(1)} · Precise</span>
          <span style={HINT_STYLE}>Creative · {MAX.toFixed(1)}</span>
        </div>
      </div>
    </div>
  )
}
