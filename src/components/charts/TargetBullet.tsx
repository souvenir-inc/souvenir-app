import { formatChartValue, type ValueFormat } from './format'
import { targetStatus, type TargetDirection, type TargetStatus } from './scale'
import { CHART_COLORS } from './theme'
import styles from './charts.module.css'

export interface TargetBulletProps {
  /** The actual. `null` draws an empty track and "No data". */
  value: number | null
  target: number
  format: ValueFormat
  /** Which side of the target is good. */
  direction: TargetDirection
  /** What it measures, for screen readers: "Refund rate". */
  label: string
  /** The scale's right end. Defaults to 1.25 × the larger of value and target. */
  max?: number
  /** Overrides the default on / near / off reading, so a scorecard's own status rules can drive it. */
  status?: TargetStatus
}

const STATUS_COLOR: Record<TargetStatus, string> = {
  on: CHART_COLORS.positive,
  near: CHART_COLORS.caution,
  off: CHART_COLORS.negative,
}

const STATUS_WORD: Record<TargetStatus, string> = { on: 'on target', near: 'close to target', off: 'off target' }

/** A bullet bar: the actual as a fill, the target as a tick, coloured by where the actual sits. */
export function TargetBullet({ value, target, format, direction, label, max, status }: TargetBulletProps) {
  const scaleMax = max ?? (Math.max(Math.abs(value ?? 0), Math.abs(target)) * 1.25 || 1)
  const pct = (n: number) => `${Math.min(Math.max(n / scaleMax, 0), 1) * 100}%`
  const reading = value === null ? null : status ?? targetStatus(value, target, direction)
  const spoken = value === null
    ? `${label}: no data. Target ${formatChartValue(target, format)}.`
    : `${label}: ${formatChartValue(value, format)}, ${STATUS_WORD[reading!]} of ${direction === 'higher' ? 'at least' : 'at most'} ${formatChartValue(target, format)}.`

  return (
    <div className={styles.bullet} role="img" aria-label={spoken}>
      <div className={styles.bulletTrack}>
        {value !== null && (
          <span className={styles.bulletFill} style={{ width: pct(value), background: STATUS_COLOR[reading!] }} />
        )}
        <span className={styles.bulletTick} style={{ left: pct(target) }} />
      </div>
      <div className={styles.bulletScale} aria-hidden>
        <span>{direction === 'higher' ? 'At least' : 'At most'} {formatChartValue(target, format)}</span>
        {reading && <span style={{ color: STATUS_COLOR[reading] }}>{STATUS_WORD[reading]}</span>}
      </div>
    </div>
  )
}
