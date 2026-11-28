'use client'

import type React from 'react'
import { cn } from '@/lib/utils'
import type { People, Person, Role } from './share-model'

// Pieces the Share dialog's parts share: the focus ring, role wording, people rows and menu look.

export const FOCUS = 'outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]'

export const ROLE_TEXT: Record<Role, { label: string; line: string }> = {
  view: { label: 'Can view', line: 'Read every card, pick their own dates, download' },
  edit: { label: 'Can edit', line: 'Also change cards and keep the board’s dates' },
}

/** A menu inside the dialog: the popover surface, above the dialog. */
export const MENU_SURFACE = 'flex flex-col bg-[var(--popover-bg)] p-1.5 outline-none'
export const MENU_STYLE: React.CSSProperties = { zIndex: 'var(--z-popover)', boxShadow: 'var(--dashboard-popover-shadow)', borderRadius: 'var(--radius-xl)' }
/** A menu row with its line under it; Radix moves the highlight with the arrow keys. */
export const MENU_ITEM = cn(
  'flex w-full cursor-pointer select-none flex-col items-start gap-0.5 rounded-lg px-2.5 py-1.5 text-left outline-none',
  'hover:bg-[var(--dashboard-sync-bg)] data-[highlighted]:bg-[var(--dashboard-sync-bg)] data-[disabled]:cursor-not-allowed data-[disabled]:opacity-60',
)

export function Avatar({ member }: { member: Person | undefined }) {
  return (
    <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full text-[length:var(--dashboard-micro-size)] font-medium text-[var(--dashboard-figure)]" style={{ background: member?.color }}>
      {member?.initials}
    </span>
  )
}

export function PersonRow({ people, id, right }: { people: People; id: string; right: React.ReactNode }) {
  const m = people.get(id)
  return (
    <li data-person={id} className="flex min-h-12 items-center gap-2.5 py-1.5">
      <Avatar member={m} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[length:var(--font-size-body)] font-medium leading-5 text-[var(--dashboard-figure)]">{people.displayName(id)}</span>
        {m && <span className="truncate text-[length:var(--font-size-small)] leading-4 text-[var(--dashboard-label)]">{m.email}</span>}
      </span>
      {right}
    </li>
  )
}
