'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { formatMetricValue } from '../format'
import { changeLabel, dayMonth, formatExact, upIsGood, weekdayDayMonth, type Series } from '../series'
import type { Metric } from '../types'
import { Readout, useSize, type ReadoutContent } from './Readout'

// A card's line (05-cards-reading-rules.md):
//   full   the full chart (CR-3): round ticks on the right, dashed gridlines, the period before
//          dashed and grey, a soft area, a dot per day (up to 45), the latest value labelled,
//          dates under it; a target as a dashed line with met / missed dots (CR-13).
//   spark  the line beside or under a number (CR-4): no axes, the period before faint behind it.
// Both answer hover one day at a time with a readout (CR-10, CR-12). With three days or fewer
// every value is labelled and the period before is faint dots; under two days, one line of
// words instead (CR-24).

const TICKS_W = 48
const DATES_H = 24
const PAD = 12

export interface LineChartProps {
  metric: Metric
  series: Series
  variant: 'full' | 'spark'
  /** A target per day, drawn as a dashed line (CR-13). */
  target?: number
  className?: string
}

export function LineChart({ metric, series, variant, target, className }: LineChartProps) {
  const [ref, { width, height }] = useSize<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const full = variant === 'full'
  return (
    <div ref={ref} className={cn('relative', className)} data-chart={variant} onPointerLeave={() => setHover(null)}>
      {series.daysWithData < 2 ? (
        <p className="m-0 flex h-full items-center text-[13px] leading-5 text-[var(--dashboard-muted)]">
          Not enough days with data to show a trend
        </p>
      ) : width > 0 ? (
        <Plot metric={metric} series={series} full={full} target={target} width={width} height={height} hover={hover} onHover={setHover} />
      ) : null}
    </div>
  )
}

interface PlotProps {
  metric: Metric
  series: Series
  full: boolean
  target?: number
  width: number
  height: number
  hover: number | null
  onHover: (i: number | null) => void
}

function Plot({ metric, series, full, target, width, height, hover, onHover }: PlotProps) {
  const n = series.days.length
  const plotW = full ? width - TICKS_W : width
  const plotH = Math.max(0, full ? height - DATES_H : height)
  const pad = full ? PAD : 2
  const top = full ? 0 : 6
  const cur = series.days.map((d) => d.value)
  const prev = series.comparable ? series.previous.map((d) => d.value) : series.previous.map(() => null)
  const values = [...cur, ...prev, target ?? null].filter((v): v is number => v != null)
  // The full chart counts from 0 with round ticks; a sparkline uses its own range so its shape shows.
  const hi = Math.max(...values)
  const lo = Math.min(...values)
  const spread = hi - lo || Math.abs(hi) || 1
  const max = full ? roundStep(hi / 4) * 4 : hi + spread * 0.08
  const min = full ? 0 : Math.max(0, lo - spread * 0.6)
  const x = (i: number) => (n === 1 ? plotW / 2 : pad + (i * (plotW - pad * 2)) / (n - 1))
  const y = (v: number) => top + (plotH - top) * (1 - (v - min) / (max - min))
  const few = series.daysWithData <= 3
  const good = upIsGood(metric.change)
  const met = (v: number) => (target == null ? null : good ? v >= target : v <= target)

  const path = (vals: (number | null)[]) => {
    let d = ''
    let open = false
    vals.forEach((v, i) => {
      if (v == null) { open = false; return }
      d += `${open ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`
      open = true
    })
    return d
  }
  const area = (vals: (number | null)[]) => {
    // One closed shape per run of days with data, down to the baseline.
    const runs: number[][] = []
    vals.forEach((v, i) => { if (v == null) return; const last = runs[runs.length - 1]; if (last && last[last.length - 1] === i - 1) last.push(i); else runs.push([i]) })
    return runs.map((r) => `M${x(r[0])},${y(min)}` + r.map((i) => `L${x(i).toFixed(1)},${y(vals[i]!).toFixed(1)}`).join('') + `L${x(r[r.length - 1])},${y(min)}Z`).join('')
  }
  const lastIndex = cur.reduce<number>((acc, v, i) => (v != null ? i : acc), -1)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max)
  const dateIdx = pickDates(n, plotW)

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const i = n === 1 ? 0 : Math.round(((e.clientX - r.left - pad) / (plotW - pad * 2)) * (n - 1))
    onHover(Math.max(0, Math.min(n - 1, i)))
  }

  return (
    <div className="absolute inset-0">
      {height > 0 && (
        <svg width={width} height={height} className="block overflow-visible" aria-hidden>
          {full && ticks.map((t) => (
            <g key={t}>
              <line x1={0} x2={plotW} y1={y(t)} y2={y(t)} stroke="var(--dashboard-chart-soft)" strokeDasharray="2 3" />
              <text x={plotW + 10} y={y(t) + 4} fontSize={12} fill="var(--dashboard-muted)">{formatMetricValue(t, metric.format)}</text>
            </g>
          ))}
          {/* The period before: dashed grey on the full chart, a faint line on a sparkline; faint
              dots when there are only a few days (CR-24). */}
          {few
            ? prev.map((v, i) => v != null && <circle key={`p${i}`} cx={x(i)} cy={y(v)} r={2} fill="var(--dashboard-chart-previous)" />)
            : <path d={path(prev)} fill="none" stroke="var(--dashboard-chart-previous)" strokeWidth={full ? 1.25 : 1} strokeDasharray={full ? '3 3' : undefined} strokeLinecap="round" />}
          <path d={area(cur)} fill="var(--dashboard-chart-area)" />
          <path d={path(cur)} fill="none" stroke="var(--dashboard-chart-ink)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
          {full && target != null && (
            <g data-target-line>
              <line x1={0} x2={plotW} y1={y(target)} y2={y(target)} stroke="var(--dashboard-muted)" strokeDasharray="4 3" />
              <text x={4} y={y(target) - 5} fontSize={11} fill="var(--dashboard-muted)">Target {formatMetricValue(target, metric.format)}</text>
            </g>
          )}
          {/* A dot per day (up to about 45), green or red against a target; the last one bigger. */}
          {cur.map((v, i) => {
            if (v == null) return null
            const isLast = i === lastIndex
            if (!full && !isLast) return null
            if (full && n > 45 && !isLast) return null
            const m = met(v)
            const fill = m == null ? 'var(--dashboard-chart-ink)' : m ? 'var(--dashboard-positive)' : 'var(--dashboard-negative)'
            return <circle key={i} cx={x(i)} cy={y(v)} r={isLast ? 3.5 : 2.25} fill={fill} stroke="var(--dashboard-card-bg)" strokeWidth={1.5} />
          })}
          {/* Labels: the latest value, or every value when there are three days or fewer. */}
          {full && cur.map((v, i) => (v != null && (few || i === lastIndex)) && (
            <text key={`l${i}`} x={x(i) + (i === lastIndex ? 4 : 0)} y={y(v) - 10} fontSize={11} fontWeight={500} textAnchor={i === lastIndex ? 'end' : 'middle'} fill="var(--dashboard-figure)">
              {formatMetricValue(v, metric.format)}
            </text>
          ))}
          {full && dateIdx.map((i) => (
            <text key={`d${i}`} x={x(i)} y={plotH + 20} fontSize={12} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} fill="var(--dashboard-muted)" dx={i === 0 ? -4 : i === n - 1 ? 4 : 0}>
              {dayMonth(series.days[i].date)}
            </text>
          ))}
          {/* Hover: a hairline on the day and a ring on the line (CR-10). */}
          {hover != null && (
            <g data-hover-day={hover}>
              <line x1={x(hover)} x2={x(hover)} y1={top} y2={plotH} stroke="var(--dashboard-hover-line)" />
              {cur[hover] != null && <circle cx={x(hover)} cy={y(cur[hover]!)} r={4.5} fill="var(--dashboard-card-bg)" stroke="var(--dashboard-chart-ink)" strokeWidth={1.5} />}
            </g>
          )}
          <rect x={0} y={0} width={plotW} height={plotH} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} style={{ touchAction: 'pan-y' }} />
        </svg>
      )}
      {hover != null && (
        <Readout
          content={readoutFor(metric, series, hover, full, target)}
          x={x(hover)} y={cur[hover] != null ? y(cur[hover]!) : plotH / 2}
          width={width} height={height}
        />
      )}
    </div>
  )
}

/** Which days get a date under the full chart: the first, the last, and evenly between. */
export function pickDates(n: number, plotW: number): number[] {
  // About 150 px a date: 4 on a 6-wide card (8, 10, 12, 14 Nov), all 7 on a 12-wide one (Figma).
  const fit = Math.max(2, Math.floor(plotW / 150) + 1)
  if (n <= fit) return Array.from({ length: n }, (_, i) => i)
  const step = Math.ceil((n - 1) / (fit - 1))
  const out: number[] = []
  for (let i = 0; i < n - 1; i += step) out.push(i)
  if (n - 1 - out[out.length - 1] < step / 2) out.pop()
  out.push(n - 1)
  return out
}

/** What the readout says for day `i` (CR-10, CR-12, CR-13, CR-14). */
export function readoutFor(metric: Metric, series: Series, i: number, withChange: boolean, target?: number): ReadoutContent {
  const d = series.days[i]
  const p = series.comparable ? series.previous[i] : undefined
  const exact = (v: number) => formatExact(v, metric.format)
  const good = upIsGood(metric.change)
  const met = target == null || d.value == null ? null : good ? d.value >= target : d.value <= target
  const firstData = series.days.findIndex((x) => x.value != null)
  const rows: ReadoutContent['rows'] = [{
    dot: met == null ? 'ink' : met ? 'met' : 'missed',
    label: dayMonth(d.date),
    // Never a 0: a day after the app's last sync is "No data yet", a day without data "No data".
    value: d.value != null ? exact(d.value) : i > firstData ? 'No data yet' : 'No data',
  }]
  const lastYear = series.compare === 'last-year'
  if (p) rows.push({ dot: 'previous', label: lastYear ? `Last year · ${dayMonth(p.date)} ${p.date.getFullYear()}` : `Previous period · ${dayMonth(p.date)}`, value: p.value != null ? exact(p.value) : 'No data', muted: true })
  if (target != null && met != null) rows.push({ label: `Target ${exact(target)}`, value: met ? 'Met' : 'Missed', muted: true })
  let footer: ReadoutContent['footer']
  if (withChange && p?.value != null && d.value != null) {
    const text = changeLabel(d.value, p.value)
    const rising = d.value >= p.value
    footer = { text: `${text} vs ${lastYear ? 'last year' : 'previous period'}`, tone: rising === good ? 'good' : 'bad' }
  }
  return { title: weekdayDayMonth(d.date), rows, footer }
}

/** A round tick step at or above v: 1, 1.5, 2, 2.5 or 5 times a power of ten (2.5k gives 0 – 10k; 15 gives 0 – 60). */
export function roundStep(v: number): number {
  if (!(v > 0)) return 1
  const exp = 10 ** Math.floor(Math.log10(v))
  const f = v / exp
  return (f <= 1 ? 1 : f <= 1.5 ? 1.5 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * exp
}
