import React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

// Card: the surface most panels in the app sit on. The default look is the one the code already
// repeats — 12px radius, var(--card-bg), the card shadow (--shadow-1). Header / Body / Footer give
// the usual padded sections; a card with one block of content can take `padding` instead.

export const cardVariants = cva('flex flex-col min-w-0 rounded-xl bg-[var(--card-bg)]', {
  variants: {
    variant: {
      /** Default: card shadow on the page background. */
      plain:       'shadow-1',
      /** Lifted, for project / schedule tiles. */
      raised:      'shadow-2',
      /** Sits inside another surface: a hairline border instead of a shadow. */
      inset:       'border border-solid border-[var(--border-default)] shadow-none',
      /** Settings panel: 16px radius, hairline border, soft shadow; no fill, so it shows the page tint. */
      panel:       'rounded-2xl border border-solid border-[var(--border-default)] shadow-panel bg-transparent',
      /** Stat tile inside a panel: 8px radius, white, soft shadow with a light ring. */
      tile:        'rounded-md bg-[var(--neutral-white)] shadow-tile',
      /** Clickable: card shadow, deeper on hover. */
      interactive: 'shadow-1 cursor-pointer transition-shadow duration-fast ease-standard hover:shadow-2',
    },
    padding: {
      none: 'p-0',
      sm:   'p-3',
      md:   'p-4',
      lg:   'p-6',
    },
  },
  defaultVariants: { variant: 'plain', padding: 'none' },
})

export type CardProps = React.HTMLAttributes<HTMLElement> &
  VariantProps<typeof cardVariants> & {
    as?: 'div' | 'section' | 'article' | 'li' | 'aside'
    ref?: React.Ref<HTMLElement>
  }

export function Card({ as = 'div', variant, padding, className, ref, ...props }: CardProps) {
  const Comp = as as React.ElementType
  return <Comp ref={ref} className={cn(cardVariants({ variant, padding }), className)} {...props} />
}

type SectionProps = React.HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> }

/** Title row: 20px / 24px padding, a hairline below. */
export function CardHeader({ className, ref, ...props }: SectionProps) {
  return <div ref={ref} className={cn('flex items-center justify-between gap-3 px-6 py-5 border-b border-solid border-[var(--neutral-100)]', className)} {...props} />
}

export function CardBody({ className, ref, ...props }: SectionProps) {
  return <div ref={ref} className={cn('flex flex-col gap-4 px-6 py-5 min-w-0', className)} {...props} />
}

/** Actions row: right-aligned, a hairline above. */
export function CardFooter({ className, ref, ...props }: SectionProps) {
  return <div ref={ref} className={cn('flex items-center justify-end gap-2 px-6 py-4 border-t border-solid border-[var(--neutral-100)]', className)} {...props} />
}
