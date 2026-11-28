'use client'

import { useId, useRef, useState } from 'react'
import { ArrowUp, Sparkles, X } from 'lucide-react'
import { Button, IconButton, Input, Textarea } from '@/components/ui'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { DraftMessage } from '@/lib/api/warehouse'
import { SourceLogo } from './icons'
import { PLAIN_BUTTON } from './plain-button'
import { Spinner } from './sync/Spinner'
import { useDashboardData } from './live/dashboard-data'
import { AI_EXAMPLES } from './templates'

// Ask the AI (Figma 170:73483 – 171:89377; 08-new-board-rules.md NB-20 – NB-30): the describe
// dialog, the line under the tabs that says what the draft is, the draft bar that takes the speed
// dial's corner, and the cards area when a draft failed or nothing could be measured.

const FOCUS = 'outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]'
const DIAL = 'bg-gradient-to-b from-[var(--dashboard-tab-active-from)] to-[var(--dashboard-tab-active-to)] text-[var(--dashboard-tab-active-text)]'

/** A draft's life, kept by the screen (one at a time, NB-20). */
export type DraftPhase = 'drafting' | 'ready' | 'failed' | 'empty'
export interface Draft {
  boardId: string
  /** What was asked first; later turns change it. */
  request: string
  phase: DraftPhase
  /** The board open before it, for Discard and Stop (NB-27). */
  openBefore: string
  /** The conversation so far: each request, and what came back. */
  messages: DraftMessage[]
  /** What the drafter said last: what the board shows and what it left out, or why there is none. */
  reply?: string
  /** Bumped on every try, so a late answer to an old try is dropped. */
  run: number
}

// ── Describe (NB-20) ─────────────────────────────────────────────────────────────

interface AskAIDialogProps {
  open: boolean
  initial: string
  onClose: () => void
  onSend: (request: string) => void
}

export function AskAIDialog({ open, ...rest }: AskAIDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) rest.onClose() }}>
      {open && <Describe {...rest} />}
    </Dialog>
  )
}

function Describe({ initial, onSend }: Omit<AskAIDialogProps, 'open'>) {
  const { apps: connected } = useDashboardData()
  const [text, setText] = useState(initial)
  const boxRef = useRef<HTMLTextAreaElement>(null)
  const hintId = useId()
  const apps = connected.list
  const send = () => { if (text.trim()) onSend(text.trim()) }
  return (
    <DialogContent
      hideClose
      aria-describedby={undefined}
      data-ask-ai
      style={{ width: 'min(640px, calc(100vw - 32px))', maxWidth: 'none', borderRadius: 'var(--radius-2xl)', padding: 0, background: 'var(--dashboard-card-bg)' }}
      onOpenAutoFocus={(e) => { e.preventDefault(); const b = boxRef.current; if (b) { b.focus(); b.setSelectionRange(b.value.length, b.value.length) } }}
    >
      <div className="relative flex flex-col gap-4 p-5">
        <DialogTitle className="text-[length:var(--font-size-body-lg)] font-semibold leading-6 text-[var(--dashboard-figure)]">Describe the board you want</DialogTitle>
        <DialogClose asChild>
          <IconButton variant="ghost" size="sm" iconSize={14} aria-label="Close" className="absolute right-3.5 top-3.5 size-7 rounded-md" icon={<X strokeWidth={1.5} absoluteStrokeWidth />} />
        </DialogClose>
        {/* The box, with Make a draft inside it (greyed until there's text); the Textarea primitive
            (Figma 170:73490), with room at the bottom for the button. */}
        <div className="relative">
          <Textarea
            ref={boxRef}
            aria-label="Describe the board you want"
            aria-describedby={hintId}
            placeholder="What should this board show? Say what you want to keep an eye on, and how often."
            value={text}
            onChange={(e) => setText(e.target.value)}
            // Enter sends, Shift+Enter adds a line (NB-20, A11Y-KB-09).
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send() } }}
            className="kaya-scrollbar h-[120px] rounded-xl px-3.5 pb-12 pt-3"
          />
          <span id={hintId} className="sr-only">Enter makes a draft; Shift and Enter add a line.</span>
          <Button size="sm" data-make-draft disabled={!text.trim()} onClick={send} className="absolute bottom-2.5 right-2.5" leftIcon={<ArrowUp aria-hidden strokeWidth={1.5} absoluteStrokeWidth />}>
            Make a draft
          </Button>
        </div>
        {/* Examples fill the box; they don't send. */}
        <div className="flex flex-wrap gap-2">
          {AI_EXAMPLES.map((ex) => (
            // An example chip (Figma 170:73497).
            <Button
              key={ex}
              variant="link"
              data-example
              onClick={() => { setText(ex); boxRef.current?.focus() }}
              className={cn(PLAIN_BUTTON, 'h-7 cursor-pointer !rounded-full border border-solid border-[var(--neutral-200)] bg-[var(--dashboard-panel-bg)] px-3 text-[length:var(--font-size-body-sm)] leading-5 text-[var(--neutral-700)] hover:bg-[var(--dashboard-hover-band)]', FOCUS)}
            >
              {ex}
            </Button>
          ))}
        </div>
        <span aria-hidden className="h-px bg-[var(--neutral-200)]" />
        <p data-drafts-from className="m-0 flex items-center gap-2 text-[length:var(--font-size-small)] leading-4 text-[var(--dashboard-label)]">
          Drafts from
          <span className="flex items-center gap-1">{apps.map((a) => <SourceLogo key={a.id} app={a} className="size-4" />)}</span>
        </p>
      </div>
    </DialogContent>
  )
}

// ── The line under the tabs (NB-21 – NB-23) ─────────────────────────────────────

export function DraftLine({ draft }: { draft: Draft }) {
  const quote = `“${draft.request}”`
  if (draft.phase === 'drafting') {
    return (
      <p data-draft-line role="status" className="m-0 flex items-center gap-2 text-[length:var(--font-size-body-sm)] leading-5 text-[var(--dashboard-label)]">
        <Spinner size={14} />Drafting a board for {quote}…
      </p>
    )
  }
  return (
    <p data-draft-line className="m-0 flex min-w-0 flex-wrap items-center gap-x-1.5 text-[length:var(--font-size-body-sm)] leading-5 text-[var(--dashboard-label)]">
      <Sparkles aria-hidden size={14} strokeWidth={1.5} absoluteStrokeWidth className="text-[var(--dashboard-figure)]" />
      <span className="font-medium text-[var(--dashboard-figure)]">Draft, not saved</span>
      <span>· From {quote}</span>
      {draft.phase === 'ready' && draft.reply && <span data-draft-reply>· {draft.reply}</span>}
    </p>
  )
}

// ── The cards area when there's no draft to show (NB-28, NB-29) ───────────────────

export function DraftProblem({ draft, onTryAgain, onChange, onConnect }: { draft: Draft; onTryAgain: () => void; onChange: () => void; onConnect: () => void }) {
  const failed = draft.phase === 'failed'
  return (
    <div data-draft-problem={draft.phase} className="flex min-h-[240px] flex-col items-center justify-center gap-1 rounded-xl text-center">
      <p className="m-0 text-[length:var(--font-size-body)] font-medium leading-5 text-[var(--dashboard-figure)]">
        {failed ? 'The draft didn’t come through' : 'No board yet'}
      </p>
      <p className="m-0 max-w-[440px] text-[length:var(--font-size-body-sm)] leading-5 text-[var(--dashboard-label)]">{failed ? 'Try again in a moment. Nothing was saved.' : draft.reply}</p>
      <div className="mt-3 flex gap-2">
        {failed ? <Button size="sm" onClick={onTryAgain}>Try again</Button> : <Button size="sm" onClick={onChange}>Change request</Button>}
        {failed ? <Button size="sm" variant="outline" onClick={onChange}>Change request</Button> : <Button size="sm" variant="outline" onClick={onConnect}>Connect an app</Button>}
      </div>
    </div>
  )
}

// ── The draft bar (NB-21, NB-22, NB-28) ──────────────────────────────────────────

interface DraftBarProps {
  draft: Draft
  onStop: () => void
  onRedraft: (change: string) => void
  onEdit: () => void
  onDiscard: () => void
  onKeep: () => void
}

export function DraftBar({ draft, onStop, onRedraft, onEdit, onDiscard, onKeep }: DraftBarProps) {
  const [change, setChange] = useState('')
  // A segment of the draft bar (Figma 170:79963), on the Button primitive.
  const segment = cn(PLAIN_BUTTON, 'flex h-9 cursor-pointer items-center !rounded-full border-0 bg-transparent px-3.5 text-[length:var(--font-size-body-sm)] font-medium leading-5 text-[var(--dashboard-figure)] transition-colors duration-fast hover:bg-[var(--neutral-100)]', FOCUS)
  const bar = 'absolute bottom-5 right-5 z-30 flex max-w-[calc(100%-40px)] items-center gap-0.5 rounded-full bg-[var(--dashboard-card-bg)] p-1 shadow-[var(--dashboard-popover-shadow)]'

  if (draft.phase === 'drafting') {
    return (
      <div data-dashboard-fab data-draft-bar="drafting" role="toolbar" aria-label="Draft" className={bar}>
        <span role="status" className="flex h-9 items-center gap-2 pl-3 pr-2 text-[length:var(--font-size-body-sm)] font-medium leading-5 text-[var(--dashboard-label)]"><Spinner size={14} />Drafting…</span>
        <span aria-hidden className="mx-0.5 h-4 w-px bg-[var(--neutral-200)]" />
        <Button variant="link" className={segment} onClick={onStop}>Stop</Button>
      </div>
    )
  }
  return (
    <div data-dashboard-fab data-draft-bar={draft.phase} role="toolbar" aria-label="Draft" className={bar}>
      {draft.phase === 'ready' && (
        <>
          {/* The draft bar's Change something box (Figma 171:89377), on the Input primitive. */}
          <Input
            size="small"
            aria-label="Change something"
            placeholder="Change something…"
            value={change}
            onChange={setChange}
            onKeyDown={(e) => { if (e.key === 'Enter' && change.trim()) { e.preventDefault(); onRedraft(change.trim()); setChange('') } }}
            className="w-[220px] min-w-0 shrink"
          />
          <Button variant="link" className={segment} onClick={onEdit}>Edit</Button>
        </>
      )}
      <Button variant="link" className={segment} onClick={onDiscard}>Discard</Button>
      {draft.phase === 'ready' && (
        // The dark Keep board segment (Figma 171:89377).
        <Button variant="link" onClick={onKeep} className={cn(PLAIN_BUTTON, 'flex h-9 cursor-pointer items-center whitespace-nowrap !rounded-full border-0 px-[var(--space-4-5)] text-[length:var(--font-size-body-sm)] font-medium leading-5', DIAL, FOCUS)}>
          Keep board
        </Button>
      )}
    </div>
  )
}
