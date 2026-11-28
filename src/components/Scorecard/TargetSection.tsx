'use client'

import { toast } from 'sonner'
import { usePeople } from '@/components/Dashboard/share/use-people'
import { Button } from '@/components/ui/button'
import type { Warehouse } from '@/lib/api/warehouse'
import { canRetry, targetErrorMessage } from '@/lib/scorecard/errors'
import { judge } from '@/lib/scorecard/status'
import { inputScale } from '@/lib/scorecard/target-form'
import { Health, percentText } from './Health'
import type { TargetMetric } from './TargetEditor'
import { useSaveTarget, useTarget } from './use-scorecard'

// The metric window's Target tab: the target in force, its status for the dates on screen (as words,
// with the reason beside it), who owns it and their note, and Edit / Remove. Every state renders:
// loading, couldn't load (with Try again when it can work), no target yet, and the target.

interface TargetSectionProps {
  warehouse: Warehouse
  metric: TargetMetric & {
    /** The number for the dates on screen, as the card shows it (a percent metric × 100); null when there's none. */
    amount: number | null
  }
  /** A number in the metric's display units, written out in full ("$55,000.00", "4.50%"). */
  formatValue: (value: number) => string
  /** Opens the target editor. */
  onEdit: () => void
}

const TEXT = 'm-0 text-[length:var(--font-size-body-sm)] leading-5'

export function TargetSection({ warehouse, metric, formatValue, onEdit }: TargetSectionProps) {
  const { query, found } = useTarget(warehouse, metric.id)
  const save = useSaveTarget(warehouse)
  const people = usePeople()

  if (query.isPending) {
    return <p aria-busy="true" className={`${TEXT} text-[var(--dashboard-muted)]`}>Loading the target…</p>
  }
  if (query.isError && !query.data) {
    return (
      <div className="flex flex-col items-start gap-2">
        <p role="alert" className={`${TEXT} text-[var(--dashboard-figure)]`}>{targetErrorMessage(query.error, 'load', metric.label)}</p>
        {canRetry(query.error) && <Button variant="link" size="sm" className="px-0" onClick={() => { void query.refetch() }}>Try again</Button>}
      </div>
    )
  }
  if (!found) {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className={`${TEXT} text-[var(--dashboard-muted)]`}>This metric has no target yet.</p>
        <Button variant="link" size="sm" className="px-0" onClick={onEdit}>Set a target</Button>
      </div>
    )
  }

  const { row } = found
  const scale = inputScale(metric.unit)
  const judgement = judge(metric.amount === null ? null : metric.amount / scale, row)

  const remove = () => {
    save.mutate(
      { metric: metric.id, row: null, newId: crypto.randomUUID() },
      {
        onSuccess: () => toast(`Removed the target for ${metric.label}`, {
          duration: 6000,
          action: {
            label: 'Undo',
            onClick: () => save.mutate(
              { metric: metric.id, row, newId: crypto.randomUUID() },
              { onError: (error) => { toast.error(targetErrorMessage(error, 'save', metric.label)) } },
            ),
          },
        }),
        onError: (error) => { toast.error(targetErrorMessage(error, 'remove', metric.label)) },
      },
    )
  }

  return (
    <section aria-label={`Target for ${metric.label}`} className="flex flex-col gap-5">
      {judgement
        ? <Health judgement={judgement} row={row} />
        : <p className={`${TEXT} text-[var(--dashboard-muted)]`}>No number for these dates yet, so there’s nothing to judge against the target.</p>}

      <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2.5 text-[length:var(--font-size-body-sm)] leading-5">
        <dt className="text-[var(--dashboard-muted)]">Target</dt>
        <dd className="m-0 text-[var(--dashboard-figure)]">{formatValue(row.target * scale)}</dd>
        <dt className="text-[var(--dashboard-muted)]">Good when</dt>
        <dd className="m-0 text-[var(--dashboard-figure)]">{row.direction === 'up' ? 'Higher' : 'Lower'}</dd>
        <dt className="text-[var(--dashboard-muted)]">Tolerance</dt>
        <dd className="m-0 text-[var(--dashboard-figure)]">{row.tolerance > 0 ? `${percentText(row.tolerance * 100)} short still counts as on track` : 'None: any miss is off track'}</dd>
        <dt className="text-[var(--dashboard-muted)]">Owner</dt>
        <dd className="m-0 text-[var(--dashboard-figure)]">{row.owner ? people.displayName(row.owner) : 'No owner'}</dd>
        {row.note && (
          <>
            <dt className="text-[var(--dashboard-muted)]">Note</dt>
            <dd className="m-0 whitespace-pre-wrap break-words text-[var(--dashboard-figure)]">{row.note}</dd>
          </>
        )}
      </dl>
      <p className={`${TEXT} text-[var(--dashboard-muted)]`}>The same target applies to whatever dates the board shows.</p>

      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={onEdit} disabled={save.isPending}>Edit target</Button>
        <Button variant="ghost" size="sm" onClick={remove} loading={save.isPending}>Remove target</Button>
      </div>
    </section>
  )
}
