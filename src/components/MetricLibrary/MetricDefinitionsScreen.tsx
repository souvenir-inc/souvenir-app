'use client'

import { useDeferredValue, useState, type ReactNode } from 'react'
import { Plus, SearchX } from 'lucide-react'
import { useAuth } from '@/context/auth-context'
import { useOrgMembers } from '@/context/org-context'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { SegmentedControl } from '@/components/ui/segmented-control'
import type { Warehouse } from '@/lib/api/warehouse'
import { countLine, filterTable, groupTable, isFiltered, NO_TABLE_FILTER, tableRows, type GroupBy, type TableFilter } from '@/lib/metrics/library-table'
import { CreateMetricDialog } from './CreateMetricDialog'
import { DefinitionsTable } from './DefinitionsTable'
import { DefinitionsToolbar } from './DefinitionsToolbar'
import { LoadFailed, LoadingRows } from './MetricStates'
import { ReviewList } from './ReviewList'
import { useLibrary } from './use-library'
import { WarehouseGate } from './WarehouseGate'

type View = 'all' | 'review'

/**
 * Settings → Metrics: every metric's definition in one table, for every member of the workspace. Search, filter
 * by status, area, maker and app, group the rows, and open one to see how it's calculated. Review lists the
 * metrics waiting for someone to confirm them. New metric asks for one in words or takes a formula.
 */
export function MetricDefinitionsScreen() {
  return (
    <div className="kaya-scrollbar flex min-h-0 flex-1 justify-center overflow-y-auto pb-9 pt-10">
      <div className="box-border flex w-full max-w-[1100px] flex-col gap-4 px-6">
        <WarehouseGate loading={<><Heading /><LoadingRows /></>}>
          {warehouse => <Definitions warehouse={warehouse} />}
        </WarehouseGate>
      </div>
    </div>
  )
}

function Heading({ action }: { action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 pl-1">
      <div>
        <h1 className="m-0 text-heading font-normal text-[var(--neutral-900)] [font-family:var(--font-title)]">Metrics</h1>
        <p className="m-0 text-body text-[var(--neutral-500)]">What every metric means and how it’s worked out, for everyone in your workspace.</p>
      </div>
      {action}
    </div>
  )
}

function Definitions({ warehouse }: { warehouse: Warehouse }) {
  const library = useLibrary(warehouse)
  const { user } = useAuth()
  const { members } = useOrgMembers()
  const [view, setView] = useState<View>('all')
  const [filter, setFilter] = useState<TableFilter>(NO_TABLE_FILTER)
  const [groupBy, setGroupBy] = useState<GroupBy>('area')
  const [creating, setCreating] = useState(false)
  // Typing in the search re-filters many rows: keep the keystroke fast (SD-RE-10).
  const shownFilter = useDeferredValue(filter)

  const names = new Map(members.map(member => [member.id, member.name || member.email]))
  const me = user?.auth0Id ?? null
  const nameOf = (id: string) => (id === me ? 'You' : names.get(id))
  const rows = tableRows(library.entries, library.appsOf, nameOf)
  const shown = filterTable(rows, shownFilter)
  const groups = groupTable(shown, groupBy)
  const proposed = rows.filter(row => row.status === 'proposed')
  const filtered = isFiltered(filter)
  const { catalog } = library

  const newMetric = (
    <Button size="sm" leftIcon={<Plus size={14} aria-hidden />} disabled={catalog.data === undefined} onClick={() => setCreating(true)}>
      New metric
    </Button>
  )

  return (
    <>
      <Heading action={newMetric} />
      <SegmentedControl
        aria-label="Metrics to show"
        value={view}
        onValueChange={setView}
        options={[{ value: 'all', label: 'All metrics' }, { value: 'review', label: proposed.length > 0 ? `Review (${proposed.length})` : 'Review' }]}
        className="self-start"
      />

      {catalog.isError && catalog.data === undefined ? (
        <LoadFailed error={catalog.error} onRetry={() => { void catalog.refetch() }} />
      ) : catalog.data === undefined ? (
        <LoadingRows />
      ) : view === 'review' ? (
        <ReviewList library={library} rows={proposed} />
      ) : rows.length === 0 ? (
        <EmptyState title="No metrics yet" description="Metrics appear once your store’s first sync finishes. You can add your own now." action={newMetric} />
      ) : (
        <>
          <DefinitionsToolbar rows={rows} filter={filter} onFilter={setFilter} groupBy={groupBy} onGroupBy={setGroupBy} count={countLine(rows, shown.length, filtered)} />
          {groups.length === 0 ? (
            <EmptyState
              icon={<SearchX size={18} aria-hidden />}
              title={filter.query.trim() ? `No metric matches “${filter.query.trim()}”` : 'No metric matches these filters'}
              description="Try another word or fewer filters, or make the metric you’re looking for."
              action={<Button variant="secondary" size="sm" onClick={() => setFilter(NO_TABLE_FILTER)}>Clear search and filters</Button>}
            />
          ) : (
            <DefinitionsTable groups={groups} grouped={groupBy !== 'none'} />
          )}
        </>
      )}

      {creating && <CreateMetricDialog library={library} initialPrompt={filter.query.trim() || undefined} onClose={() => setCreating(false)} />}
    </>
  )
}
