import React from 'react'
import { cn } from '@/lib/utils'

// ScrollArea: a scrolling region with the app's thin scrollbar (the `kaya-scrollbar` style in
// globals.css). A native scroller underneath, so wheel, touch, keyboard and find-in-page behave as
// usual. `min-h-0` lets it shrink inside a flex column, the usual reason a panel doesn't scroll.

export interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  /** @default 'vertical' */
  orientation?: 'vertical' | 'horizontal' | 'both'
  ref?: React.Ref<HTMLDivElement>
}

const OVERFLOW = {
  vertical:   'overflow-y-auto overflow-x-hidden',
  horizontal: 'overflow-x-auto overflow-y-hidden',
  both:       'overflow-auto',
} as const

export function ScrollArea({ orientation = 'vertical', className, ref, ...props }: ScrollAreaProps) {
  return <div ref={ref} tabIndex={0} className={cn('kaya-scrollbar min-h-0 min-w-0', OVERFLOW[orientation], className)} {...props} />
}
