'use client'

import { useState } from 'react'
import { CircleCheck } from 'lucide-react'
import { ConfirmModal } from '@/components/ConfirmModal'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { TextLink } from '@/components/ui/link'
import type { MetricEntry } from '@/lib/api/warehouse'
import type { TableRow } from '@/lib/metrics/library-table'
import { DASHBOARD_METRIC_ROUTE } from '@/lib/routes'
import { OriginTag } from './bits'
import type { Library } from './use-library'
import { useMetricActions } from './use-metric-actions'

/**
 * Metrics waiting for a check (saved without `verified`): confirm one as it is, or delete a custom one. Anyone
 * in the workspace may do either; the warehouse decides (R-A4).
 */
export function ReviewList({ library, rows }: { library: Library; rows: readonly TableRow[] }) {
  const actions = useMetricActions(library)
  const [deleting, setDeleting] = useState<MetricEntry | null>(null)

  if (rows.length === 0) {
    return <EmptyState icon={<CircleCheck size={18} aria-hidden />} title="Nothing to review" description="Every metric in this workspace is confirmed." />
  }

  return (
    <>
      <ul className="m-0 flex list-none flex-col divide-y divide-[var(--neutral-100)] p-0" aria-label="Metrics to review">
        {rows.map(row => {
          const entry = library.byName.get(row.name)
          if (!entry) return null
          const busy = actions.confirming === row.name
          return (
            <li key={row.name} className="flex flex-wrap items-start gap-3 py-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <TextLink href={DASHBOARD_METRIC_ROUTE(row.name)} variant="standalone">{row.label}</TextLink>
                  <OriginTag origin={row.origin} />
                </div>
                <p className="m-0 text-body-sm text-[var(--neutral-600)]">{row.description || 'No description yet.'}</p>
                <p className="m-0 text-small text-[var(--neutral-500)]">Proposed by {row.creator.name}</p>
              </div>
              <div className="flex items-center gap-2">
                {row.origin === 'custom' && (
                  <Button variant="ghost" size="sm" disabled={actions.saving} onClick={() => setDeleting(entry)} aria-label={`Delete ${row.label}`}>
                    Delete
                  </Button>
                )}
                <Button variant="secondary" size="sm" loading={busy} disabled={actions.saving} onClick={() => actions.confirm(entry)} aria-label={`Confirm ${row.label}`}>
                  Confirm
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
      {deleting && (
        <ConfirmModal
          title={`Delete ${deleting.label}?`}
          description="It leaves the library for everyone in your workspace. Boards and scorecards that show it must drop it first."
          confirmLabel="Delete metric"
          onConfirm={() => actions.deleteMetric(deleting, 'delete')}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  )
}
