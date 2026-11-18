'use client'

import React from 'react'

export interface WorkspaceLockedOverlayProps {
  isAdmin?: boolean
  onAdminAction?: () => void
}

export function WorkspaceLockedOverlay({ isAdmin, onAdminAction }: WorkspaceLockedOverlayProps) {
  return (
    <div
      // eslint-disable-next-line no-restricted-syntax -- ds-allow: covers one panel (position: absolute), not the page, so it can't be a portalled modal Dialog
      role="dialog"
      aria-modal="true"
      aria-label="Workspace locked"
      style={{
        position:             'absolute',
        inset:                0,
        zIndex:               'var(--z-overlay)',
        display:              'flex',
        alignItems:           'center',
        justifyContent:       'center',
        backgroundColor:      'color-mix(in srgb, var(--neutral-100) 88%, transparent)',
        backdropFilter:       'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        borderRadius:         'inherit',
      }}
    >
      <div
        style={{
          display:         'flex',
          flexDirection:   'column',
          alignItems:      'center',
          gap:             'var(--space-3)',
          padding:         'var(--space-7) var(--space-8)',
          borderRadius:    'var(--radius-2xl)',
          backgroundColor: 'var(--modal-bg)',
          border:          '1px solid var(--border-default)',
          boxShadow:       '0px 4px 20px color-mix(in srgb, var(--static-black) 8%, transparent)',
          maxWidth:        360,
          textAlign:       'center' as const,
        }}
      >
        <span
          style={{
            width:           40,
            height:          40,
            borderRadius:    '50%',
            backgroundColor: 'var(--color-tag-Red-bg)',
            border:          '1px solid var(--color-tag-Red-ring)',
            display:         'flex',
            alignItems:      'center',
            justifyContent:  'center',
          }}
          aria-hidden
        >
          <span style={{
            width:           14,
            height:          14,
            borderRadius:    '50%',
            backgroundColor: 'var(--color-tag-Red-text)',
          }} />
        </span>

        <div>
          <p style={{
            fontFamily: 'var(--font-title)',
            fontWeight: 'var(--font-weight-medium)',
            fontSize:   'var(--font-size-heading-sm)',
            lineHeight: '26px',
            color:      'var(--neutral-900)',
            margin:     0,
          }}>
            Workspace locked
          </p>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 'var(--font-weight-regular)',
            fontSize:   'var(--font-size-body)',
            lineHeight: 'var(--line-height-body)',
            color:      'var(--neutral-500)',
            margin:     'var(--space-1) 0 0',
          }}>
            {isAdmin
              ? 'Credits are exhausted. Add credits to restore access for your team.'
              : 'Your workspace has run out of credits. Contact your admin to restore access.'}
          </p>
        </div>

        {isAdmin && onAdminAction && (
          <button
            type="button"
            onClick={onAdminAction}
            style={{
              height:          36,
              padding:         '0 var(--space-5)',
              borderRadius:    'var(--radius-md)',
              border:          'none',
              backgroundColor: 'var(--neutral-900)',
              color:           'var(--neutral-white)',
              fontFamily:      'var(--font-body)',
              fontWeight:      'var(--font-weight-medium)',
              fontSize:        'var(--font-size-body)',
              cursor:          'pointer',
            }}
          >
            Add credits
          </button>
        )}
      </div>
    </div>
  )
}

WorkspaceLockedOverlay.displayName = 'WorkspaceLockedOverlay'
export default WorkspaceLockedOverlay
