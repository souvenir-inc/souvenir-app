'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { LinkSixIcon, MessagePreviewOneIcon, UserIcon } from '@strange-huge/icons'
import { Button } from '@/components/ui/button'
import { SouvenirLogo } from '@/components/SouvenirLogo'
import { getOrgSlackStatus, getSlackInstallUrl, getSlackStatus } from '@/lib/api/slack'

// ── Shadows ───────────────────────────────────────────────────────────────────
const SHADOW_MODAL = '0px 12px 16px -4px rgba(130,122,116,0.12), var(--shadow-soft), 0px 0px 0px 1px var(--neutral-100)'
const SHADOW_CARD_BORDER = '0px 1px 1.5px rgba(82,75,71,0.12), 0px 0px 0px 1px var(--neutral-200)'

// Poll the Slack status after the install tab opens, until the bot reports
// installed or we give up. 3s cadence keeps it responsive without hammering.
const POLL_INTERVAL_MS = 3000
const POLL_TIMEOUT_MS   = 3 * 60 * 1000

// ── Permission rows (Figma 136:53621 "Permissions Section") ──────────────────

interface Permission {
  icon: React.ReactNode
  text: string
}

const PERMISSIONS: Permission[] = [
  {
    icon: <LinkSixIcon size={20} color="var(--neutral-700)" />,
    text: 'Establish a connection between your Souvenir workspace and Slack.',
  },
  {
    icon: <MessagePreviewOneIcon size={20} color="var(--neutral-700)" />,
    text: 'Send scheduled summaries, notifications, and AI-generated content to channels.',
  },
  {
    icon: <UserIcon size={20} color="var(--neutral-700)" />,
    text: 'Read channel names and members for message routing and @mentions.',
  },
]

function SectionDivider() {
  return <div style={{ width: '100%', height: 1, backgroundColor: 'var(--neutral-100)', flexShrink: 0 }} />
}

// ── Souvenir ↔ link ↔ Slack logo bridge ───────────────────────────────────────

function LogoBridge() {
  const tileStyle: React.CSSProperties = {
    width: 48,
    height: 48,
    borderRadius: 'var(--radius-xl)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
      <div style={{ ...tileStyle, backgroundColor: 'var(--neutral-white)', boxShadow: SHADOW_CARD_BORDER }}>
        <SouvenirLogo variant="gray" size={28} alt="Souvenir" />
      </div>
      <LinkSixIcon size={20} color="var(--neutral-500)" />
      <div style={{ ...tileStyle, backgroundColor: 'var(--neutral-white)', boxShadow: SHADOW_CARD_BORDER }}>
        <img src="/icons/slack.svg" alt="Slack" width={28} height={28} style={{ display: 'block' }} />
      </div>
    </div>
  )
}

// ── Card ───────────────────────────────────────────────────────────────────────

interface SlackConnectModalProps {
  isOpen:       boolean
  onClose:      () => void
  orgId?:       string | null
  /** Fired once the bot reports installed (status poll succeeds). */
  onConnected?: () => void
}

export function SlackConnectModal({ isOpen, onClose, orgId, onConnected }: SlackConnectModalProps) {
  const [connecting, setConnecting] = useState(false)
  const pollRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stopPolling = () => {
    if (pollRef.current)    { clearInterval(pollRef.current); pollRef.current = null }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
  }

  // Stop polling whenever the modal closes or the component unmounts.
  useEffect(() => {
    if (isOpen) return stopPolling
    stopPolling()
    const reset = window.setTimeout(() => setConnecting(false), 0)
    return () => {
      window.clearTimeout(reset)
      stopPolling()
    }
  }, [isOpen])

  const handleConnect = async () => {
    if (connecting) return
    setConnecting(true)
    try {
      const url = await getSlackInstallUrl()
      // Open Slack's install flow in a new tab so the app (and this poll) stay alive.
      window.open(url, '_blank', 'noopener,noreferrer')
      toast.info('Continue in the new tab to authorize Slack…')

      stopPolling()
      pollRef.current = setInterval(async () => {
        try {
          const status = orgId ? await getOrgSlackStatus(orgId) : await getSlackStatus()
          if (status.connected) {
            stopPolling()
            setConnecting(false)
            toast.success('Slack connected')
            onConnected?.()
            onClose()
          }
        } catch { /* transient — keep polling */ }
      }, POLL_INTERVAL_MS)

      timeoutRef.current = setTimeout(() => {
        stopPolling()
        setConnecting(false)
        toast.info('Still waiting on Slack. Finish authorizing, then try again.')
      }, POLL_TIMEOUT_MS)
    } catch (err) {
      setConnecting(false)
      toast.error(err instanceof Error ? err.message : 'Could not start Slack install')
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={open => { if (!open) onClose() }}>
      {/* The card below draws its own surface, so the dialog shell is bare. */}
      <DialogContent
        bare
        aria-describedby={undefined}
        style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
      >
        <DialogTitle visuallyHidden>Connect Souvenir to Slack</DialogTitle>

        <div
          style={{
            display:         'flex',
            flexDirection:   'column',
            width:           520,
            maxWidth:        'calc(100vw - 48px)',
            maxHeight:       'calc(100vh - 48px)',
            overflowY:       'auto',
            borderRadius:    'var(--radius-2xl)',
            boxSizing:       'border-box',
            backgroundColor: 'var(--modal-bg)',
            boxShadow:       SHADOW_MODAL,
          }}
        >
          {/* ── Header — title + Souvenir / link / Slack logo bridge ── */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-4)', padding: 'var(--space-6) var(--space-6) var(--space-6)' }}>
            <h2 style={{
              fontFamily: 'var(--font-title)',
              fontWeight: 'var(--font-weight-regular)',
              fontSize:   'var(--font-size-heading)',
              lineHeight: 'var(--line-height-heading)',
              color:      'var(--neutral-900)',
              margin:     0,
              textAlign:  'center',
            }}>
              Connect Souvenir to Slack
            </h2>
            <LogoBridge />
          </div>

          <SectionDivider />

          {/* ── Permissions ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', padding: 'var(--space-6) var(--space-6) var(--space-5)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', padding: 'var(--space-5)', borderRadius: 'var(--radius-xl)', backgroundColor: 'var(--neutral-50)' }}>
              <p style={{
                fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-body-sm)', lineHeight: '18px',
                color: 'var(--neutral-700)', margin: 0,
              }}>
                Souvenir will be able to:
              </p>
              {PERMISSIONS.map(p => (
                <div key={p.text} style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                  <span aria-hidden style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, flexShrink: 0 }}>
                    {p.icon}
                  </span>
                  <p style={{
                    fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-body-sm)', lineHeight: '18px',
                    color: 'var(--neutral-700)', margin: 0,
                  }}>
                    {p.text}
                  </p>
                </div>
              ))}
            </div>
            <p style={{
              fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-small)', lineHeight: 'var(--line-height-small)',
              color: 'var(--neutral-500)', margin: 0,
            }}>
              Slack will share your name, email, and workspace ID with Souvenir. By connecting, you agree to Souvenir's privacy policy and terms of service.
            </p>
          </div>

          <SectionDivider />

          {/* ── Footer ── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 'var(--space-2)', padding: 'var(--space-4) var(--space-6)' }}>
            <Button variant="cancel" size="sm" onClick={onClose} disabled={connecting}>
              Cancel
            </Button>
            <Button variant="default" size="sm" loading={connecting} onClick={handleConnect}>
              Accept and Connect
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
