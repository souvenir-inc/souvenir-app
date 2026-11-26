'use client'

import React from 'react'
import { Button, type ButtonProps, IconButton } from '@/components/ui/button'
import { Tooltip } from '@/components/Tooltip'

// The button on every agent card: a white pill with dark text in both light and dark mode, like the
// reference card's "Add to Grok Bot". It is the secondary button with its colour tokens pinned to
// white (they would otherwise follow the theme and turn dark in dark mode), scoped to this button.

const WHITE_BUTTON: React.CSSProperties = {
  display: 'inline-flex',
  // CSS custom properties are not in React.CSSProperties; they are set for the Button inside only.
  ...({
    '--button-secondary-bg':            'var(--static-white)',
    '--button-secondary-bg-hover':      'var(--agent-card-button-secondary-bg-hover)',
    '--button-secondary-text':          'var(--agent-card-button-secondary-text)',
    '--button-secondary-text-disabled': 'var(--agent-card-button-secondary-text-disabled)',
  } as React.CSSProperties),
}

export function AgentCardButton(props: Omit<ButtonProps, 'variant'>) {
  return (
    <span style={WHITE_BUTTON}>
      <Button {...props} variant="secondary" />
    </span>
  )
}

const WHITE_ICON_BUTTON: React.CSSProperties = {
  display: 'inline-flex',
  ...({
    '--icon-button-secondary-bg':            'var(--static-white)',
    '--icon-button-secondary-bg-hover':      'var(--agent-card-button-secondary-bg-hover)',
    '--icon-button-secondary-icon':          'var(--agent-card-button-secondary-text)',
    '--icon-button-secondary-icon-disabled': 'var(--agent-card-button-secondary-text-disabled)',
  } as React.CSSProperties),
}

/** The icon-only version of the agent card's white button (Use agent / Replace agent), with a tooltip. */
export function AgentCardIconButton({ label, icon, disabled, onClick }: { label: string; icon: React.ReactNode; disabled?: boolean; onClick?: () => void }) {
  return (
    <Tooltip content={label}>
      <span style={WHITE_ICON_BUTTON}>
        <IconButton variant="secondary" size="sm" icon={icon} aria-label={label} disabled={disabled} onClick={onClick} />
      </span>
    </Tooltip>
  )
}
