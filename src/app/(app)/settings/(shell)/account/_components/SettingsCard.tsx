import React from 'react'

// ── Table-style settings row — Figma "table/base" rows (18:27521/18:27530) ───
export function SettingsRow({
  title,
  subtitle,
  divider,
  children,
}: {
  title: string
  subtitle: string
  divider?: boolean
  children: React.ReactNode
}) {
  return (
    <div style={{
      display:      'flex',
      alignItems:   'center',
      justifyContent: 'space-between',
      padding:      'var(--space-3) var(--space-6)',
      borderBottom: divider ? '1px solid var(--neutral-100)' : undefined,
    }}>
      <div>
        <p style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-medium)', fontSize: 'var(--font-size-body)', lineHeight: 'var(--line-height-body)', color: 'var(--neutral-900)', margin: 0 }}>
          {title}
        </p>
        <p style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-caption)', lineHeight: 'var(--line-height-small)', color: 'var(--neutral-500)', margin: 0 }}>
          {subtitle}
        </p>
      </div>
      {children}
    </div>
  )
}

// ── Section card wrapper ──────────────────────────────────────────────────────

export function SettingsCard({
  children,
  danger,
}: {
  children: React.ReactNode
  danger?: boolean
}) {
  return (
    <div
      style={{
        border:        `1px solid ${danger ? 'var(--red-400)' : 'var(--border-default)'}`,
        borderRadius:  'var(--radius-2xl)',
        boxShadow:     'var(--shadow-soft)',
        display:       'flex',
        flexDirection: 'column',
        overflow:      'hidden',
        paddingTop:    'var(--space-3)',
        paddingBottom: 'var(--space-3)',
      }}
    >
      {children}
    </div>
  )
}

// ── Divider inside a card ─────────────────────────────────────────────────────

export function CardSection({
  children,
  divider,
  padTop = 12,
  padBottom = 24,
}: {
  children: React.ReactNode
  divider?: boolean
  padTop?: number
  padBottom?: number
}) {
  return (
    <div
      style={{
        display:         'flex',
        flexDirection:   'column',
        padding:         `${padTop}px 24px ${padBottom}px`,
        borderBottom:    divider ? '1px solid var(--neutral-100)' : undefined,
      }}
    >
      {children}
    </div>
  )
}
