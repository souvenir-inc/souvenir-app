'use client'

import React, { useState } from 'react'
import { z } from 'zod'
import { CancelOneIcon } from '@strange-huge/icons'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'

// ── Style constants (mirrors org/plans page tokens) ──────────────────────────

const SHADOW_MODAL = '0px 19px 32px 0px rgba(18,12,8,0.15), 0px 2px 2.8px 0px rgba(130,122,116,0.1)'
const SHADOW_INPUT = '0px 1px 1.5px 0px rgba(82,75,71,0.12), 0px 0px 0px 1px var(--text-field-ring)'
const SHADOW_PILL  = '0px 1.091px 1.091px 0px rgba(59,54,50,0.05), 0px 1.455px 3.127px 0px rgba(38,33,30,0.15), 0px 0px 0px 1px var(--neutral-100)'
const SHADOW_PILL_ACTIVE = '0px 0px 0px 1px var(--neutral-black), 0px 1.091px 1.091px 0px rgba(59,54,50,0.1), 0px 1.455px 3.127px 0px rgba(59,54,50,0.4)'

type PreferredTime = 'mornings' | 'afternoons' | 'evenings'

// Old check only required a non-empty email; this also rejects malformed
// addresses, which nothing here caught before.
const requestDemoSchema = z.object({
  email:         z.string().trim().min(1, 'Work email is required.').email('Enter a valid work email.'),
  name:          z.string().trim(),
  preferredTime: z.enum(['mornings', 'afternoons', 'evenings']),
  message:       z.string().trim(),
})

// ── Labelled input ────────────────────────────────────────────────────────────

function InputField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label:        string
  value:        string
  onChange:     (v: string) => void
  placeholder?: string
  type?:        string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', width: '100%' }}>
      <p style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-body)', lineHeight: 'var(--line-height-body)', color: 'var(--neutral-700)', margin: 0 }}>
        {label}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-0-5)', background: 'var(--field-surface)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-1-5) var(--space-2-5)', boxShadow: SHADOW_INPUT }}>
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ flex: '1 0 0', minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'var(--font-body)', fontSize: 'var(--font-size-body)', lineHeight: 'var(--line-height-body)', color: 'var(--neutral-900)', padding: '0 var(--space-0-5)' }}
        />
      </div>
    </div>
  )
}

// ── Preferred-time pill toggle ────────────────────────────────────────────────

function TimePill({
  label,
  active,
  onClick,
}: {
  label:   string
  active:  boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex:            '1 1 0',
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'center',
        padding:         'var(--space-1-5) var(--space-2-5) var(--space-2)',
        borderRadius:    'var(--radius-lg)',
        border:          'none',
        cursor:          'pointer',
        fontFamily:      'var(--font-body)',
        fontWeight:      'var(--font-weight-medium)',
        fontSize:        'var(--font-size-body)',
        lineHeight:      'var(--line-height-body)',
        whiteSpace:      'nowrap',
        position:        'relative',
        background:      'var(--neutral-white)',
        color:           active ? 'var(--neutral-50)' : 'var(--neutral-700)',
        boxShadow:       active ? SHADOW_PILL_ACTIVE : SHADOW_PILL,
        transition:      'box-shadow var(--duration-fast), color var(--duration-fast)',
      }}
    >
      {active && (
        <span
          aria-hidden
          style={{
            position:     'absolute',
            inset:        0,
            borderRadius: 'var(--radius-lg)',
            background:   'linear-gradient(180deg, var(--neutral-700, #524b47) 0%, var(--neutral-900, #26211e) 100%)',
            pointerEvents: 'none',
          }}
        />
      )}
      <span style={{ position: 'relative' }}>{label}</span>
    </button>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────────

export interface RequestDemoModalProps {
  onClose: () => void
  /** Called with form data when the user clicks "Book a demo". Wire up your calendar / CRM here. */
  onSubmit?: (data: {
    email:         string
    name:          string
    preferredTime: PreferredTime
    message:       string
  }) => Promise<void>
}

export function RequestDemoModal({ onClose, onSubmit }: RequestDemoModalProps) {
  const [email,         setEmail]         = useState('')
  const [name,          setName]          = useState('')
  const [preferredTime, setPreferredTime] = useState<PreferredTime>('mornings')
  const [message,       setMessage]       = useState('')
  const [submitting,    setSubmitting]     = useState(false)

  const handleSubmit = async () => {
    const result = requestDemoSchema.safeParse({ email, name, preferredTime, message })
    if (!result.success) {
      toast.error(result.error.issues[0]?.message ?? 'Please check your details.')
      return
    }
    setSubmitting(true)
    try {
      await onSubmit?.(result.data)
      toast.success("We'll send you a calendar link shortly.")
      onClose()
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent
        hideClose
        aria-describedby={undefined}
        // Mid-submit, Esc and outside clicks wait; portaled dropdown menus don't count as "outside".
        onEscapeKeyDown={e => { if (submitting) e.preventDefault() }}
        onInteractOutside={e => {
          if (submitting || (e.target instanceof Element && e.target.closest('[data-kds-dropdown-panel]'))) e.preventDefault()
        }}
        className="kaya-scrollbar p-2"
        style={{ width: 738, maxHeight: 'calc(100dvh - 48px)', overflow: 'auto', background: 'var(--neutral-50)', borderRadius: 'var(--radius-2xl)', boxShadow: SHADOW_MODAL }}
      >
        <div style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>

          {/* Header */}
          <div style={{ padding: 'var(--space-3) var(--space-3) 0', display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
            <DialogTitle style={undefined} className="m-0 flex-[1_0_0] font-[family-name:var(--font-title)] text-2xl font-normal leading-8 text-[var(--neutral-900)]">
              Request a demo
            </DialogTitle>
            <button
              onClick={onClose}
              aria-label="Close"
              className="flex shrink-0 cursor-pointer rounded-md border-none bg-transparent p-1.5 text-[var(--neutral-700)]"
            >
              <CancelOneIcon size={20} />
            </button>
          </div>

          {/* Subtitle */}
          <div style={{ padding: '0 var(--space-3) var(--space-6)' }}>
            <p style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-body)', lineHeight: 'var(--line-height-body)', color: 'var(--neutral-500)', margin: 0 }}>
              A 30-minute walkthrough of Tasks, agents, and the Slack bot.
            </p>
          </div>

          {/* Form container */}
          <div style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-2xl)', padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>

            {/* Row 1: Work email + Full name */}
            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <InputField label="Work email" value={email} onChange={setEmail} placeholder="you@company.com" type="email" />
              <InputField label="Full name"  value={name}  onChange={setName}  placeholder="Jane Smith" />
            </div>

            {/* Preferred time toggles */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              <p style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-body)', lineHeight: 'var(--line-height-body)', color: 'var(--neutral-700)', margin: 0 }}>
                Preferred time
              </p>
              <div style={{ display: 'flex', gap: 'var(--space-2-5)' }}>
                <TimePill label="Mornings"   active={preferredTime === 'mornings'}   onClick={() => setPreferredTime('mornings')} />
                <TimePill label="Afternoons" active={preferredTime === 'afternoons'} onClick={() => setPreferredTime('afternoons')} />
                <TimePill label="Evenings"   active={preferredTime === 'evenings'}   onClick={() => setPreferredTime('evenings')} />
              </div>
            </div>

            {/* Textarea */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              <p style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-body)', lineHeight: 'var(--line-height-body)', color: 'var(--neutral-700)', margin: 0 }}>
                What do you want to see?
              </p>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Tell us about your team and what you're trying to solve — we'll tailor the demo to it…"
                rows={4}
                style={{ width: '100%', boxSizing: 'border-box', border: 'none', outline: 'none', background: 'var(--field-surface)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-2) var(--space-3)', boxShadow: SHADOW_INPUT, fontFamily: 'var(--font-body)', fontSize: 'var(--font-size-body)', lineHeight: 'var(--line-height-body)', color: 'var(--neutral-900)', resize: 'none' }}
              />
            </div>
          </div>

          {/* Footer */}
          <div style={{ padding: 'var(--space-6) 0 var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <Button variant="default" fluid onClick={handleSubmit} loading={submitting} disabled={submitting}>
              Book a demo
            </Button>
            <p style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-body)', lineHeight: 'var(--line-height-body)', color: 'var(--neutral-500)', margin: 0 }}>
              Opens a calendar to pick your slot.
            </p>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  )
}

export default RequestDemoModal
