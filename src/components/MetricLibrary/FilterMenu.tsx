'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Dropdown } from '@/components/Dropdown'
import styles from './MetricLibrary.module.css'

export interface FilterOption<T extends string> {
  value: T
  label: string
  count?: number
}

export interface FilterMenuProps<T extends string> {
  /** What the menu filters, for screen readers: "Area". */
  name: string
  value: T
  options: ReadonlyArray<FilterOption<T>>
  onChange: (value: T) => void
  /** Draw the trigger as set (anything but its default). */
  active?: boolean
  placement?: 'bottom-start' | 'bottom-end'
}

/** A pill that opens a short list of choices, the way Home's period picker does. */
export function FilterMenu<T extends string>({ name, value, options, onChange, active = false, placement = 'bottom-start' }: FilterMenuProps<T>) {
  const [open, setOpen] = useState(false)
  const current = options.find(option => option.value === value)?.label ?? value
  return (
    <Dropdown.Float
      open={open}
      onOpenChange={setOpen}
      placement={placement}
      trigger={
        <button type="button" className={styles.filterTrigger} data-active={active ? '' : undefined} aria-label={`${name}: ${current}`}>
          {current}
          <ChevronDown size={14} strokeWidth={1.75} aria-hidden />
        </button>
      }
    >
      <Dropdown maxHeight="min(360px, calc(100dvh - 120px))">
        <Dropdown.Section>
          {options.map(option => (
            <Dropdown.Item
              key={option.value}
              label={option.label}
              selected={option.value === value}
              badge={option.count === undefined ? undefined : <span className={styles.sectionMeta}>{option.count}</span>}
              onClick={() => { onChange(option.value); setOpen(false) }}
              fluid
            />
          ))}
        </Dropdown.Section>
      </Dropdown>
    </Dropdown.Float>
  )
}
