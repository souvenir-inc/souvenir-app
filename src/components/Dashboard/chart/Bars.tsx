'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { formatMetricValue, niceMax } from '../format'
import { changeLabel, dayMonth, formatExact, weekInfo } from '../series'
import type { Metric } from '../types'
import { Readout, useSize, type ReadoutContent } from './Readout'

// Weekly bars for a sum or count (05-cards-reading-rules.md CR-2, CR-11):
//   full     ticks on the right (0, half, max), a solid baseline, dashed gridlines, the week labels
//            under it; 44 px bars (Figma "chart · weekly bars", 560 × 216).
//   compact  the 6 × 1 card: 36 px bars, no axes (Figma "chart · weekly bars (compact)").
// The week still filling in is the lighter bar. Hover: a soft band behind the week and a readout
// per week against the week before; the week in progress reads "so far".

const TICKS_W = 36
const LABELS_H = 24

export function WeeklyBars({ metric, variant, className }: { metric: Metric; variant: 'full' | 'compact'; className?: string }) {
  const [ref, { width, height }] = useSize<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const full = variant === 'full'
  const weeks = metric.weekly
  const n = weeks.length
  const plotW = full ? width - TICKS_W : width
  const plotH = Math.max(0, full ? height - LABELS_H : height)
  // A week below 0 draws as an empty week; the scale is the weeks above it.
  const values = weeks.map((w) => Math.max(0, w.value ?? 0))
  const top = Math.max(...values, 0)
  const max = full ? (top > 0 ? niceMax(top) : 1) : top * 1.13 || 1
  // Every week empty: say so rather than draw axes with no bars.
  const empty = weeks.every((w) => w.value == null)
  const band = plotW / n
  const barW = full ? 44 : 36
  const cx = (i: number) => (full ? band * i + band / 2 : n === 1 ? plotW / 2 : barW / 2 + (i * (plotW - barW)) / (n - 1))
  const y = (v: number) => plotH * (1 - v / max)
  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - r.left
    let best = 0
    for (let i = 1; i < n; i++) if (Math.abs(cx(i) - px) < Math.abs(cx(best) - px)) best = i
    setHover(best)
  }
  return (
    <div ref={ref} className={cn('relative', className)} data-chart={`bars-${variant}`} onPointerLeave={() => setHover(null)}>
      {empty && (
        <p data-chart-empty className="m-0 flex h-full items-center text-[13px] leading-5 text-[var(--dashboard-muted)]">No weeks with data yet</p>
      )}
      {!empty && width > 0 && height > 0 && (
        <svg width={width} height={height} className="block overflow-visible" aria-hidden>
          {full && (top > 0 ? [0, max / 2, max] : [0]).map((t) => (
            <g key={t}>
              <line x1={0} x2={plotW} y1={y(t)} y2={y(t)} stroke="var(--dashboard-chart-soft)" strokeDasharray={t === 0 ? undefined : '2 3'} />
              <text x={plotW + 10} y={y(t) + 4} fontSize={12} fill="var(--dashboard-muted)">{formatMetricValue(t, metric.format)}</text>
            </g>
          ))}
          {hover != null && (
            <rect data-hover-week={hover} x={cx(hover) - (full ? 32 : 24)} y={0} width={full ? 64 : 48} height={plotH} rx={4} fill="var(--dashboard-hover-band)" />
          )}
          {weeks.map((w, i) => {
            const h = plotH - y(Math.max(0, w.value ?? 0))
            return (
              <path
                key={w.start.getTime()}
                d={roundedTop(cx(i) - barW / 2, y(Math.max(0, w.value ?? 0)), barW, h, full ? 4 : 3)}
                fill={w.inProgress ? 'var(--dashboard-chart-soft)' : 'var(--dashboard-chart-ink)'}
              />
            )
          })}
          {full && weeks.map((w, i) => (
            <text key={`l${w.start.getTime()}`} x={cx(i)} y={plotH + 20} fontSize={12} textAnchor="middle" fill="var(--dashboard-muted)">{dayMonth(w.start)}</text>
          ))}
          <rect x={0} y={0} width={plotW} height={plotH} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} style={{ touchAction: 'pan-y' }} />
        </svg>
      )}
      {hover != null && (
        <Readout content={weekReadout(metric, hover)} x={cx(hover) + (cx(hover) > width / 2 ? -barW / 2 : barW / 2)} y={y(Math.max(0, weeks[hover].value ?? 0))} width={width} height={height} />
      )}
    </div>
  )
}

/** A bar with its top corners rounded. */
function roundedTop(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, h / 2, w / 2)
  if (h <= 0) return ''
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`
}

/** What the readout says for week `i` (CR-11). */
export function weekReadout(metric: Metric, i: number): ReadoutContent {
  const w = metric.weekly[i]
  const info = weekInfo(w)
  const value = w.value === null ? 'No data' : formatExact(w.value, metric.format)
  const row = { dot: w.inProgress ? 'soft' as const : 'ink' as const, label: info.range, value }
  const before = metric.weekly[i - 1]?.value ?? null
  // A week in progress isn't set against a whole week: its number is "so far".
  if (w.inProgress || w.value === null || before === null) return { title: info.title, rows: [row] }
  return {
    title: info.title,
    rows: [row],
    footer: { text: `${changeLabel(w.value, before)} vs the week before`, tone: (w.value >= before) === metric.upIsGood ? 'good' : 'bad' },
  }
}
