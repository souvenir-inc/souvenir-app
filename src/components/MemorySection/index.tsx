'use client'

import React, { useEffect, useRef, useState } from 'react'
import { AnimatePresence, m } from 'framer-motion'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { ArrowDownOneIcon, ArrowUpTwoIcon, BrainTwoIcon, CancelOneIcon, DeleteTwoIcon } from '@strange-huge/icons'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { MarkdownRenderer } from '@/lib/markdown-utils'
import { editMemory, fetchMemorySummary, forgetMemoryNote, type MemoryNote, type MemorySummary } from '@/lib/api/memory'
import styles from './MemorySection.module.css'
import { DURATION } from "@/styles/tokens/motion"

// One memory store on the settings Memory page: its notes topic by topic, each opening to the note itself, then the written summary and the edit chat.

const BODY = 'var(--font-body)'
// A stale summary is being rewritten in the background; check back this often for the fresh one.
const REFRESH_POLL_MS = 8_000
const REFRESH_POLL_LIMIT = 8
const HOVER = 'color-mix(in srgb, var(--neutral-100) 60%, transparent)'
const CARD: React.CSSProperties = {
  border:          '1px solid var(--border-default)',
  borderRadius:    'var(--radius-2xl)',
  boxShadow:       'var(--shadow-soft)',
  overflow:        'hidden',
  backgroundColor: 'var(--neutral-white)',
}

type Exchange = { id: number; asked: string; reply: string | null; failed?: boolean }

function ago(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (minutes < 1_440) return `${Math.floor(minutes / 60)}h ago`
  const days = Math.floor(minutes / 1_440)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function matches(note: MemoryNote, query: string): boolean {
  const needle = query.trim().toLowerCase()
  return !needle || [note.title, note.description, note.content].some(text => text.toLowerCase().includes(needle))
}

function teaser(markdown: string): string {
  return markdown.split('\n').map(line => line.trim()).find(line => line && !line.startsWith('#'))?.replace(/[*_`]/g, '') ?? ''
}

function NoteRow({ note, open, onToggle, onForget }: {
  note:     MemoryNote
  open:     boolean
  onToggle: () => void
  onForget: () => Promise<void>
}) {
  const [hovered,    setHovered]    = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [forgetting, setForgetting] = useState(false)

  async function forget() {
    setForgetting(true)
    try {
      await onForget()
    } finally {
      setForgetting(false)
      setConfirming(false)
    }
  }

  const quiet: React.CSSProperties = {
    display:      'inline-flex',
    alignItems:   'center',
    gap:          'var(--space-1-5)',
    padding:      'var(--space-1) var(--space-2)',
    border:       'none',
    borderRadius: 'var(--radius-md)',
    background:   'transparent',
    cursor:       'pointer',
    fontFamily:   BODY,
    fontSize:     'var(--font-size-body-sm)',
    lineHeight:   'var(--line-height-body-sm)',
    whiteSpace:   'nowrap',
  }

  return (
    <div style={{ borderTop: '1px solid var(--neutral-100)' }}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display:         'flex',
          alignItems:      'center',
          gap:             'var(--space-2)',
          paddingRight:    'var(--space-4)',
          backgroundColor: open || hovered ? HOVER : 'transparent',
          transition:      'background-color var(--duration-fast) ease',
        }}
      >
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          style={{
            flex:       '1 0 0',
            minWidth:   0,
            display:    'flex',
            alignItems: 'center',
            gap:        'var(--space-3)',
            padding:    'var(--space-3) var(--space-2) var(--space-3) var(--space-4)',
            border:     'none',
            background: 'transparent',
            cursor:     'pointer',
            textAlign:  'left',
            fontFamily: BODY,
            fontSize:   'var(--font-size-body)',
            lineHeight: 'var(--line-height-body)',
          }}
        >
          <m.span
            animate={{ rotate: open ? 0 : -90 }}
            transition={{ duration: DURATION.quick }}
            style={{ display: 'flex', flexShrink: 0, color: 'var(--neutral-400)' }}
          >
            <ArrowDownOneIcon size={14} />
          </m.span>
          <span style={{ flex: '1 0 0', minWidth: 0, fontWeight: 'var(--font-weight-medium)', color: 'var(--neutral-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{note.title}</span>
          {!confirming && <span style={{ flexShrink: 0, color: 'var(--neutral-400)', fontSize: 'var(--font-size-body-sm)' }}>Updated {ago(note.updatedAt)}</span>}
        </button>

        {confirming ? (
          <m.div initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
            <span style={{ fontFamily: BODY, fontSize: 'var(--font-size-body-sm)', color: 'var(--neutral-600)', marginRight: 'var(--space-1)', whiteSpace: 'nowrap' }}>Forget this note?</span>
            <button type="button" onClick={() => void forget()} disabled={forgetting} style={{ ...quiet, color: 'var(--red-600)', fontWeight: 'var(--font-weight-medium)', opacity: forgetting ? 0.6 : 1 }}>
              {forgetting ? 'Forgetting…' : 'Forget'}
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={forgetting} style={{ ...quiet, color: 'var(--neutral-500)' }}>
              Cancel
            </button>
          </m.div>
        ) : (
          <button
            type="button"
            aria-label={`Forget ${note.title}`}
            onClick={() => setConfirming(true)}
            style={{ ...quiet, color: hovered || open ? 'var(--neutral-600)' : 'var(--neutral-400)' }}
          >
            <DeleteTwoIcon size={14} /> Forget
          </button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <m.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: DURATION.base, ease: 'easeOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div className={styles.note} style={{ padding: 'var(--memory-item-detail-padding)' }}>
              <MarkdownRenderer content={note.content} />
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Loading memory">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-4) var(--space-6) var(--space-2)', color: 'var(--neutral-400)' }}>
        <BrainTwoIcon size={16} />
        <span className="kaya-shimmer-text" style={{ fontFamily: BODY, fontSize: 'var(--font-size-body)', lineHeight: 'var(--line-height-body)' }}>Organizing memory…</span>
      </div>
      {[0.55, 0.8, 0.65, 0.9, 0.5].map((width, i) => (
        <div key={width} style={{ display: 'grid', gridTemplateColumns: '16px minmax(110px, 0.9fr) minmax(0, 2fr) 72px', gap: 'var(--space-3)', alignItems: 'center', padding: 'var(--space-3) var(--space-6) var(--space-3) var(--space-4)', borderTop: '1px solid var(--neutral-100)' }}>
          <div className="kaya-skeleton" style={{ width: 10, height: 10, animationDelay: `${i * 120}ms` }} />
          <div className="kaya-skeleton" style={{ width: '70%', height: 12, animationDelay: `${i * 120}ms` }} />
          <div className="kaya-skeleton" style={{ width: `${width * 100}%`, height: 12, animationDelay: `${i * 120}ms` }} />
          <div className="kaya-skeleton" style={{ width: 72, height: 12, animationDelay: `${i * 120}ms` }} />
        </div>
      ))}
    </div>
  )
}

function ManageDialog({ open, onOpenChange, orgId, summary, onSummary, draft, onDraft }: {
  open:         boolean
  onOpenChange: (open: boolean) => void
  orgId:        string | null
  summary:      MemorySummary
  onSummary:    (summary: MemorySummary) => void
  draft:        string
  onDraft:      (draft: string) => void
}) {
  const [exchanges, setExchanges] = useState<Exchange[]>([])
  const [updating,  setUpdating]  = useState(false)
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' })
  }, [exchanges])

  async function send() {
    const asked = draft.trim()
    if (!asked || updating) return
    onDraft('')
    setUpdating(true)
    const id = Date.now()
    setExchanges(previous => [...previous, { id, asked, reply: null }])
    try {
      const result = await editMemory(orgId, asked)
      onSummary(result.summary)
      setExchanges(previous => previous.map(item => item.id === id ? { ...item, reply: result.reply } : item))
    } catch {
      setExchanges(previous => previous.map(item => item.id === id ? { ...item, reply: 'That didn’t go through. Try again.', failed: true } : item))
    } finally {
      setUpdating(false)
    }
  }

  const ready = draft.trim() && !updating
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        aria-describedby={undefined}
        style={{ width: 760, height: 'calc(100dvh - 64px)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4) var(--space-3) var(--space-6)', borderBottom: '1px solid var(--neutral-100)' }}>
          <DialogTitle style={{ margin: 0, fontFamily: BODY, fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-body-lg)', lineHeight: 'var(--line-height-heading-sm)', color: 'var(--neutral-900)' }}>
            {orgId ? 'Organization memory summary' : 'Memory summary'}
          </DialogTitle>
          <DialogClose
            aria-label="Close"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, border: 'none', background: 'transparent', borderRadius: 'var(--radius-md)', cursor: 'pointer', color: 'var(--neutral-500)' }}
          >
            <CancelOneIcon size={14} />
          </DialogClose>
        </div>

        <div className="kaya-scrollbar" style={{ flex: '1 0 0', minHeight: 0, overflowY: 'auto', padding: 'var(--space-4) var(--space-6)' }}>
          <MarkdownRenderer content={summary.summary} />
          {exchanges.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginTop: 'var(--space-6)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--neutral-100)' }}>
              {exchanges.map(item => (
                <m.div
                  key={item.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', fontFamily: BODY, fontSize: 'var(--font-size-body)', lineHeight: 'var(--line-height-body)' }}
                >
                  <div style={{ alignSelf: 'flex-end', maxWidth: '80%', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-xl)', backgroundColor: 'var(--neutral-100)', color: 'var(--neutral-900)' }}>{item.asked}</div>
                  {item.reply === null ? (
                    <span className="kaya-shimmer-text">Updating memory…</span>
                  ) : (
                    <div style={{ color: item.failed ? 'var(--red-600)' : 'var(--neutral-700)' }}>
                      <MarkdownRenderer content={item.reply} />
                    </div>
                  )}
                </m.div>
              ))}
            </div>
          )}
          <div ref={bottom} />
        </div>

        <form onSubmit={event => { event.preventDefault(); void send() }} style={{ padding: 'var(--space-3) var(--space-6) var(--space-5)' }}>
          <div style={{
            display:         'flex',
            alignItems:      'center',
            gap:             'var(--space-2)',
            padding:         'var(--space-1-5) var(--space-1-5) var(--space-1-5) var(--space-4)',
            borderRadius:    'var(--radius-full)',
            backgroundColor: 'var(--field-surface)',
            boxShadow:       'var(--shadow-control)',
          }}>
            <input
              autoFocus
              value={draft}
              onChange={event => onDraft(event.target.value)}
              placeholder="Ask or update"
              maxLength={4000}
              style={{ flex: '1 0 0', minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontFamily: BODY, fontSize: 'var(--font-size-body)', lineHeight: 'var(--line-height-body)', color: 'var(--neutral-900)' }}
            />
            <button
              type="submit"
              aria-label="Send"
              disabled={!ready}
              style={{
                display:         'flex',
                alignItems:      'center',
                justifyContent:  'center',
                width:           32,
                height:          32,
                borderRadius:    'var(--radius-full)',
                border:          'none',
                cursor:          ready ? 'pointer' : 'default',
                backgroundColor: ready ? 'var(--neutral-900)' : 'var(--neutral-300)',
                color:           'var(--neutral-white)',
                transition:      'background-color var(--duration-fast) ease',
              }}
            >
              <ArrowUpTwoIcon size={16} />
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** `orgId` set = the organization's shared memory (the backend allows admins only); null = the user's own. */
export function MemorySection({ title, hint, orgId, query }: { title: string; hint: string; orgId: string | null; query: string }) {
  const [summary,  setSummary]  = useState<MemorySummary | null>(null)
  const [failed,   setFailed]   = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [dialog,   setDialog]   = useState(false)
  const [draft,    setDraft]    = useState('')

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = (attempt: number) => {
      fetchMemorySummary(orgId)
        .then(result => {
          if (cancelled) return
          setSummary(result)
          setFailed(false)
          if (result.stale && attempt < REFRESH_POLL_LIMIT) timer = setTimeout(() => load(attempt + 1), REFRESH_POLL_MS)
        })
        .catch(() => { if (!cancelled) setFailed(true) })
    }
    load(0)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [orgId])

  function openSummary() {
    setDraft('')
    setDialog(true)
  }

  async function forget(path: string) {
    try {
      setSummary(await forgetMemoryNote(orgId, path))
      if (expanded === path) setExpanded(null)
    } catch {
      toast.error('Couldn’t forget that note. Try again.')
    }
  }

  const shown = summary?.notes.filter(note => matches(note, query)) ?? []

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2-5)', marginTop: 'var(--space-4)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 'var(--space-4)', paddingLeft: 'var(--space-1)' }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ fontFamily: BODY, fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-body-lg)', lineHeight: 'var(--line-height-heading-sm)', color: 'var(--neutral-900)', margin: 0 }}>{title}</h2>
          <p style={{ fontFamily: BODY, fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-body)', lineHeight: 'var(--line-height-body)', color: 'var(--neutral-500)', margin: 0 }}>{hint}</p>
        </div>
        {summary && summary.notes.length > 0 && (
          summary.stale ? (
            <span className="kaya-shimmer-text" style={{ fontFamily: BODY, fontSize: 'var(--font-size-body-sm)', lineHeight: 'var(--line-height-body-sm)', whiteSpace: 'nowrap' }}>
              Refreshing with your latest notes…
            </span>
          ) : (
            <span style={{ fontFamily: BODY, fontSize: 'var(--font-size-body-sm)', lineHeight: 'var(--line-height-body-sm)', color: 'var(--neutral-400)', whiteSpace: 'nowrap' }}>
              {summary.notes.length} notes · summarized {ago(summary.generatedAt)}
            </span>
          )
        )}
      </div>

      <div style={CARD}>
        {summary === null ? (
          failed ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-8) var(--space-6)', color: 'var(--neutral-400)', fontFamily: BODY, fontSize: 'var(--font-size-body)' }}>
              <BrainTwoIcon size={32} />
              Couldn’t load this memory. Try again in a moment.
            </div>
          ) : <Skeleton />
        ) : summary.notes.length === 0 ? (
          <div style={{ padding: 'var(--space-4) var(--space-6)', fontFamily: BODY, fontSize: 'var(--font-size-body)', lineHeight: 'var(--line-height-body)', color: 'var(--neutral-500)' }}>{summary.summary}</div>
        ) : shown.length === 0 ? (
          <div style={{ padding: 'var(--space-4) var(--space-6)', fontFamily: BODY, fontSize: 'var(--font-size-body)', lineHeight: 'var(--line-height-body)', color: 'var(--neutral-500)' }}>No notes match “{query.trim()}”.</div>
        ) : (
          summary.groups.map((group, index) => {
            const notes = shown.filter(note => note.group === group)
            if (notes.length === 0) return null
            return (
              <div key={group} style={{ borderTop: index === 0 ? 'none' : '1px solid var(--neutral-100)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-4) var(--space-6) var(--space-2-5)' }}>
                  <span style={{ fontFamily: BODY, fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-body)', lineHeight: 'var(--line-height-body)', color: 'var(--neutral-900)' }}>{group}</span>
                  <span style={{
                    display:         'inline-flex',
                    alignItems:      'center',
                    justifyContent:  'center',
                    minWidth:        20,
                    height:          20,
                    padding:         '0 var(--space-1-5)',
                    borderRadius:    'var(--radius-full)',
                    backgroundColor: 'var(--neutral-100)',
                    color:           'var(--neutral-600)',
                    fontFamily:      BODY,
                    fontSize:        'var(--font-size-small)',
                    fontWeight:      'var(--font-weight-medium)',
                  }}>
                    {notes.length}
                  </span>
                </div>
                {notes.map(note => (
                  <NoteRow
                    key={note.path}
                    note={note}
                    open={expanded === note.path}
                    onToggle={() => setExpanded(current => current === note.path ? null : note.path)}
                    onForget={() => forget(note.path)}
                  />
                ))}
              </div>
            )
          })
        )}
      </div>

      <div style={{ ...CARD, display: 'flex', alignItems: 'center', gap: 'var(--space-4)', padding: 'var(--space-4) var(--space-6)' }}>
        <div style={{
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'center',
          width:           36,
          height:          36,
          flexShrink:      0,
          borderRadius:    'var(--radius-lg)',
          backgroundColor: 'var(--neutral-100)',
          color:           'var(--neutral-600)',
        }}>
          <BrainTwoIcon size={18} />
        </div>
        <div style={{ flex: '1 0 0', minWidth: 0 }}>
          <p style={{ fontFamily: BODY, fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-body)', lineHeight: 'var(--line-height-body)', color: 'var(--neutral-900)', margin: 0 }}>Manage memory</p>
          <p style={{
            fontFamily:      BODY,
            fontSize:        'var(--font-size-body)',
            lineHeight:      'var(--line-height-body)',
            color:           'var(--neutral-500)',
            margin:          0,
            display:         '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow:        'hidden',
          }}>
            {summary && summary.notes.length > 0 ? teaser(summary.summary) : 'Read the full summary and ask Souvenir to add, change or forget anything.'}
          </p>
        </div>
        <Button variant="secondary" size="sm" disabled={summary === null} onClick={openSummary}>Open summary</Button>
      </div>

      {summary && (
        <ManageDialog
          open={dialog}
          onOpenChange={setDialog}
          orgId={orgId}
          summary={summary}
          onSummary={setSummary}
          draft={draft}
          onDraft={setDraft}
        />
      )}
    </section>
  )
}

export default MemorySection
