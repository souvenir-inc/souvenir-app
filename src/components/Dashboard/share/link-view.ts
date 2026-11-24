'use client'

import { useSyncExternalStore } from 'react'

// What a link opened (09 SH-23, SH-24): a board you can't see, or a board on the link's dates rather
// than its own. Also a viewer's own dates (SH-2: viewers pick other dates for themselves). A tiny
// external store, so the screen seeds it from the URL in an effect and reads it while rendering.

export interface LinkView {
  /** The link names a board the viewer can't see (or one that's gone). */
  noAccess: { id: string } | null
  /** Dates you're looking at that aren't the board's own: Reset / Save for board beside the period. */
  dates: { boardId: string; period: string; compare: string } | null
}

let snap: LinkView = { noAccess: null, dates: null }
const listeners = new Set<() => void>()
const set = (patch: Partial<LinkView>) => { snap = { ...snap, ...patch }; listeners.forEach((l) => l()) }

/** From `?board=&period=&compare=`. Returns the board to open, if it's one you can see. */
export function seedLinkFromQuery(q: { board: string | null; period: string | null; compare: string | null }, visible: (boardId: string) => boolean): string | null {
  if (!q.board) return null
  if (!visible(q.board)) { set({ noAccess: { id: q.board } }); return null }
  if (q.period) set({ dates: { boardId: q.board, period: q.period, compare: q.compare ?? 'previous' } })
  return q.board
}

export const setViewDates = (dates: LinkView['dates']) => set({ dates })
export const leaveNoAccess = () => set({ noAccess: null })

export function useLinkView(): LinkView {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l) } },
    () => snap,
    () => snap,
  )
}
