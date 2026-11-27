// The metric library's numbers, through the Dashboard's one formatting module, so a figure reads the same on a
// card, in the metric window and here. Percent metrics are fractions on the wire (0.04 is 4%).

import { formatFigure, formatMetricValue } from '@/components/Dashboard/format'
import type { MetricFormat } from '@/components/Dashboard/types'
import type { Change } from '@/lib/metrics/display'
import type { DisplayUnit } from '@/lib/metrics/units'

const FORMAT: ReadonlyMap<DisplayUnit, MetricFormat> = new Map([
  ['money', 'currency'], ['count', 'number'], ['percent', 'percent'], ['ratio', 'ratio'], ['number', 'number'],
])

/** One number in its unit: "$48.2k", "2,140", "3.40%", "3.20". Missing data is a dash, never a zero. */
export function formatDisplay(value: number | null | undefined, unit: DisplayUnit): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  if (unit === 'number') return formatMetricValue(value, 'number')
  return formatFigure(unit === 'percent' ? value * 100 : value, FORMAT.get(unit) ?? 'number')
}

/** How far a number moved: "10.0%", "0.4 pts", "0.40". */
export function changeText(change: Change): string {
  switch (change.measure) {
    case 'percent': return formatFigure(change.magnitude, 'percent')
    case 'points': return `${formatMetricValue(change.magnitude, 'number')} pts`
    case 'ratio': return formatFigure(change.magnitude, 'ratio')
  }
}
