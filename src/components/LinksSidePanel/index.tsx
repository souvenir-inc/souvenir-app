'use client'

import React from 'react'
import { PlusSignIcon } from '@strange-huge/icons'
import { Button } from '@/components/ui/button'
import { Eyebrow } from '@/components/Eyebrow'
import { SuperLinkRow, type SuperLinkStatus } from '@/components/SuperLinkRow'
import { SuperLinksEmpty } from '@/components/SuperLinksEmpty'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LinksSidePanelItem {
  id:           string
  personaName:  string
  avatarColor:  string
  url:          string
  tokenUsed:    number
  tokenLimit:   number
  status:       SuperLinkStatus
}

export interface LinksSidePanelProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onSelect'> {
  links:        LinksSidePanelItem[]
  selectedId?:  string | null
  onSelect?:    (id: string) => void
  onGenerate?:  () => void
  /** True while `onGenerate`'s request is in flight — shows a spinner on the button. */
  generating?:  boolean
  onCopyUrl?:   (id: string) => void
  /** Eyebrow at the top of the panel. */
  label?:       string
}

// ── Component ─────────────────────────────────────────────────────────────────

export function LinksSidePanel({
    ref,
    links, selectedId, onSelect, onGenerate, generating = false, onCopyUrl, label = 'Active links', className, style, ...props
  }: LinksSidePanelProps & { ref?: React.Ref<HTMLDivElement> }) {
    const empty = links.length === 0
    return (
      <div
        ref={ref}
        className={cn(className)}
        style={{
          isolation:       'isolate',
          display:         'flex',
          flexDirection:   'column',
          padding:         'var(--space-5) var(--space-5)',
          borderRadius:    'var(--radius-2xl)',
          backgroundColor: 'var(--neutral-white)',
          boxShadow:       'var(--shadow-surface-card)',
          minWidth:        0,
          minHeight:       0,
          ...style,
        }}
        {...props}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Eyebrow>{label}</Eyebrow>
            <span
              style={{
                display:         'inline-flex',
                alignItems:      'center',
                justifyContent:  'center',
                minWidth:        18,
                height:          18,
                padding:         '0 var(--space-1-5)',
                borderRadius:    99,
                backgroundColor: 'var(--neutral-100)',
                color:           'var(--neutral-700)',
                fontFamily:      'var(--font-body)',
                fontSize:        'var(--font-size-caption)',
                lineHeight:      'var(--line-height-caption)',
                fontWeight:      'var(--font-weight-medium)',
              }}
            >
              {links.length}
            </span>
          </div>
          <Button size="sm" variant="secondary" onClick={onGenerate} loading={generating} disabled={generating} leftIcon={<PlusSignIcon />}>
            Generate link
          </Button>
        </div>

        {empty ? (
          <SuperLinksEmpty />
        ) : (
          <div
            className="kaya-scrollbar"
            style={{
              display:             'flex',
              flexDirection:       'column',
              gap:                 'var(--space-2)',
              overflowY:           'auto',
              overscrollBehaviorY: 'contain',
              minHeight:           0,
              padding:             'var(--space-1) var(--space-1)',
              margin:              '-4px -4px',
            }}
          >
            {links.map(link => (
              <SuperLinkRow
                key={link.id}
                personaName={link.personaName}
                avatarColor={link.avatarColor}
                url={link.url}
                tokenUsed={link.tokenUsed}
                tokenLimit={link.tokenLimit}
                status={link.status}
                selected={selectedId === link.id}
                onClick={() => onSelect?.(link.id)}
                onCopyUrl={() => onCopyUrl?.(link.id)}
              />
            ))}
          </div>
        )}
      </div>
    )
}

LinksSidePanel.displayName = 'LinksSidePanel'
export default LinksSidePanel
