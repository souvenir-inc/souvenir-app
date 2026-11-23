'use client'

import { Area, ComposedChart, Line, XAxis, YAxis } from 'recharts'
import { ChartContainer, type ChartConfig } from '@/components/ui/chart'
import { cn } from '@/lib/utils'
import type { Metric } from './types'

// Medium card chart (Figma "sparkline", 280×88): the current period as a solid line over a faint
// area, the comparison period as a dashed line, and a ringed dot on the latest point.

const config = {
  current:  { label: 'This period', color: 'var(--dashboard-chart-ink)' },
  previous: { label: 'Previous',    color: 'var(--dashboard-chart-compare)' },
} satisfies ChartConfig

interface SparklineProps {
  trend: Metric['trend']
  className?: string
}

export function Sparkline({ trend, className }: SparklineProps) {
  const rows = trend.current.map((current, i) => ({ i, current, previous: trend.previous[i] }))
  const last = rows.length - 1
  return (
    <ChartContainer config={config} className={cn('[&_.recharts-surface]:overflow-visible', className)} aria-hidden>
      {/* Top margin 6 keeps the latest point's dot inside the box, as in the Figma. */}
      <ComposedChart data={rows} margin={{ top: 6, right: 0, bottom: 0, left: 0 }}>
        <XAxis dataKey="i" hide />
        <YAxis hide domain={[0, 'dataMax']} />
        <Area
          dataKey="current" type="linear" stroke="none" fill="var(--dashboard-chart-area)" fillOpacity={1}
          isAnimationActive={false}
        />
        <Line
          dataKey="previous" type="linear" stroke="var(--color-previous)" strokeWidth={1}
          strokeDasharray="1.55 3.11" strokeLinecap="round" dot={false} activeDot={false} isAnimationActive={false}
        />
        <Line
          dataKey="current" type="linear" stroke="var(--color-current)" strokeWidth={1.5}
          strokeLinecap="round" strokeLinejoin="round" activeDot={false} isAnimationActive={false}
          dot={({ cx, cy, index }) =>
            index === last && cx != null && cy != null ? (
              <circle
                key="last" cx={cx} cy={cy} r={2.25}
                fill="var(--color-current)" stroke="var(--dashboard-card-bg)" strokeWidth={1.5}
              />
            ) : (
              <g key={index} />
            )
          }
        />
      </ComposedChart>
    </ChartContainer>
  )
}
