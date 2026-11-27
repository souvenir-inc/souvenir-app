'use client'

import { useEffect } from 'react'
import type { Warehouse } from '@/lib/api/warehouse'
import { EmptyBoardList, Frame, Problem, Skeleton } from '../DashboardStates'
import { preloadDashboardDialogs } from '../lazy-dialogs'
import { useBoardStatus, useLiveDashboard } from '../live/dashboard-data'
import { useLinkView } from '../share/link-view'
import { useDashboard, type DashboardOptions } from '../tabs/use-dashboard'
import { BoardView } from './BoardView'
import { LOAD_COPY } from './copy'
import { useBoardUrl } from './use-board-url'

// The board screen once the boards are in: the boards (server + the viewer's unsaved changes), the
// open board's numbers and sync status, the URL; then the open board (BoardView).

export function BoardScreen({ warehouse, ...options }: Omit<DashboardOptions, 'defaultBoard'> & { warehouse: Warehouse }) {
  const api = useDashboard({ ...options, defaultBoard: warehouse.defaultBoard })
  const { state, openBoard } = api
  const linkView = useLinkView()
  // Measure the dates on screen: the viewer's own pick (or a link's) wins over the board's saved ones (SH-23).
  const viewing = openBoard && linkView.dates?.boardId === openBoard.id ? linkView.dates : openBoard
  const live = useLiveDashboard(warehouse, {
    id: openBoard?.id ?? '',
    period: viewing?.period ?? '7d',
    compare: viewing?.compare ?? 'previous',
    metricIds: (openBoard?.cards ?? []).map((c) => c.metricId),
  })
  // Only a board the server has: a new board's status is a 404 until its first save lands.
  useBoardStatus(warehouse, openBoard?.id ?? '', !!openBoard && !openBoard.draft && api.onServer(openBoard.id))
  useBoardUrl(state, api)
  useEffect(() => preloadDashboardDialogs(), [])

  if (!openBoard) return <Frame><EmptyBoardList onNewBoard={() => { api.createBoard() }} /></Frame>
  if (!live.data) return <Frame>{live.failed ? <Problem text={LOAD_COPY.board} onRetry={live.retry} /> : <Skeleton />}</Frame>
  return <BoardView warehouse={warehouse} api={api} openBoard={openBoard} live={live} data={live.data} linkView={linkView} />
}
