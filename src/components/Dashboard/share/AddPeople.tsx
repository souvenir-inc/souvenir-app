'use client'

import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Button, IconButton } from '@/components/ui'
import { cn } from '@/lib/utils'
import { RoleMenu } from './AccessMenus'
import type { Match, People, Role, Share } from './share-model'
import { Avatar, FOCUS, ROLE_TEXT } from './share-ui'

// Adding people to a board (Figma 170:58396; SH-10 – SH-14): a field that takes chips, matches from
// the workspace as you type (a combobox with its own listbox), a role for them, and Invite.

export function AddPeople({ people, share, onListOpen, onInvite }: { people: People; share: Share; onListOpen: (open: boolean) => void; onInvite: (ids: string[], role: Role) => void }) {
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [role, setPickRole] = useState<Role>('view')
  const [active, setActive] = useState(0)
  const [closed, setClosed] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const found = people.matches(query, share, picked)
  const pickable = found.filter((m) => !m.has)
  const outside = people.outsideEmail(query)
  const showList = !!query.trim() && !closed
  // The list's state for the dialog's Esc (read in its handler, not while rendering).
  useEffect(() => { onListOpen(showList) }, [showList, onListOpen])

  const pick = (m: Match) => {
    if (m.has) return
    setPicked((p) => [...p, m.person.id])
    setQuery('')
    setActive(0)
    inputRef.current?.focus()
  }
  const send = () => {
    if (!picked.length) return
    onInvite(picked, role)
    setPicked([])
    setQuery('')
  }
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!pickable.length) return
      e.preventDefault()
      setClosed(false)
      setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + pickable.length) % pickable.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (showList && pickable[active]) pick(pickable[active])
      else if (!query.trim() && picked.length) send()
    } else if (e.key === 'Escape' && showList) {
      setClosed(true)
    } else if (e.key === 'Backspace' && !query && picked.length) {
      setPicked((p) => p.slice(0, -1))
    }
  }
  const activeId = showList && pickable[active] ? `share-match-${pickable[active].person.id}` : undefined

  return (
    <div className="relative">
      <div className="flex items-start gap-2">
        <div
          className="flex min-h-10 min-w-0 flex-1 cursor-text flex-wrap items-center gap-1.5 rounded-lg border border-solid border-[var(--dashboard-list-border)] bg-[var(--dashboard-card-bg)] py-1.5 pl-2 pr-1 focus-within:border-[var(--dashboard-way-border)]"
          onClick={() => inputRef.current?.focus()}
        >
          {picked.map((id) => {
            const m = people.get(id)
            return (
              <span key={id} data-chip={id} className="flex h-6 items-center gap-1.5 rounded-md bg-[var(--dashboard-chip-bg)] pl-1.5 pr-1 text-[length:var(--font-size-body-sm)] leading-5 text-[var(--dashboard-figure)]">
                <span aria-hidden className="flex size-4 items-center justify-center rounded-full text-[length:var(--dashboard-avatar-xs-size)] font-medium" style={{ background: m?.color }}>{m?.initials}</span>
                {m?.name}
                {/* A chip's × (Figma 170:70828). */}
                <IconButton
                  variant="ghost" size="xs" iconSize={11} aria-label={`Remove ${m?.name ?? 'this person'}`}
                  onClick={(e) => { e.stopPropagation(); setPicked((p) => p.filter((x) => x !== id)) }}
                  icon={<X strokeWidth={1.5} absoluteStrokeWidth />}
                  className={cn('size-4 rounded-sm text-[var(--dashboard-label)] [--hv:transparent] hover:text-[var(--dashboard-figure)] active:scale-100', FOCUS)}
                />
              </span>
            )
          })}
          {/* A combobox among its chips (A11Y combobox pattern): the field primitive has its own frame
              and label, so the bare input stays; it has a name, a listbox and an active descendant. */}
          {/* eslint-disable-next-line no-restricted-syntax -- ds-allow: the add field's input among its chips (Figma 170:58396) */}
          <input
            ref={inputRef}
            data-share-add
            role="combobox"
            aria-expanded={showList}
            aria-controls="share-matches"
            aria-autocomplete="list"
            aria-activedescendant={activeId}
            aria-label="Add people"
            placeholder={picked.length ? '' : 'Add people'}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); setClosed(false) }}
            onKeyDown={onKey}
            className="h-6 min-w-[80px] flex-1 border-0 bg-transparent px-1 text-[length:var(--font-size-body)] leading-5 text-[var(--dashboard-figure)] outline-none placeholder:text-[var(--dashboard-faint)]"
          />
          <RoleMenu value={role} label="Role for new people" onChange={setPickRole} compact />
        </div>
        <Button size="sm" data-invite disabled={!picked.length} onClick={send} className="h-10 shrink-0">Invite</Button>
      </div>

      {showList && (
        <div id="share-matches" role="listbox" aria-label="Matches" data-share-matches className="absolute inset-x-0 top-[calc(100%+4px)] z-10 max-h-[280px] overflow-y-auto rounded-xl border border-solid border-[var(--neutral-200)] bg-[var(--dashboard-card-bg)] p-1.5 shadow-[var(--dashboard-popover-shadow)]">
          {outside ? (
            <div data-outside className="flex flex-col items-start gap-1 px-2.5 py-2">
              <p className="m-0 text-[length:var(--font-size-body-sm)] font-medium leading-5 text-[var(--dashboard-figure)]">{outside} isn’t in {people.workspace}</p>
              <p className="m-0 text-[length:var(--font-size-small)] leading-4 text-[var(--dashboard-label)]">Boards can be shared with workspace members only. An admin can invite them to the workspace first.</p>
            </div>
          ) : found.length === 0 ? (
            <p data-no-match className="m-0 px-2.5 py-2 text-[length:var(--font-size-body-sm)] leading-5 text-[var(--dashboard-label)]">No one at {people.workspace} matches ‘{query.trim()}’</p>
          ) : (
            found.map((m) => {
              const on = pickable[active]?.person.id === m.person.id
              return (
                <div
                  key={m.person.id}
                  id={`share-match-${m.person.id}`}
                  role="option"
                  aria-selected={on}
                  aria-disabled={!!m.has}
                  data-match={m.person.id}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(m)}
                  className={cn('flex h-11 items-center gap-2.5 rounded-lg px-2.5', m.has ? 'cursor-default opacity-60' : 'cursor-pointer hover:bg-[var(--dashboard-sync-bg)]', on && 'bg-[var(--dashboard-sync-bg)]')}
                >
                  <Avatar member={m.person} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[length:var(--font-size-body-sm)] font-medium leading-5 text-[var(--dashboard-figure)]">{m.person.name}</span>
                    <span className="truncate text-[length:var(--font-size-small)] leading-4 text-[var(--dashboard-label)]">{m.person.email}</span>
                  </span>
                  {m.has && <span className="text-[length:var(--font-size-small)] text-[var(--dashboard-label)]">{m.has === 'owner' ? 'Owner' : ROLE_TEXT[m.has].label}</span>}
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
