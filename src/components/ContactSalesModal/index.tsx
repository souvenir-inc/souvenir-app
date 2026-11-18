'use client'

import React, { useEffect, useState } from 'react'
import { useForm, ValidationError } from '@formspree/react'
import { toast } from 'sonner'
import { CancelOneIcon, ArrowDownOneIcon } from '@strange-huge/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Dropdown } from '@/components/Dropdown'

const TEAM_SIZE_OPTIONS = [
  { value: '1-5', label: '1 – 5' },
  { value: '6-20', label: '6 – 20' },
  { value: '21-50', label: '21 – 50' },
  { value: '51-200', label: '51 – 200' },
  { value: '201+', label: '201+' },
] as const

const TEAM_SIZE_LABELS: Record<string, string> = Object.fromEntries(
  TEAM_SIZE_OPTIONS.map(o => [o.value, o.label])
)

const SHADOW_MODAL = 'var(--shadow-4)'

const S = {
  label: {
    fontFamily: 'var(--font-body)',
    fontWeight: 'var(--font-weight-regular)',
    fontSize: 'var(--font-size-body)',
    lineHeight: 'var(--line-height-body)',
    color: 'var(--neutral-700)',
    margin: 0,
  } as React.CSSProperties,
  fieldError: {
    display: 'block',
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--font-size-small)',
    lineHeight: 'var(--line-height-small)',
    color: 'var(--red-400)',
    marginTop: 'var(--space-0-5)',
  } as React.CSSProperties,
} as const

export function ContactSalesModal({ onClose }: { onClose: () => void }) {
  const [state, handleSubmit] = useForm('xgojalnr')
  const [teamSize, setTeamSize] = useState<string>('1-5')
  const [teamSizeOpen, setTeamSizeOpen] = useState(false)

  // Success: toast + close
  useEffect(() => {
    if (state.succeeded) {
      toast.success("We'll be in touch within one business day.")
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
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent
        hideClose
        aria-describedby={undefined}
        // Mid-submit, Esc and outside clicks wait; portaled dropdown menus don't count as "outside".
        onEscapeKeyDown={e => { if (state.submitting) e.preventDefault() }}
        onInteractOutside={e => {
          if (state.submitting || (e.target instanceof Element && e.target.closest('[data-kds-dropdown-panel]'))) e.preventDefault()
        }}
        className="kaya-scrollbar p-2"
        style={{ width: 738, maxHeight: 'calc(100dvh - 48px)', overflow: 'auto', background: 'var(--neutral-50)', borderRadius: 'var(--radius-2xl)', boxShadow: SHADOW_MODAL }}
      >
        <form onSubmit={handleSubmit}>
          <div style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>

            {/* Header */}
            <div style={{ borderBottom: '1px solid var(--neutral-100)', padding: '0 var(--space-3) var(--space-6)', display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
              <DialogTitle style={undefined} className="m-0 flex-[1_0_0] font-[family-name:var(--font-title)] text-2xl font-normal leading-8 text-[var(--neutral-900)]">
                Contact sales
              </DialogTitle>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex shrink-0 cursor-pointer rounded-md border-none bg-transparent p-1.5 text-[var(--neutral-700)]"
              >
                <CancelOneIcon size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {/* Subtitle */}
              <div style={{ padding: '0 var(--space-3) var(--space-6)' }}>
                <p style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-body)', lineHeight: 'var(--line-height-body)', color: 'var(--neutral-500)', margin: 0 }}>
                  Deploy Autonomous Tasks to your team. We&apos;ll scope seats, governance, and rollout.
                </p>
              </div>

              {/* Fields */}
              <div style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-2xl)', padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>

                {/* Row 1: Work email + Full name */}
                <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', width: '100%' }}>
                    <label htmlFor="cs-email" style={S.label}>Work email</label>
                    <Input fluid id="cs-email" type="email" name="email" placeholder="you@company.com" required />
                    <span style={S.fieldError}>
                      <ValidationError field="email" errors={state.errors} />
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', width: '100%' }}>
                    <label htmlFor="cs-name" style={S.label}>Full name</label>
                    <Input fluid id="cs-name" type="text" name="name" placeholder="Jane Smith" required />
                    <span style={S.fieldError}>
                      <ValidationError field="name" errors={state.errors} />
                    </span>
                  </div>
                </div>

                {/* Row 2: Company + Team size */}
                <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', width: '100%' }}>
                    <label htmlFor="cs-company" style={S.label}>Company</label>
                    <Input fluid id="cs-company" type="text" name="company" placeholder="Acme Inc." required />
                    <span style={S.fieldError}>
                      <ValidationError field="company" errors={state.errors} />
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', width: '100%' }}>
                    <label htmlFor="cs-team-size" style={S.label}>Team size</label>
                    <Dropdown.Float
                      open={teamSizeOpen}
                      onOpenChange={setTeamSizeOpen}
                      placement="bottom-start"
                      trigger={
                        <Button
                          id="cs-team-size"
                          type="button"
                          variant="outline"
                          fluid
                          rightIcon={<ArrowDownOneIcon animated />}
                        >
                          {TEAM_SIZE_LABELS[teamSize]}
                        </Button>
                      }
                    >
                      <Dropdown maxHeight={false}>
                        <Dropdown.Section>
                          {TEAM_SIZE_OPTIONS.map(o => (
                            <Dropdown.Item
                              key={o.value}
                              label={o.label}
                              selected={teamSize === o.value}
                              onClick={() => { setTeamSize(o.value); setTeamSizeOpen(false) }}
                              fluid
                            />
                          ))}
                        </Dropdown.Section>
                      </Dropdown>
                    </Dropdown.Float>
                    {/* @formspree/react's handleSubmit builds a FormData from the native
                        <form> element, so the selected value only reaches the Formspree
                        payload if a native form field carries it — the Dropdown/Button
                        pair above has no native form participation. */}
                    <input type="hidden" name="team_size" value={teamSize} />
                    <span style={S.fieldError}>
                      <ValidationError field="team_size" errors={state.errors} />
                    </span>
                  </div>
                </div>

                {/* What are you trying to solve? */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                  <label htmlFor="cs-message" style={S.label}>What are you trying to solve?</label>
                  <Textarea id="cs-message" name="message" placeholder="Tell us about your use case…" minRows={4} required />
                  <span style={S.fieldError}>
                    <ValidationError field="message" errors={state.errors} />
                  </span>
                </div>
              </div>

              {/* Footer */}
              <div style={{ padding: 'var(--space-6) 0 var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                <Button variant="default" fluid type="submit" loading={state.submitting} disabled={state.submitting}>
                  Contact sales
                </Button>
                <p style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-body)', lineHeight: 'var(--line-height-body)', color: 'var(--neutral-500)', margin: 0 }}>
                  Response within one business day.
                </p>
              </div>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
