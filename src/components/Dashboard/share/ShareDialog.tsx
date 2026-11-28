'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Hash, Link2, X } from 'lucide-react'
import { ConfirmModal } from '@/components/ConfirmModal'
import { Button, IconButton, Input } from '@/components/ui'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog'
import type { CardView } from '../MetricCard'
import type { Board } from '../tabs/board-state'
import { AddPeople } from './AddPeople'
import { GeneralAccess, RoleMenu } from './AccessMenus'
import { accessChangePrompt, type AccessChange } from './access-change'
import { SlackStep } from './SlackStep'
import { boardLink, copyText, linkCaption, type General, type Grant, type Share as BoardShare } from './share-model'
import { PersonRow, ROLE_TEXT } from './share-ui'
import { usePeople } from './use-people'

// The Share dialog (Figma 170:58396 – 171:94333; 09-share-export-rules.md SH-4 – SH-28), Option A: a
// centred 520 px dialog. People with access, adding people, roles, general access, the link, and
// Post to Slack as a second step in the same dialog. Who has access is the board's own (its general
// access and grants); a change is saved with the board. Taking access away or changing a role is
// confirmed first, naming the person and what changes (AU-12, UX-CU-01/03/08).

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
  /** A change that takes access away or changes a role, waiting for its confirmation. */
  const [pending, setPending] = useState<AccessChange | null>(null)
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

  const apply = (change: AccessChange) => {
    switch (change.kind) {
      case 'remove': return onChange({ grants: share.grants.filter((g) => g.userId !== change.userId) })
      case 'role': return onChange({ grants: share.grants.map((g) => (g.userId === change.userId ? { ...g, role: change.role } : g)) })
      case 'general': return onChange({ general: change.general })
    }
  }
  // Opening the board to everyone is sharing inside the workspace: the click is the confirmation.
  const changeGeneral = (general: General) => {
    if (share.general === 'none' && general !== 'none') onChange({ general })
    else setPending({ kind: 'general', from: share.general, general })
  }
  const prompt = pending && accessChangePrompt(pending, { board: board.label, people, lose: people.loseCount(share) })

  return (
    <DialogContent
      hideClose
      aria-describedby={undefined}
      data-share-dialog
      data-step={step}
      style={{ width: 'min(520px, calc(100vw - 32px))', maxWidth: 'none', maxHeight: 'calc(100dvh - 96px)', borderRadius: 'var(--radius-2xl)', padding: 0, background: 'var(--dashboard-card-bg)', display: 'flex', flexDirection: 'column', overflow: 'visible' }}
      // Esc closes the matches first, not the dialog (SH-10); open menus close themselves (Radix layers).
      onEscapeKeyDown={(e) => { if (listOpen.current) e.preventDefault() }}
      onOpenAutoFocus={(e) => { e.preventDefault(); (document.querySelector('[data-share-add]') as HTMLElement | null)?.focus() }}
    >
      {step === 'slack' ? (
        <SlackStep board={board} period={period} compare={compare} cardView={cardView} stamp={stamp} link={link} people={people} onBack={() => setStep('people')} onPosted={onPosted} />
      ) : (
        <>
          <div className="relative flex shrink-0 items-center px-5 pb-3 pt-5">
            <DialogTitle className="min-w-0 truncate pr-8 text-[length:var(--font-size-body-lg)] font-semibold leading-6 text-[var(--dashboard-figure)]">Share “{board.label}”</DialogTitle>
            <DialogClose asChild>
              <IconButton variant="ghost" size="sm" iconSize={14} aria-label="Close" className="absolute right-3.5 top-4 size-7 rounded-md" icon={<X strokeWidth={1.5} absoluteStrokeWidth />} />
            </DialogClose>
          </div>

          <div className="shrink-0 px-5">
            {owner ? (
              <AddPeople
                people={people} share={share} onListOpen={(o) => { listOpen.current = o }}
                onInvite={(ids, role) => onChange({ grants: [...share.grants.filter((g) => !ids.includes(g.userId)), ...ids.map((userId) => ({ userId, role }))] })}
              />
            ) : (
              <p data-share-readonly className="m-0 pb-1 text-[length:var(--font-size-body-sm)] leading-5 text-[var(--dashboard-label)]">Only {people.name(share.ownerId)} can change who has access.</p>
            )}
            <p className="m-0 pb-1 pt-4 text-[length:var(--font-size-small)] font-medium leading-4 text-[var(--dashboard-label)]">People with access</p>
          </div>

          {/* Only the people list scrolls (SH-9). */}
          <ul data-share-people className="kaya-scrollbar m-0 min-h-0 flex-1 list-none overflow-y-auto px-5 py-0">
            <PersonRow people={people} id={share.ownerId} right={<span className="pr-1 text-[length:var(--font-size-body-sm)] text-[var(--dashboard-label)]">Owner</span>} />
            {people.sortGrants(share.grants).map((g) => (
              <PersonRow
                key={g.userId}
                people={people}
                id={g.userId}
                right={owner ? (
                  <RoleMenu
                    value={g.role}
                    label={`${people.name(g.userId)}’s role`}
                    onChange={(role) => setPending({ kind: 'role', userId: g.userId, role })}
                    onRemove={() => setPending({ kind: 'remove', userId: g.userId })}
                  />
                ) : <span className="pr-1 text-[length:var(--font-size-body-sm)] text-[var(--dashboard-label)]">{ROLE_TEXT[g.role].label}</span>}
              />
            ))}
          </ul>

          <div className="shrink-0 px-5">
            <span aria-hidden className="mt-2 block h-px bg-[var(--neutral-200)]" />
            <p className="m-0 pb-2 pt-3 text-[length:var(--font-size-small)] font-medium leading-4 text-[var(--dashboard-label)]">General access</p>
            <GeneralAccess people={people} share={share} editable={owner} isDefault={isDefault} onChange={changeGeneral} />

            {linkFailed && (
              <div data-link-failed className="mt-3 flex flex-col gap-1.5">
                {/* The read-only link to select (Figma 170:85246). */}
                <Input
                  readOnly
                  fluid
                  size="small"
                  aria-label="Link to this board"
                  value={link}
                  ref={(el: HTMLInputElement | null) => { el?.select() }}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <p role="alert" className="m-0 text-[length:var(--font-size-small)] leading-4 text-[var(--dashboard-error)]">Couldn’t copy the link. Press ⌘C to copy it.</p>
              </div>
            )}
            {caption && !linkFailed && <p data-link-caption className="m-0 pt-3 text-[length:var(--font-size-small)] leading-4 text-[var(--dashboard-label)]">{linkCaption(period, compare)}</p>}
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
      {pending && prompt && (
        <ConfirmModal
          title={prompt.title}
          description={prompt.description}
          confirmLabel={prompt.confirm}
          danger={prompt.danger}
          onConfirm={async () => { apply(pending) }}
          onClose={() => setPending(null)}
        />
      )}
    </DialogContent>
  )
}
