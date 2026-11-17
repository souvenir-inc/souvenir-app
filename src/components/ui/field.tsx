'use client'

import React from 'react'
import { Field as FieldPrimitive } from '@base-ui/react/field'
import { cn } from '@/lib/utils'

// Field: label + control + hint + error, wired together by Base UI. The label's htmlFor, the
// control's id, aria-describedby (hint and error) and aria-invalid are all set automatically, so a
// form never hand-writes them. Controls that join a Field: Textarea, Input (InputField), RadioGroup,
// Checkbox, Switch. Text colours are the text-field tokens InputField already uses.
//
//   <Field invalid={!!error}>
//     <FieldLabel>Email</FieldLabel>
//     <Textarea … />
//     <FieldHint>We'll only use it for receipts.</FieldHint>
//     <FieldError>{error}</FieldError>
//   </Field>

export type FieldProps = React.ComponentPropsWithoutRef<typeof FieldPrimitive.Root> & {
  /** Shows the error state on the label, control and FieldError, and sets aria-invalid. */
  invalid?: boolean
}

export function Field({ className, invalid, ...props }: FieldProps) {
  return <FieldPrimitive.Root invalid={invalid} className={cn('flex flex-col gap-1 min-w-0', className)} {...props} />
}

export function FieldLabel({ className, ...props }: React.ComponentPropsWithoutRef<typeof FieldPrimitive.Label>) {
  return (
    <FieldPrimitive.Label
      className={cn(
        'flex items-center gap-1 m-0 text-body font-normal text-[var(--text-field-label)]',
        'data-[invalid]:text-[var(--text-field-label-error)] data-[disabled]:text-[var(--text-field-label-disabled)]',
        className,
      )}
      {...props}
    />
  )
}

/** Helper text under the control; linked to it through aria-describedby. */
export function FieldHint({ className, ...props }: React.ComponentPropsWithoutRef<typeof FieldPrimitive.Description>) {
  return (
    <FieldPrimitive.Description
      className={cn('m-0 text-small text-[var(--neutral-500)] data-[disabled]:text-[var(--text-field-label-disabled)]', className)}
      {...props}
    />
  )
}

/**
 * Error message. Renders only when it has content, and is linked to the control through
 * aria-describedby like the hint; pair it with `invalid` on the Field.
 */
export function FieldError({ className, children, ...props }: React.ComponentPropsWithoutRef<typeof FieldPrimitive.Description>) {
  if (children == null || children === false || children === '') return null
  return (
    <FieldPrimitive.Description role="alert" className={cn('m-0 text-small text-[var(--text-field-label-error)]', className)} {...props}>
      {children}
    </FieldPrimitive.Description>
  )
}
