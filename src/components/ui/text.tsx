import React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

// Text and Heading: every piece of UI copy sets its size, line height, weight and colour here instead
// of an inline style. Sizes are the type styles in src/styles/tokens/scales.css; colours are the
// neutral steps the app already uses (900 default, 700, 600, 500 muted, 400 subtle).
// Chat answers keep their own prose styles (--prose-*); this is for UI chrome.

const textVariants = cva('m-0', {
  variants: {
    variant: {
      display:      'text-display',
      'heading-xl': 'text-heading-xl',
      heading:      'text-heading',
      'heading-md': 'text-heading-md',
      'heading-sm': 'text-heading-sm',
      'body-lg':    'text-body-lg',
      body:         'text-body',
      'body-sm':    'text-body-sm',
      small:        'text-small',
      caption:      'text-caption',
      code:         'text-code font-[family-name:var(--font-code)]',
    },
    tone: {
      default:   'text-[var(--neutral-900)]',
      secondary: 'text-[var(--neutral-700)]',
      tertiary:  'text-[var(--neutral-600)]',
      muted:     'text-[var(--neutral-500)]',
      subtle:    'text-[var(--neutral-400)]',
      inverse:   'text-[var(--neutral-white)]',
      danger:    'text-[var(--red-600)]',
      success:   'text-[var(--green-600)]',
      inherit:   'text-inherit',
    },
    weight: {
      regular:  'font-normal',
      medium:   'font-medium',
      semibold: 'font-semibold',
    },
    truncate: {
      true: 'truncate',
    },
    lineClamp: {
      1: 'line-clamp-1',
      2: 'line-clamp-2',
      3: 'line-clamp-3',
    },
    align: {
      start:  'text-start',
      center: 'text-center',
      end:    'text-end',
    },
  },
  defaultVariants: { variant: 'body', tone: 'default', weight: 'regular' },
})

type TextElement = 'p' | 'span' | 'div' | 'label' | 'li' | 'dt' | 'dd' | 'figcaption' | 'strong' | 'em' | 'small' | 'time' | 'legend'

export type TextProps = Omit<React.HTMLAttributes<HTMLElement>, 'color'> &
  VariantProps<typeof textVariants> & {
    /** The element to render. Default `p`; use `span` inside a line of other content. */
    as?: TextElement
    /** For `as="label"`. */
    htmlFor?: string
    ref?: React.Ref<HTMLElement>
  }

export function Text({ as = 'p', variant, tone, weight, truncate, lineClamp, align, className, ref, ...props }: TextProps) {
  const Comp = as as React.ElementType
  return <Comp ref={ref} className={cn(textVariants({ variant, tone, weight, truncate, lineClamp, align }), className)} {...props} />
}

// ── Heading ─────────────────────────────────────────────────────────────────
// `level` sets the element (h1–h4) and a default size and weight; `variant` / `weight` override the
// look without changing the outline, e.g. a visually small h2.

const LEVEL_DEFAULTS = {
  1: { variant: 'heading',    weight: 'regular' },
  2: { variant: 'heading-md', weight: 'medium' },
  3: { variant: 'heading-sm', weight: 'semibold' },
  4: { variant: 'body-lg',    weight: 'semibold' },
} as const

export type HeadingProps = Omit<TextProps, 'as'> & {
  level?: 1 | 2 | 3 | 4
  /** Render a different element than the level implies (keeps the level's look). */
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'span' | 'div' | 'legend'
}

export function Heading({ level = 2, as, variant, weight, tone, truncate, lineClamp, align, className, ref, ...props }: HeadingProps) {
  const defaults = LEVEL_DEFAULTS[level]
  const Comp = (as ?? `h${level}`) as React.ElementType
  return (
    <Comp
      ref={ref}
      className={cn(
        textVariants({ variant: variant ?? defaults.variant, weight: weight ?? defaults.weight, tone, truncate, lineClamp, align }),
        className,
      )}
      {...props}
    />
  )
}
