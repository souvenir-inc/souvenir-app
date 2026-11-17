'use client'

import React from 'react'
import { Collapsible as CollapsiblePrimitive } from '@base-ui/react/collapsible'
import { Accordion as AccordionPrimitive } from '@base-ui/react/accordion'
import { ArrowDownOneIcon } from '@strange-huge/icons'
import { cn } from '@/lib/utils'

// Collapsible: a section that opens and closes (show more, advanced options, a reasoning trace).
// Accordion: a set of them where opening one can close the others. Base UI supplies aria-expanded,
// aria-controls, keyboard support and the panel's measured height (--collapsible-panel-height /
// --accordion-panel-height), which the panels animate.
//
//   <Collapsible>
//     <CollapsibleTrigger>Advanced</CollapsibleTrigger>
//     <CollapsiblePanel>…</CollapsiblePanel>
//   </Collapsible>

const triggerClass = cn(
  'group inline-flex items-center gap-1.5 border-0 bg-transparent p-0 cursor-pointer',
  'text-body font-medium text-[var(--neutral-700)] hover:text-[var(--neutral-900)]',
  'rounded-xs outline-2 outline-solid outline-offset-2 outline-transparent focus-visible:outline-[var(--focus-ring)]',
)

const chevronClass = 'shrink-0 transition-transform duration-base ease-standard group-data-[panel-open]:rotate-180'

export const Collapsible = CollapsiblePrimitive.Root

export interface TriggerProps extends React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Trigger> {
  /** Show the chevron that turns when open. @default true */
  chevron?: boolean
}

export function CollapsibleTrigger({ chevron = true, className, children, ...props }: TriggerProps) {
  return (
    <CollapsiblePrimitive.Trigger className={cn(triggerClass, className)} {...props}>
      {children}
      {chevron && <ArrowDownOneIcon size={14} className={chevronClass} />}
    </CollapsiblePrimitive.Trigger>
  )
}

export function CollapsiblePanel({ className, ...props }: React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Panel>) {
  return (
    <CollapsiblePrimitive.Panel
      className={cn(
        'overflow-hidden h-[var(--collapsible-panel-height)] transition-[height] duration-base ease-standard',
        'data-[starting-style]:h-0 data-[ending-style]:h-0',
        className,
      )}
      {...props}
    />
  )
}

export const Accordion = AccordionPrimitive.Root
export const AccordionItem = AccordionPrimitive.Item

export function AccordionTrigger({ chevron = true, className, children, ...props }: React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger> & { chevron?: boolean }) {
  return (
    <AccordionPrimitive.Header className="m-0">
      <AccordionPrimitive.Trigger className={cn(triggerClass, 'w-full justify-between py-2', className)} {...props}>
        {children}
        {chevron && <ArrowDownOneIcon size={14} className={chevronClass} />}
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
}

export function AccordionPanel({ className, ...props }: React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Panel>) {
  return (
    <AccordionPrimitive.Panel
      className={cn(
        'overflow-hidden h-[var(--accordion-panel-height)] transition-[height] duration-base ease-standard',
        'data-[starting-style]:h-0 data-[ending-style]:h-0',
        className,
      )}
      {...props}
    />
  )
}
