'use client'

import React, { useId } from 'react'
import { m, useReducedMotion } from 'framer-motion'
import { RadioGroup as RadioGroupPrimitive } from '@base-ui/react/radio-group'
import { Radio } from '@base-ui/react/radio'
import { cn } from '@/lib/utils'
import { SPRING } from "@/styles/tokens/motion"

// SegmentedControl: a short, always-visible choice of one (2–5 options): a grey track with a white
// pill that slides to the chosen segment. Radio semantics and arrow keys come from Base UI's
// RadioGroup. The look is the one connector permissions already used (AccountPermissions).
//
//   <SegmentedControl aria-label="Access" value={mode} onValueChange={setMode}
//     options={[{ value: 'allow', label: 'Allow' }, { value: 'ask', label: 'Ask' }]} />

export interface SegmentedOption<T extends string> {
  value: T
  label: React.ReactNode
  /** Accessible name when the label is an icon only. */
  'aria-label'?: string
  disabled?: boolean
}

export interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<SegmentedOption<T>>
  value: T
  onValueChange: (value: T) => void
  'aria-label': string
  /** sm = 26px segments, 12px text; md = 32px segments, 14px text. @default 'sm' */
  size?: 'sm' | 'md'
  disabled?: boolean
  /** Stretch the segments to fill the width. */
  fluid?: boolean
  className?: string
}

const SEGMENT_SIZE = {
  sm: 'h-[26px] min-w-9 px-2 text-small',
  md: 'h-8 min-w-10 px-3 text-body',
} as const

export function SegmentedControl<T extends string>({
  options,
  value,
  onValueChange,
  size = 'sm',
  disabled = false,
  fluid = false,
  className,
  ...aria
}: SegmentedControlProps<T>) {
  const pillId = useId()
  const reduceMotion = useReducedMotion()
  return (
    <RadioGroupPrimitive
      value={value}
      onValueChange={(v) => onValueChange(v as T)}
      disabled={disabled}
      aria-label={aria['aria-label']}
      className={cn(
        'flex flex-none rounded-md bg-[var(--neutral-100)] p-[var(--space-0-75)]',
        fluid && 'w-full',
        disabled && 'opacity-60',
        className,
      )}
    >
      {options.map((option) => {
        const checked = option.value === value
        return (
          <Radio.Root
            key={option.value}
            value={option.value}
            disabled={option.disabled}
            aria-label={option['aria-label']}
            className={cn(
              'relative flex items-center justify-center rounded-sm border-0 bg-transparent font-medium cursor-pointer',
              'text-[var(--neutral-500)] [&:not([data-disabled])]:hover:text-[var(--neutral-900)] data-[checked]:text-[var(--neutral-900)]',
              'outline-2 outline-solid outline-offset-1 outline-transparent focus-visible:outline-[var(--neutral-400)]',
              // Radio.Root renders a <span>, which never matches :disabled; Base UI marks it data-disabled.
              'data-[disabled]:cursor-not-allowed',
              SEGMENT_SIZE[size],
              fluid && 'flex-1',
            )}
          >
            {checked && (
              <m.span
                layoutId={pillId}
                aria-hidden
                transition={reduceMotion ? { duration: 0 } : { type: 'spring', ...SPRING.settle }}
                className="absolute inset-0 rounded-sm bg-[var(--neutral-white)] shadow-[0_0_0_1px_var(--neutral-200),0_1px_2px_rgba(82,75,71,0.08)]"
              />
            )}
            <span className="relative inline-flex items-center gap-1">{option.label}</span>
          </Radio.Root>
        )
      })}
    </RadioGroupPrimitive>
  )
}
