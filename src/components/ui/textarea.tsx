'use client'

import React, { useCallback, useLayoutEffect, useRef } from 'react'
import { Field as FieldPrimitive } from '@base-ui/react/field'
import { cn } from '@/lib/utils'

// Textarea: the multi-line twin of InputField — same surface (text-field tokens, hairline ring that
// darkens on hover and turns red when invalid, the blue focus outline that settles in from 6px to 3px).
// Built on Base UI Field.Control, so inside a <Field> it picks up the label, hint and invalid state.
//
//   <Textarea autoResize minRows={3} maxRows={8} maxLength={500} showCount … />

// Body text is 14 / 22; 7px top and bottom padding plus the 1px ring box make a 3-row box 82px tall.
const LINE_HEIGHT = 22
const PADDING_Y = 7

const textareaClassName = cn(
  'block w-full min-w-0 resize-none box-border m-0 border-0 outline-none',
  'px-2.5 py-[7px] rounded-lg', // 7px matches InputField's padding exactly
  'text-body font-normal font-[family-name:var(--font-body)]',
  'bg-[var(--text-field-bg)] text-[var(--text-field-text)] placeholder:text-[var(--text-field-placeholder)]',
  'shadow-[0px_1px_1.5px_0px_var(--neutral-700-12),0px_0px_0px_1px_var(--text-field-ring)]',
  'hover:shadow-[0px_1px_1.5px_0px_var(--neutral-700-12),0px_0px_0px_1px_var(--text-field-ring-hover)]',
  'data-[invalid]:shadow-[0px_1px_1.5px_0px_var(--neutral-700-12),0px_0px_0px_1px_var(--red-500)]',
  'outline-2 outline-solid outline-offset-[6px] outline-transparent',
  'focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-[3px] data-[invalid]:outline-transparent',
  'transition-[box-shadow,outline-color,outline-offset] duration-base ease-standard',
  'disabled:cursor-not-allowed disabled:text-[var(--text-field-label-disabled)]',
)

export interface TextareaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'rows'> {
  /** Grow with the content between minRows and maxRows (then scroll). */
  autoResize?: boolean
  /** Visible rows. With autoResize, the starting height. @default 3 */
  minRows?: number
  /** Cap for autoResize; beyond it the box scrolls. */
  maxRows?: number
  /** Show "n / maxLength" under the box (needs maxLength). */
  showCount?: boolean
  ref?: React.Ref<HTMLTextAreaElement>
}

const heightFor = (rows: number) => rows * LINE_HEIGHT + PADDING_Y * 2

export function Textarea({
  autoResize = false,
  minRows = 3,
  maxRows,
  showCount = false,
  maxLength,
  className,
  style,
  value,
  defaultValue,
  onChange,
  id,
  ref,
  ...props
}: TextareaProps) {
  const innerRef = useRef<HTMLTextAreaElement | null>(null)
  // Controlled: the count follows `value`. Uncontrolled: track what was typed.
  const [typedLength, setTypedLength] = React.useState(() => String(defaultValue ?? '').length)
  const length = value !== undefined ? String(value).length : typedLength

  const setRefs = useCallback((node: HTMLTextAreaElement | null) => {
    innerRef.current = node
    if (typeof ref === 'function') ref(node)
    else if (ref) (ref as React.RefObject<HTMLTextAreaElement | null>).current = node
  }, [ref])

  const resize = useCallback(() => {
    const el = innerRef.current
    if (!el || !autoResize) return
    el.style.height = 'auto'
    const max = maxRows ? heightFor(maxRows) : Infinity
    const next = Math.max(heightFor(minRows), Math.min(el.scrollHeight, max))
    el.style.height = `${next}px`
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden'
  }, [autoResize, minRows, maxRows])

  // Controlled value changes from outside (a reset, a draft restore) re-measure too.
  useLayoutEffect(() => {
    resize()
  }, [value, resize])

  // The id goes on Control, which renders it onto the textarea and registers it with
  // the Field's label; set on the textarea alone, label and field disagreed.
  const control = (
    <FieldPrimitive.Control
      id={id}
      render={
        <textarea
          ref={setRefs}
          rows={minRows}
          maxLength={maxLength}
          value={value}
          defaultValue={defaultValue}
          onChange={(e) => {
            if (value === undefined) setTypedLength(e.target.value.length)
            resize()
            onChange?.(e)
          }}
          className={cn(textareaClassName, className)}
          style={{ minHeight: heightFor(minRows), ...(maxRows && !autoResize ? { maxHeight: heightFor(maxRows) } : null), ...style }}
          {...props}
        />
      }
    />
  )

  if (!showCount || maxLength == null) return control
  return (
    <div className="flex flex-col gap-1 min-w-0">
      {control}
      <span aria-live="polite" className="self-end text-small text-[var(--neutral-500)] tabular-nums">
        {length} / {maxLength}
      </span>
    </div>
  )
}
