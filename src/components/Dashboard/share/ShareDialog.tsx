'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, ChevronDown, Globe, Hash, Link2, Lock, TriangleAlert, Users, X } from 'lucide-react'
import { PopoverContent, PopoverRoot, PopoverTrigger } from '@/components/Popover'
import { Button, IconButton } from '@/components/ui'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { CardView } from '../MetricCard'
import { METRICS } from '../mock-data'
import type { Board } from '../tabs/board-state'
import { dims } from '../grid-layout'
import { BoardSnapshot, SNAPSHOT_WIDTH } from './BoardSnapshot'
import {
  ME, RESTRICTED, WORKSPACE, boardLink, cantSeeOn, datesLabel, displayName, linkCaption, loseCount, matches, memberById, nameOf,
  outsideEmail, personById, sortGrants, type Match, type Member, type Role,
} from './share-model'
import { connectSlack, copyText, invite, postToSlack, removeGrant, setGeneral, setRole, shareOf, useShareSnapshot } from './share-store'

// The Share dialog (Figma 170:58396 – 171:94333; 09-share-export-rules.md SH-4 – SH-28), Option A: a
// centred 520 px dialog. People with access, adding people and teams, roles, general access, the link,
// and Post to Slack as a second step in the same dialog.

const FOCUS = 'outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]'
const CHANNELS = ['growth', 'marketing', 'leadership', 'store-ops']
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
  isAdmin: boolean
  /** Cards as they read now; the Slack preview locks restricted ones (SH-26). */
  cardView: (metricId: string) => CardView | undefined
  stamp: string
  onClose: () => void
  onPosted: (channel: string) => void
  onNotReady: (what: string) => void
}

export function ShareDialog({ open, ...rest }: ShareDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) rest.onClose() }}>
      {open && <Share {...rest} />}
    </Dialog>
  )
}

function Share({ startOn, board, period, compare, isAdmin, cardView, stamp, onClose, onPosted, onNotReady }: Omit<ShareDialogProps, 'open'>) {
  const shares = useShareSnapshot()
  const share = shareOf(shares, board.id)
  const owner = board.access === 'owner'
  const viewer = board.access === 'view'
  const metricIds = board.cards.map((c) => c.metricId)
  const [step, setStep] = useState<'people' | 'slack'>(startOn === 'slack' ? 'slack' : 'people')
  const [linkFailed, setLinkFailed] = useState(startOn === 'link')
  const [copied, setCopied] = useState(false)
  const [caption, setCaption] = useState(false)
  const [removed, setRemoved] = useState<{ name: string; undo: () => void } | null>(null)
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
        <SlackStep board={board} period={period} compare={compare} cardView={cardView} stamp={stamp} onBack={() => setStep('people')} onPosted={onPosted} />
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
              <AddPeople boardId={board.id} metricIds={metricIds} isAdmin={isAdmin} onListOpen={(o) => { listOpen.current = o }} onNotReady={onNotReady} />
            ) : (
              <p data-share-readonly className="m-0 pb-1 text-[13px] leading-5 text-[var(--dashboard-label)]">Only {nameOf(share.owner)} can change who has access.</p>
            )}
            <p className="m-0 pb-1 pt-4 text-[12px] font-medium leading-4 text-[var(--dashboard-label)]">People with access</p>
          </div>

          {/* Only the people list scrolls (SH-9). */}
          <ul data-share-people className="kaya-scrollbar m-0 min-h-0 flex-1 list-none overflow-y-auto px-5 py-0">
            <PersonRow id={share.owner} sub={personById(share.owner)?.email} right={<span className="pr-1 text-[13px] text-[var(--dashboard-label)]">Owner</span>} />
            {sortGrants(share.grants).map((g) => {
              const m = memberById(g.id)
              if (!m) return null
              const locked = cantSeeOn([g.id], metricIds).filter((x) => x.person.id === g.id)[0]
              return (
                <PersonRow
                  key={g.id}
                  id={g.id}
                  sub={m.kind === 'team' ? `${m.members.length} people` : m.email}
                  note={locked ? `Can’t see ${METRICS[locked.metricId]?.label}` : undefined}
                  right={owner ? (
                    <RoleMenu
                      value={g.role}
                      label={`${m.name}’s role`}
                      onChange={(r) => setRole(board.id, g.id, r)}
                      onRemove={() => setRemoved({ name: m.name, undo: removeGrant(board.id, g.id) })}
                    />
                  ) : <span className="pr-1 text-[13px] text-[var(--dashboard-label)]">{ROLE_TEXT[g.role].label}</span>}
                />
              )
            })}
          </ul>

          <div className="shrink-0 px-5">
            {removed && (
              <p data-share-removed role="status" className="m-0 flex items-center gap-2 py-2 text-[13px] leading-5 text-[var(--dashboard-label)]">
                {removed.name} no longer has access.
                {/* eslint-disable-next-line no-restricted-syntax -- ds-allow: an inline Undo (Figma 170:78020) */}
                <button type="button" onClick={() => { removed.undo(); setRemoved(null) }} className={cn('cursor-pointer rounded-sm border-0 bg-transparent p-0 text-[13px] font-medium text-[var(--dashboard-figure)] underline underline-offset-2', FOCUS)}>Undo</button>
              </p>
            )}
            <span aria-hidden className="mt-2 block h-px bg-[var(--neutral-200)]" />
            <p className="m-0 pb-2 pt-3 text-[12px] font-medium leading-4 text-[var(--dashboard-label)]">General access</p>
            <GeneralAccess boardId={board.id} editable={owner} />

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

function Avatar({ member }: { member: Member | undefined }) {
  if (member?.kind === 'team') {
    return (
      <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--dashboard-sync-bg)] text-[var(--neutral-700)]">
        <Users size={14} strokeWidth={1.5} absoluteStrokeWidth />
      </span>
    )
  }
  return (
    <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-medium text-[var(--dashboard-figure)]" style={{ background: member?.color }}>
      {member?.initials}
    </span>
  )
}

function PersonRow({ id, sub, note, right }: { id: string; sub?: string; note?: string; right: React.ReactNode }) {
  const m = memberById(id)
  return (
    <li data-person={id} className="flex min-h-12 items-center gap-2.5 py-1.5">
      <Avatar member={m} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[14px] font-medium leading-5 text-[var(--dashboard-figure)]">{displayName(id)}</span>
        {sub && <span className="truncate text-[12px] leading-4 text-[var(--dashboard-label)]">{sub}</span>}
        {note && (
          <span data-cant-see className="flex items-center gap-1 text-[12px] leading-4 text-[var(--dashboard-label)]">
            <Lock aria-hidden size={11} strokeWidth={1.5} absoluteStrokeWidth />{note}
          </span>
        )}
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

function GeneralAccess({ boardId, editable }: { boardId: string; editable: boolean }) {
  const shares = useShareSnapshot()
  const share = shareOf(shares, boardId)
  const [open, setOpen] = useState(false)
  const everyone = share.general.to === 'workspace'
  const title = everyone ? `Everyone at ${WORKSPACE}` : 'Only people added'
  const line = everyone ? 'Anyone in the workspace can open this board' : 'Only the people above can open this board'
  const lose = loseCount(share)
  return (
    <div data-general-access={share.general.to} className="flex items-center gap-2.5">
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
                {/* eslint-disable-next-line no-restricted-syntax -- ds-allow: a general access choice (Figma 170:78449) */}
                <button type="button" role="menuitemradio" aria-checked={!everyone} onClick={() => { setOpen(false); setGeneral(boardId, { to: 'none' }) }} className={MENU_ITEM}>
                  <span className="flex w-full items-center text-[13px] font-medium leading-5 text-[var(--dashboard-figure)]">Only people added{!everyone && <Check aria-hidden size={14} strokeWidth={1.5} absoluteStrokeWidth className="ml-auto" />}</span>
                  {/* Going back shows who loses access first (SH-19). */}
                  <span data-lose-count={everyone ? lose : undefined} className={cn('text-[12px] leading-4', everyone ? 'text-[var(--dashboard-error)]' : 'text-[var(--dashboard-label)]')}>
                    {everyone ? `${lose} people lose access` : 'Only the people above can open this board'}
                  </span>
                </button>
                {/* eslint-disable-next-line no-restricted-syntax -- ds-allow: a general access choice (Figma 170:78449) */}
                <button type="button" role="menuitemradio" aria-checked={everyone} onClick={() => { setOpen(false); if (!everyone) setGeneral(boardId, { to: 'workspace', role: 'view' }) }} className={MENU_ITEM}>
                  <span className="flex w-full items-center text-[13px] font-medium leading-5 text-[var(--dashboard-figure)]">Everyone at {WORKSPACE}{everyone && <Check aria-hidden size={14} strokeWidth={1.5} absoluteStrokeWidth className="ml-auto" />}</span>
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
      {everyone && share.general.to === 'workspace' && (
        editable
          ? <RoleMenu value={share.general.role} label="Everyone’s role" onChange={(r) => setGeneral(boardId, { to: 'workspace', role: r })} />
          : <span className="pr-1 text-[13px] text-[var(--dashboard-label)]">{ROLE_TEXT[share.general.role].label}</span>
      )}
    </div>
  )
}

// ── Adding people (SH-10 – SH-14) ──────────────────────────────────────────────────────

function AddPeople({ boardId, metricIds, isAdmin, onListOpen, onNotReady }: { boardId: string; metricIds: string[]; isAdmin: boolean; onListOpen: (open: boolean) => void; onNotReady: (what: string) => void }) {
  const shares = useShareSnapshot()
  const share = shareOf(shares, boardId)
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [role, setPickRole] = useState<Role>('view')
  const [active, setActive] = useState(0)
  const [closed, setClosed] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const found = matches(query, share, picked)
  const pickable = found.filter((m) => !m.has)
  const outside = outsideEmail(query)
  const showList = !!query.trim() && !closed
  // The list's state for the dialog's Esc (read in its handler, not while rendering).
  useEffect(() => { onListOpen(showList) }, [showList, onListOpen])
  const cantSee = cantSeeOn(picked, metricIds)

  const pick = (m: Match) => {
    if (m.has) return
    setPicked((p) => [...p, m.member.id])
    setQuery('')
    setActive(0)
    document.querySelector<HTMLInputElement>('[data-share-add]')?.focus()
  }
  const send = () => {
    if (!picked.length) return
    invite(boardId, picked, role)
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
            const m = memberById(id)
            return (
              <span key={id} data-chip={id} className="flex h-6 items-center gap-1.5 rounded-md bg-[var(--dashboard-chip-bg)] pl-1.5 pr-1 text-[13px] leading-5 text-[var(--dashboard-figure)]">
                {m?.kind === 'team' ? <Users aria-hidden size={12} strokeWidth={1.5} absoluteStrokeWidth /> : <span aria-hidden className="flex size-4 items-center justify-center rounded-full text-[8px] font-medium" style={{ background: m?.color }}>{m?.initials}</span>}
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
            aria-label="Add people or teams"
            placeholder={picked.length ? '' : 'Add people or teams'}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); setClosed(false) }}
            onKeyDown={onKey}
            className="h-6 min-w-[80px] flex-1 border-0 bg-transparent px-1 text-[14px] leading-5 text-[var(--dashboard-figure)] outline-none placeholder:text-[var(--dashboard-faint)]"
          />
          <RoleMenu value={role} label="Role for new people" onChange={setPickRole} compact />
        </div>
        <Button size="sm" data-invite disabled={!picked.length} onClick={send} className="h-10 shrink-0">Invite</Button>
      </div>

      {cantSee.length > 0 && (
        <p data-cant-see-hint className="m-0 flex items-center gap-1.5 pt-2 text-[12px] leading-4 text-[var(--dashboard-label)]">
          <Lock aria-hidden size={12} strokeWidth={1.5} absoluteStrokeWidth />
          {cantSee.map((x) => `${x.person.name} can’t see ${METRICS[x.metricId]?.label}.`).join(' ')} It will show locked for {cantSee.length === 1 ? 'them' : 'those people'}.
        </p>
      )}

      {showList && (
        <div id="share-matches" role="listbox" aria-label="Matches" data-share-matches className="absolute inset-x-0 top-[calc(100%+4px)] z-10 max-h-[280px] overflow-y-auto rounded-xl border border-solid border-[var(--neutral-200)] bg-[var(--dashboard-card-bg)] p-1.5 shadow-[var(--dashboard-popover-shadow)]">
          {outside ? (
            <div data-outside className="flex flex-col items-start gap-1 px-2.5 py-2">
              <p className="m-0 text-[13px] font-medium leading-5 text-[var(--dashboard-figure)]">{outside} isn’t in {WORKSPACE}</p>
              <p className="m-0 text-[12px] leading-4 text-[var(--dashboard-label)]">Boards can be shared with workspace members only.{isAdmin ? '' : ' Ask an admin to invite them.'}</p>
              {isAdmin && <Button size="sm" variant="outline" className="mt-1.5" onClick={() => onNotReady('Invite to workspace')}>Invite to workspace</Button>}
            </div>
          ) : found.length === 0 ? (
            <p data-no-match className="m-0 px-2.5 py-2 text-[13px] leading-5 text-[var(--dashboard-label)]">No one at {WORKSPACE} matches ‘{query.trim()}’</p>
          ) : (
            (['team', 'person'] as const).map((kind) => {
              const group = found.filter((m) => m.member.kind === kind)
              if (!group.length) return null
              return (
                <div key={kind} role="group" aria-label={kind === 'team' ? 'Teams' : 'People'}>
                  <p className="m-0 px-2.5 pb-1 pt-1.5 text-[11px] font-medium uppercase leading-4 tracking-[0.04em] text-[var(--dashboard-faint)]">{kind === 'team' ? 'Teams' : 'People'}</p>
                  {group.map((m) => {
                    const on = pickable[active]?.member.id === m.member.id
                    return (
                      <div
                        key={m.member.id}
                        role="option"
                        aria-selected={on}
                        aria-disabled={!!m.has}
                        data-match={m.member.id}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pick(m)}
                        className={cn('flex h-11 items-center gap-2.5 rounded-lg px-2.5', m.has ? 'cursor-default opacity-60' : 'cursor-pointer hover:bg-[var(--dashboard-sync-bg)]', on && 'bg-[var(--dashboard-sync-bg)]')}
                      >
                        <Avatar member={m.member} />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-[13px] font-medium leading-5 text-[var(--dashboard-figure)]">{m.member.name}</span>
                          <span className="truncate text-[12px] leading-4 text-[var(--dashboard-label)]">{m.member.kind === 'team' ? `${m.member.members.length} people` : m.member.email}</span>
                        </span>
                        {m.has && <span className="text-[12px] text-[var(--dashboard-label)]">{m.has === 'owner' ? 'Owner' : ROLE_TEXT[m.has].label}</span>}
                      </div>
                    )
                  })}
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

function SlackStep({ board, period, compare, cardView, stamp, onBack, onPosted }: { board: Board; period: string; compare: string; cardView: (id: string) => CardView | undefined; stamp: string; onBack: () => void; onPosted: (channel: string) => void }) {
  const shares = useShareSnapshot()
  const [channel, setChannel] = useState(shares.lastChannel)
  const [posting, setPosting] = useState(false)
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState(false)
  const restricted = board.cards.map((c) => METRICS[c.metricId]).filter((m) => m && RESTRICTED.includes(m.id))
  // Restricted numbers are locked in the image for everyone (SH-26).
  const lockedView = (id: string): CardView | undefined => {
    const v = cardView(id)
    return RESTRICTED.includes(id) && v ? { ...v, body: 'locked', health: undefined, dot: undefined, syncing: false } : v
  }
  const rows = board.cards.reduce((h, c) => Math.max(h, c.y + dims(c.size).h), 1)
  const fullHeight = 32 + rows * 156 + (rows - 1) * 16 + 28
  const width = 444
  const scale = width / SNAPSHOT_WIDTH

  const post = () => {
    setPosting(true)
    setFailed(false)
    postToSlack(channel).then(
      () => onPosted(channel),
      () => { setPosting(false); setFailed(true) },
    )
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

      {shares.slack !== 'connected' ? (
        // Slack isn't connected (SH-27).
        <div data-slack-off className="flex flex-col items-start gap-1 px-5 pb-5">
          <p className="m-0 text-[14px] font-medium leading-5 text-[var(--dashboard-figure)]">Connect Slack to post boards to a channel</p>
          <p className="m-0 text-[13px] leading-5 text-[var(--dashboard-label)]">You’ll pick the channel each time you post.</p>
          <Button size="sm" className="mt-3" loading={shares.slack === 'connecting'} onClick={connectSlack}>
            {shares.slack === 'connecting' ? 'Connecting…' : 'Connect Slack'}
          </Button>
        </div>
      ) : (
        <>
          <div className="kaya-scrollbar min-h-0 flex-1 overflow-y-auto px-5">
            <p className="m-0 pb-1.5 text-[12px] font-medium leading-4 text-[var(--dashboard-label)]">Channel</p>
            <PopoverRoot open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                {/* eslint-disable-next-line no-restricted-syntax -- ds-allow: the channel select (Figma 171:94068) */}
                <button type="button" data-channel={channel} className={cn('flex h-10 w-full cursor-pointer items-center gap-1.5 rounded-[10px] border border-solid border-[var(--dashboard-list-border)] bg-[var(--dashboard-card-bg)] px-3 text-left text-[14px] leading-5 text-[var(--dashboard-figure)]', FOCUS)}>
                  <Hash aria-hidden size={14} strokeWidth={1.5} absoluteStrokeWidth className="text-[var(--dashboard-label)]" />
                  <span className="flex-1">{channel}</span>
                  <ChevronDown aria-hidden size={14} strokeWidth={1.5} absoluteStrokeWidth className="text-[var(--dashboard-label)]" />
                </button>
              </PopoverTrigger>
              <PopoverContent side="bottom" align="start" sideOffset={4} variant="dropdown" maxHeight={false} portal={false} style={{ width: 'var(--radix-popover-trigger-width)', boxShadow: 'var(--dashboard-popover-shadow)', borderRadius: 12 }}>
                <div role="listbox" aria-label="Channels" className="flex flex-col p-1.5">
                  {CHANNELS.map((c) => (
                    // eslint-disable-next-line no-restricted-syntax -- ds-allow: a channel row
                    <button key={c} type="button" role="option" aria-selected={c === channel} onClick={() => { setChannel(c); setOpen(false) }} className={cn('flex h-8 w-full cursor-pointer items-center gap-1.5 rounded-lg border-0 bg-transparent px-2.5 text-left text-[13px] text-[var(--dashboard-figure)] hover:bg-[var(--dashboard-sync-bg)]', FOCUS)}>
                      <Hash aria-hidden size={13} strokeWidth={1.5} absoluteStrokeWidth className="text-[var(--dashboard-label)]" />{c}
                      {c === channel && <Check aria-hidden size={14} strokeWidth={1.5} absoluteStrokeWidth className="ml-auto" />}
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
                <span className="text-[12px] text-[var(--dashboard-label)]">9:41 AM</span>
              </p>
              <p className="m-0 text-[13px] leading-5 text-[var(--dashboard-figure)]">
                {nameOf(ME)} shared <strong className="font-semibold">{board.label}</strong> · {datesLabel(period, compare)}
              </p>
              <div aria-label="Board image" role="img" className="overflow-hidden rounded-lg border border-solid border-[var(--neutral-200)]" style={{ width, height: fullHeight * scale }}>
                <div aria-hidden className="pointer-events-none origin-top-left" style={{ transform: `scale(${scale})` }}>
                  <BoardSnapshot cards={board.cards} cardView={lockedView} stamp={stamp} />
                </div>
              </div>
              <span className="w-fit rounded-md border border-solid border-[var(--dashboard-list-border)] bg-[var(--dashboard-card-bg)] px-2.5 py-1 text-[12px] font-medium leading-4 text-[var(--dashboard-figure)]">Open board</span>
            </div>
            {restricted.length > 0 && (
              <p data-slack-locked className="m-0 flex items-center gap-1.5 pt-2.5 text-[12px] leading-4 text-[var(--dashboard-label)]">
                <Lock aria-hidden size={12} strokeWidth={1.5} absoluteStrokeWidth />{restricted.map((m) => m!.label).join(', ')} shows locked in Slack.
              </p>
            )}
            {failed && (
              <p role="alert" data-slack-failed className="m-0 flex items-center gap-1.5 pt-2.5 text-[12px] leading-4 text-[var(--dashboard-error)]">
                <TriangleAlert aria-hidden size={12} strokeWidth={1.5} absoluteStrokeWidth />Couldn’t post to #{channel}. Try again.
              </p>
            )}
          </div>
          <div className="mt-4 flex shrink-0 items-center justify-end gap-2 border-t border-solid border-[var(--neutral-200)] px-5 py-4">
            <Button variant="outline" size="sm" onClick={onBack}>Cancel</Button>
            <Button size="sm" data-slack-post loading={posting} onClick={post}>Post to #{channel}</Button>
          </div>
        </>
      )}
    </>
  )
}
