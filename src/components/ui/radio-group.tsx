'use client'

import React from 'react'
import { RadioGroup as RadioGroupPrimitive } from '@base-ui/react/radio-group'
import { Radio } from '@base-ui/react/radio'
import { cn } from '@/lib/utils'

// RadioGroup: pick exactly one. Base UI gives the radiogroup role, roving focus and arrow-key
// selection. The dot uses the Checkbox tokens (16px, same on/off fills and shadows) so the two read
// as one family.
//
//   <RadioGroup value={plan} onValueChange={setPlan} aria-label="Plan">
//     <RadioItem value="monthly" label="Monthly" />
//     <RadioItem value="yearly" label="Yearly" description="Save 25%" />
//   </RadioGroup>

export type RadioGroupProps<T extends string> = Omit<React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive>, 'value' | 'defaultValue' | 'onValueChange'> & {
  value?: T
  defaultValue?: T
  onValueChange?: (value: T) => void
  orientation?: 'vertical' | 'horizontal'
}

export function RadioGroup<T extends string>({ orientation = 'vertical', className, onValueChange, ...props }: RadioGroupProps<T>) {
  return (
    <RadioGroupPrimitive
      className={cn('flex', orientation === 'vertical' ? 'flex-col gap-3' : 'flex-row flex-wrap gap-4', className)}
      onValueChange={(v) => onValueChange?.(v as T)}
      {...props}
    />
  )
}

export interface RadioItemProps extends Omit<React.ComponentPropsWithoutRef<typeof Radio.Root>, 'children'> {
  value: string
  label: React.ReactNode
  /** Second line under the label. */
  description?: React.ReactNode
}

export function RadioItem({ label, description, className, disabled, ...props }: RadioItemProps) {
  return (
    <label className={cn('flex items-start gap-2.5 cursor-pointer select-none', disabled && 'cursor-not-allowed opacity-70', className)}>
      <Radio.Root
        disabled={disabled}
        className={cn(
          'group relative mt-[3px] inline-flex size-4 shrink-0 items-center justify-center rounded-full border-0 p-0 cursor-pointer',
          'bg-[var(--checkbox-bg-off)] shadow-[var(--shadow-checkbox-off)]',
          'data-[checked]:bg-[var(--checkbox-bg-on)] data-[checked]:shadow-[var(--shadow-checkbox-on)]',
          'outline-2 outline-solid outline-offset-2 outline-transparent focus-visible:outline-[var(--focus-ring)]',
          'transition-[background-color,outline-color] duration-fast ease-standard disabled:cursor-not-allowed',
        )}
        {...props}
      >
        <Radio.Indicator className="size-1.5 rounded-full bg-[var(--neutral-white)]" />
      </Radio.Root>
      <span className="flex min-w-0 flex-col">
        <span className="text-body text-[var(--neutral-900)]">{label}</span>
        {description && <span className="text-small text-[var(--neutral-500)]">{description}</span>}
      </span>
    </label>
  )
}
