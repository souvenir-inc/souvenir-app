'use client'

import { useState } from 'react'
import { formatExact } from '@/components/Dashboard/format'
import type { MetricFormat } from '@/components/Dashboard/types'
import { TargetEditor, type TargetMetric } from '@/components/Scorecard/TargetEditor'
import { TargetSection } from '@/components/Scorecard/TargetSection'
import { useTarget } from '@/components/Scorecard/use-scorecard'
import type { MetricEntry, Unit, Warehouse } from '@/lib/api/warehouse'
import { inputScale } from '@/lib/scorecard/target-form'

const FORMAT: Record<Unit, MetricFormat> = { money: 'currency', count: 'number', percent: 'percent', ratio: 'ratio' }

interface MetricTargetProps {
  warehouse: Warehouse
  entry: MetricEntry
  /** The metric's measured number for the window on screen, in stored units; null when there's none. */
  value: number | null
}

/**
 * The metric page's target: the same section and editor as the metric window's Target tab, saved in the
 * workspace's scorecards (the API), so the board cards and this page judge the metric the same way.
 */
export function MetricTarget({ warehouse, entry, value }: MetricTargetProps) {
  const [editing, setEditing] = useState(false)
  const { found } = useTarget(warehouse, entry.name)
  const metric: TargetMetric = {
    id: entry.name,
    label: entry.label,
    unit: entry.unit,
    upIsGood: found?.row.direction !== 'down',
  }
  const amount = value === null ? null : value * inputScale(entry.unit)
  return (
    <>
      <TargetSection
        warehouse={warehouse}
        metric={{ ...metric, amount }}
        formatValue={figure => formatExact(figure, FORMAT[entry.unit])}
        onEdit={() => setEditing(true)}
      />
      <TargetEditor open={editing} onClose={() => setEditing(false)} warehouse={warehouse} metric={metric} row={found?.row ?? null} />
    </>
  )
}
