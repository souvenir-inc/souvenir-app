'use client'

import React, { useState } from 'react'
import { SearchOneIcon } from '@strange-huge/icons'
import { MemorySection } from '@/components/MemorySection'
import { useOrg } from '@/context/org-context'

// Settings → PERSONAL → Memory. Everyone reviews and edits their own memory; org admins also get the organization's shared memory.

export default function MemoryPage() {
  const { orgId, caps } = useOrg()
  const [query, setQuery] = useState('')
  return (
    <div className="kaya-scrollbar" style={{ flex: '1 0 0', minHeight: 0, overflowY: 'auto', display: 'flex', justifyContent: 'center', paddingTop: 'var(--space-10)', paddingBottom: 'var(--space-9)' }}>
      <div style={{ width: '100%', maxWidth: 908, padding: '0 var(--space-6)', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 'var(--space-2-5)' }}>
        <div style={{ paddingLeft: 'var(--space-1)', marginBottom: 'var(--space-1)' }}>
          <h1 style={{ fontFamily: 'var(--font-title)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-heading)', lineHeight: 'var(--line-height-heading)', color: 'var(--neutral-900)', margin: 0 }}>Memory</h1>
          <p style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-body)', lineHeight: 'var(--line-height-body)', color: 'var(--neutral-500)', margin: 0 }}>
            What Souvenir remembers across your chats. Open any note to read it, and ask Souvenir to change or forget anything.
          </p>
        </div>
        <label style={{
          display:         'flex',
          alignItems:      'center',
          gap:             'var(--space-2)',
          padding:         'var(--space-1-5) var(--space-3)',
          borderRadius:    'var(--radius-lg)',
          backgroundColor: 'var(--field-surface)',
          boxShadow:       '0px 1px 1.5px 0px rgba(82,75,71,0.12), 0px 0px 0px 1px var(--neutral-100)',
          color:           'var(--neutral-400)',
        }}>
          <SearchOneIcon size={16} />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search memory"
            aria-label="Search memory"
            style={{ flex: '1 0 0', minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'var(--font-body)', fontSize: 'var(--font-size-body)', lineHeight: 'var(--line-height-body)', color: 'var(--neutral-900)' }}
          />
        </label>
        <MemorySection
          title="Your memory"
          hint="Your work, your preferences and what you're focused on. Only you see this."
          orgId={null}
          query={query}
        />
        {caps.canManageOrg && orgId && (
          <MemorySection
            title="Organization memory"
            hint="What Souvenir remembers about your company for everyone in this workspace. Admins only."
            orgId={orgId}
            query={query}
          />
        )}
      </div>
    </div>
  )
}
