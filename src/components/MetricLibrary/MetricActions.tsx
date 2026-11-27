'use client'

import { useState } from 'react'
import { CircleCheck, PencilLine, RotateCcw, Trash2 } from 'lucide-react'
import { ConfirmModal } from '@/components/ConfirmModal'
import { Button } from '@/components/ui/button'
import { useGuardedRouter } from '@/context/nav-guard-context'
import type { MetricEntry } from '@/lib/api/warehouse'
import { originOf } from '@/lib/metrics/catalog'
import { SETTINGS_METRICS_ROUTE } from '@/lib/routes'
import { FormulaEditorDialog } from './FormulaEditorDialog'
import type { Library, WindowId, WindowRange } from './use-library'
import { useMetricActions } from './use-metric-actions'

type Asking = 'delete' | 'reset' | null

/**
 * What can be done to one metric, each mapped to the warehouse's metric endpoints:
 * Confirm (PUT with `verified: true`), Edit formula / Your own formula (PUT under its name), Go back to Souvenir's
 * definition (DELETE of the workspace's own version) and Delete (DELETE of a custom metric). Every member may try;
 * the warehouse decides (R-A4). Irreversible ones ask first, naming the metric (UX-CU-01).
 */
export function MetricActions({ library, entry, windowId, range }: { library: Library; entry: MetricEntry; windowId: WindowId; range: WindowRange }) {
  const actions = useMetricActions(library)
  const { push } = useGuardedRouter()
  const [editing, setEditing] = useState(false)
  const [asking, setAsking] = useState<Asking>(null)
  const origin = originOf(entry)

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!entry.verified && (
        <Button size="sm" variant="secondary" leftIcon={<CircleCheck size={14} aria-hidden />} loading={actions.confirming === entry.name} disabled={actions.saving} onClick={() => actions.confirm(entry)}>
          Confirm
        </Button>
      )}
      <Button size="sm" variant="secondary" leftIcon={<PencilLine size={14} aria-hidden />} disabled={actions.saving} onClick={() => setEditing(true)}>
        {origin === 'custom' ? 'Edit formula' : 'Your own formula'}
      </Button>
      {origin === 'adjusted' && (
        <Button size="sm" variant="ghost" leftIcon={<RotateCcw size={14} aria-hidden />} disabled={actions.deleting} onClick={() => setAsking('reset')}>
          Use Souvenir’s definition
        </Button>
      )}
      {origin === 'custom' && (
        <Button size="sm" variant="ghost" leftIcon={<Trash2 size={14} aria-hidden />} disabled={actions.deleting} onClick={() => setAsking('delete')}>
          Delete
        </Button>
      )}

      {editing && <FormulaEditorDialog library={library} entry={entry} windowId={windowId} range={range} onClose={() => setEditing(false)} />}
      {asking === 'reset' && (
        <ConfirmModal
          title={`Go back to Souvenir’s ${entry.label}?`}
          description="Your workspace’s own formula is removed, and every board and scorecard shows Souvenir’s definition again."
          confirmLabel="Use Souvenir’s definition"
          onConfirm={() => actions.deleteMetric(entry, 'reset')}
          onClose={() => setAsking(null)}
        />
      )}
      {asking === 'delete' && (
        <ConfirmModal
          title={`Delete ${entry.label}?`}
          description="It leaves the library for everyone in your workspace. Boards and scorecards that show it must drop it first."
          confirmLabel="Delete metric"
          onConfirm={async () => { await actions.deleteMetric(entry, 'delete'); push(SETTINGS_METRICS_ROUTE) }}
          onClose={() => setAsking(null)}
        />
      )}
    </div>
  )
}
