import { useId } from 'react'
import type { ValueFormat } from './format'
import { describeSeries, extentOf, paddedDomain, sparkGeometry } from './scale'
import { CHART_COLORS, TONE_COLOR, type ChartTone } from './theme'
import styles from './charts.module.css'

export interface SparklineProps {
  /** The series, oldest first. `null` is a day with no rows: the line breaks there, it never drops to zero. */
  values: ReadonlyArray<number | null>
  /** What the line shows, for screen readers: "Revenue, last 30 days". */
  label: string
  /** How values read in the spoken description. Defaults to `count`. */
  format?: ValueFormat
  /** An optional faded series behind it (the previous period), on the same scale. */
  comparison?: ReadonlyArray<number | null>
  /** Line colour. Defaults to `neutral` (ink). */
  tone?: ChartTone
  /** Height in px; the width fills the container. Defaults to 32. */
  height?: number
  /** Soft fill under the line. Defaults to true. */
  fill?: boolean
  className?: string
}

// The SVG stretches to any width (preserveAspectRatio none, strokes don't scale), so dots are HTML on top
// to stay round. Plain SVG, not Recharts: a scorecard draws one per row and needs no axes or tooltips.
const VIEW_W = 100

export function Sparkline({
  values, label, format = 'count', comparison, tone = 'neutral', height = 32, fill = true, className,
}: SparklineProps) {
  const gradientId = `spark-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const count = Math.max(values.length, comparison?.length ?? 0)
  const domain = paddedDomain(extentOf(values, comparison ?? []), { pad: 0.12 })
  const main = sparkGeometry(values, domain, VIEW_W, height, { count, inset: 3 })
  const behind = comparison ? sparkGeometry(comparison, domain, VIEW_W, height, { count, inset: 3 }) : null
  const color = TONE_COLOR[tone]
  const pct = (p: { x: number; y: number }) => ({ left: `${(p.x / VIEW_W) * 100}%`, top: `${(p.y / height) * 100}%` })

  return (
    <div
      className={`${styles.spark}${className ? ` ${className}` : ''}`}
      style={{ height }}
      role="img"
      aria-label={describeSeries(label, values, format, 'days')}
    >
      <svg className={styles.sparkSvg} viewBox={`0 0 ${VIEW_W} ${height}`} preserveAspectRatio="none" aria-hidden focusable="false">
        {fill && (
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.12} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
        )}
        {behind?.lines.map(d => (
          <path key={`c${d}`} d={d} fill="none" stroke={CHART_COLORS.comparison} strokeWidth={1.25}
            strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        ))}
        {fill && main.areas.map(d => <path key={`a${d}`} d={d} fill={`url(#${gradientId})`} stroke="none" />)}
        {main.lines.map(d => (
          <path key={`l${d}`} d={d} fill="none" stroke={color} strokeWidth={1.5}
            strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      {main.dots.map(p => (
        <span key={`d${p.x}`} className={styles.sparkDot} style={{ ...pct(p), background: color }} aria-hidden />
      ))}
      {main.last && main.lines.length > 0 && (
        <span className={styles.sparkEnd} style={{ ...pct(main.last), background: color }} aria-hidden />
      )}
    </div>
  )
}
