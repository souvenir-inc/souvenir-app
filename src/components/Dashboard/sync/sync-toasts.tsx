'use client'

import { TriangleAlert, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button, IconButton } from '@/components/ui'
import { cn } from '@/lib/utils'
import { appNames } from './sync-model'

// The sync toasts (Figma 287:60863, 195:61735; SY-29, SY-30). The error toast is white with a
// fine border, names the app, offers Reconnect (admins), and closes after 8 s, staying while
// hovered (Sonner pauses on hover), with × or on Reconnect. Sonner's own polite live region reads it
// once; the toast doesn't add an alert role of its own (A11Y-AN-03, AN-06): the failure doesn't block
// anything, and Reconnect is also on the board's banner and in Data sources (AN-04).

const FOCUS = 'outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]'
const ERROR_MS = 8_000

export function showSyncErrorToast({ names, rest, onReconnect }: { names: string[]; rest: string; onReconnect: (() => void) | null }) {
  const { lead, more } = appNames(names)
  const verb = names.length === 1 ? 'sync failed' : 'failed to sync'
  toast.custom((id) => (
    <div
      data-sync-toast="error"
      className="flex w-max max-w-[calc(100vw-32px)] items-center gap-2.5 rounded-lg border border-solid border-[var(--dashboard-toast-border)] bg-[var(--dashboard-card-bg)] py-2 pl-3.5 pr-1.5 shadow-[var(--dashboard-toast-shadow)]"
    >
      <TriangleAlert aria-hidden size={16} strokeWidth={1.5} absoluteStrokeWidth className="shrink-0 text-[var(--dashboard-sync-failed)]" />
      <p className="m-0 min-w-0 text-[length:var(--font-size-body-sm)] leading-5 text-[var(--dashboard-label)]">
        <span className="text-[var(--dashboard-figure)]"><span className="font-medium">{lead}{more ? ` & ${more}` : ''}</span> {verb}</span>
        {' '}• {rest}
      </p>
      {onReconnect && (
        // The toast's dark Reconnect (Figma 287:60866).
        <Button
          size="xs"
          onClick={() => { toast.dismiss(id); onReconnect() }}
          className={cn('min-h-7 rounded-md border-0 bg-[var(--dashboard-figure)] px-2.5 py-1 [font-family:inherit] text-[length:var(--font-size-body-sm)] font-medium leading-5 text-[var(--dashboard-card-bg)] shadow-none hover:opacity-90 active:scale-100', FOCUS)}
        >
          Reconnect
        </Button>
      )}
      {/* The toast's 28px round × (Figma 287:60868). */}
      <IconButton
        variant="ghost"
        size="xs"
        iconSize={14}
        aria-label="Close"
        onClick={() => toast.dismiss(id)}
        icon={<X aria-hidden size={14} strokeWidth={1.5} absoluteStrokeWidth />}
        className={cn('size-7 rounded-full text-[var(--dashboard-muted)] [--hv:var(--dashboard-row-hover)] hover:text-[var(--dashboard-figure)] active:scale-100', FOCUS)}
      />
    </div>
  ), { duration: ERROR_MS })
}

/** A sync you started ended well while you were on a board that doesn't read the app (SY-30). */
export function showSyncedToast(names: string[]) {
  const { lead, more } = appNames(names)
  toast(`${lead}${more ? ` & ${more}` : ''} synced just now`)
}
