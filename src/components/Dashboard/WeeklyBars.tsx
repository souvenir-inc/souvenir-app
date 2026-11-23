'use client'

import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { cn } from '@/lib/utils'
import { formatMetricValue, niceMax } from './format'
import type { Metric } from './types'

// Large card chart (Figma "chart · weekly bars", 560×216): five 44px bars on a 524px plot, a
// solid baseline, dashed mid and top gridlines, and the axis labels on the right. The
// unfinished week is drawn in the soft colour.

const TICK = { fill: 'var(--dashboard-muted)', fontSize: 12 }

interface WeeklyBarsProps {
  metric: Metric
  className?: string
}

export function WeeklyBars({ metric, className }: WeeklyBarsProps) {
  const max = niceMax(Math.max(...metric.weekly.map((w) => w.value)))
  const config = { value: { label: metric.label, color: 'var(--dashboard-chart-ink)' } } satisfies ChartConfig
  const fmt = (v: number) => formatMetricValue(v, metric.format)
  return (
    <ChartContainer config={config} className={cn('[&_.recharts-surface]:overflow-visible', className)}>
      <BarChart data={metric.weekly} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--dashboard-chart-soft)" strokeDasharray="2 3" />
        <XAxis
          dataKey="week" interval={0} height={24} tick={TICK}
          tickLine={false} tickSize={0} tickMargin={8}
          axisLine={{ stroke: 'var(--dashboard-chart-soft)' }}
        />
        <YAxis
          orientation="right" width={36} domain={[0, max]} ticks={[0, max / 2, max]} tick={TICK}
          tickLine={false} tickSize={0} tickMargin={10} axisLine={false}
          tickFormatter={fmt}
        />
        <ChartTooltip
          cursor={{ fill: 'var(--dashboard-chart-area)' }}
          content={<ChartTooltipContent valueFormatter={fmt} />}
        />
        <Bar dataKey="value" barSize={44} radius={[4, 4, 0, 0]} isAnimationActive={false}>
          {metric.weekly.map((w) => (
            <Cell key={w.week} fill={w.inProgress ? 'var(--dashboard-chart-soft)' : 'var(--color-value)'} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}
