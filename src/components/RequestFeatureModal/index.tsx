'use client'

import React, { useEffect, useState } from 'react'
import { useForm, ValidationError } from '@formspree/react'
import { CancelOneIcon } from '@strange-huge/icons'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/auth-context'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { toast } from 'sonner'

const SHADOW_MODAL = 'var(--shadow-4)'
const SHADOW_INPUT = 'var(--shadow-field)'

// Closing the modal (the X, a click on the overlay) previously discarded
// whatever was typed with no warning. Persisted here instead: survives
// close/reopen and even a page reload within the same tab, cleared only
// once the request actually submits.
const DRAFT_KEY = 'kaya:requestFeatureDraft:v1'

function readDraft(): string {
  if (typeof window === 'undefined') return ''
  try {
    return window.sessionStorage.getItem(DRAFT_KEY) ?? ''
  } catch {
    return ''
  }
}

function writeDraft(message: string): void {
  try { window.sessionStorage.setItem(DRAFT_KEY, message) } catch { /* quota / private mode */ }
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

export interface RequestFeatureModalProps {
  onClose: () => void
}

export function RequestFeatureModal({ onClose }: RequestFeatureModalProps) {
  const { user } = useAuth()
  // Already known from sign-in (same identity shown in the Settings
  // sidebar) — prefilled so it's not re-typed on every request, but left as
  // plain `defaultValue`s (uncontrolled) so they're still freely editable.
  const displayName = user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.name || '' : ''
  const [message, setMessage] = useState(readDraft)
  const [state, handleSubmit] = useForm('mrerelnz')

  useEffect(() => {
    writeDraft(message)
  }, [message])

  // Success: clear the draft, toast + close
  useEffect(() => {
    if (state.succeeded) {
      clearDraft()
      toast.success('Feature request sent — thanks for the suggestion!')
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
        aria-label="Request a feature"
        className="kaya-scrollbar"
        style={{ background: 'var(--modal-bg)', borderRadius: 'var(--radius-2xl)', padding: 'var(--space-2)', boxShadow: SHADOW_MODAL, width: 738, maxWidth: 'calc(100vw - 48px)', maxHeight: 'calc(100dvh - 48px)', overflow: 'auto', display: 'block' }}
      >
        <form onSubmit={handleSubmit}>
          <div style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>

            {/* Header */}
            <div style={{ padding: 'var(--space-3) var(--space-3) 0', display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
              <DialogTitle asChild>
              <p style={{ flex: '1 0 0', fontFamily: 'var(--font-title)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-heading)', lineHeight: 'var(--line-height-heading)', color: 'var(--neutral-900)', margin: 0 }}>
                Request a feature
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
                Got an idea for Souvenir?
              </p>
              </DialogDescription>
            </div>

            {/* Form container */}
            <div style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-2xl)', padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>

              {/* Row 1: Work email + Full name */}
              <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', width: '100%' }}>
                  <label htmlFor="rf-email" style={labelStyle}>Work email</label>
                  <div style={{ display: 'flex', alignItems: 'center', background: 'var(--field-surface)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-1-5) var(--space-2-5)', boxShadow: SHADOW_INPUT }}>
                    <input id="rf-email" type="email" name="email" placeholder="you@company.com" defaultValue={user?.email ?? ''} required style={inputStyle} />
                  </div>
                  <span style={fieldErrorStyle}>
                    <ValidationError field="email" errors={state.errors} />
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', width: '100%' }}>
                  <label htmlFor="rf-name" style={labelStyle}>Full name</label>
                  <div style={{ display: 'flex', alignItems: 'center', background: 'var(--field-surface)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-1-5) var(--space-2-5)', boxShadow: SHADOW_INPUT }}>
                    <input id="rf-name" type="text" name="name" placeholder="Jane Smith" defaultValue={displayName} style={inputStyle} />
                  </div>
                  <span style={fieldErrorStyle}>
                    <ValidationError field="name" errors={state.errors} />
                  </span>
                </div>
              </div>

              {/* What would help you — tall textarea */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                <label htmlFor="rf-message" style={labelStyle}>What would help you?</label>
                <textarea
                  id="rf-message"
                  name="message"
                  placeholder="Tell us about your team and what you're trying to solve…"
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

            </div>

            {/* Footer */}
            <div style={{ padding: 'var(--space-6) 0 var(--space-3)' }}>
              <Button variant="default" fluid type="submit" sendState={state.submitting ? 'loading' : state.succeeded ? 'success' : 'idle'}>
                Submit request
              </Button>
            </div>

          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default RequestFeatureModal
