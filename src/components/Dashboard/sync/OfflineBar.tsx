'use client'

import { Check, WifiOff } from 'lucide-react'
import { clock } from './sync-model'
import { useSyncSnapshot } from './sync-store'
import { Spinner } from './Spinner'

/**
 * The bar across the top of the window, above the whole app (Figma 204:59895, 204:60082; SY-33,
 * SY-34). Offline: dark, can't be closed, says how old the numbers are and that it's reconnecting.
 * Back online: green for 3 s, then gone.
 */
export function OfflineBar() {
  const s = useSyncSnapshot()
  if (s.online && s.backOnlineAt == null) return null
  if (!s.online) {
    return (
      <div role="status" data-offline-bar="offline" className="flex h-9 shrink-0 items-center justify-center gap-2 bg-[var(--dashboard-window-bar-bg)] px-4 text-[13px] text-[var(--dashboard-window-bar-text)]">
        <WifiOff aria-hidden size={14} strokeWidth={1.5} absoluteStrokeWidth className="shrink-0" />
        <span className="truncate">You’re offline. Showing data from {clock(s.offlineSince ?? s.now)}.</span>
        <span aria-hidden className="w-2 shrink-0" />
        <Spinner className="border-white/25 border-t-[var(--dashboard-window-bar-muted)]" />
        <span className="shrink-0 text-[var(--dashboard-window-bar-muted)]">Reconnecting…</span>
      </div>
    )
  }
  return (
    <div role="status" data-offline-bar="online" className="flex h-9 shrink-0 items-center justify-center gap-2 bg-[var(--dashboard-window-bar-online)] px-4 text-[13px] text-[var(--neutral-white)]">
      <Check aria-hidden size={14} strokeWidth={1.5} absoluteStrokeWidth className="shrink-0" />
      <span>You’re back online.</span>
    </div>
  )
}
