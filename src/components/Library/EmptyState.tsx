'use client'

import React from 'react'

export interface EmptyStateProps {
  icon: React.ReactNode
  title: string
  text?: string
  /** Actions under the text (at most one primary). */
  children?: React.ReactNode
}

/** Centred empty state: a small grey icon tile, one title line, one quiet line. Used for empty lists and search misses. */
export function EmptyState({ icon, title, text, children }: EmptyStateProps) {
  return (
    <div
      role="status"
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0,
        // More padding below than above: centred under the header, at the optical centre rather than low.
        padding: '24px 24px 10vh', textAlign: 'center', flex: '1 0 auto',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, borderRadius: 'var(--radius-xl)',
          background: 'var(--neutral-100)', color: 'var(--neutral-600)', marginBottom: 'var(--space-4)',
        }}
      >
        {icon}
      </span>
      <p style={{ margin: 0, fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-medium)', fontSize: 'var(--font-size-heading-sm)', lineHeight: 'var(--line-height-heading-md)', color: 'var(--neutral-900)' }}>{title}</p>
      {text && <p style={{ margin: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--font-size-body)', lineHeight: 'var(--line-height-body)', color: 'var(--neutral-600)', maxWidth: 380, marginTop: 'var(--space-1)' }}>{text}</p>}
      {children && <div style={{ marginTop: 'var(--space-5)', display: 'flex', gap: 'var(--space-2)' }}>{children}</div>}
    </div>
  )
}
