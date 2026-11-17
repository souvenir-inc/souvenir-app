import React from 'react'
import { Button } from '@/components/ui/button'
import { ArrowLeftOneIcon } from '@strange-huge/icons'

interface SettingsPageShellProps {
  title: React.ReactNode
  description: string
  children: React.ReactNode
  backLabel?: string
  onBack?: () => void
  maxWidth?: number
  fluid?: boolean
}

export function SettingsPageShell({
  title,
  description,
  children,
  backLabel,
  onBack,
  maxWidth = 860,
  fluid = false,
}: SettingsPageShellProps) {
  return (
    <div
      className="kaya-scrollbar"
      style={{
        flex: '1 0 0',
        minHeight: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        scrollbarGutter: fluid ? 'auto' : undefined,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: 'var(--space-10)',
        paddingBottom: 'var(--space-9)',
      }}
    >
      {/* Horizontal padding lives here, not on the scrolling element above —
          keeps the scrollbar flush with the container's edge. */}
      <div
        style={{
          flex: '1 0 0',
          minWidth: 0,
          maxWidth: fluid ? undefined : maxWidth + 48,
          padding: '0 var(--space-6)',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2-5)',
        }}
      >
        <header style={{ paddingLeft: 'var(--space-1)', marginBottom: 'var(--space-1)' }}>
          {backLabel && onBack && (
            <div style={{ marginBottom: 'var(--space-2)' }}>
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<ArrowLeftOneIcon size={16} animated />}
                onClick={onBack}
              >
                {backLabel}
              </Button>
            </div>
          )}
          <h1
            style={{
              fontFamily: 'var(--font-title)',
              fontWeight: 'var(--font-weight-regular)',
              fontSize: 'var(--font-size-heading)',
              lineHeight: 'var(--line-height-heading)',
              color: 'var(--neutral-900)',
              margin: 0,
            }}
          >
            {title}
          </h1>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontWeight: 'var(--font-weight-regular)',
              fontSize: 'var(--font-size-body)',
              lineHeight: 'var(--line-height-body)',
              color: 'var(--neutral-500)',
              margin: 0,
            }}
          >
            {description}
          </p>
        </header>

        {children}
      </div>
    </div>
  )
}
