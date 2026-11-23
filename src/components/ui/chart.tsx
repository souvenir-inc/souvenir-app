'use client'

import React from 'react'
import { ResponsiveContainer, Tooltip, type TooltipContentProps } from 'recharts'
import { cn } from '@/lib/utils'

// Chart: the shadcn/ui chart layer over recharts. `ChartContainer` sizes the chart to its box and
// turns a `config` into CSS variables (`--color-<key>`), so series colours come from tokens and a
// chart can say `fill="var(--color-orders)"`. `ChartTooltipContent` is the shared tooltip card.
//
//   const config = { orders: { label: 'Orders', color: 'var(--dashboard-chart-ink)' } } satisfies ChartConfig
//   <ChartContainer config={config} className="h-[216px]">
//     <BarChart data={rows}><Bar dataKey="orders" fill="var(--color-orders)" /></BarChart>
//   </ChartContainer>

export type ChartConfig = Record<string, { label?: React.ReactNode; color?: string }>

const ChartContext = React.createContext<ChartConfig | null>(null)

export function useChartConfig(): ChartConfig {
  const config = React.useContext(ChartContext)
  if (!config) throw new Error('useChartConfig must be used inside <ChartContainer>')
  return config
}

export interface ChartContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  config: ChartConfig
  /** A single recharts chart element. */
  children: React.ReactElement
}

export function ChartContainer({ config, className, style, children, ...props }: ChartContainerProps) {
  const vars = Object.fromEntries(
    Object.entries(config).flatMap(([key, v]) => (v.color ? [[`--color-${key}`, v.color]] : [])),
  ) as React.CSSProperties
  return (
    <ChartContext.Provider value={config}>
      <div
        data-slot="chart"
        className={cn(
          'relative w-full min-w-0 text-[12px] leading-4',
          // recharts draws its own focus outline on the svg; the card already shows focus.
          '[&_.recharts-surface]:outline-none [&_.recharts-wrapper]:outline-none',
          className,
        )}
        style={{ ...vars, ...style }}
        {...props}
      >
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 1, height: 1 }}>
          {children}
        </ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  )
}

export const ChartTooltip = Tooltip

type ChartTooltipContentProps = Partial<TooltipContentProps<number, string>> & {
  /** Formats each value; defaults to the raw value. */
  valueFormatter?: (value: number) => string
  hideLabel?: boolean
}

/** The tooltip card: label on top, one row per series with its colour swatch. */
export function ChartTooltipContent({ active, payload, label, valueFormatter, hideLabel }: ChartTooltipContentProps) {
  const config = useChartConfig()
  if (!active || !payload?.length) return null
  return (
    <div className="pointer-events-none min-w-[120px] rounded-lg bg-[var(--popover-bg)] px-2.5 py-2 text-[12px] leading-4 shadow-[var(--shadow-popover)]">
      {!hideLabel && label != null && <p className="m-0 mb-1 font-medium text-[var(--neutral-900)]">{label}</p>}
      <div className="flex flex-col gap-1">
        {payload.map((item) => {
          const key = String(item.dataKey ?? item.name)
          const entry = config[key]
          const value = typeof item.value === 'number' ? item.value : Number(item.value)
          return (
            <div key={key} className="flex items-center gap-2">
              <span aria-hidden className="size-2 shrink-0 rounded-[2px]" style={{ background: entry?.color ?? item.color }} />
              <span className="flex-1 text-[var(--neutral-500)]">{entry?.label ?? item.name}</span>
              <span className="font-medium tabular-nums text-[var(--neutral-900)]">
                {valueFormatter ? valueFormatter(value) : value}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
