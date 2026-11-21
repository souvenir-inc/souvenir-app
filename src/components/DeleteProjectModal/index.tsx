'use client'

import React from 'react'
import { AlertCircleIcon, CancelOneIcon } from '@strange-huge/icons'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button, IconButton } from '@/components/ui/button'

// Shared by every project-delete entry point (the All Projects grid/list and
// the single project page's own "Delete" menu item) so a destructive action
// always shows the same confirmation first, never fires straight from a
// single click anywhere in the app. What the delete does depends on the type
// (back-end project.py delete/restore): a Personal project and its chats are
// hard-deleted; a Workspace/Shared project and its chats go to Recently
// Deleted for 30 days and can be restored. Files are removed either way.

export interface DeleteProjectModalProps {
  open:        boolean
  projectName: string
  chatCount:   number
  /** Workspace/Shared projects are soft-deleted and restorable for 30 days. */
  restorable?: boolean
  loading?:    boolean
  onConfirm:   () => void
  onClose:     () => void
}

function deleteMessage(projectName: string, chatCount: number, restorable: boolean): string {
  const chats = chatCount > 0 ? ` and its ${chatCount} ${chatCount === 1 ? 'chat' : 'chats'}` : ''
  return restorable
    ? `"${projectName}"${chats} will move to Recently Deleted, where the owner can restore ${chatCount > 0 ? 'them' : 'it'} for 30 days. Its files are removed now.`
    : `"${projectName}"${chats} will be permanently deleted. This action cannot be undone.`
}

export function DeleteProjectModal({ open, projectName, chatCount, restorable = false, loading = false, onConfirm, onClose }: DeleteProjectModalProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !loading) onClose() }}>
      <DialogContent
        hideClose
        role="alertdialog"
        aria-modal="true"
        onEscapeKeyDown={(e) => { if (loading) e.preventDefault() }}
        onInteractOutside={(e) => { if (loading) e.preventDefault() }}
        style={{
          background:      'var(--modal-bg)',
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
          <DialogTitle asChild>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontWeight: 'var(--font-weight-semibold)',
              fontSize:   'var(--font-size-body-lg)',
              lineHeight: 'var(--line-height-body-lg)',
              color:      'var(--neutral-900)',
              margin:     0,
            }}
          >
            Delete project?
          </p>
          </DialogTitle>
          <IconButton variant="ghost" size="xs" icon={<CancelOneIcon />} aria-label="Close" onClick={onClose} disabled={loading} />
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
                fontFamily: 'var(--font-body)',
                fontWeight: 'var(--font-weight-semibold)',
                fontSize:   'var(--font-size-caption)',
                lineHeight: 'var(--line-height-small)',
                color:      'var(--red-600)',
                letterSpacing: '0.02em',
                textTransform: 'uppercase',
              }}
            >
              Warning
            </span>
          </div>

          <DialogDescription asChild>
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
            {deleteMessage(projectName, chatCount, restorable)}
          </p>
          </DialogDescription>
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
          <Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm} loading={loading}>Delete</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default DeleteProjectModal
