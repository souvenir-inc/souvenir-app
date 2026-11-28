import React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

// Layout primitives: Box (padding, radius, surface), Stack (vertical), Inline (horizontal) and Grid.
// Spacing props only accept steps of the 4px scale (src/styles/tokens), so a gap or padding can't
// drift to 5, 7 or 13px. The key is Tailwind's spacing number: '3' = 12px, '1.5' = 6px.
// Class names are written out in full below because Tailwind only generates classes it can read.

export type Space = '0' | '0.5' | '1' | '1.5' | '2' | '2.5' | '3' | '4' | '5' | '6' | '8' | '10' | '12' | '16'

const GAP: Record<Space, string> = {
  '0': 'gap-0', '0.5': 'gap-0.5', '1': 'gap-1', '1.5': 'gap-1.5', '2': 'gap-2', '2.5': 'gap-2.5', '3': 'gap-3',
  '4': 'gap-4', '5': 'gap-5', '6': 'gap-6', '8': 'gap-8', '10': 'gap-10', '12': 'gap-12', '16': 'gap-16',
}
const P: Record<Space, string> = {
  '0': 'p-0', '0.5': 'p-0.5', '1': 'p-1', '1.5': 'p-1.5', '2': 'p-2', '2.5': 'p-2.5', '3': 'p-3',
  '4': 'p-4', '5': 'p-5', '6': 'p-6', '8': 'p-8', '10': 'p-10', '12': 'p-12', '16': 'p-16',
}
const PX: Record<Space, string> = {
  '0': 'px-0', '0.5': 'px-0.5', '1': 'px-1', '1.5': 'px-1.5', '2': 'px-2', '2.5': 'px-2.5', '3': 'px-3',
  '4': 'px-4', '5': 'px-5', '6': 'px-6', '8': 'px-8', '10': 'px-10', '12': 'px-12', '16': 'px-16',
}
const PY: Record<Space, string> = {
  '0': 'py-0', '0.5': 'py-0.5', '1': 'py-1', '1.5': 'py-1.5', '2': 'py-2', '2.5': 'py-2.5', '3': 'py-3',
  '4': 'py-4', '5': 'py-5', '6': 'py-6', '8': 'py-8', '10': 'py-10', '12': 'py-12', '16': 'py-16',
}

const ALIGN = { start: 'items-start', center: 'items-center', end: 'items-end', stretch: 'items-stretch', baseline: 'items-baseline' } as const
const JUSTIFY = { start: 'justify-start', center: 'justify-center', end: 'justify-end', between: 'justify-between' } as const

type Align = keyof typeof ALIGN
type Justify = keyof typeof JUSTIFY

type BaseProps = React.HTMLAttributes<HTMLElement> & {
  /** The element to render. Default `div`. */
  as?: React.ElementType
  ref?: React.Ref<HTMLElement>
}

// ── Box ─────────────────────────────────────────────────────────────────────

const boxVariants = cva('', {
  variants: {
    radius: {
      none: 'rounded-none', xs: 'rounded-xs', sm: 'rounded-sm', md: 'rounded-md', lg: 'rounded-lg',
      xl: 'rounded-xl', '2xl': 'rounded-2xl', full: 'rounded-full',
    },
    surface: {
      none:    '',
      default: 'bg-[var(--neutral-white)]',
      subtle:  'bg-[var(--neutral-50)]',
      muted:   'bg-[var(--neutral-100)]',
      card:    'bg-[var(--card-bg)]',
    },
    bordered: {
      true: 'border border-solid border-[var(--border-default)]',
    },
  },
})

export type BoxProps = BaseProps & VariantProps<typeof boxVariants> & {
  p?: Space
  px?: Space
  py?: Space
}

export function Box({ as: Comp = 'div', p, px, py, radius, surface, bordered, className, ref, ...props }: BoxProps) {
  return (
    <Comp
      ref={ref}
      className={cn(p && P[p], px && PX[px], py && PY[py], boxVariants({ radius, surface, bordered }), className)}
      {...props}
    />
  )
}

// ── Stack / Inline ──────────────────────────────────────────────────────────

export type StackProps = BaseProps & {
  gap?: Space
  align?: Align
  justify?: Justify
}

/** Children laid out top to bottom with an even gap. */
export function Stack({ as: Comp = 'div', gap = '0', align, justify, className, ref, ...props }: StackProps) {
  return (
    <Comp
      ref={ref}
      className={cn('flex flex-col', GAP[gap], align && ALIGN[align], justify && JUSTIFY[justify], className)}
      {...props}
    />
  )
}

export type InlineProps = BaseProps & {
  gap?: Space
  /** Default `center`, the usual case for an icon beside a label. */
  align?: Align
  justify?: Justify
  wrap?: boolean
}

/** Children laid out in a row with an even gap; vertically centred by default. */
export function Inline({ as: Comp = 'div', gap = '0', align = 'center', justify, wrap = false, className, ref, ...props }: InlineProps) {
  return (
    <Comp
      ref={ref}
      className={cn('flex flex-row', GAP[gap], ALIGN[align], justify && JUSTIFY[justify], wrap && 'flex-wrap', className)}
      {...props}
    />
  )
}

// ── Grid ────────────────────────────────────────────────────────────────────

const COLS = {
  1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4', 5: 'grid-cols-5', 6: 'grid-cols-6',
} as const
const MD_COLS = {
  1: 'md:grid-cols-1', 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-4', 5: 'md:grid-cols-5', 6: 'md:grid-cols-6',
} as const
const LG_COLS = {
  1: 'lg:grid-cols-1', 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4', 5: 'lg:grid-cols-5', 6: 'lg:grid-cols-6',
} as const

type ColCount = keyof typeof COLS

export type GridProps = BaseProps & {
  /** A column count, or counts per breakpoint: `{ base: 1, md: 2, lg: 3 }`. Columns share the width equally. */
  cols?: ColCount | { base?: ColCount; md?: ColCount; lg?: ColCount }
  gap?: Space
}

export function Grid({ as: Comp = 'div', cols = 1, gap = '0', className, ref, ...props }: GridProps) {
  const c = typeof cols === 'number' ? { base: cols } : cols
  return (
    <Comp
      ref={ref}
      className={cn('grid', c.base && COLS[c.base], c.md && MD_COLS[c.md], c.lg && LG_COLS[c.lg], GAP[gap], className)}
      {...props}
    />
  )
}
