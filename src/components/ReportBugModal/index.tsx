'use client'

import React, { useState, useEffect } from 'react'
import { useForm, ValidationError } from '@formspree/react'
import { CancelOneIcon } from '@strange-huge/icons'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/auth-context'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { toast } from 'sonner'

const SHADOW_MODAL = 'var(--shadow-4)'
const SHADOW_INPUT = 'var(--shadow-field)'
const SHADOW_PILL  = 'var(--shadow-card-raised)'
const SHADOW_PILL_ACTIVE = 'var(--shadow-pill-active)'

type Severity = 'low' | 'medium' | 'high'

// Closing the modal (the X, a click on the overlay) previously discarded
// whatever was typed with no warning — a detailed bug report gone for one
// misclick. Persisted here instead: survives close/reopen and even a page
// reload within the same tab, cleared only once the report actually submits.
const DRAFT_KEY = 'kaya:reportBugDraft:v1'

interface BugDraft { message: string; severity: Severity }

function readDraft(): BugDraft {
  if (typeof window === 'undefined') return { message: '', severity: 'low' }
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY)
    if (!raw) return { message: '', severity: 'low' }
    const parsed = JSON.parse(raw) as Partial<BugDraft>
    const severity: Severity = parsed.severity === 'medium' || parsed.severity === 'high' ? parsed.severity : 'low'
    return { message: typeof parsed.message === 'string' ? parsed.message : '', severity }
  } catch {
    return { message: '', severity: 'low' }
  }
}

function writeDraft(draft: BugDraft): void {
  try { window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft)) } catch { /* quota / private mode */ }
}

function clearDraft(): void {
  try { window.sessionStorage.removeItem(DRAFT_KEY) } catch { /* noop */ }
}

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-body)', lineHeight: 'var(--line-height-body)', color: 'var(--neutral-700)', margin: 0,
}
const inputStyle: React.CSSProperties = {
  flex: '1 0 0', minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'var(--font-body)', fontSize: 'var(--font-size-body)', lineHeight: 'var(--line-height-body)', color: 'var(--neutral-900)', padding: '0 var(--space-0-5)',
}
const fieldErrorStyle: React.CSSProperties = {
  display: 'block', fontFamily: 'var(--font-body)', fontSize: 'var(--font-size-small)', lineHeight: 'var(--line-height-small)', color: 'var(--red-400)', marginTop: 'var(--space-0-5)',
}

function SeverityPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: '1 1 0', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'var(--space-1-5) var(--space-2-5) var(--space-2)', borderRadius: 'var(--radius-lg)', border: 'none', cursor: 'pointer',
        fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-medium)', fontSize: 'var(--font-size-body)', lineHeight: 'var(--line-height-body)',
        whiteSpace: 'nowrap', position: 'relative', background: 'var(--neutral-white)',
        color: active ? 'var(--neutral-50)' : 'var(--neutral-700)',
        boxShadow: active ? SHADOW_PILL_ACTIVE : SHADOW_PILL,
        transition: 'box-shadow var(--duration-fast), color var(--duration-fast)',
      }}
    >
      {active && (
        <span aria-hidden style={{ position: 'absolute', inset: 0, borderRadius: 'var(--radius-lg)', background: 'linear-gradient(180deg, var(--neutral-700) 0%, var(--neutral-900) 100%)', pointerEvents: 'none' }} />
      )}
      <span style={{ position: 'relative' }}>{label}</span>
    </button>
  )
}

export interface ReportBugModalProps {
  onClose: () => void
}

export function ReportBugModal({ onClose }: ReportBugModalProps) {
  const { user } = useAuth()
  // Already known from sign-in (same identity shown in the Settings
  // sidebar) — prefilled so it's not re-typed on every report, but left as
  // plain `defaultValue`s (uncontrolled) so they're still freely editable.
  const displayName = user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.name || '' : ''
  const [severity, setSeverity] = useState<Severity>(() => readDraft().severity)
  const [message,  setMessage]  = useState(() => readDraft().message)
  const [state, handleSubmit] = useForm('xjgjgopw')

  useEffect(() => {
    writeDraft({ message, severity })
  }, [message, severity])

  // Success: clear the draft, toast + close
  useEffect(() => {
    if (state.succeeded) {
      clearDraft()
      toast.success("Bug reported — we'll look into it soon.")
      onClose()
    }
  }, [state.succeeded, onClose])

  // Form-level errors (server / spam / network) → toast.
  // @formspree/react v3: state.errors is a SubmissionErrors instance; getFormErrors()
  // returns {code, message}[] — not strings — so we extract .message before toasting.
  useEffect(() => {
    if (state.submitting || state.succeeded) return
    const formErrs: Array<{ code: string; message: string }> =
      (state.errors?.getFormErrors?.() as Array<{ code: string; message: string }>) ?? []
    if (formErrs.length > 0) {
      toast.error(formErrs[0].message ?? 'Submission failed. Please try again.')
    }
  }, [state.errors, state.submitting, state.succeeded])

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent
        hideClose
        aria-label="Report a bug"
        className="kaya-scrollbar"
        style={{ background: 'var(--modal-bg)', borderRadius: 'var(--radius-2xl)', padding: 'var(--space-2)', boxShadow: SHADOW_MODAL, width: 738, maxWidth: 'calc(100vw - 48px)', maxHeight: 'calc(100dvh - 48px)', overflow: 'auto', display: 'block' }}
      >
        <form onSubmit={handleSubmit}>
          <div style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>

            {/* Header */}
            <div style={{ padding: 'var(--space-3) var(--space-3) 0', display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
              <DialogTitle asChild>
              <p style={{ flex: '1 0 0', fontFamily: 'var(--font-title)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-heading)', lineHeight: 'var(--line-height-heading)', color: 'var(--neutral-900)', margin: 0 }}>
                Report a bug
              </p>
              </DialogTitle>
              <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 'var(--space-1-5)', borderRadius: 'var(--radius-md)', display: 'flex', color: 'var(--neutral-700)', flexShrink: 0 }}>
                <CancelOneIcon size={20} />
              </button>
            </div>

            {/* Subtitle */}
            <div style={{ padding: '0 var(--space-3) var(--space-6)' }}>
              <DialogDescription asChild>
              <p style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-body)', lineHeight: 'var(--line-height-body)', color: 'var(--neutral-500)', margin: 0 }}>
                Something not working right?
              </p>
              </DialogDescription>
            </div>

            {/* Form container */}
            <div style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-2xl)', padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>

              {/* Row 1: Work email + Full name */}
              <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', width: '100%' }}>
                  <label htmlFor="rb-email" style={labelStyle}>Work email</label>
                  <div style={{ display: 'flex', alignItems: 'center', background: 'var(--field-surface)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-1-5) var(--space-2-5)', boxShadow: SHADOW_INPUT }}>
                    <input id="rb-email" type="email" name="email" placeholder="you@company.com" defaultValue={user?.email ?? ''} required style={inputStyle} />
                  </div>
                  <span style={fieldErrorStyle}>
                    <ValidationError field="email" errors={state.errors} />
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', width: '100%' }}>
                  <label htmlFor="rb-name" style={labelStyle}>Full name</label>
                  <div style={{ display: 'flex', alignItems: 'center', background: 'var(--field-surface)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-1-5) var(--space-2-5)', boxShadow: SHADOW_INPUT }}>
                    <input id="rb-name" type="text" name="name" placeholder="Jane Smith" defaultValue={displayName} style={inputStyle} />
                  </div>
                  <span style={fieldErrorStyle}>
                    <ValidationError field="name" errors={state.errors} />
                  </span>
                </div>
              </div>

              {/* What went wrong — tall textarea */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                <label htmlFor="rb-message" style={labelStyle}>What went wrong?</label>
                <textarea
                  id="rb-message"
                  name="message"
                  placeholder="Describe what happened and what you expected instead…"
                  rows={5}
                  required
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box', border: 'none', outline: 'none', background: 'var(--field-surface)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-2) var(--space-3)', boxShadow: SHADOW_INPUT, fontFamily: 'var(--font-body)', fontSize: 'var(--font-size-body)', lineHeight: 'var(--line-height-body)', color: 'var(--neutral-900)', resize: 'none' }}
                />
                <span style={fieldErrorStyle}>
                  <ValidationError field="message" errors={state.errors} />
                </span>
              </div>

              {/* Severity pills */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                <p style={labelStyle}>Severity</p>
                <input type="hidden" name="severity" value={severity} />
                <div style={{ display: 'flex', gap: 'var(--space-2-5)' }}>
                  <SeverityPill label="Low"    active={severity === 'low'}    onClick={() => setSeverity('low')} />
                  <SeverityPill label="Medium" active={severity === 'medium'} onClick={() => setSeverity('medium')} />
                  <SeverityPill label="High"   active={severity === 'high'}   onClick={() => setSeverity('high')} />
                </div>
              </div>

            </div>

            {/* Footer */}
            <div style={{ padding: 'var(--space-6) 0 var(--space-3)' }}>
              <Button variant="default" fluid type="submit" sendState={state.submitting ? 'loading' : state.succeeded ? 'success' : 'idle'}>
                Submit bug
              </Button>
            </div>

          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default ReportBugModal
