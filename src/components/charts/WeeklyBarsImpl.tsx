'use client'

import { useReducedMotion } from 'framer-motion'
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartTooltip } from './ChartTooltip'
import { formatAxisValue, formatChartValueExact, formatDay, type ValueFormat } from './format'
import { describeSeries, extentOf, niceTicks, paddedDomain, targetStatus, type TargetDirection } from './scale'
import { AXIS_TICK, CHART_ANIMATION_MS, CHART_COLORS } from './theme'
import styles from './charts.module.css'

export interface WeeklyBar {
  /** ISO date the week starts on. */
  start: string
  value: number | null
  /** The week isn't over yet: drawn lighter and labelled "so far". */
  partial?: boolean
}

export interface WeeklyBarsProps {
  bars: WeeklyBar[]
  format: ValueFormat
  /** What the bars show, for screen readers: "Orders by week". */
  label: string
  /** A target drawn as a dashed line; bars that miss it turn red. */
  target?: number | null
  /** Which side of the target is good. Defaults to `higher`. */
  direction?: TargetDirection
  /** Height in px. Defaults to 180. */
  height?: number
  /** No axes, for small cards. */
  compact?: boolean
}

function barColor(bar: WeeklyBar, target: number | null | undefined, direction: TargetDirection): string {
  if (bar.value === null || typeof target !== 'number') return CHART_COLORS.ink
  const status = targetStatus(bar.value, target, direction)
  return status === 'off' ? CHART_COLORS.negative : status === 'near' ? CHART_COLORS.caution : CHART_COLORS.ink
}

/** One bar per week, the same weeks a scorecard reads, with the unfinished week drawn lighter. */
export function WeeklyBars({
  bars, format, label, target, direction = 'higher', height = 180, compact = false,
}: WeeklyBarsProps) {
  const reduceMotion = useReducedMotion()
  const values = bars.map(b => b.value)
  const padded = paddedDomain(extentOf(values, typeof target === 'number' ? [target] : []), { zero: true, pad: 0.04 })
  // Round ticks in the metric's format, with the axis ending on one ($0 / $50k / $100k, not $0 / $48k / $96.3k).
  const ticks = niceTicks(padded[0], padded[1], 4)
  const domain: [number, number] = [ticks[0], ticks[ticks.length - 1]]

  return (
    <div className={styles.trend} role="img" aria-label={describeSeries(label, values, format, 'weeks')}>
      <ResponsiveContainer width="100%" height={height} debounce={60}>
        <BarChart data={bars} margin={compact ? { top: 6, right: 2, bottom: 2, left: 2 } : { top: 8, right: 0, bottom: 0, left: 0 }}
          barCategoryGap="24%" accessibilityLayer={false}>
          <XAxis dataKey="start" hide={compact} tickLine={false} axisLine={{ stroke: CHART_COLORS.grid }} tick={AXIS_TICK}
            tickMargin={8} interval="preserveStartEnd" minTickGap={20} tickFormatter={d => formatDay(String(d))} />
          <YAxis hide={compact} orientation="right" width={48} tickLine={false} axisLine={false} tick={AXIS_TICK}
            domain={domain} ticks={ticks} tickFormatter={v => formatAxisValue(Number(v), format)} />
          {typeof target === 'number' && (
            <ReferenceLine y={target} stroke={CHART_COLORS.target} strokeDasharray="3 3" ifOverflow="extendDomain" />
          )}
          <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={40}
            isAnimationActive={!reduceMotion} animationDuration={CHART_ANIMATION_MS} animationEasing="ease-out">
            {bars.map(bar => (
              <Cell key={bar.start} fill={barColor(bar, target, direction)} fillOpacity={bar.partial ? 0.35 : 0.9} />
            ))}
          </Bar>
          <Tooltip
            cursor={{ fill: 'var(--neutral-100)', fillOpacity: 0.6 }}
            isAnimationActive={false}
            content={props => {
              const bar = props.active ? (props.payload?.[0]?.payload as WeeklyBar | undefined) : undefined
              if (!bar) return null
              return (
                <ChartTooltip
                  title={`Week of ${formatDay(bar.start)}${bar.partial ? ' (so far)' : ''}`}
                  rows={[
                    { key: 'v', label: 'Value', value: formatChartValueExact(bar.value, format), swatch: barColor(bar, target, direction) },
                    ...(typeof target === 'number' ? [{ key: 't', label: 'Target', value: formatChartValueExact(target, format), muted: true }] : []),
                  ]}
                />
              )
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
