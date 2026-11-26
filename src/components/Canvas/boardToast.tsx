'use client'

import { X, type LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import styles from './Canvas.module.css'

export interface BoardToastOptions {
  icon: LucideIcon
  /** The message. Where it says `{name}`, `name` (a board's or a metric's) is set in Medium. */
  message: string
  name?: string
  action?: { label: string; onClick: () => void }
  tone?: 'error'
  /** The icon's line, lucide's units: 1.75 (1.17 px at 16), or 2 where the frame draws it heavier (restore). */
  iconStroke?: number
  /** Replaces the toast already showing under this id (a failed save, then its retry). */
  id?: string
  /** Stays until it's dismissed in code, with no × (a failed save stays until a save works: Dev, 19 Nov). */
  persistent?: boolean
}

/** How long a board toast stays: 5 seconds, or 8 for an error (design rule 14), paused while hovered. */
const TOAST_MS = 5_000
const ERROR_TOAST_MS = 8_000

function words(message: string, name: string | undefined) {
  if (!name || !message.includes('{name}')) return message
  const [before, after] = message.split('{name}')
  return <>{before}<strong>{name}</strong>{after}</>
}

/**
 * A board toast (the Tabs row, after the Sync toast design A): one line, white, a hairline, an icon, the message with
 * the board's name in Medium, one dark action and ×. "Growth hidden from your tabs" · Undo.
 */
export function boardToast({
  icon: Icon, message, name, action, tone, iconStroke = 1.75, id: given, persistent = false,
}: BoardToastOptions): string | number {
  return toast.custom(id => (
    <div className={styles.boardToast} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon size={16} strokeWidth={iconStroke} className={styles.boardToastIcon} data-tone={tone} aria-hidden />
      <p className={styles.boardToastText}>{words(message, name)}</p>
      {action && (
        <button type="button" className={styles.boardToastAction} onClick={() => { toast.dismiss(id); action.onClick() }}>
          {action.label}
        </button>
      )}
      {!persistent && (
        <button type="button" className={styles.boardToastClose} aria-label="Close" onClick={() => toast.dismiss(id)}>
          <X size={14} strokeWidth={1.5} absoluteStrokeWidth aria-hidden />
        </button>
      )}
    </div>
  ), {
    duration: persistent ? Infinity : tone === 'error' ? ERROR_TOAST_MS : TOAST_MS,
    dismissible: !persistent,
    ...(given === undefined ? {} : { id: given }),
  })
}
