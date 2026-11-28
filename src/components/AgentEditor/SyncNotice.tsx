'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import type { SyncNotice as SyncNoticeKind } from '@/lib/agent-sync'

export interface SyncNoticeProps {
  notice:    SyncNoticeKind
  onLoadLatest: () => void
  onDismiss:    () => void
}

/**
 * Shown when the agent was saved from another view or tab: a quiet "Updated" note
 * when this view was clean, or a choice when the user has unsaved edits.
 */
export function SyncNotice({ notice, onLoadLatest, onDismiss }: SyncNoticeProps) {
  if (!notice) return null
  const conflict = notice === 'conflict'
  return (
    <div
      role="status"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', flexWrap: 'wrap',
        padding: 'var(--space-2-5) var(--space-3)', borderRadius: 'var(--radius-lg)',
        backgroundColor: conflict ? 'var(--color-tag-Yellow-bg, var(--green-50))' : 'var(--blue-50)',
        boxShadow: '0px 0px 0px 1px var(--neutral-100)',
        fontFamily: 'var(--font-body)', fontSize: 'var(--font-size-body)', lineHeight: 'var(--line-height-body)', color: 'var(--neutral-800)',
      }}
    >
      <span>
        {conflict
          ? 'This agent was updated elsewhere. Your unsaved edits are still here.'
          : 'Updated — this agent was changed elsewhere and is now up to date.'}
      </span>
      <span style={{ display: 'flex', gap: 'var(--space-2)' }}>
        {conflict && <Button type="button" variant="outline" size="sm" onClick={onLoadLatest}>Load latest</Button>}
        <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>{conflict ? 'Keep mine' : 'Dismiss'}</Button>
      </span>
    </div>
  )
}
