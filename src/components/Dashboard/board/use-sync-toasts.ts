'use client'

import { useEffect, useRef } from 'react'
import { clock } from '../sync/sync-model'
import { getSyncSnapshot, onSyncEnd, reconnect } from '../sync/sync-store'
import { showSyncErrorToast, showSyncedToast } from '../sync/sync-toasts'
import type { AppId } from '../types'

/**
 * How a sync ended, as a toast when the board on screen doesn't already say so (SY-29, SY-30).
 * `apps`: the apps the open board reads (they show a banner instead); `sourcesOpen`: Data sources
 * is open and lists it (SY-28). The listener lives as long as the screen and reads these through a
 * ref set after each render.
 */
export function useSyncToasts(apps: AppId[], sourcesOpen: boolean) {
  const ctx = useRef({ apps, sourcesOpen })
  useEffect(() => { ctx.current = { apps, sourcesOpen } })
  useEffect(() => onSyncEnd((e) => {
    const { apps: onBoard, sourcesOpen: listed } = ctx.current
    const known = getSyncSnapshot().apps
    const names = (ids: AppId[]) => ids.map((id) => known[id]?.name ?? 'An app')
    // Reconnect only for a refused sign-in on the viewer's own account; it opens that account.
    const fix = (ids: AppId[]) => (ids.some((id) => known[id]?.needsReconnect && known[id]?.yours) ? () => reconnect(ids) : null)
    if (e.kind === 'refresh') {
      if (e.failed.length && !listed) showSyncErrorToast({ names: names(e.failed), rest: 'Other apps synced', onReconnect: fix(e.failed) })
      return
    }
    // Boards that read the app show its banner instead (SY-30).
    if ([...e.ok, ...e.failed].some((id) => onBoard.includes(id))) return
    if (e.failed.length) {
      const at = e.failed.map((id) => known[id]?.syncedAt).find((t) => t != null)
      showSyncErrorToast({ names: names(e.failed), rest: at ? `Data from ${clock(at)}` : 'No data yet', onReconnect: fix(e.failed) })
    }
    if (e.ok.length) showSyncedToast(names(e.ok))
  }), [])
}
