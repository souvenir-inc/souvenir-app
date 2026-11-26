'use client'

import { useEffect } from 'react'
import type { MeasureRequest, Measurement } from '@/lib/api/warehouse'
import { useMeasurement } from '@/lib/warehouse/queries'
import type { RangeKey } from './batching'
import styles from './Canvas.module.css'

/** How far off a metric is: red is off, amber is close to off. */
export type FlagLevel = 'red' | 'amber'

export interface AttentionChip {
  metric: string
  label: string
  /** The number the metric's card shows, formatted. */
  value: string
  level: FlagLevel
}

/**
 * The metrics that aren't performing, across every board: one compact chip each, red first, then amber. A click opens
 * the metric up close. When nothing is flagged the row isn't there at all: no empty state, no "all good".
 */
export function AttentionRow({ chips, onOpen }: { chips: AttentionChip[]; onOpen: (metric: string) => void }) {
  if (chips.length === 0) return null
  const ordered = [...chips].sort((a, b) => (a.level === b.level ? 0 : a.level === 'red' ? -1 : 1))
  return (
    <section className={styles.attention} aria-label="Needs attention">
      <span className={styles.attentionTitle}>Needs attention</span>
      <ul className={styles.attentionChips}>
        {ordered.map(chip => (
          <li key={chip.metric}>
            <button type="button" className={styles.attentionChip} data-level={chip.level} onClick={() => onOpen(chip.metric)}
              aria-label={`${chip.label}, ${chip.value}, ${chip.level === 'red' ? 'off' : 'close to off'}. Open`}>
              <span className={styles.attentionDot} aria-hidden />
              <span className={styles.attentionLabel}>{chip.label}</span>
              <span className={styles.attentionValue}>{chip.value}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * One totals request for the row (the metrics of every board that share a range), reported up when it answers. A
 * component rather than a hook so the row can ask as many ranges as the boards need (one per source cut, usually 1–3).
 */
export function AttentionProbe({ rangeKey, request, onResult }: {
  rangeKey: RangeKey
  request: MeasureRequest
  onResult: (key: RangeKey, measurement: Measurement | undefined) => void
}) {
  const query = useMeasurement(request, request.metrics.length > 0)
  const data = query.data
  useEffect(() => {
    onResult(rangeKey, data)
  }, [onResult, rangeKey, data])
  return null
}
