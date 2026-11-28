'use client'

import { useState, type ReactNode } from 'react'
import { ChevronLeft, SearchX } from 'lucide-react'
import { Frame } from '@/components/Dashboard/DashboardStates'
import { listNames } from '@/components/Dashboard/format'
import { EmptyState } from '@/components/ui/empty-state'
import { Alert } from '@/components/ui/alert'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Skeleton } from '@/components/Skeleton'
import { TextLink } from '@/components/ui/link'
import type { MetricEntry, Warehouse } from '@/lib/api/warehouse'
import { originOf, usersOf } from '@/lib/metrics/catalog'
import { categoryName, changeOf } from '@/lib/metrics/display'
import { buildTree } from '@/lib/metrics/tree'
import { displayOfMetric } from '@/lib/metrics/units'
import { DASHBOARD_METRIC_ROUTE, SETTINGS_METRICS_ROUTE } from '@/lib/routes'
import { ChangeText, KindTag, OriginTag, StatusTag } from './bits'
import { formatDisplay } from './format'
import { MetricActions } from './MetricActions'
import { MetricCalculation } from './MetricCalculation'
import { MetricTarget } from './MetricTarget'
import { LoadFailed, LoadingRows } from './MetricStates'
import { againstOf, useLibrary, useTotals, WINDOW_IDS, windowLabel, windowRange, type Library, type WindowId } from './use-library'
import { WarehouseGate } from './WarehouseGate'
import { WhatMovedIt } from './WhatMovedIt'

const STATUS_TEXT: Record<MetricEntry['status'], string> = {
  confirmed: 'Confirmed',
  proposed: 'Proposed: waiting for an admin to confirm it',
  retired: 'Retired: it still measures, but use its replacement',
}

export interface MetricPageScreenProps {
  /** The metric's catalog name, already checked against ^[a-z][a-z0-9_]*$ by the route. */
  name: string
}

/** One metric: its number for a window, how it's calculated, what moved it, and what it means. */
export function MetricPageScreen({ name }: MetricPageScreenProps) {
  return (
    <Frame>
      <div className="flex flex-col gap-6 pb-10">
        <TextLink href={SETTINGS_METRICS_ROUTE} variant="subtle" className="self-start text-body-sm">
          <ChevronLeft size={16} aria-hidden />
          Metric definitions
        </TextLink>
        <WarehouseGate loading={<LoadingRows rows={5} label="Loading metric" />}>
          {warehouse => <MetricPage warehouse={warehouse} name={name} />}
        </WarehouseGate>
      </div>
    </Frame>
  )
}

function MetricPage({ warehouse, name }: { warehouse: Warehouse; name: string }) {
  const library = useLibrary(warehouse)
  const { catalog } = library
  if (catalog.isError && catalog.data === undefined) return <LoadFailed error={catalog.error} onRetry={() => { void catalog.refetch() }} />
  if (catalog.data === undefined) return <LoadingRows rows={5} label="Loading metric" />
  const entry = library.byName.get(name)
  if (!entry) {
    return (
      <EmptyState
        icon={<SearchX size={18} aria-hidden />}
        title="There’s no metric with that name in this workspace"
        description="It may have been deleted or renamed."
        action={<TextLink href={SETTINGS_METRICS_ROUTE} variant="standalone">See every metric</TextLink>}
      />
    )
  }
  return <MetricDetail key={entry.name} library={library} entry={entry} />
}

function Section({ id, title, meta, children }: { id: string; title: string; meta?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={id} className="m-0 text-heading-sm font-medium text-[var(--neutral-900)]">{title}</h2>
        {meta}
      </div>
      {children}
    </section>
  )
}

function MetricDetail({ library, entry }: { library: Library; entry: MetricEntry }) {
  const [windowId, setWindowId] = useState<WindowId>('30d')
  const range = windowRange(windowId, library.warehouse.timezone)
  const totals = useTotals(library, [entry.name], range)
  const tree = buildTree(entry.name, library.lookup)
  const display = displayOfMetric(entry.unit, entry.value, library.unitOf)
  const origin = originOf(entry)
  const apps = library.appsOf(entry.category).map(app => app.name)
  const cannot = totals.unavailable.get(entry.name)
  const value = totals.current?.get(entry.name) ?? null
  const against = againstOf(windowId)
  const usedBy = usersOf(entry.name, library.entries)
  const label = windowLabel(windowId)

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="m-0 text-heading font-normal text-[var(--neutral-900)] [font-family:var(--font-title)]">{entry.label}</h1>
          <StatusTag status={entry.status} />
          {origin !== 'builtin' && <OriginTag origin={origin} />}
          <KindTag kind={tree.kind} />
        </div>
        {entry.description && <p className="m-0 max-w-[720px] text-body text-[var(--neutral-600)]">{entry.description}</p>}
        <p className="m-0 text-small text-[var(--neutral-500)]">
          {origin === 'custom' ? 'Built from other metrics' : categoryName(entry.category)}{apps.length > 0 ? ` · ${listNames(apps)}` : ''}
        </p>
        <MetricActions library={library} entry={entry} windowId={windowId} range={range} />
      </header>

      <Section id="metric-number" title="The number" meta={
        <SegmentedControl aria-label="Window" value={windowId} onValueChange={setWindowId} options={WINDOW_IDS.map(id => ({ value: id, label: windowLabel(id) }))} />
      }>
        {cannot !== undefined ? (
          <Alert tone="info">This store can’t measure {entry.label} yet: {cannot}.</Alert>
        ) : totals.error && !totals.current ? (
          <LoadFailed error={totals.error} action="measure" onRetry={totals.retry} />
        ) : !totals.current ? (
          <Skeleton width={180} height="40px" />
        ) : (
          <div className="flex flex-wrap items-baseline gap-3" aria-live="polite">
            <span className="text-display text-[var(--neutral-900)]">{formatDisplay(value, display)}</span>
            <ChangeText change={changeOf(value, totals.previous?.get(entry.name), display)} against={against} />
            <span className="sr-only">{label}</span>
          </div>
        )}
        <MetricTarget warehouse={library.warehouse} entry={entry} value={cannot === undefined ? value : null} />
      </Section>

      <Section id="metric-calculation" title="How it’s calculated" meta={<span className="text-small text-[var(--neutral-500)]">{label}</span>}>
        <MetricCalculation library={library} name={entry.name} range={range} />
      </Section>

      <Section id="metric-inputs" title="What moved it" meta={<span className="text-small text-[var(--neutral-500)]">{label} vs the {against}</span>}>
        <WhatMovedIt library={library} entry={entry} range={range} against={against} />
      </Section>

      <Section id="metric-definition" title="Definition">
        <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-body-sm">
          <dt className="text-[var(--neutral-500)]">Whose</dt><dd className="m-0 text-[var(--neutral-900)]">{origin === 'builtin' ? 'Souvenir’s library' : origin === 'adjusted' ? 'Your workspace’s version of a library metric' : 'Your workspace'}</dd>
          <dt className="text-[var(--neutral-500)]">Status</dt><dd className="m-0 text-[var(--neutral-900)]">{STATUS_TEXT[entry.status]}</dd>
          <dt className="text-[var(--neutral-500)]">Counted in</dt><dd className="m-0 text-[var(--neutral-900)]">The store’s time zone ({library.warehouse.timezone})</dd>
        </dl>
      </Section>

      {usedBy.length > 0 && (
        <Section id="metric-used-by" title="Used by" meta={<span className="text-small text-[var(--neutral-500)]">{usedBy.length}</span>}>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {usedBy.map(other => (
              <li key={other.name} className="flex flex-col">
                <TextLink href={DASHBOARD_METRIC_ROUTE(other.name)} variant="standalone">{other.label}</TextLink>
                {other.description && <span className="text-small text-[var(--neutral-500)]">{other.description}</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}
