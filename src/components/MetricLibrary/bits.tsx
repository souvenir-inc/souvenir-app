import { ArrowDown, ArrowUp } from 'lucide-react'
import { Badge, type BadgeColor } from '@/components/Badge'
import { ORIGIN_NAMES, type Origin } from '@/lib/metrics/catalog'
import type { Change } from '@/lib/metrics/display'
import { STATUS_NAMES, type MetricStatus } from '@/lib/metrics/library-table'
import type { FormulaKind } from '@/lib/metrics/tree'
import { changeText } from './format'

/** The move against the period before. Neutral ink: whether up is good depends on the metric, and the library doesn't judge. */
export function ChangeText({ change, against }: { change: Change | null; against?: string }) {
  if (change === null) return null
  const text = change.direction === 'flat' ? 'No change' : changeText(change)
  const spoken = change.direction === 'flat' ? 'no change' : `${change.direction} ${text}`
  return (
    <span className="inline-flex items-center gap-0.5 text-small text-[var(--neutral-600)]">
      {change.direction === 'up' && <ArrowUp size={12} strokeWidth={1.75} aria-hidden />}
      {change.direction === 'down' && <ArrowDown size={12} strokeWidth={1.75} aria-hidden />}
      <span aria-hidden>{text}{against ? ` vs ${against}` : ''}</span>
      <span className="sr-only">{spoken}{against ? ` compared with ${against}` : ''}</span>
    </span>
  )
}

const KIND_NAMES: ReadonlyMap<FormulaKind, string> = new Map([['root', 'Counted from a table'], ['nested', 'Built from other metrics']])

export function KindTag({ kind }: { kind: FormulaKind | null }) {
  if (kind === null) return null
  return <Badge label={KIND_NAMES.get(kind)} color="Neutral" />
}

export function OriginTag({ origin }: { origin: Origin }) {
  return <Badge label={ORIGIN_NAMES.get(origin)} color={origin === 'builtin' ? 'Neutral' : origin === 'custom' ? 'Purple' : 'Blue'} />
}

const STATUS_COLORS: Record<MetricStatus, BadgeColor> = { confirmed: 'Green', proposed: 'Yellow', retired: 'Neutral' }

export function StatusTag({ status }: { status: MetricStatus }) {
  return <Badge label={STATUS_NAMES.get(status)} color={STATUS_COLORS[status]} />
}
