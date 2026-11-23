'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { m, useReducedMotion } from 'framer-motion'
import { ArrowDown, ArrowUp, Lock, X } from 'lucide-react'
import { Tooltip } from '@/components/Tooltip'
import { cn } from '@/lib/utils'
import { opens, type CardBody, type HealthPill } from './card-states'
import { WeeklyBars } from './chart/Bars'
import { LineChart } from './chart/LineChart'
import { SourceMark } from './icons'
import type { Series } from './series'
import type { CardSize, Metric } from './types'

// One metric card (Figma 17:889, 05-cards-reading-rules.md). What it shows follows its size (CR-1):
//   sm       3×1  288×156  the number and its change
//   sm-tall  3×2  288×328  the number at the top, its line below
//   md       6×1  592×156  the number, its line (or compact weekly bars) beside it
//   lg       6×2  592×328  the number, the full chart (or weekly bars)
//   full     12×1          the number, a wide line
//   full-lg  12×2          the number, the full chart with its legend
// Reading the board the whole card is a button that opens its metric window (CR-6 – CR-8); empty
// and locked cards don't open (CR-18). In edit mode it shows a × in place of the logo and a resize
// grip in the bottom-right corner (BS-18).

export const SIZE_LABEL: Record<CardSize, string> = {
  sm: 'small', 'sm-tall': 'small, tall', md: 'wide', lg: 'medium', full: 'full width', 'full-lg': 'large',
}
const SIZE_LEVEL: Record<CardSize, number> = { sm: 1, 'sm-tall': 2, md: 3, lg: 4, full: 5, 'full-lg': 6 }
const TALL: CardSize[] = ['sm-tall', 'lg', 'full-lg']
const WIDE: CardSize[] = ['md', 'lg', 'full', 'full-lg']

/** Handlers for the resize grip; BoardGrid owns the geometry (BS-19). */
export interface GripProps {
  onPointerDown: (e: React.PointerEvent) => void
  onKeyDown: (e: React.KeyboardEvent) => void
}

/** How a card reads right now, worked out by the screen (sync, scenarios, health). */
export interface CardView {
  body: CardBody
  /** Its app failed or is behind (SY-23), and what hovering the dot says (CR-25). */
  dot?: { tone: 'failed' | 'behind'; tip: string }
  /** Its app is syncing: the number shimmers (SY-24). */
  syncing?: boolean
  series?: Series
  health?: HealthPill | null
  /** A target per day for the full chart (CR-13). */
  targetPerDay?: number
  /** People who can edit get Remove card on an empty card (CR-22). */
  canEdit?: boolean
}

interface MetricCardProps {
  metric: Metric
  size: CardSize
  view?: CardView
  /** Lifted look while the card is being dragged or resized. */
  dragging?: boolean
  /** Edit mode: × and the resize grip (BS-18). */
  editing?: boolean
  onRemove?: () => void
  grip?: GripProps
  /** Opens the metric window (CR-7); left out in edit mode and for the drag copy. */
  onOpen?: () => void
  /** Try again on a card that couldn't load (CR-20). */
  onRetry?: () => void
  /** Place on the board; the numbers fade in card by card. */
  index?: number
  className?: string
}

export function MetricCard({ metric, size, view, dragging = false, editing = false, onRemove, grip, onOpen, onRetry, index = 0, className }: MetricCardProps) {
  const body = view?.body ?? 'numbers'
  const openable = !!onOpen && !editing && opens(body)
  const tall = TALL.includes(size)
  const wide = WIDE.includes(size)
  const change = `${metric.change.direction === 'up' ? 'up' : 'down'} ${metric.change.label}`
  const label = openable
    ? `${metric.label}, ${body === 'today-empty' ? 'no data yet' : `${metric.value}, ${view?.series && !view.series.comparable ? 'no comparison' : change}`}${view?.dot ? `, ${view.dot.tip}` : ''}. Open`
    : metric.label
  return (
    <article
      aria-label={label}
      data-card-body={body}
      role={openable ? 'button' : undefined}
      tabIndex={openable ? 0 : undefined}
      onClick={openable ? onOpen : undefined}
      onKeyDown={openable ? (e) => {
        if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
        e.preventDefault()
        onOpen?.()
      } : undefined}
      className={cn(
        'group/card relative size-full overflow-clip rounded-xl bg-[var(--dashboard-card-bg)]',
        'transition-shadow duration-base ease-standard',
        dragging ? 'shadow-[var(--dashboard-raised-shadow)]' : 'shadow-[var(--dashboard-card-shadow)]',
        // Hover lifts the card a little; the pointer is a hand anywhere on it (CR-6). Focus: a 2 px
        // ring 4 px outside the card (CR-8).
        openable && 'cursor-pointer hover:shadow-[var(--dashboard-card-hover-shadow)] outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-solid focus-visible:outline-[var(--focus-ring)]',
        className,
      )}
    >
      <div className={cn('absolute left-4 top-4 flex h-5 min-w-0 items-center gap-1.5', editing ? 'right-12' : metric.alsoFrom ? 'right-[60px]' : 'right-10', size === 'full-lg' && !editing && 'right-[230px]', size === 'lg' && metric.bars && !editing && 'right-[150px]')}>
        <Title text={metric.label} />
        {view?.dot && body !== 'locked' && <SyncDot tone={view.dot.tone} tip={view.dot.tip} />}
      </div>

      {/* Top right: the legend (wide charts), then the app logo(s), or the × in edit mode. */}
      <div className={cn('absolute flex items-center gap-3', editing ? 'right-3 top-3 h-6' : 'right-4 top-4 h-5')}>
        {body === 'numbers' && size === 'lg' && metric.bars && <Legend items={[['soft', 'Week in progress']]} />}
        {body === 'numbers' && size === 'full-lg' && (metric.bars ? <Legend items={[['soft', 'Week in progress']]} /> : <Legend items={[['ink', 'This period'], ['previous', 'Previous period']]} />)}
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
        ) : !metric.unmeasured && (
          <span className="flex items-center gap-1.5">
            <SourceMark source={metric.source} className="block size-3.5" />
            {metric.alsoFrom && <SourceMark source={metric.alsoFrom} className="block size-3.5" />}
          </span>
        )}
      </div>

      <Body
        metric={metric} size={size} view={view} body={body} tall={tall} wide={wide} index={index}
        onRetry={onRetry} onRemove={onRemove}
      />

      {editing && grip && (
        // The resize grip: two diagonal strokes in the corner (Figma 75:21098). Drag it, or use the
        // arrow keys: → / ← wider or narrower, ↓ / ↑ taller or shorter (BS-19). Hidden on the
        // narrow layout (CR-36).
        <span
          role="slider"
          data-no-drag // the grip resizes; it never starts a move
          tabIndex={0}
          aria-label={`Resize ${metric.label}`}
          aria-valuetext={SIZE_LABEL[size]}
          aria-valuemin={1}
          aria-valuemax={6}
          aria-valuenow={SIZE_LEVEL[size]}
          onPointerDown={grip.onPointerDown}
          onKeyDown={grip.onKeyDown}
          className={cn(
            'absolute bottom-0 right-0 z-10 hidden size-7 cursor-nwse-resize touch-none items-center justify-center rounded text-[var(--neutral-400)] hover:text-[var(--dashboard-figure)] @min-[60rem]:flex',
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

interface BodyProps {
  metric: Metric
  size: CardSize
  view?: CardView
  body: CardBody
  tall: boolean
  wide: boolean
  index: number
  onRetry?: () => void
  onRemove?: () => void
}

function Body({ metric, size, view, body, tall, wide, index, onRetry, onRemove }: BodyProps) {
  const reduceMotion = useReducedMotion()
  const chartBox = chartBoxFor(size, metric)
  const figureAt = tall ? 'top-11' : view?.health && body === 'numbers' && !tall ? 'bottom-[46px]' : 'bottom-4'

  if (body === 'loading') {
    // The title and logo show at once; the number and chart shimmer in their own shapes (CR-19).
    return (
      <div aria-hidden>
        <span className={cn('dashboard-shape-shimmer absolute left-4 h-7 w-28 rounded-md', tall ? 'top-12' : 'bottom-[18px]')} />
        {chartBox && <span className={cn('dashboard-shape-shimmer rounded-lg opacity-40', chartBox)} />}
      </div>
    )
  }

  if (body !== 'numbers' && body !== 'today-empty') {
    return <EmptyBody body={body} canEdit={!!view?.canEdit} onRetry={onRetry} onRemove={onRemove} tall={tall} />
  }

  if (body === 'today-empty') {
    // On Today, an app that hasn't synced today: a dash, never a 0 (CR-26).
    return (
      <div className={cn('absolute left-4 flex items-end gap-2', figureAt)}>
        <p className="m-0 text-[28px] font-medium leading-8 text-[var(--dashboard-muted)]">—</p>
        <p className="m-0 pb-1.5 text-[12px] leading-4 text-[var(--dashboard-muted)]">{wide ? 'No data for today yet' : 'No data yet'}</p>
      </div>
    )
  }

  const series = view?.series
  return (
    <m.div
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25, delay: Math.min(index, 12) * 0.04 }}
    >
      <Figure metric={metric} syncing={!!view?.syncing} comparable={series?.comparable ?? true} className={figureAt} inlinePill={tall && size !== 'sm-tall' ? view?.health : undefined} />
      {view?.health && (!tall || size === 'sm-tall') && (
        <div className={cn('absolute left-4 flex items-center gap-2', size === 'sm-tall' ? 'top-[84px]' : 'bottom-4')}>
          <HealthPillView pill={view.health} withTarget={wide} />
        </div>
      )}
      {series && chartBox && (
        metric.bars && size !== 'sm-tall' && size !== 'full'
          ? <WeeklyBars metric={metric} variant={size === 'md' ? 'compact' : 'full'} className={chartBox} />
          : <LineChart metric={metric} series={series} variant={tall && size !== 'sm-tall' ? 'full' : 'spark'} target={view?.targetPerDay} className={chartBox} />
      )}
    </m.div>
  )
}

/** Where the chart goes, by size (Figma 170:40175). */
function chartBoxFor(size: CardSize, metric: Metric): string | null {
  switch (size) {
    case 'sm': return null
    case 'sm-tall': return 'absolute bottom-4 left-4 right-4 top-[144px]'
    case 'md': return metric.bars ? 'absolute bottom-4 left-[52.7%] right-4 top-[52px]' : 'absolute bottom-4 left-1/2 right-4 top-[52px]'
    case 'full': return 'absolute bottom-4 left-[320px] right-4 top-[52px]'
    default: return 'absolute bottom-4 left-4 right-4 top-24'
  }
}

const EMPTY_TEXT: Record<Exclude<CardBody, 'loading' | 'numbers' | 'today-empty'>, string> = {
  removed: 'This metric was removed.',
  locked: 'No access',
  'no-data-yet': 'No data yet',
  'couldnt-load': 'Couldn’t load.',
  'no-data': 'No data',
}

/** Empty, failed and locked cards (CR-20 – CR-23): one line where the number goes, and maybe a link. */
function EmptyBody({ body, canEdit, onRetry, onRemove, tall }: { body: CardBody; canEdit: boolean; onRetry?: () => void; onRemove?: () => void; tall: boolean }) {
  const where = cn('absolute left-4 flex flex-col items-start gap-1 text-[13px] leading-[17px] text-[var(--dashboard-figure)]', tall ? 'top-11' : 'bottom-4')
  if (body === 'locked') {
    return (
      <div className={where}>
        <Tooltip content="Ask the board’s owner for access" side="top" align="start">
          <span tabIndex={0} className="flex items-center gap-1.5 rounded-sm text-[var(--dashboard-label)] outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-[var(--focus-ring)]">
            <Lock aria-hidden size={14} strokeWidth={1.5} absoluteStrokeWidth />No access
          </span>
        </Tooltip>
      </div>
    )
  }
  const text = EMPTY_TEXT[body as keyof typeof EMPTY_TEXT]
  // Try again is for everyone; Remove card only for people who can edit (CR-20, CR-22).
  const action = body === 'couldnt-load' ? { label: 'Try again', run: onRetry } : canEdit ? { label: 'Remove card', run: onRemove } : null
  return (
    <div className={where}>
      <p className="m-0">{text}</p>
      {action?.run && (
        // eslint-disable-next-line no-restricted-syntax -- ds-allow: the card's underlined text action (Figma 170:89079)
        <button
          type="button"
          data-no-drag
          onClick={(e) => { e.stopPropagation(); action.run?.() }}
          className="cursor-pointer rounded-sm border-0 bg-transparent p-0 text-[13px] leading-[17px] text-[var(--dashboard-figure)] underline underline-offset-2 outline-none hover:text-[var(--dashboard-label)] focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-[var(--focus-ring)]"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

/** The title, cut with "…" and shown in full on hover when it doesn't fit (CR-9). */
function Title({ text }: { text: string }) {
  const ref = useRef<HTMLHeadingElement>(null)
  const [cut, setCut] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setCut(el.scrollWidth > el.clientWidth + 0.5))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const h = <h3 ref={ref} className="m-0 min-w-0 truncate text-[13px] font-medium leading-5 text-[var(--dashboard-label)]">{text}</h3>
  return <Tooltip content={text} side="top" align="start" disabled={!cut}>{h}</Tooltip>
}

/** The dot after the label (SY-23); hovering it says which app and how old its numbers are (CR-25). */
function SyncDot({ tone, tip }: { tone: 'failed' | 'behind'; tip: string }) {
  return (
    <Tooltip content={tip} side="top" align="start">
      <span
        data-card-sync-dot={tone}
        aria-hidden
        className={cn(
          'size-[7px] shrink-0 rounded-full shadow-[0_0_0_1.5px_var(--dashboard-card-bg)]',
          tone === 'failed' ? 'bg-[var(--dashboard-sync-failed)]' : 'bg-[var(--dashboard-sync-behind)]',
        )}
      />
    </Tooltip>
  )
}

const LEGEND_DOT = { ink: 'bg-[var(--dashboard-chart-ink)] h-0.5 w-2.5 rounded-[1px]', previous: 'bg-[var(--dashboard-chart-previous)] h-0.5 w-2.5 rounded-[1px]', soft: 'bg-[var(--dashboard-chart-soft)] size-2 rounded-[2px]' }

function Legend({ items }: { items: [keyof typeof LEGEND_DOT, string][] }) {
  return (
    <div className="flex items-center gap-4">
      {items.map(([k, t]) => (
        <span key={t} className="flex items-center gap-1.5 whitespace-nowrap text-[12px] leading-4 text-[var(--dashboard-muted)]">
          <span aria-hidden className={LEGEND_DOT[k]} />{t}
        </span>
      ))}
    </div>
  )
}

const PILL: Record<HealthPill['tone'], string> = {
  good: 'border-[var(--dashboard-pill-border)] bg-[var(--dashboard-pill-bg)] text-[var(--dashboard-positive)]',
  bad: 'border-[var(--dashboard-pill-bad-border)] bg-[var(--dashboard-pill-bad-bg)] text-[var(--dashboard-pill-bad-text)]',
  warn: 'border-[var(--dashboard-pill-border)] bg-[var(--dashboard-pill-bg)] text-[var(--dashboard-pill-warn-text)]',
}
const PILL_DOT: Record<HealthPill['tone'], string> = {
  good: 'bg-[var(--dashboard-positive)]',
  bad: 'bg-[var(--dashboard-negative)]',
  warn: 'bg-[var(--dashboard-pill-warn-dot)]',
}

/** The health line (CR-28): one pill; wider cards add the target beside it. */
export function HealthPillView({ pill, withTarget }: { pill: HealthPill; withTarget: boolean }) {
  return (
    <>
      <span data-health={pill.tone} className={cn('flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-solid pl-2 pr-2.5 text-[12px] leading-4', PILL[pill.tone])}>
        <span aria-hidden className={cn('size-1.5 rounded-full', PILL_DOT[pill.tone])} />
        {pill.text}
      </span>
      {withTarget && pill.target && <span className="min-w-0 truncate text-[12px] leading-4 text-[var(--dashboard-muted)]">{pill.target}</span>}
    </>
  )
}

function Figure({ metric, syncing, comparable, inlinePill, className }: { metric: Metric; syncing: boolean; comparable: boolean; inlinePill?: HealthPill | null; className?: string }) {
  const { change } = metric
  const Arrow = change.direction === 'up' ? ArrowUp : ArrowDown
  return (
    <div className={cn('absolute left-4 flex items-baseline gap-2', inlinePill && 'right-4 min-w-0', className)}>
      <p data-syncing={syncing || undefined} className={cn('m-0 whitespace-nowrap text-[28px] font-medium leading-8 tracking-[-0.56px] text-[var(--dashboard-figure)]', syncing && 'dashboard-shimmer-text')}>
        {metric.value}
      </p>
      {comparable ? (
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
      ) : (
        // The period before is mostly empty: no change to show (CR-24).
        <p className="m-0 whitespace-nowrap text-[12px] leading-4 text-[var(--dashboard-muted)]">No comparison</p>
      )}
      {/* On a narrow card the target text gives way first, cut with an ellipsis. */}
      {inlinePill && <span className="flex min-w-0 items-center gap-2 self-center overflow-hidden pl-1"><HealthPillView pill={inlinePill} withTarget /></span>}
    </div>
  )
}
