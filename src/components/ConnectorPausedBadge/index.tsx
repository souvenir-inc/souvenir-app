'use client'

import React from 'react'

export interface ConnectorPausedBadgeProps {
  /** Why the connector is paused — affects the label shown. */
  reason?: 'plan' | 'workspace_locked'
}

export function ConnectorPausedBadge({ reason = 'plan' }: ConnectorPausedBadgeProps) {
  const label = reason === 'workspace_locked' ? 'Workspace locked' : 'Upgrade to enable'

  return (
    <span
      style={{
        display:         'inline-flex',
        alignItems:      'center',
        padding:         'var(--space-0-5) var(--space-2)',
        borderRadius:    'var(--radius-full)',
        backgroundColor: 'var(--color-tag-Yellow-bg)',
        border:          '1px solid var(--color-tag-Yellow-ring)',
        fontFamily:      'var(--font-body)',
        fontWeight:      'var(--font-weight-medium)',
        fontSize:        'var(--font-size-caption)',
        lineHeight:      'var(--line-height-small)',
        color:           'var(--color-tag-Yellow-text)',
        whiteSpace:      'nowrap' as const,
        flexShrink:      0,
      }}
    >
      {label}
    </span>
  )
}

ConnectorPausedBadge.displayName = 'ConnectorPausedBadge'
export default ConnectorPausedBadge
