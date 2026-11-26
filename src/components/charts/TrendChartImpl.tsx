'use client'

import { useId } from 'react'
import { useReducedMotion } from 'framer-motion'
import {
  Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { ChartTooltip, type ChartTooltipRow } from './ChartTooltip'
import { formatAxisValue, formatChartValue, formatChartValueExact, formatDay, formatDayLong, type ValueFormat } from './format'
import { describeSeries, extentOf, meetsTarget, niceTicks, paddedDomain, type TrendPoint } from './scale'
import { AXIS_TICK, CHART_ANIMATION_MS, CHART_COLORS } from './theme'
import styles from './charts.module.css'

export interface TrendTarget {
  /** At least this (alone), or the lower edge of a band (with `high`). */
  low?: number | null
  /** At most this (alone), or the upper edge of a band (with `low`). */
  high?: number | null
}

export interface TrendChartProps {
  /** The current period, oldest first, with the comparison lined up (see `alignComparison`). */
  points: TrendPoint[]
  format: ValueFormat
  /** What the chart shows, for screen readers: "Revenue, last 30 days". */
  label: string
  /** `area` (default) fills softly under the line; `line` doesn't. */
  variant?: 'line' | 'area'
  /** Names the dashed series in the hover card: "Period before". */
  comparisonLabel?: string
  /**
   * A target, drawn as a labelled dashed line (one edge) or a band (both), with each day's dot green on target and
   * red off it. `{ low }` reads "at least", `{ high }` "at most", both "between".
   */
  target?: TrendTarget | null
  /** Which way is good, for colouring the change in the hover card. Defaults to `higher`. */
  polarity?: 'higher' | 'lower' | 'neutral'
  /** Height in px. Defaults to 200. */
  height?: number
  /** No axes, grid, dots or labels, for small cards. The hover card stays. */
  compact?: boolean
}

/** Up to this many days get a dot each; beyond it, only the last day (and the one under the pointer). */
const DOT_LIMIT = 45
/** With this few days that have a value, every one is labelled and the period before is drawn as faint dots. */
const SPARSE_DAYS = 3

function changeOf(value: number | null | undefined, before: number | null | undefined): number | null {
  if (value === null || value === undefined || before === null || before === undefined || before === 0) return null
  return ((value - before) / Math.abs(before)) * 100
}

function changeColor(change: number, polarity: TrendChartProps['polarity']): string {
  if (polarity === 'neutral' || Math.abs(change) < 0.05) return CHART_COLORS.axis
  const good = polarity === 'lower' ? change < 0 : change > 0
  return good ? CHART_COLORS.positive : CHART_COLORS.negative
}

/** "Target $340", "Target at most 4.0%", "Target $300–$400". */
function targetText(target: TrendTarget, format: ValueFormat): string | null {
  const low = typeof target.low === 'number' ? target.low : null
  const high = typeof target.high === 'number' ? target.high : null
  if (low !== null && high !== null) return `Target ${formatChartValue(low, format)}–${formatChartValue(high, format)}`
  if (low !== null) return `Target ${formatChartValue(low, format)}`
  if (high !== null) return `Target at most ${formatChartValue(high, format)}`
  return null
}

function TrendTooltip({ point, format, comparisonLabel, target, polarity }: {
  point: TrendPoint; format: ValueFormat; comparisonLabel: string; target: TrendTarget | null | undefined; polarity: TrendChartProps['polarity']
}) {
  const verdict = meetsTarget(point.value, target)
  const rows: ChartTooltipRow[] = [{
    key: 'v', label: formatDay(point.date), value: formatChartValueExact(point.value, format),
    swatch: verdict === null ? CHART_COLORS.ink : verdict ? CHART_COLORS.positive : CHART_COLORS.negative,
  }]
  const hasComparison = point.comparisonDate !== undefined
  if (hasComparison) {
    rows.push({
      key: 'c', label: `${comparisonLabel} · ${formatDay(point.comparisonDate!)}`,
      value: formatChartValueExact(point.comparison, format), swatch: CHART_COLORS.comparison, muted: true,
    })
  }
  const goal = target ? targetText(target, format) : null
  if (goal) rows.push({ key: 't', label: goal.replace(/^Target /, 'Target: '), value: verdict === null ? '' : verdict ? 'Met' : 'Missed', muted: true })
  const change = hasComparison ? changeOf(point.value, point.comparison) : null
  return (
    <ChartTooltip
      title={formatDayLong(point.date)}
      rows={rows}
      footer={change === null ? undefined : (
        <span style={{ color: changeColor(change, polarity) }}>
          {change >= 0 ? '+' : '−'}{Math.abs(change).toFixed(1)}% vs {comparisonLabel.charAt(0).toLowerCase()}{comparisonLabel.slice(1)}
        </span>
      )}
    />
  )
}

interface DotProps {
  cx?: number
  cy?: number
  index?: number
  payload?: TrendPoint
}

/**
 * A daily line with the period before dashed behind it: straight segments (no curve overshooting the data), a dot
 * per day (green on target, red off it when there's a target), the latest value labelled at the right end, a
 * labelled target line or band, and round axis ticks in the metric's own format.
 */
export function TrendChart({
  points, format, label, variant = 'area', comparisonLabel = 'Period before', target, polarity = 'higher', height = 200, compact = false,
}: TrendChartProps) {
  const reduceMotion = useReducedMotion()
  const gradientId = `trend-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const values = points.map(p => p.value)
  const comparison = points.map(p => p.comparison ?? null)
  const hasComparison = points.some(p => p.comparisonDate !== undefined)
  const low = typeof target?.low === 'number' ? target.low : null
  const high = typeof target?.high === 'number' ? target.high : null
  const bounds = [low, high].filter((n): n is number => n !== null)
  const hasTarget = bounds.length > 0
  const zero = format === 'money' || format === 'count'
  const padded = paddedDomain(extentOf(values, comparison, bounds), { zero, pad: 0.04 })
  const ticks = niceTicks(padded[0], padded[1], 4)
  const domain: [number, number] = [ticks[0], ticks[ticks.length - 1]]
  const lastIndex = values.reduce<number>((at, v, i) => (v !== null && v !== undefined ? i : at), -1)
  const valued = values.filter(v => v !== null && v !== undefined).length
  // Few days with data: no line can show a trend, so each value is labelled and the period before drawn as faint dots
  // (a dashed segment between two lone days reads as a spike under the wrong dates).
  const sparse = valued <= SPARSE_DAYS
  const dotted = !compact && (points.length <= DOT_LIMIT || hasTarget || sparse)
  const animate = !reduceMotion
  const goal = target ? targetText(target, format) : null

  const renderDot = ({ cx, cy, index, payload }: DotProps) => {
    const key = `dot-${index}`
    if (cx === undefined || cy === undefined || !payload || payload.value === null || payload.value === undefined) return <g key={key} />
    const last = index === lastIndex
    if (!dotted && !last) return <g key={key} />
    const labelled = !compact && (last || sparse)
    const verdict = meetsTarget(payload.value, target)
    const fill = verdict === null ? CHART_COLORS.ink : verdict ? CHART_COLORS.positive : CHART_COLORS.negative
    return (
      <g key={key}>
        <circle cx={cx} cy={cy} r={last || sparse ? 3.5 : 2.25} fill={fill} stroke={CHART_COLORS.surface} strokeWidth={last || sparse ? 2 : 1} />
        {labelled && (
          <text x={last ? cx - 6 : cx} y={cy < 18 ? cy + 18 : cy - 10} textAnchor={last ? 'end' : 'middle'} className={styles.lastValue}>
            {formatChartValue(payload.value, format)}
          </text>
        )}
      </g>
    )
  }

  // Fewer than two days with a value: there's no trend to draw, and a lone dot reads as a broken chart.
  if (valued < 2) {
    return (
      <div className={styles.chartEmpty} style={{ height }}>
        {compact ? null : 'Not enough days with data to show a trend'}
      </div>
    )
  }

  return (
    <div className={styles.trend} role="img" aria-label={`${describeSeries(label, values, format, 'days')}${goal ? ` ${goal}.` : ''}`}>
      <ResponsiveContainer width="100%" height={height} debounce={60}>
        <ComposedChart data={points} margin={compact ? { top: 6, right: 2, bottom: 2, left: 2 } : { top: 14, right: 0, bottom: 0, left: 0 }}
          accessibilityLayer={false}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.wash} stopOpacity={0.08} />
              <stop offset="100%" stopColor={CHART_COLORS.wash} stopOpacity={0} />
            </linearGradient>
          </defs>
          {!compact && <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} strokeOpacity={0.7} />}
          {/* Padded so a dot (and its label) on the first or last day isn't cut in half by the edge. */}
          <XAxis dataKey="date" hide={compact} tickLine={false} axisLine={false} tick={AXIS_TICK} tickMargin={8}
            padding={compact ? undefined : { left: 12, right: 12 }}
            interval="preserveStartEnd" minTickGap={36} tickFormatter={d => formatDay(String(d))} />
          <YAxis hide={compact} orientation="right" width={48} tickLine={false} axisLine={false} tick={AXIS_TICK}
            domain={domain} ticks={ticks} allowDataOverflow tickFormatter={v => formatAxisValue(Number(v), format)} />
          {low !== null && high !== null && (
            <ReferenceArea y1={low} y2={high} fill={CHART_COLORS.ink} fillOpacity={0.04}
              stroke={CHART_COLORS.axis} strokeOpacity={0.5} strokeDasharray="4 4" ifOverflow="hidden"
              label={compact || !goal ? undefined : { value: goal, position: 'insideTopLeft', fill: CHART_COLORS.axis, fontSize: 11 }} />
          )}
          {bounds.length === 1 && (
            <ReferenceLine y={bounds[0]} stroke={CHART_COLORS.axis} strokeDasharray="4 4" strokeOpacity={0.9} ifOverflow="hidden"
              label={compact || !goal ? undefined : { value: goal, position: 'insideTopLeft', fill: CHART_COLORS.axis, fontSize: 11 }} />
          )}
          {hasComparison && (
            <Line dataKey="comparison" type="linear" stroke={sparse ? 'transparent' : CHART_COLORS.comparison} strokeWidth={1.5}
              strokeDasharray="4 4" dot={sparse ? { r: 2.5, fill: CHART_COLORS.comparison, strokeWidth: 0 } : false}
              activeDot={false} connectNulls={false} isAnimationActive={animate} animationDuration={CHART_ANIMATION_MS} />
          )}
          <Area dataKey="value" type="linear" stroke={CHART_COLORS.ink} strokeWidth={1.75}
            fill={variant === 'area' ? `url(#${gradientId})` : 'none'} connectNulls={false}
            dot={renderDot}
            activeDot={{ r: 4, fill: CHART_COLORS.ink, stroke: CHART_COLORS.surface, strokeWidth: 2 }}
            isAnimationActive={animate} animationDuration={CHART_ANIMATION_MS} animationEasing="ease-out" />
          <Tooltip
            cursor={{ stroke: CHART_COLORS.grid, strokeWidth: 1 }}
            isAnimationActive={false}
            content={props => {
              const point = props.active ? (props.payload?.[0]?.payload as TrendPoint | undefined) : undefined
              return point
                ? <TrendTooltip point={point} format={format} comparisonLabel={comparisonLabel} target={target} polarity={polarity} />
                : null
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
