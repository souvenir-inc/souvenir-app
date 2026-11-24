'use client'

import { TriangleAlert, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { appNames } from './sync-model'

// The sync toasts (Figma 287:60863, 195:61735; SY-29, SY-30). The error toast is white with a
// fine border, names the app, offers Reconnect (admins), and closes after 8 s, staying while
// hovered (Sonner pauses on hover), with × or on Reconnect.

const FOCUS = 'outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]'
const ERROR_MS = 8_000

export function showSyncErrorToast({ names, rest, onReconnect }: { names: string[]; rest: string; onReconnect: (() => void) | null }) {
  const { lead, more } = appNames(names)
  const verb = names.length === 1 ? 'sync failed' : 'failed to sync'
  toast.custom((id) => (
    <div
      role="alert"
      data-sync-toast="error"
      className="flex w-max max-w-[calc(100vw-32px)] items-center gap-2.5 rounded-[10px] border border-solid border-[var(--dashboard-toast-border)] bg-[var(--dashboard-card-bg)] py-2 pl-3.5 pr-1.5 shadow-[var(--dashboard-toast-shadow)]"
    >
      <TriangleAlert aria-hidden size={16} strokeWidth={1.5} absoluteStrokeWidth className="shrink-0 text-[var(--dashboard-sync-failed)]" />
      <p className="m-0 min-w-0 text-[13px] leading-5 text-[var(--dashboard-label)]">
        <span className="text-[var(--dashboard-figure)]"><span className="font-medium">{lead}{more ? ` & ${more}` : ''}</span> {verb}</span>
        {' '}• {rest}
      </p>
      {onReconnect && (
        // eslint-disable-next-line no-restricted-syntax -- ds-allow: the toast's dark Reconnect (Figma 287:60866)
        <button
          type="button"
          onClick={() => { toast.dismiss(id); onReconnect() }}
          className={cn('shrink-0 cursor-pointer rounded-md border-0 bg-[var(--dashboard-figure)] px-2.5 py-1 text-[13px] font-medium leading-5 text-[var(--dashboard-card-bg)] transition-opacity duration-fast hover:opacity-90', FOCUS)}
        >
          Reconnect
        </button>
      )}
      {/* eslint-disable-next-line no-restricted-syntax -- ds-allow: the toast's 28px round × (Figma 287:60868) */}
      <button
        type="button"
        aria-label="Close"
        onClick={() => toast.dismiss(id)}
        className={cn('flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 text-[var(--dashboard-muted)] hover:bg-[var(--dashboard-row-hover)] hover:text-[var(--dashboard-figure)]', FOCUS)}
      >
        <X aria-hidden size={14} strokeWidth={1.5} absoluteStrokeWidth />
      </button>
    </div>
  ), { duration: ERROR_MS })
}

/** A sync you started ended well while you were on a board that doesn't read the app (SY-30). */
export function showSyncedToast(names: string[]) {
  const { lead, more } = appNames(names)
  toast(`${lead}${more ? ` & ${more}` : ''} synced just now`)
}
