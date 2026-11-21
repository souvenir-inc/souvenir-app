'use client'

import React from 'react'

/** The yellow mark a cited passage, row or transcript line gets (kept apart from the playback highlight). */
export const CITED_MARK: React.CSSProperties = {
  background: 'var(--color-tag-Yellow-bg)',
  boxShadow: '0 0 0 2px var(--color-tag-Yellow-text)',
  borderRadius: 'var(--radius-xs)',
  color: 'inherit',
}

/** The small dark tag after a cited passage: "Cited passage", "Cited row", "Cited". */
export function CitedLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', marginLeft: 'var(--space-2)', padding: '0 var(--space-1-5)', height: 20, borderRadius: 'var(--radius-sm)',
        background: 'var(--neutral-900)', color: 'var(--card-bg)', fontFamily: 'var(--font-body)', fontSize: 'var(--font-size-caption)', fontWeight: 'var(--font-weight-semibold)',
        lineHeight: 'var(--line-height-body-sm)', verticalAlign: 2, whiteSpace: 'nowrap', flexShrink: 0,
      }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M9.6 6C6.5 7.3 4.5 10 4.5 13.4V18h6v-6H7.6c.2-2 1.4-3.6 3.1-4.4L9.6 6Zm9 0c-3.1 1.3-5.1 4-5.1 7.4V18h6v-6h-2.9c.2-2 1.4-3.6 3.1-4.4L18.6 6Z" />
      </svg>
      {children}
    </span>
  )
}
