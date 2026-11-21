'use client'

import React, { useState } from 'react'
import { CancelOneIcon, AlertCircleIcon } from '@strange-huge/icons'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button, IconButton } from '@/components/ui/button'
import { type Persona } from '@/lib/api/personas'

export function DeleteAgentDialog({
  target,
  onClose,
  onConfirm,
}: {
  /** The agent awaiting confirmation; null keeps the dialog closed. */
  target: Persona | null
  onClose: () => void
  /** Performs the delete; the dialog closes once it resolves. */
  onConfirm: (persona: Persona) => Promise<void>
}) {
  const [isDeleting, setIsDeleting] = useState(false)

  // Radix Dialog: focus trap, Escape / overlay click close (not while deleting), focus return.
  return (
    <Dialog open={!!target} onOpenChange={(next) => { if (!next && !isDeleting) onClose() }}>
      {target && (
        <DialogContent
          hideClose
          role="alertdialog"
          aria-describedby={undefined}
          style={{
            backgroundColor: 'var(--modal-bg)',
            borderRadius:    'var(--radius-2xl)',
            boxShadow:       'var(--shadow-4)',
            width:           480,
          }}
        >
          {/* Header */}
          <div
            style={{
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'space-between',
              padding:        'var(--space-5) var(--space-5) var(--space-4)',
              borderBottom:   '1px solid var(--neutral-100)',
              flexShrink:     0,
            }}
          >
            <DialogTitle
              style={{
                fontFamily: 'var(--font-title)',
                fontWeight: 'var(--font-weight-regular)',
                fontSize:   'var(--font-size-heading)',
                lineHeight: 'var(--line-height-heading)',
                color:      'var(--neutral-900)',
                margin:     0,
              }}
            >
              Delete agent?
            </DialogTitle>
            <IconButton variant="ghost" size="xs" icon={<CancelOneIcon />} aria-label="Close" onClick={() => onClose()} disabled={isDeleting} />
          </div>

          {/* Body */}
          <div
            style={{
              padding:       'var(--space-5)',
              display:       'flex',
              flexDirection: 'column',
              gap:           'var(--space-3)',
              flexShrink:    0,
            }}
          >
            {/* Warning tag */}
            <div
              style={{
                display:         'inline-flex',
                alignSelf:       'flex-start',
                alignItems:      'center',
                gap:             'var(--space-1)',
                padding:         'var(--space-0-5) var(--space-2) var(--space-0-5) var(--space-1-5)',
                borderRadius:    'var(--radius-sm)',
                backgroundColor: 'var(--red-400-10)',
                boxShadow:       '0px 0px 0px 1px rgba(238,48,48,0.22)',
              }}
            >
              <AlertCircleIcon size={13} color="var(--red-500)" />
              <span
                style={{
                  fontFamily:    'var(--font-body)',
                  fontWeight:    'var(--font-weight-semibold)',
                  fontSize:      'var(--font-size-caption)',
                  lineHeight:    'var(--line-height-small)',
                  color:         'var(--red-600)',
                  letterSpacing: '0.02em',
                  textTransform: 'uppercase',
                }}
              >
                Warning
              </span>
            </div>

            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontWeight: 'var(--font-weight-regular)',
                fontSize:   'var(--font-size-body)',
                lineHeight: 'var(--line-height-body)',
                color:      'var(--neutral-700)',
                margin:     0,
              }}
            >
              <><strong>&ldquo;{target.name}&rdquo;</strong> will be permanently deleted. This action cannot be undone.</>
            </p>
          </div>

          {/* Footer */}
          <div
            style={{
              display:        'flex',
              justifyContent: 'flex-end',
              alignItems:     'center',
              gap:            'var(--space-2)',
              padding:        'var(--space-3) var(--space-4) var(--space-4)',
              borderTop:      '1px solid var(--neutral-100)',
              flexShrink:     0,
            }}
          >
            <Button variant="ghost" onClick={() => onClose()} disabled={isDeleting}>Cancel</Button>
            <Button
              variant="danger"
              loading={isDeleting}
              onClick={async () => {
                setIsDeleting(true)
                try {
                  await onConfirm(target)
                  onClose()
                } finally {
                  setIsDeleting(false)
                }
              }}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  )
}
