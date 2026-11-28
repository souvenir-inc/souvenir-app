import React from 'react'
import { cn } from '@/lib/utils'

// Kbd: a keyboard shortcut chip (⌘ K, Esc). The shortcut pill the account menu already draws, on its
// --shortcut-pill-* tokens. Several keys: <Kbd>⌘</Kbd><Kbd>K</Kbd>, or one string: <Kbd>⌘ ,</Kbd>.

export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 shrink-0 items-center justify-center rounded-xs px-1 py-0.5',
        'bg-[var(--shortcut-pill-bg)] shadow-[0px_1px_1.5px_0px_var(--shortcut-pill-shadow),0px_0px_0px_1px_var(--shortcut-pill-ring)]',
        'font-[family-name:var(--font-body)] text-caption font-normal text-[var(--shortcut-pill-text)] whitespace-nowrap',
        className,
      )}
      {...props}
    />
  )
}
