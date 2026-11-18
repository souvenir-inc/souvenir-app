'use client'

import React, { useState } from 'react'
import { ArrowDownOneIcon } from '@strange-huge/icons'
import { Button } from '@/components/ui/button'
import { Dropdown, type DropdownPlacement } from '@/components/Dropdown'

// Select: choose one value from a short list, shown in the trigger. It is the app's existing
// select pattern (a secondary button that opens Dropdown.Float with the chosen item ticked, as in
// ProjectViewToggle and the role pickers) packaged once, so menus and selects stay one component.
// For long or searchable lists use a Combobox (not built yet; see the plan).
//
//   <Select aria-label="Sort" value={sort} onValueChange={setSort}
//     options={[{ value: 'recent', label: 'Recent' }, { value: 'name', label: 'Name' }]} />

export interface SelectOption<T extends string> {
  value: T
  label: string
  /** Second line in the menu (not shown in the trigger). */
  description?: string
  icon?: React.ReactElement
  disabled?: boolean
}

export interface SelectProps<T extends string> {
  options: ReadonlyArray<SelectOption<T>>
  value: T | undefined
  onValueChange: (value: T) => void
  /** Accessible name for the trigger; required when there is no visible label. */
  'aria-label'?: string
  /** Trigger text when nothing is chosen. */
  placeholder?: string
  /** Trigger look: secondary (default) or ghost / outline for quieter rows. */
  variant?: 'secondary' | 'ghost' | 'outline'
  size?: 'sm' | 'md'
  placement?: DropdownPlacement
  /** Menu width preset. @default 'md' */
  menuSize?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  className?: string
}

export function Select<T extends string>({
  options,
  value,
  onValueChange,
  placeholder = 'Select…',
  variant = 'secondary',
  size = 'sm',
  placement = 'bottom-start',
  menuSize = 'md',
  disabled = false,
  className,
  ...aria
}: SelectProps<T>) {
  const [open, setOpen] = useState(false)
  const current = options.find((o) => o.value === value)
  const trigger = (
    <Button
      variant={variant}
      size={size}
      disabled={disabled}
      aria-label={aria['aria-label']}
      aria-haspopup="menu"
      rightIcon={<ArrowDownOneIcon size={16} />}
      className={className}
    >
      {current?.label ?? placeholder}
    </Button>
  )
  if (disabled) return trigger
  return (
    <Dropdown.Float open={open} onOpenChange={setOpen} placement={placement} autoFlipVertical trigger={trigger}>
      <Dropdown size={menuSize}>
        <Dropdown.Section fluid>
          {options.map((option) => (
            <Dropdown.Item
              key={option.value}
              label={option.label}
              subLabel={option.description}
              icon={option.icon}
              selected={option.value === value}
              // The selection is announced, not only drawn: a single-choice menu item.
              role="menuitemradio"
              aria-checked={option.value === value}
              disabled={option.disabled}
              fluid
              onClick={() => { onValueChange(option.value); setOpen(false) }}
            />
          ))}
        </Dropdown.Section>
      </Dropdown>
    </Dropdown.Float>
  )
}
