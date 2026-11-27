'use client'

import { useEffect, useEffectEvent } from 'react'
import { seedLinkFromQuery } from '../share/link-view'
import type { DashboardState } from '../tabs/board-state'
import type { DashboardApi } from '../tabs/use-dashboard'

// /dashboard?board=<id>&period=&compare= (TAB-61, SH-23, DASH-TR-23): read once on arrival; the URL
// then follows the open board.

/** Board ids are UUIDs (DASH-TR-01). Fixed length, so the check is linear on capped input (RG-1). */
const BOARD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The `board` param when it's a board id; anything else is ignored (SD-NV-04, XS-10). */
export function boardIdParam(raw: string | null): string | null {
  return raw !== null && raw.length === 36 && BOARD_ID.test(raw) ? raw : null
}

/** Whether the viewer has this board. An outside key, so only the boards' own keys count (JS-1). */
export function hasBoard(state: DashboardState, id: string): boolean {
  return Object.hasOwn(state.boards, id)
}

/**
 * Opens the board a link names, on the link's dates; a board the viewer can't see shows the
 * no-access page, and one they can that isn't in their tabs is added as the last tab (SH-23, SH-24).
 */
export function useBoardUrl(state: DashboardState, api: Pick<DashboardApi, 'apply' | 'open'>) {
  const arrive = useEffectEvent(() => {
    const q = new URLSearchParams(window.location.search)
    const board = boardIdParam(q.get('board'))
    const id = seedLinkFromQuery({ board, period: q.get('period'), compare: q.get('compare') }, (boardId) => hasBoard(state, boardId))
    if (id && state.hidden.includes(id)) api.apply([{ type: 'show', id, index: state.tabs.length, open: true }])
    else if (id) api.open(id)
  })
  useEffect(() => arrive(), [])

  // Only `board` is written back, and not for the home tab.
  const home = state.tabs[0]
  useEffect(() => {
    const url = new URL(window.location.href)
    if (state.openId === home) url.searchParams.delete('board')
    else url.searchParams.set('board', state.openId)
    window.history.replaceState(window.history.state, '', url)
  }, [state.openId, home])
}
