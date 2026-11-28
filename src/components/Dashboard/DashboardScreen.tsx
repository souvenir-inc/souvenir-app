'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/context/auth-context'
import { useOrg, useOrgMembers } from '@/context/org-context'
import type { Warehouse } from '@/lib/api/warehouse'
import { orgScope, queryKeys } from '@/lib/query-keys'
import { Frame, LoadProblem, NoStore, NotEnabled, Problem, Skeleton } from './DashboardStates'
import { BoardScreen } from './board/BoardScreen'
import { LOAD_COPY } from './board/copy'
import { loadFailure } from './board/errors'
import { useWarehouseAccess } from './board/warehouse-access'
import { newBoardPeriod } from './default-period'
import { Apps } from './live/apps'
import { BoardStore } from './live/board-store'
import { useCatalog, useWarehouses } from './live/dashboard-data'
import { Metrics } from './live/metrics'
import { warehouseQueries } from './live/warehouse-queries'
import { resetLinkView } from './share/link-view'
import { resetSyncStore } from './sync/sync-store'
import type { Person } from './tabs/board-state'
import { starterState } from './templates'

// Dashboard (rules: fe-handbook/features/dashboard/source-docs/01 – 11). AppLayout renders /dashboard
// bare (like /schedules), so the screen builds its own panel. The gates, in order: the warehouse is
// turned on for the organization, the organization has one, we know who the viewer is, then the
// catalog and the viewer's boards; then the board screen (board/BoardScreen.tsx).

const AVATARS = 6

/** The organization's warehouse, its catalog and the viewer's boards; then the board screen. */
export function DashboardScreen() {
  const access = useWarehouseAccess()
  // Not turned on: the feature isn't there, so nothing is read (SD-NV-13).
  if (access === 'off') return <Frame><NotEnabled /></Frame>
  if (access === 'loading') return <Frame><Skeleton /></Frame>
  return <WarehouseGate enabled={access === 'on' ? true : null} />
}

/** `enabled`: the org record says the warehouse is on (null when it couldn't be read). */
function WarehouseGate({ enabled }: { enabled: boolean | null }) {
  const { user, isHydrated, refreshUser } = useAuth()
  const viewer = user?.auth0Id ?? ''
  const warehouses = useWarehouses()
  const warehouse = warehouses.data?.[0]
  if (warehouses.isError && !warehouses.data) {
    return <Frame><LoadProblem failure={loadFailure(warehouses.error, enabled)} text={LOAD_COPY.dashboard} onRetry={() => { void warehouses.refetch() }} /></Frame>
  }
  if (!warehouses.data) return <Frame><Skeleton /></Frame>
  if (!warehouse) return <Frame><NoStore /></Frame>
  // Boards are read as the viewer, so wait for who that is; once auth has settled without one, say so.
  if (!viewer) {
    if (!isHydrated) return <Frame><Skeleton /></Frame>
    return <Frame><Problem text={LOAD_COPY.boards} onRetry={() => { void refreshUser() }} /></Frame>
  }
  return <Loaded key={`${warehouse.id}:${viewer}`} warehouse={warehouse} viewer={viewer} enabled={enabled} />
}

function Loaded({ warehouse, viewer, enabled }: { warehouse: Warehouse; viewer: string; enabled: boolean | null }) {
  // Leaving the dashboard ends this visit's link view and sync state: coming back from the sidebar
  // starts clean, not on an old "No access" page or another warehouse's banners.
  useEffect(() => () => { resetLinkView(); resetSyncStore() }, [])
  const { orgId } = useOrg()
  const { members, membersLoading } = useOrgMembers()
  const org = orgScope(orgId)
  // One store for the screen's life (keyed by warehouse and viewer): it reads and writes the boards
  // one at a time and remembers the versions it read.
  const [store] = useState(() => new BoardStore(warehouse, viewer))
  const catalog = useCatalog(warehouse)
  const people = new Map<string, Person>(members.map((p, i) => [p.id, {
    name: p.name,
    initials: p.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase(),
    color: `var(--dashboard-avatar-${(i % AVATARS) + 1})`,
  }]))
  const boards = useQuery(warehouseQueries.boards(org, warehouse, store, people, !membersLoading))
  const failed = (catalog.isError && !catalog.data) ? catalog.error : (boards.isError && !boards.data) ? boards.error : null
  if (failed) {
    return <Frame><LoadProblem failure={loadFailure(failed, enabled)} text={LOAD_COPY.boards} onRetry={() => { void catalog.refetch(); void boards.refetch() }} /></Frame>
  }
  if (!boards.data || !catalog.data) return <Frame><Skeleton /></Frame>
  const metricsCatalog = catalog.data
  const names = new Set(metricsCatalog.map((e) => e.name))
  // A warehouse with no boards yet gets the starter boards (NB-32), on the viewer's default period.
  const starter = () => starterState(
    new Metrics({ catalog: metricsCatalog, scorecards: [], apps: new Apps(warehouse.connections), chart: { from: new Date(), to: new Date() }, chartBefore: null, compare: 'none', today: new Date() }),
    () => crypto.randomUUID(),
    viewer,
    newBoardPeriod(),
  )
  return (
    <BoardScreen
      warehouse={warehouse}
      snapshot={boards.data}
      queryKey={queryKeys.warehouse.boards(org, warehouse.id)}
      store={store}
      measurable={names}
      viewer={viewer}
      starter={starter}
    />
  )
}
