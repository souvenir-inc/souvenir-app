'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

// The chart readout (Figma "readout" 170:66889; CR-10 – CR-13): white, 10 px radius, a hairline
// ring and a soft shadow, 12 px text. It opens right of the pointer and flips to the left in the
// right half, so it never leaves the card or covers the dot.

/** Tracks an element's size (charts draw to it). */
export function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const read = () => setSize((s) => (s.width === el.clientWidth && s.height === el.clientHeight ? s : { width: el.clientWidth, height: el.clientHeight }))
    const ro = new ResizeObserver(read)
    ro.observe(el)
    read()
    return () => ro.disconnect()
  }, [])
  return [ref, size] as const
}

/**
 * Arrow keys through a chart's days or weeks, for a chart that is its own Tab stop (the metric
 * window's): ← → one at a time, Home / End to the ends, Esc stops; leaving the chart stops too.
 * `index` is null until a key is pressed; the first ← or → starts on the latest.
 */
export function useChartKeys(count: number) {
  const [index, setIndex] = useState<number | null>(null)
  const shown = index === null || count === 0 ? null : Math.min(index, count - 1)
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && shown !== null) { e.preventDefault(); e.stopPropagation(); setIndex(null); return }
    if (!count) return
    const last = count - 1
    const next = e.key === 'ArrowLeft' ? (shown === null ? last : Math.max(0, shown - 1))
      : e.key === 'ArrowRight' ? (shown === null ? last : Math.min(last, shown + 1))
      : e.key === 'Home' ? 0
      : e.key === 'End' ? last
      : null
    if (next === null) return
    e.preventDefault()
    setIndex(next)
  }
  return { index: shown, onKeyDown, onBlur: () => setIndex(null) }
}

/** A readout as one line for screen readers: "Thu 13 Nov: 13 Nov $7,500, Previous period · 6 Nov $6,900. +8.7% vs previous period". */
export function readoutText(content: ReadoutContent): string {
  const rows = content.rows.map((r) => `${r.label} ${r.value}`).join(', ')
  return `${content.title}: ${rows}${content.footer ? `. ${content.footer.text}` : ''}`
}

export interface ReadoutRow {
  /** The dot before the label: this period (ink), the period before (grey), a week in progress (soft). */
  dot?: 'ink' | 'previous' | 'soft' | 'met' | 'missed'
  label: string
  value: string
  muted?: boolean
}

export interface ReadoutContent {
  title: string
  rows: ReadoutRow[]
  /** Under a line: the change, green or red by which way is good for the metric. */
  footer?: { text: string; tone: 'good' | 'bad' | 'muted' }
}

const DOT: Record<NonNullable<ReadoutRow['dot']>, string> = {
  ink: 'bg-[var(--dashboard-chart-ink)]',
  previous: 'bg-[var(--dashboard-chart-previous)]',
  soft: 'bg-[var(--dashboard-chart-soft)]',
  met: 'bg-[var(--dashboard-positive)]',
  missed: 'bg-[var(--dashboard-negative)]',
}
const TONE = { good: 'text-[var(--dashboard-positive)]', bad: 'text-[var(--dashboard-negative)]', muted: 'text-[var(--dashboard-muted)]' }

interface ReadoutProps {
  content: ReadoutContent
  /** The hovered point, in the chart box's px. */
  x: number
  y: number
  /** The chart box, to keep the readout inside it. */
  width: number
  height: number
}

export function Readout({ content, x, y, width, height }: ReadoutProps) {
  const [ref, measured] = useSize<HTMLDivElement>()
  const w = measured.width || 200
  const h = measured.height || 90
  const flip = x > width / 2
  // Inside the chart's box, even on a narrow card.
  const left = Math.max(0, Math.min(width - w, flip ? x - 12 - w : x + 12))
  const top = Math.max(-8, Math.min(height - h, y - h / 2))
  return (
    <div
      ref={ref}
      // Seen, not announced: keyboard reading is announced once by its own status region
      // (readoutText), so one change is one announcement (A11Y-AN-06).
      aria-hidden
      data-readout
      className="pointer-events-none absolute z-10 flex min-w-[180px] flex-col gap-[var(--space-0-75)] whitespace-nowrap rounded-lg bg-[var(--dashboard-card-bg)] px-2.5 py-2 text-[length:var(--font-size-small)] leading-4 shadow-[var(--dashboard-readout-shadow)]"
      style={{ left, top }}
    >
      <p className="m-0 text-[var(--dashboard-label)]">{content.title}</p>
      {content.rows.map((r, i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <span className={cn('flex items-center gap-1.5', r.muted ? 'text-[var(--dashboard-muted)]' : 'text-[var(--dashboard-figure)]')}>
            {r.dot && <span aria-hidden className={cn('size-2 shrink-0 rounded-full', DOT[r.dot])} />}
            {r.label}
          </span>
          <span className={cn('font-medium', r.muted ? 'text-[var(--dashboard-muted)]' : 'text-[var(--dashboard-figure)]')}>{r.value}</span>
        </div>
      ))}
      {content.footer && (
        <p className={cn('m-0 border-0 border-t border-solid border-[var(--neutral-200)] pt-[var(--space-1-25)] text-right font-medium', TONE[content.footer.tone])}>
          {content.footer.text}
        </p>
      )}
    </div>
  )
}
