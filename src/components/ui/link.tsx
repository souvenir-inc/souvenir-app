import React from 'react'
import NextLink from 'next/link'
import { ArrowUpRightOneIcon } from '@strange-huge/icons'
import { cn } from '@/lib/utils'

// TextLink: a link inside or beside text. In-app paths go through next/link (client navigation,
// prefetch); `external` opens a new tab with rel="noreferrer" and a small arrow. A link that looks like
// a button is a Button with asChild instead.
//
//   <TextLink href="/settings/usage">See usage</TextLink>
//   <TextLink href="https://docs…" external variant="subtle">Docs</TextLink>

const VARIANT = {
  /** Inside a sentence: underlined, inherits the text's colour. */
  inline:     'text-inherit underline underline-offset-2 decoration-[var(--neutral-300)] hover:decoration-current',
  /** On its own (a "See all"): no underline until hover, near-black. */
  standalone: 'text-[var(--neutral-900)] no-underline hover:underline underline-offset-2',
  /** Quiet: muted text, darker on hover. */
  subtle:     'text-[var(--neutral-500)] no-underline hover:text-[var(--neutral-900)]',
} as const

export type TextLinkProps = Omit<React.ComponentPropsWithoutRef<typeof NextLink>, 'href'> & {
  href: string
  variant?: keyof typeof VARIANT
  /** Opens in a new tab with rel="noreferrer" and an arrow. */
  external?: boolean
}

export function TextLink({ href, variant = 'inline', external = false, className, children, ...props }: TextLinkProps) {
  const classes = cn(
    'inline-flex items-center gap-0.5 rounded-xs cursor-pointer transition-colors duration-fast',
    'outline-2 outline-solid outline-offset-2 outline-transparent focus-visible:outline-[var(--focus-ring)]',
    VARIANT[variant],
    className,
  )
  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={classes} {...props}>
        {children}
        <ArrowUpRightOneIcon size={12} aria-hidden />
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    )
  }
  return <NextLink href={href} className={classes} {...props}>{children}</NextLink>
}
