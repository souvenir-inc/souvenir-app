'use client'

import React from 'react'

/**
 * The rounded, scrolling card every agent create/edit screen sits in — same
 * frame the old wizard used, minus the step tracker (there are no steps now).
 */
export function AgentPageShell({
  children,
  maxWidth = 1040,
}: {
  children: React.ReactNode
  /** Width cap of the content column. */
  maxWidth?: number
}) {
  return (
    <div
      className="kaya-scrollbar"
      style={{
        background:     'var(--color-surface-container)',
        border:         '1px solid var(--border-default)',
        borderRadius:   'var(--layout-radius)',
        flex:           '1 0 0',
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        paddingTop:     'var(--space-7)',
        paddingBottom:  'var(--space-7)',
        minHeight:      0,
        overflowY:      'auto',
      }}
    >
      {/* Horizontal padding lives on this inner wrapper, not the scrolling
          element above — keeps the scrollbar flush with the card's border. */}
      <div
        style={{
          width: '100%', maxWidth: maxWidth + 96, boxSizing: 'border-box',
          paddingLeft: 'var(--space-9)', paddingRight: 'var(--space-9)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '1 0 auto',
        }}
      >
        {children}
      </div>
    </div>
  )
}

/**
 * Title row, with the page's primary actions (Back / Save …) pinned to the top right.
 * Only the buttons are sticky: they ride along as the card scrolls while the title scrolls
 * away normally. A sticky element can only stick inside a tall parent, so they live in a
 * zero-height bar placed first in the page column (the full-height parent) rather than in
 * the short title row.
 */
export function AgentPageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: React.ReactNode
}) {
  return (
    <>
      {actions && (
        <div
          style={{
            position: 'sticky', top: 16, zIndex: 'var(--z-sticky)', height: 0, width: '100%',
            display: 'flex', justifyContent: 'flex-end', pointerEvents: 'none',
          }}
        >
          <div
            style={{
              pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-1)', borderRadius: 'var(--radius-xl)',
              backgroundColor: 'color-mix(in srgb, var(--neutral-50) 88%, transparent)',
              backdropFilter: 'blur(var(--agent-page-shell-blur))', WebkitBackdropFilter: 'blur(var(--agent-page-shell-blur))',
            }}
          >
            {actions}
          </div>
        </div>
      )}
      <div
        style={{
          display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', minWidth: 0,
          width: '100%', marginBottom: 'var(--space-6)', flexShrink: 0,
          // Leave the top-right corner free for the sticky buttons.
          paddingRight: actions ? 'var(--agent-page-shell-padding-right)' : 0, boxSizing: 'border-box',
        }}
      >
        <h1
          style={{
            margin: 0, fontFamily: 'var(--font-title)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-heading)', lineHeight: 'var(--line-height-heading)', color: 'var(--neutral-900)',
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p style={{ margin: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--font-size-body)', lineHeight: 'var(--line-height-body)', color: 'var(--neutral-600)' }}>
            {subtitle}
          </p>
        )}
      </div>
    </>
  )
}
