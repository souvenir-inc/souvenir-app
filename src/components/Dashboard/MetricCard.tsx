'use client'

import { m, useReducedMotion } from 'framer-motion'
import { ArrowDown, ArrowUp, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SourceMark } from './icons'
import { LazySparkline, LazyWeeklyBars } from './charts'
import type { CardSize, Metric } from './types'

// One metric card in three sizes (Figma 17:889):
//   sm  1×1  288×156  title, source, figure at the bottom
//   md  2×1  592×156  + sparkline in the right half
//   lg  2×2  592×328  figure under the title, legend, weekly bars below
// Reading the board the card is just the number (6D-1). In edit mode (6D-4, BS-18) it shows a ×
// in place of the source mark and a resize grip in the bottom-right corner.

export const SIZE_LABEL: Record<CardSize, string> = { sm: 'small', md: 'medium', lg: 'large' }

/** Handlers for the resize grip; BoardGrid owns the geometry (BS-19). */
export interface GripProps {
  onPointerDown: (e: React.PointerEvent) => void
  onKeyDown: (e: React.KeyboardEvent) => void
}

interface MetricCardProps {
  metric: Metric
  size: CardSize
  /** Lifted look while the card is being dragged or resized. */
  dragging?: boolean
  /** Edit mode: × and the resize grip (BS-18). */
  editing?: boolean
  onRemove?: () => void
  grip?: GripProps
  /** Numbers still loading: a shimmer where the figure and chart go (TAB-6). */
  loading?: boolean
  /** Place on the board; the numbers fade in card by card. */
  index?: number
  className?: string
}

export function MetricCard({ metric, size, dragging = false, editing = false, onRemove, grip, loading = false, index = 0, className }: MetricCardProps) {
  const reduceMotion = useReducedMotion()
  const chartBox = size === 'md' ? 'absolute bottom-4 left-1/2 right-4 top-[52px]' : 'absolute bottom-4 left-4 right-4 top-24'
  return (
    <article
      aria-label={metric.label}
      className={cn(
        'group/card relative size-full overflow-clip rounded-xl bg-[var(--dashboard-card-bg)]',
        'transition-shadow duration-base ease-standard',
        dragging ? 'shadow-[var(--dashboard-raised-shadow)]' : 'shadow-[var(--dashboard-card-shadow)]',
        className,
      )}
    >
      <h3 className="absolute left-4 right-12 top-4 m-0 truncate text-[13px] font-medium leading-5 text-[var(--dashboard-label)]">
        {metric.label}
      </h3>

      {/* Top right: the legend (large only), then the source mark, or the × in edit mode. */}
      <div className={cn('absolute flex items-center gap-3', editing ? 'right-3 top-3 h-6' : 'right-4 top-4 h-5')}>
        {size === 'lg' && (
          <div className="flex items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-[2px] bg-[var(--dashboard-chart-soft)]" />
            <span className="whitespace-nowrap text-[12px] leading-4 text-[var(--dashboard-muted)]">Week in progress</span>
          </div>
        )}
        {editing ? (
          // eslint-disable-next-line no-restricted-syntax -- ds-allow: the card's 24px raised × of Figma 75:21094 (white, 6px radius, hairline ring)
          <button
            type="button"
            aria-label={`Remove ${metric.label}`}
            data-no-drag // never starts a card drag
            onClick={onRemove}
            className={cn(
              'flex size-6 cursor-pointer items-center justify-center rounded-md border-0 bg-[var(--dashboard-card-bg)] p-0 text-[var(--dashboard-label)]',
              'shadow-[var(--dashboard-control-shadow)] transition-colors duration-fast hover:bg-[var(--neutral-100)] hover:text-[var(--dashboard-figure)]',
              'outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-[var(--focus-ring)]',
            )}
          >
            <X aria-hidden size={14} strokeWidth={1.5} absoluteStrokeWidth />
          </button>
        ) : (
          <SourceMark source={metric.source} className="block size-3.5" />
        )}
      </div>

      {loading ? (
        // Names show at once; a soft shimmer where each figure and chart goes (TAB-6).
        <div aria-hidden>
          <span className={cn('kaya-skeleton absolute left-4 h-7 w-28 rounded-md', size === 'lg' ? 'top-12' : 'bottom-[18px]')} />
          {size !== 'sm' && <span className={cn('kaya-skeleton rounded-lg opacity-40', chartBox)} />}
        </div>
      ) : (
        <m.div
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25, delay: Math.min(index, 12) * 0.04 }}
        >
          <Figure metric={metric} className={size === 'lg' ? 'top-11' : 'bottom-4'} />
          {size === 'md' && <LazySparkline trend={metric.trend} className={cn(chartBox, '!w-auto')} />}
          {size === 'lg' && <LazyWeeklyBars metric={metric} className={cn(chartBox, '!w-auto')} />}
        </m.div>
      )}

      {editing && grip && (
        // The resize grip: two diagonal strokes in the corner (Figma 75:21098). Drag it, or use the
        // arrow keys: → / ← wider or narrower, ↓ / ↑ taller or shorter (BS-19).
        <span
          role="slider"
          data-no-drag // the grip resizes; it never starts a move
          tabIndex={0}
          aria-label={`Resize ${metric.label}`}
          aria-valuetext={SIZE_LABEL[size]}
          aria-valuemin={1}
          aria-valuemax={3}
          aria-valuenow={size === 'sm' ? 1 : size === 'md' ? 2 : 3}
          onPointerDown={grip.onPointerDown}
          onKeyDown={grip.onKeyDown}
          className={cn(
            'absolute bottom-0 right-0 z-10 flex size-7 cursor-nwse-resize touch-none items-center justify-center rounded text-[var(--neutral-400)] hover:text-[var(--dashboard-figure)]',
            'outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-[var(--focus-ring)]',
          )}
        >
          <svg aria-hidden width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M10.5 3.5 3.5 10.5" />
            <path d="M10.5 7.5 7.5 10.5" />
          </svg>
        </span>
      )}
    </article>
  )
}

function Figure({ metric, className }: { metric: Metric; className?: string }) {
  const { change } = metric
  const Arrow = change.direction === 'up' ? ArrowUp : ArrowDown
  return (
    <div className={cn('absolute left-4 flex items-baseline gap-2', className)}>
      <p className="m-0 whitespace-nowrap text-[28px] font-medium leading-8 tracking-[-0.56px] text-[var(--dashboard-figure)]">
        {metric.value}
      </p>
      <p
        className={cn(
          'm-0 flex items-center gap-0.5 whitespace-nowrap text-[12px] font-medium leading-4',
          change.sentiment === 'positive' ? 'text-[var(--dashboard-positive)]' : 'text-[var(--dashboard-negative)]',
        )}
      >
        <Arrow aria-hidden size={10} strokeWidth={1.75} absoluteStrokeWidth className="shrink-0" />
        <span className="sr-only">{change.direction === 'up' ? 'Up' : 'Down'} </span>
        {change.label}
        <span className="sr-only"> vs previous period</span>
      </p>
    </div>
  )
}
