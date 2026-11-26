'use client'

import { useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight, Plus, Search, X } from 'lucide-react'
import { Button } from '@/components/Button'
import { Skeleton } from '@/components/Skeleton'
import { changeOf, formatDisplay } from '@/lib/metrics/display'
import {
  categoriesIn, countsOf, filterRows, isFiltered, libraryRows, NO_FILTER, sectionsOf, UNAVAILABLE_SECTION,
  type LibraryFilter, type LibraryRow, type Origin,
} from '@/lib/metrics/library'
import { buildTree, namesIn, type FormulaKind } from '@/lib/metrics/tree'
import { againstOf, storeToday } from '@/lib/metrics/windows'
import { formatStoreDate } from '@/lib/warehouse/freshness'
import { usePeriod } from '@/lib/warehouse/period'
import { dashboardMetricRoute } from '@/lib/routes'
import { ChangeText, CustomTag, KindTag } from './bits'
import { CreateMetricDialog } from './CreateMetricDialog'
import { FilterMenu } from './FilterMenu'
import { TrackedSection } from './TrackedSection'
import { useTracking } from './tracking'
import { useGroupedTotals, useLibrary } from './useLibrary'
import styles from './MetricLibrary.module.css'

const ORIGIN_OPTIONS: ReadonlyArray<{ value: Origin | 'all'; label: string }> = [
  { value: 'all', label: 'Built-in and custom' },
  { value: 'builtin', label: 'Built-in' },
  { value: 'custom', label: 'Custom' },
]

const KIND_OPTIONS: ReadonlyArray<{ value: FormulaKind | 'all'; label: string }> = [
  { value: 'all', label: 'Root and nested' },
  { value: 'root', label: 'Root' },
  { value: 'nested', label: 'Nested' },
]

/**
 * The dashboard: the metrics you track (with a target) on top, judged; every metric the workspace can measure
 * below, by area, each one a click from its own page. The period is the header's.
 */
export function MetricLibraryScreen() {
  const library = useLibrary()
  const [filter, setFilter] = useState<LibraryFilter>(NO_FILTER)
  const [creating, setCreating] = useState(false)
  const [showUnavailable, setShowUnavailable] = useState(false)
  const period = usePeriod()
  const tracking = useTracking()
  const against = againstOf(period)
  const timeZone = library.workspace.data?.timezone
  const names = useMemo(() => library.entries.map(entry => entry.name), [library.entries])
  // Each metric's window ends where its data stops (a custom metric: where its first root stops), so a stale
  // store isn't read as a quiet week. One request pair per distinct day.
  const { lookup: formulas, known, untilOf: untilOfNames } = library
  const untilOfMetric = useMemo(() => (name: string) => untilOfNames(namesIn(buildTree(name, formulas), known)), [untilOfNames, formulas, known])
  const totals = useGroupedTotals(names, period, timeZone, untilOfMetric)
  const today = storeToday(timeZone)

  const { entries, lookup, fill } = library
  const currentTotals = totals.current
  const previousTotals = totals.previous
  const rows = useMemo(
    () => libraryRows(entries, lookup, currentTotals, previousTotals, name => fill(name, totals.endOf(name))),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- endOf follows the same totals as current/previous
    [entries, lookup, currentTotals, previousTotals, fill],
  )
  const shown = useMemo(() => filterRows(rows, filter), [rows, filter])
  // Tracked metrics sit in their own section on top, so they leave the area lists below.
  const trackedRows = shown.filter(row => tracking.isTracked(row.name))
  const untracked = shown.filter(row => !tracking.isTracked(row.name))
  const values = currentTotals?.periods[0]?.values ?? {}
  const sections = sectionsOf(untracked)
  const categories = useMemo(() => categoriesIn(rows), [rows])
  const counts = countsOf(rows)
  const loadingValues = totals.loading
  const set = (patch: Partial<LibraryFilter>) => setFilter(previous => ({ ...previous, ...patch }))

  if (library.catalog.isError) {
    return (
      <div className={styles.empty}>
        <p>Couldn&apos;t load the metrics. Try again.</p>
        <Button variant="secondary" size="sm" onClick={() => { void library.catalog.refetch() }}>Try again</Button>
      </div>
    )
  }

  return (
    <div className={styles.screen}>
      <div className={styles.toolbar}>
        <label className={styles.search}>
          <Search className={styles.searchIcon} size={16} strokeWidth={1.75} aria-hidden />
          <input
            className={styles.searchInput}
            type="search"
            value={filter.query}
            placeholder="Search metrics"
            aria-label="Search metrics"
            onChange={event => set({ query: event.target.value })}
            onKeyDown={event => { if (event.key === 'Escape') set({ query: '' }) }}
          />
          {filter.query !== '' && (
            <button type="button" className={styles.searchClear} aria-label="Clear search" onClick={() => set({ query: '' })}>
              <X size={14} strokeWidth={1.75} aria-hidden />
            </button>
          )}
        </label>
        <FilterMenu
          name="Area"
          value={filter.category}
          active={filter.category !== 'all'}
          options={[{ value: 'all', label: 'All areas', count: rows.length }, ...categories.map(c => ({ value: c.id, label: c.title, count: c.count }))]}
          onChange={category => set({ category })}
        />
        <FilterMenu name="Origin" value={filter.origin} active={filter.origin !== 'all'} options={ORIGIN_OPTIONS} onChange={origin => set({ origin })} />
        <FilterMenu name="Formula" value={filter.kind} active={filter.kind !== 'all'} options={KIND_OPTIONS} onChange={kind => set({ kind })} />
        <div className={styles.toolbarEnd}>
          <Button size="sm" leftIcon={<Plus size={14} strokeWidth={1.75} aria-hidden />} onClick={() => setCreating(true)}>
            New metric
          </Button>
        </div>
      </div>

      {library.catalog.data !== undefined && (
        <p className={styles.summary}>
          {isFiltered(filter)
            ? <>{shown.length} of {counts.total} metrics<button type="button" onClick={() => setFilter(NO_FILTER)}>Clear filters</button></>
            : <>{counts.total} metrics · {counts.custom} custom</>}
          {totals.isError && <> · Some numbers didn&apos;t load<button type="button" onClick={totals.refetch}>Try again</button></>}
        </p>
      )}

      {library.catalog.data === undefined
        ? <LoadingRows />
        : sections.length === 0 && trackedRows.length === 0
          ? (
            <div className={styles.empty}>
              <p>No metric matches {filter.query.trim() ? <>“{filter.query.trim()}”</> : 'these filters'}.</p>
              <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>Make it a new metric</Button>
            </div>
          )
          : (
            <div className={styles.sections}>
              <TrackedSection
                rows={trackedRows}
                tracking={tracking}
                loading={loadingValues}
                against={against}
                filtered={isFiltered(filter)}
                windowOf={totals.windowOf}
                untilOf={totals.untilOf}
                values={values}
              />
              {sections.length > 0 && <h2 className={styles.groupTitle}>All metrics</h2>}
              {sections.map(section => {
                // An area's metrics share a source, so "Data until" is said once, on the area, not on every row.
                const days = [...new Set(section.rows.map(row => totals.untilOf(row.name)))]
                const shared = days.length === 1 && days[0] !== null && days[0] < today ? days[0] : null
                return (
                <section key={section.id} aria-labelledby={`metrics-${section.id}`}>
                  <div className={styles.sectionHead}>
                    <h2 id={`metrics-${section.id}`} className={styles.sectionTitle}>{section.title}</h2>
                    <span className={styles.sectionMeta}>
                      {shared !== null && section.id !== UNAVAILABLE_SECTION && <span className={styles.sectionUntil}>Data until {formatStoreDate(shared)}</span>}
                      {section.rows.length}
                    </span>
                  </div>
                  {section.id === UNAVAILABLE_SECTION && !showUnavailable && !isFiltered(filter)
                    ? (
                      <div className={styles.unavailableSummary}>
                        <p>
                          These need data no connected app sends yet:{' '}
                          {categoriesIn(section.rows).map((c, i) => <span key={c.id}>{i > 0 && ', '}{c.title} ({c.count})</span>)}.
                        </p>
                        <Button variant="secondary" size="sm" onClick={() => setShowUnavailable(true)}>Show them</Button>
                      </div>
                    )
                    : (
                      <ul className={styles.rows}>
                        {section.rows.map(row => (
                          <li key={row.name}>
                            <MetricRow row={row} loading={loadingValues} against={against} until={shared === null ? totals.untilOf(row.name) : null} today={today} target={row.unavailable === null ? tracking.targetCell(row, totals.windowOf(row.name)) : null} />
                          </li>
                        ))}
                      </ul>
                    )}
                </section>
                )
              })}
            </div>
          )}

      {creating && <CreateMetricDialog onClose={() => setCreating(false)} initialPrompt={filter.query.trim() || undefined} />}
    </div>
  )
}

export interface MetricRowProps {
  row: LibraryRow
  loading: boolean
  against: string
  until: string | null
  today: string
  /** The inline target control, when targets are available. */
  target?: ReactNode
}

/**
 * One metric as a row. The label is the link and stretches over the whole row, so the row opens the metric's
 * page while a control inside it (the target) still takes its own clicks.
 */
export function MetricRow({ row, loading, against, until, today, target }: MetricRowProps) {
  const change = changeOf(row.value, row.previous, row.display)
  return (
    <div className={styles.row} data-unavailable={row.unavailable !== null ? '' : undefined} data-has-target={target ? '' : undefined}>
      <div className={styles.rowText}>
        <h3 className={styles.rowLabel}>
          <Link href={dashboardMetricRoute(row.name)} className={styles.rowLink}>{row.label}</Link>
        </h3>
        <p className={styles.rowDescription}>{row.description}</p>
      </div>
      <div className={styles.rowTags}>
        <KindTag kind={row.kind} />
        {row.origin === 'custom' && <CustomTag />}
      </div>
      {target && <div className={styles.rowTarget} data-quiet="">{target}</div>}
      <div className={styles.rowValue}>
        {row.unavailable !== null
          ? <span className={styles.reason}>{row.unavailable}</span>
          : loading
            ? <Skeleton width={72} height="20px" />
            : (
              <>
                <strong>{formatDisplay(row.value, row.display)}</strong>
                <span title={`Compared with ${against}`}><ChangeText change={change} /></span>
                {until !== null && until < today && <span className={styles.until}>Data until {formatStoreDate(until)}</span>}
              </>
            )}
      </div>
      <ArrowRight className={styles.rowArrow} size={16} strokeWidth={1.75} aria-hidden />
    </div>
  )
}

function LoadingRows() {
  return (
    <div className={styles.skeletonRows} aria-busy aria-label="Loading metrics">
      <Skeleton width={120} height="20px" />
      {Array.from({ length: 8 }, (_, index) => <Skeleton key={index} height="44px" radius="10px" />)}
    </div>
  )
}
