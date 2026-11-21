'use client'

import React from 'react'
import { PINS_ENABLED } from '@/lib/feature-flags'
import { X } from 'lucide-react'

// ── Mention chip ──────────────────────────────────────────────────────────────
// Shared by chat/page.tsx, project/[id]/chat/[chatId]/page.tsx, and
// ChatInterface.tsx — all three had an identical copy (down to the exact
// style values), one per composer's @-mention pill.

export interface MentionChipProps {
  label:    string
  onRemove: () => void
}

export function MentionChip({ label, onRemove }: MentionChipProps) {
  if (!PINS_ENABLED) return null
  return (
    <span
      style={{
        display:         'inline-flex',
        alignItems:      'center',
        gap:             'var(--space-1)',
        borderRadius:    'var(--radius-full)',
        backgroundColor: 'var(--neutral-100)',
        border:          '1px solid var(--border-default)',
        padding:         'var(--space-0-5) var(--space-2) var(--space-0-5) var(--space-2-5)',
        fontSize:        'var(--font-size-small)',
        fontWeight:      'var(--font-weight-medium)',
        color:           'var(--neutral-700)',
        fontFamily:      'var(--font-body)',
        maxWidth:        '200px',
        whiteSpace:      'nowrap',
      }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>@{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove mention @${label}`}
        style={{
          display:        'inline-flex',
          alignItems:     'center',
          justifyContent: 'center',
          border:         'none',
          background:     'none',
          padding:        'var(--space-0-5)',
          cursor:         'pointer',
          color:          'var(--neutral-600)',
          borderRadius:   '50%',
          flexShrink:     0,
        }}
      >
        <X size={11} strokeWidth={2.5} />
      </button>
    </span>
  )
}

export default MentionChip
