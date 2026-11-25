'use client'

import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Check, ChevronDown, Globe, Hash, Link2, Lock, TriangleAlert, X } from 'lucide-react'
import { PopoverContent, PopoverRoot, PopoverTrigger } from '@/components/Popover'
import { Button, IconButton } from '@/components/ui'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useOrgIdentity } from '@/context/org-context'
import { ApiError } from '@/lib/api/client'
import { Warehouse } from '@/lib/api/warehouse'
import { orgScope, queryKeys } from '@/lib/query-keys'
import { ORG_SOUVENIR_SLACK_ROUTE } from '@/lib/routes'
import { cn } from '@/lib/utils'
import type { CardView } from '../MetricCard'
import { useDashboardData } from '../live/dashboard-data'
import type { Board } from '../tabs/board-state'
import { dims } from '../grid-layout'
import { BoardSnapshot, SNAPSHOT_WIDTH } from './BoardSnapshot'
import { fileBase, nodeToPng } from './export'
import {
  boardLink, copyText, datesLabel, linkCaption,
  type General, type Grant, type Match, type People, type Person, type Role, type Share as BoardShare,
} from './share-model'
import { usePeople } from './use-people'

// The Share dialog (Figma 170:58396 – 171:94333; 09-share-export-rules.md SH-4 – SH-28), Option A: a
// centred 520 px dialog. People with access, adding people, roles, general access, the link, and
// Post to Slack as a second step in the same dialog. Who has access is the board's own (its general
// access and grants); a change is saved with the board.

const FOCUS = 'outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]'
const ROLE_TEXT: Record<Role, { label: string; line: string }> = {
  view: { label: 'Can view', line: 'Read every card, pick their own dates, download' },
  edit: { label: 'Can edit', line: 'Also change cards and keep the board’s dates' },
}

export type ShareStart = 'people' | 'link' | 'slack'

interface ShareDialogProps {
  open: boolean
  startOn: ShareStart
  board: Board
  /** The dates on screen: what the link opens on (SH-21). */
  period: string
  compare: string
  /** Cards as they read now, for the Slack picture. */
  cardView: (metricId: string) => CardView | undefined
  stamp: string
  /** The board new members open on: it stays open to the workspace until another is picked. */
  isDefault?: boolean
  /** The owner changed who has access. */
  onChange: (access: { general?: General; grants?: Grant[] }) => void
  onClose: () => void
  onPosted: (channel: string) => void
}

export function ShareDialog({ open, ...rest }: ShareDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) rest.onClose() }}>
      {open && <Share {...rest} />}
    </Dialog>
  )
}

function Share({ startOn, board, period, compare, cardView, stamp, isDefault = false, onChange, onClose, onPosted }: Omit<ShareDialogProps, 'open'>) {
  const people = usePeople()
  const share: BoardShare = { ownerId: board.ownerId, grants: board.grants, general: board.general }
  const owner = board.access === 'owner'
  const viewer = board.access === 'view'
  const [step, setStep] = useState<'people' | 'slack'>(startOn === 'slack' ? 'slack' : 'people')
  const [linkFailed, setLinkFailed] = useState(startOn === 'link')
  const [copied, setCopied] = useState(false)
  const [caption, setCaption] = useState(false)
  const [removed, setRemoved] = useState<{ name: string; grants: Grant[] } | null>(null)
  const listOpen = useRef(false)
  const link = boardLink(typeof window === 'undefined' ? '' : window.location.origin, board.id, period, compare)

  useEffect(() => {
    if (!copied) return
    const t = window.setTimeout(() => setCopied(false), 2_000)
    return () => window.clearTimeout(t)
  }, [copied])

  const copy = async () => {
    const ok = await copyText(link)
    setLinkFailed(!ok)
    setCopied(ok)
    setCaption(ok)
  }

  return (
    <DialogContent
      hideClose
      aria-describedby={undefined}
      data-share-dialog
      data-step={step}
      style={{ width: 'min(520px, calc(100vw - 32px))', maxWidth: 'none', maxHeight: 'calc(100dvh - 96px)', borderRadius: 16, padding: 0, background: 'var(--dashboard-card-bg)', display: 'flex', flexDirection: 'column', overflow: 'visible' }}
      // Esc closes the matches or an open menu first, not the dialog (SH-10).
      onEscapeKeyDown={(e) => {
        const menu = document.querySelector('[data-share-dialog] [data-role-menu], [data-share-dialog] [data-general-menu], [data-share-dialog] [aria-label="Channels"]')
        if (menu) document.querySelector<HTMLElement>('[data-share-dialog] [aria-expanded="true"][data-state="open"]')?.click()
        if (listOpen.current || menu) e.preventDefault()
      }}
      onOpenAutoFocus={(e) => { e.preventDefault(); (document.querySelector('[data-share-add]') as HTMLElement | null)?.focus() }}
    >
      {step === 'slack' ? (
        <SlackStep board={board} period={period} compare={compare} cardView={cardView} stamp={stamp} link={link} people={people} onBack={() => setStep('people')} onPosted={onPosted} />
      ) : (
        <>
          <div className="relative flex shrink-0 items-center px-5 pb-3 pt-5">
            <DialogTitle className="min-w-0 truncate pr-8 text-[16px] font-semibold leading-6 text-[var(--dashboard-figure)]">Share “{board.label}”</DialogTitle>
            <DialogClose asChild>
              <IconButton variant="ghost" size="sm" iconSize={14} aria-label="Close" className="absolute right-3.5 top-4 size-7 rounded-[8px]" icon={<X strokeWidth={1.5} absoluteStrokeWidth />} />
            </DialogClose>
          </div>

          <div className="shrink-0 px-5">
            {owner ? (
              <AddPeople
                people={people} share={share} onListOpen={(o) => { listOpen.current = o }}
                onInvite={(ids, role) => onChange({ grants: [...share.grants.filter((g) => !ids.includes(g.userId)), ...ids.map((userId) => ({ userId, role }))] })}
              />
            ) : (
              <p data-share-readonly className="m-0 pb-1 text-[13px] leading-5 text-[var(--dashboard-label)]">Only {people.name(share.ownerId)} can change who has access.</p>
            )}
            <p className="m-0 pb-1 pt-4 text-[12px] font-medium leading-4 text-[var(--dashboard-label)]">People with access</p>
          </div>

          {/* Only the people list scrolls (SH-9). */}
          <ul data-share-people className="kaya-scrollbar m-0 min-h-0 flex-1 list-none overflow-y-auto px-5 py-0">
            <PersonRow people={people} id={share.ownerId} right={<span className="pr-1 text-[13px] text-[var(--dashboard-label)]">Owner</span>} />
            {people.sortGrants(share.grants).map((g) => (
              <PersonRow
                key={g.userId}
                people={people}
                id={g.userId}
                right={owner ? (
                  <RoleMenu
                    value={g.role}
                    label={`${people.name(g.userId)}’s role`}
                    onChange={(role) => onChange({ grants: share.grants.map((x) => (x.userId === g.userId ? { ...x, role } : x)) })}
                    onRemove={() => {
                      setRemoved({ name: people.name(g.userId), grants: share.grants })
                      onChange({ grants: share.grants.filter((x) => x.userId !== g.userId) })
                    }}
                  />
                ) : <span className="pr-1 text-[13px] text-[var(--dashboard-label)]">{ROLE_TEXT[g.role].label}</span>}
              />
            ))}
          </ul>

          <div className="shrink-0 px-5">
            {removed && (
              <p data-share-removed role="status" className="m-0 flex items-center gap-2 py-2 text-[13px] leading-5 text-[var(--dashboard-label)]">
                {removed.name} no longer has access.
                {/* eslint-disable-next-line no-restricted-syntax -- ds-allow: an inline Undo (Figma 170:78020) */}
                <button type="button" onClick={() => { onChange({ grants: removed.grants }); setRemoved(null) }} className={cn('cursor-pointer rounded-sm border-0 bg-transparent p-0 text-[13px] font-medium text-[var(--dashboard-figure)] underline underline-offset-2', FOCUS)}>Undo</button>
              </p>
            )}
            <span aria-hidden className="mt-2 block h-px bg-[var(--neutral-200)]" />
            <p className="m-0 pb-2 pt-3 text-[12px] font-medium leading-4 text-[var(--dashboard-label)]">General access</p>
            <GeneralAccess people={people} share={share} editable={owner} isDefault={isDefault} onChange={(general) => onChange({ general })} />

            {linkFailed && (
              <div data-link-failed className="mt-3 flex flex-col gap-1.5">
                {/* eslint-disable-next-line no-restricted-syntax -- ds-allow: the read-only link to select (Figma 170:85246) */}
                <input
                  readOnly
                  aria-label="Link to this board"
                  value={link}
                  ref={(el) => { el?.select() }}
                  onFocus={(e) => e.currentTarget.select()}
                  className="h-9 w-full rounded-lg border border-solid border-[var(--dashboard-list-border)] bg-[var(--dashboard-panel-bg)] px-3 text-[13px] text-[var(--dashboard-figure)] outline-none focus:border-[var(--dashboard-way-border)]"
                />
                <p role="alert" className="m-0 text-[12px] leading-4 text-[var(--dashboard-error)]">Couldn’t copy the link. Press ⌘C to copy it.</p>
              </div>
            )}
            {caption && !linkFailed && <p data-link-caption className="m-0 pt-3 text-[12px] leading-4 text-[var(--dashboard-label)]">{linkCaption(period, compare)}</p>}
          </div>

          <div className="mt-4 flex shrink-0 items-center gap-2 border-t border-solid border-[var(--neutral-200)] px-5 py-4">
            <Button
              variant="outline" size="sm" data-copy-link onClick={copy}
              leftIcon={copied ? <Check aria-hidden strokeWidth={1.5} absoluteStrokeWidth /> : <Link2 aria-hidden strokeWidth={1.5} absoluteStrokeWidth />}
            >
              {copied ? 'Copied' : 'Copy link'}
            </Button>
            {/* Viewers get Copy link only: a Slack post puts the board in front of a channel (SH-8). */}
            {!viewer && (
              <Button variant="outline" size="sm" data-post-slack onClick={() => setStep('slack')} leftIcon={<Hash aria-hidden strokeWidth={1.5} absoluteStrokeWidth />}>
                Post to Slack
              </Button>
            )}
            <Button size="sm" className="ml-auto" onClick={onClose}>Done</Button>
          </div>
        </>
      )}
    </DialogContent>
  )
}

// ── Rows ─────────────────────────────────────────────────────────────────────────────

function Avatar({ member }: { member: Person | undefined }) {
  return (
    <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-medium text-[var(--dashboard-figure)]" style={{ background: member?.color }}>
      {member?.initials}
    </span>
  )
}

function PersonRow({ people, id, right }: { people: People; id: string; right: React.ReactNode }) {
  const m = people.get(id)
  return (
    <li data-person={id} className="flex min-h-12 items-center gap-2.5 py-1.5">
      <Avatar member={m} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[14px] font-medium leading-5 text-[var(--dashboard-figure)]">{people.displayName(id)}</span>
        {m && <span className="truncate text-[12px] leading-4 text-[var(--dashboard-label)]">{m.email}</span>}
      </span>
      {right}
    </li>
  )
}

// ── Menus (inside the dialog, so portal={false}) ─────────────────────────────────────

const MENU_ITEM = cn('flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-lg border-0 bg-transparent px-2.5 py-1.5 text-left hover:bg-[var(--dashboard-sync-bg)] focus-visible:bg-[var(--dashboard-sync-bg)]', FOCUS)

function RoleMenu({ value, label, onChange, onRemove, compact = false }: { value: Role; label: string; onChange: (r: Role) => void; onRemove?: () => void; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <PopoverRoot open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {/* eslint-disable-next-line no-restricted-syntax -- ds-allow: the quiet role trigger (Figma 170:77629) */}
        <button
          type="button"
          aria-label={`${label}: ${ROLE_TEXT[value].label}`}
          data-role-trigger
          className={cn('flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md border-0 bg-transparent px-1.5 text-[13px] leading-5 text-[var(--neutral-700)] hover:bg-[var(--dashboard-sync-bg)] data-[state=open]:bg-[var(--dashboard-sync-bg)]', compact && 'h-6', FOCUS)}
        >
          {ROLE_TEXT[value].label}<ChevronDown aria-hidden size={12} strokeWidth={1.5} absoluteStrokeWidth />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom" align="end" sideOffset={4} collisionPadding={8} variant="dropdown" maxHeight={false} portal={false}
        style={{ width: 220, boxShadow: 'var(--dashboard-popover-shadow)', borderRadius: 12 }}
      >
        <div role="menu" aria-label={label} data-role-menu className="flex flex-col p-1.5">
          {(['view', 'edit'] as const).map((r) => (
            // eslint-disable-next-line no-restricted-syntax -- ds-allow: a role with its line (Figma 170:77629)
            <button key={r} type="button" role="menuitemradio" aria-checked={value === r} onClick={() => { setOpen(false); onChange(r) }} className={MENU_ITEM}>
              <span className="flex w-full items-center text-[13px] font-medium leading-5 text-[var(--dashboard-figure)]">
                {ROLE_TEXT[r].label}
                {value === r && <Check aria-hidden size={14} strokeWidth={1.5} absoluteStrokeWidth className="ml-auto" />}
              </span>
              <span className="text-[12px] leading-4 text-[var(--dashboard-label)]">{ROLE_TEXT[r].line}</span>
            </button>
          ))}
          {onRemove && (
            <>
              <span aria-hidden className="mx-1 my-1 h-px bg-[var(--neutral-200)]" />
              {/* eslint-disable-next-line no-restricted-syntax -- ds-allow: Remove access in red (Figma 170:77629) */}
              <button type="button" role="menuitem" onClick={() => { setOpen(false); onRemove() }} className={cn(MENU_ITEM, 'text-[13px] font-medium leading-5 text-[var(--dashboard-error)]')}>Remove access</button>
            </>
          )}
        </div>
      </PopoverContent>
    </PopoverRoot>
  )
}

function GeneralAccess({ people, share, editable, isDefault, onChange }: { people: People; share: BoardShare; editable: boolean; isDefault: boolean; onChange: (general: General) => void }) {
  const [open, setOpen] = useState(false)
  const everyone = share.general !== 'none'
  const title = everyone ? `Everyone at ${people.workspace}` : 'Only people added'
  const line = everyone ? 'Anyone in the workspace can open this board' : 'Only the people above can open this board'
  const lose = people.loseCount(share)
  return (
    <div data-general-access={share.general} className="flex items-center gap-2.5">
      <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--dashboard-sync-bg)] text-[var(--neutral-700)]">
        {everyone ? <Globe size={15} strokeWidth={1.5} absoluteStrokeWidth /> : <Lock size={15} strokeWidth={1.5} absoluteStrokeWidth />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col items-start">
        {editable ? (
          <PopoverRoot open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              {/* eslint-disable-next-line no-restricted-syntax -- ds-allow: the general access trigger (Figma 170:58430) */}
              <button type="button" data-general-trigger className={cn('flex cursor-pointer items-center gap-1 rounded-md border-0 bg-transparent p-0 text-[14px] font-medium leading-5 text-[var(--dashboard-figure)]', FOCUS)}>
                {title}<ChevronDown aria-hidden size={12} strokeWidth={1.5} absoluteStrokeWidth />
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="bottom" align="start" sideOffset={4} collisionPadding={8} variant="dropdown" maxHeight={false} portal={false}
              style={{ width: 260, boxShadow: 'var(--dashboard-popover-shadow)', borderRadius: 12 }}
            >
              <div role="menu" aria-label="General access" data-general-menu className="flex flex-col p-1.5">
                {/* The default board can't be made private: new members open on it (the warehouse refuses it too). */}
                {/* eslint-disable-next-line no-restricted-syntax -- ds-allow: a general access choice (Figma 170:78449) */}
                <button type="button" role="menuitemradio" aria-checked={!everyone} aria-disabled={everyone && isDefault} data-default-locked={everyone && isDefault ? '' : undefined} onClick={() => { if (everyone && isDefault) return; setOpen(false); onChange('none') }} className={cn(MENU_ITEM, everyone && isDefault && 'cursor-not-allowed opacity-60')}>
                  <span className="flex w-full items-center text-[13px] font-medium leading-5 text-[var(--dashboard-figure)]">Only people added{!everyone && <Check aria-hidden size={14} strokeWidth={1.5} absoluteStrokeWidth className="ml-auto" />}</span>
                  {/* Going back shows who loses access first (SH-19). */}
                  <span data-lose-count={everyone && !isDefault ? lose : undefined} className={cn('text-[12px] leading-4', everyone && !isDefault ? 'text-[var(--dashboard-error)]' : 'text-[var(--dashboard-label)]')}>
                    {everyone && isDefault ? 'New members open on this board. Pick another default board first.'
                      : everyone ? `${lose} ${lose === 1 ? 'person loses' : 'people lose'} access` : 'Only the people above can open this board'}
                  </span>
                </button>
                {/* eslint-disable-next-line no-restricted-syntax -- ds-allow: a general access choice (Figma 170:78449) */}
                <button type="button" role="menuitemradio" aria-checked={everyone} onClick={() => { setOpen(false); if (!everyone) onChange('view') }} className={MENU_ITEM}>
                  <span className="flex w-full items-center text-[13px] font-medium leading-5 text-[var(--dashboard-figure)]">Everyone at {people.workspace}{everyone && <Check aria-hidden size={14} strokeWidth={1.5} absoluteStrokeWidth className="ml-auto" />}</span>
                  <span className="text-[12px] leading-4 text-[var(--dashboard-label)]">Anyone in the workspace can open this board</span>
                </button>
              </div>
            </PopoverContent>
          </PopoverRoot>
        ) : (
          <span className="text-[14px] font-medium leading-5 text-[var(--dashboard-figure)]">{title}</span>
        )}
        <span className="text-[12px] leading-4 text-[var(--dashboard-label)]">{line}</span>
      </span>
      {share.general !== 'none' && (
        editable
          ? <RoleMenu value={share.general} label="Everyone’s role" onChange={onChange} />
          : <span className="pr-1 text-[13px] text-[var(--dashboard-label)]">{ROLE_TEXT[share.general].label}</span>
      )}
    </div>
  )
}

// ── Adding people (SH-10 – SH-14) ──────────────────────────────────────────────────────

function AddPeople({ people, share, onListOpen, onInvite }: { people: People; share: BoardShare; onListOpen: (open: boolean) => void; onInvite: (ids: string[], role: Role) => void }) {
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
    document.querySelector<HTMLInputElement>('[data-share-add]')?.focus()
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

  return (
    <div className="relative">
      <div className="flex items-start gap-2">
        <div
          className="flex min-h-10 min-w-0 flex-1 cursor-text flex-wrap items-center gap-1.5 rounded-[10px] border border-solid border-[var(--dashboard-list-border)] bg-[var(--dashboard-card-bg)] py-1.5 pl-2 pr-1 focus-within:border-[var(--dashboard-way-border)]"
          onClick={() => inputRef.current?.focus()}
        >
          {picked.map((id) => {
            const m = people.get(id)
            return (
              <span key={id} data-chip={id} className="flex h-6 items-center gap-1.5 rounded-md bg-[var(--dashboard-chip-bg)] pl-1.5 pr-1 text-[13px] leading-5 text-[var(--dashboard-figure)]">
                <span aria-hidden className="flex size-4 items-center justify-center rounded-full text-[8px] font-medium" style={{ background: m?.color }}>{m?.initials}</span>
                {m?.name}
                {/* eslint-disable-next-line no-restricted-syntax -- ds-allow: a chip's × (Figma 170:70828) */}
                <button type="button" aria-label={`Remove ${m?.name}`} onClick={(e) => { e.stopPropagation(); setPicked((p) => p.filter((x) => x !== id)) }} className={cn('flex size-4 cursor-pointer items-center justify-center rounded-sm border-0 bg-transparent p-0 text-[var(--dashboard-label)] hover:text-[var(--dashboard-figure)]', FOCUS)}>
                  <X size={11} strokeWidth={1.5} absoluteStrokeWidth />
                </button>
              </span>
            )
          })}
          {/* eslint-disable-next-line no-restricted-syntax -- ds-allow: the add field's input among its chips (Figma 170:58396) */}
          <input
            ref={inputRef}
            data-share-add
            role="combobox"
            aria-expanded={showList}
            aria-controls="share-matches"
            aria-label="Add people"
            placeholder={picked.length ? '' : 'Add people'}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); setClosed(false) }}
            onKeyDown={onKey}
            className="h-6 min-w-[80px] flex-1 border-0 bg-transparent px-1 text-[14px] leading-5 text-[var(--dashboard-figure)] outline-none placeholder:text-[var(--dashboard-faint)]"
          />
          <RoleMenu value={role} label="Role for new people" onChange={setPickRole} compact />
        </div>
        <Button size="sm" data-invite disabled={!picked.length} onClick={send} className="h-10 shrink-0">Invite</Button>
      </div>

      {showList && (
        <div id="share-matches" role="listbox" aria-label="Matches" data-share-matches className="absolute inset-x-0 top-[calc(100%+4px)] z-10 max-h-[280px] overflow-y-auto rounded-xl border border-solid border-[var(--neutral-200)] bg-[var(--dashboard-card-bg)] p-1.5 shadow-[var(--dashboard-popover-shadow)]">
          {outside ? (
            <div data-outside className="flex flex-col items-start gap-1 px-2.5 py-2">
              <p className="m-0 text-[13px] font-medium leading-5 text-[var(--dashboard-figure)]">{outside} isn’t in {people.workspace}</p>
              <p className="m-0 text-[12px] leading-4 text-[var(--dashboard-label)]">Boards can be shared with workspace members only. An admin can invite them to the workspace first.</p>
            </div>
          ) : found.length === 0 ? (
            <p data-no-match className="m-0 px-2.5 py-2 text-[13px] leading-5 text-[var(--dashboard-label)]">No one at {people.workspace} matches ‘{query.trim()}’</p>
          ) : (
            found.map((m) => {
              const on = pickable[active]?.person.id === m.person.id
              return (
                <div
                  key={m.person.id}
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
                    <span className="truncate text-[13px] font-medium leading-5 text-[var(--dashboard-figure)]">{m.person.name}</span>
                    <span className="truncate text-[12px] leading-4 text-[var(--dashboard-label)]">{m.person.email}</span>
                  </span>
                  {m.has && <span className="text-[12px] text-[var(--dashboard-label)]">{m.has === 'owner' ? 'Owner' : ROLE_TEXT[m.has].label}</span>}
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

// ── Post to Slack (SH-25 – SH-28) ──────────────────────────────────────────────────────

function SlackStep({ board, period, compare, cardView, stamp, link, people, onBack, onPosted }: { board: Board; period: string; compare: string; cardView: (id: string) => CardView | undefined; stamp: string; link: string; people: People; onBack: () => void; onPosted: (channel: string) => void }) {
  const { warehouse, today } = useDashboardData()
  const { orgId } = useOrgIdentity()
  // The channels Souvenir is in; none listed means Slack isn't installed for the workspace (SH-27).
  const slack = useQuery({
    queryKey: [...queryKeys.warehouse.all(orgScope(orgId)), 'slack-channels'],
    queryFn: ({ signal }) => Warehouse.slackChannels(signal),
    staleTime: 60_000,
  })
  const channels = slack.data?.channels ?? []
  const [picked, setPicked] = useState<string | null>(null)
  const channel = channels.find((c) => c.id === picked) ?? channels[0]
  const [posting, setPosting] = useState(false)
  /** Why the last post didn't go, as the person reads it; null when it did (or none was tried). */
  const [failed, setFailed] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  // The picture that's posted: the board at full size, drawn off screen.
  const shotRef = useRef<HTMLDivElement>(null)
  const sharer = people.name(people.viewer)
  const rows = board.cards.reduce((h, c) => Math.max(h, c.y + dims(c.size).h), 1)
  const fullHeight = 32 + rows * 156 + (rows - 1) * 16 + 28
  const width = 444
  const scale = width / SNAPSHOT_WIDTH

  const post = async () => {
    if (!channel || !shotRef.current) return
    setPosting(true)
    setFailed(null)
    try {
      const image = await nodeToPng(shotRef.current)
      const text = `${sharer} shared *${board.label}* · ${datesLabel(period, compare)}\n${link}`
      await warehouse.postToSlack(board.id, image, `${fileBase(board.label, period, today)}.png`, channel.id, text)
      onPosted(channel.name)
    } catch (error) {
      console.error('[dashboard] posting to Slack failed', error)
      setPosting(false)
      const status = error instanceof ApiError ? error.status : 0
      // 403: the person or Souvenir has left that channel since the list was read. 409: Slack was
      // disconnected from the organization. Either way the channel list is read again.
      if (status === 403 || status === 409) void slack.refetch()
      setFailed(status === 403 ? `You or Souvenir are no longer in #${channel.name}. Pick another channel.`
        : status === 409 ? 'Slack is no longer connected to your organization.'
        : `Couldn’t post to #${channel.name}. Try again.`)
    }
  }

  return (
    <>
      <div className="relative flex shrink-0 items-center gap-1.5 px-4 pb-3 pt-5">
        <IconButton variant="ghost" size="sm" iconSize={14} aria-label="Back to people" onClick={onBack} className="size-7 rounded-[8px]" icon={<ArrowLeft strokeWidth={1.5} absoluteStrokeWidth />} />
        <DialogTitle className="text-[16px] font-semibold leading-6 text-[var(--dashboard-figure)]">Post to Slack</DialogTitle>
        <DialogClose asChild>
          <IconButton variant="ghost" size="sm" iconSize={14} aria-label="Close" className="absolute right-3.5 top-4 size-7 rounded-[8px]" icon={<X strokeWidth={1.5} absoluteStrokeWidth />} />
        </DialogClose>
      </div>

      {slack.isLoading ? (
        <p role="status" className="m-0 px-5 pb-5 text-[13px] leading-5 text-[var(--dashboard-label)]">Looking for your Slack channels…</p>
      ) : slack.isError ? (
        <div data-slack-failed className="flex flex-col items-start gap-1 px-5 pb-5">
          <p role="alert" className="m-0 text-[13px] leading-5 text-[var(--dashboard-error)]">Couldn’t reach Slack.</p>
          <Button size="sm" variant="outline" className="mt-2" onClick={() => { void slack.refetch() }}>Try again</Button>
        </div>
      ) : !slack.data?.connected || !channel ? (
        // Slack isn't installed, or there's no channel both the person and Souvenir are in (SH-27).
        // The second also covers a person whose Slack account isn't linked to Souvenir yet: the
        // warehouse lists no channels for them either, and can't say which of the two it is.
        <div data-slack-off className="flex flex-col items-start gap-1 px-5 pb-5">
          <p className="m-0 text-[14px] font-medium leading-5 text-[var(--dashboard-figure)]">
            {slack.data?.connected ? 'No Slack channel you and Souvenir are both in' : 'Connect Slack to post boards to a channel'}
          </p>
          <p className="m-0 text-[13px] leading-5 text-[var(--dashboard-label)]">
            {slack.data?.connected
              ? 'Boards go only to channels you’re both in. Invite Souvenir to one of yours, or link your Slack account to Souvenir if you haven’t.'
              : 'You’ll pick the channel each time you post.'}
          </p>
          {slack.data?.connected ? (
            <Button size="sm" variant="outline" className="mt-3" onClick={() => { void slack.refetch() }}>Check again</Button>
          ) : (
            <Button size="sm" className="mt-3" onClick={() => { window.location.assign(ORG_SOUVENIR_SLACK_ROUTE) }}>Connect Slack</Button>
          )}
        </div>
      ) : (
        <>
          <div className="kaya-scrollbar min-h-0 flex-1 overflow-y-auto px-5">
            <p className="m-0 pb-1.5 text-[12px] font-medium leading-4 text-[var(--dashboard-label)]">Channel</p>
            <PopoverRoot open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                {/* eslint-disable-next-line no-restricted-syntax -- ds-allow: the channel select (Figma 171:94068) */}
                <button type="button" data-channel={channel.name} className={cn('flex h-10 w-full cursor-pointer items-center gap-1.5 rounded-[10px] border border-solid border-[var(--dashboard-list-border)] bg-[var(--dashboard-card-bg)] px-3 text-left text-[14px] leading-5 text-[var(--dashboard-figure)]', FOCUS)}>
                  <Hash aria-hidden size={14} strokeWidth={1.5} absoluteStrokeWidth className="text-[var(--dashboard-label)]" />
                  <span className="flex-1">{channel.name}</span>
                  <ChevronDown aria-hidden size={14} strokeWidth={1.5} absoluteStrokeWidth className="text-[var(--dashboard-label)]" />
                </button>
              </PopoverTrigger>
              <PopoverContent side="bottom" align="start" sideOffset={4} variant="dropdown" maxHeight={false} portal={false} style={{ width: 'var(--radix-popover-trigger-width)', boxShadow: 'var(--dashboard-popover-shadow)', borderRadius: 12 }}>
                <div role="listbox" aria-label="Channels" className="flex max-h-[240px] flex-col overflow-y-auto p-1.5">
                  {channels.map((c) => (
                    // eslint-disable-next-line no-restricted-syntax -- ds-allow: a channel row
                    <button key={c.id} type="button" role="option" aria-selected={c.id === channel.id} onClick={() => { setPicked(c.id); setOpen(false) }} className={cn('flex h-8 w-full shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border-0 bg-transparent px-2.5 text-left text-[13px] text-[var(--dashboard-figure)] hover:bg-[var(--dashboard-sync-bg)]', FOCUS)}>
                      <Hash aria-hidden size={13} strokeWidth={1.5} absoluteStrokeWidth className="text-[var(--dashboard-label)]" />{c.name}
                      {c.id === channel.id && <Check aria-hidden size={14} strokeWidth={1.5} absoluteStrokeWidth className="ml-auto" />}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </PopoverRoot>

            <p className="m-0 pb-1.5 pt-4 text-[12px] font-medium leading-4 text-[var(--dashboard-label)]">Preview</p>
            <div data-slack-preview className="flex flex-col gap-2 rounded-xl border border-solid border-[var(--neutral-200)] bg-[var(--dashboard-slack-preview)] p-3">
              <p className="m-0 flex items-center gap-2 text-[13px] leading-5">
                <span aria-hidden className="flex size-6 items-center justify-center rounded-md bg-[var(--neutral-900)] text-[11px] font-semibold text-[var(--dashboard-tab-active-text)]">S</span>
                <span className="font-semibold text-[var(--dashboard-figure)]">Souvenir</span>
                <span className="text-[12px] text-[var(--dashboard-label)]">now</span>
              </p>
              <p className="m-0 text-[13px] leading-5 text-[var(--dashboard-figure)]">
                {sharer} shared <strong className="font-semibold">{board.label}</strong> · {datesLabel(period, compare)}
              </p>
              <div aria-label="Board image" role="img" className="overflow-hidden rounded-lg border border-solid border-[var(--neutral-200)]" style={{ width, height: fullHeight * scale }}>
                <div aria-hidden className="pointer-events-none origin-top-left" style={{ transform: `scale(${scale})` }}>
                  <BoardSnapshot cards={board.cards} cardView={cardView} stamp={stamp} />
                </div>
              </div>
              <span className="w-fit max-w-full truncate text-[12px] leading-4 text-[var(--dashboard-label)] underline">{link}</span>
            </div>
            {/* The picture itself, at full size and off screen (the preview above is scaled down). */}
            <div aria-hidden style={{ position: 'fixed', left: 0, top: 0, transform: 'translateX(-200vw)', pointerEvents: 'none' }}>
              <BoardSnapshot ref={shotRef} cards={board.cards} cardView={cardView} stamp={stamp} />
            </div>
            {failed && (
              <p role="alert" data-slack-failed className="m-0 flex items-center gap-1.5 pt-2.5 text-[12px] leading-4 text-[var(--dashboard-error)]">
                <TriangleAlert aria-hidden size={12} strokeWidth={1.5} absoluteStrokeWidth />{failed}
              </p>
            )}
          </div>
          <div className="mt-4 flex shrink-0 items-center justify-end gap-2 border-t border-solid border-[var(--neutral-200)] px-5 py-4">
            <Button variant="outline" size="sm" onClick={onBack}>Cancel</Button>
            <Button size="sm" data-slack-post loading={posting} onClick={() => { void post() }}>Post to #{channel.name}</Button>
          </div>
        </>
      )}
    </>
  )
}
