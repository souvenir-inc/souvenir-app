'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { m, useReducedMotion } from 'framer-motion'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { Tooltip } from '@/components/Tooltip'
import { cn } from '@/lib/utils'
import { opens, type CardBody, type HealthPill } from './card-states'
import { WeeklyBars } from './chart/Bars'
import { LineChart } from './chart/LineChart'
import { SourceMark } from './icons'
import { useDashboardData } from './live/dashboard-data'
import { compareName } from './period'
import type { App, CardSize, Metric } from './types'

// One metric card (Figma 17:889, 05-cards-reading-rules.md). What it shows follows its size (CR-1):
//   sm       3×1  288×156  the number and its change
//   sm-tall  3×2  288×328  the number at the top, its line below
//   md       6×1  592×156  the number, its line (or compact weekly bars) beside it
//   lg       6×2  592×328  the number, the full chart (or weekly bars)
//   full     12×1          the number, a wide line
//   full-lg  12×2          the number, the full chart with its legend
// Reading the board the whole card is a button that opens its metric window (CR-6 – CR-8); empty
// and locked cards don't open (CR-18). In edit mode it shows a × in place of the logo and a resize
// arc on the bottom-right corner and a remove badge on the top-left, drawn by BoardGrid (Figma 2.5).

export const SIZE_LABEL: Record<CardSize, string> = {
  sm: 'small', 'sm-tall': 'small, tall', md: 'wide', lg: 'medium', full: 'full width', 'full-lg': 'large',
}
/** The chart a card draws unless its settings say otherwise: weekly bars on tall wide cards, the line on
 * the rest (Figma 2.5: Orders 2 × 2 with bars, Revenue 2 × 1 with its line). */
export const barsBySize = (size: CardSize) => size === 'lg' || size === 'full-lg'

/** As the resize landing slot names them (Figma 2.7, 19:6006). */
export const SIZE_NAME: Record<CardSize, string> = {
  sm: 'Small', 'sm-tall': 'Small tall', md: 'Wide', lg: 'Medium', full: 'Full width', 'full-lg': 'Large',
}
export const SIZE_LEVEL: Record<CardSize, number> = { sm: 1, 'sm-tall': 2, md: 3, lg: 4, full: 5, 'full-lg': 6 }
const TALL: CardSize[] = ['sm-tall', 'lg', 'full-lg']
const WIDE: CardSize[] = ['md', 'lg', 'full', 'full-lg']

/** Handlers for the resize grip; BoardGrid owns the geometry (BS-19). */
export interface GripProps {
  onPointerDown: (e: React.PointerEvent) => void
  onKeyDown: (e: React.KeyboardEvent) => void
}

/** How a card reads right now, worked out by the screen (sync, health). */
export interface CardView {
  body: CardBody
  /** The card's own chart: weekly bars or the trend (10 CS-6). Unset, the size's default. */
  bars?: boolean
  /** Its app failed or is behind (SY-23), and what hovering the dot says (CR-25). */
  dot?: { tone: 'failed' | 'behind'; tip: string }
  /** Its app is syncing: the number shimmers (SY-24). */
  syncing?: boolean
  health?: HealthPill | null
  /** People who can edit get Remove card on an empty card (CR-22). */
  canEdit?: boolean
  /** The number is in, the chart's days aren't yet: the chart area shimmers on its own. */
  chartLoading?: boolean
  /** The chart's days couldn't be read; the number still shows. */
  chartFailed?: boolean
}

interface MetricCardProps {
  metric: Metric
  size: CardSize
  view?: CardView
  /** Lifted look while the card is being dragged or resized. */
  dragging?: boolean
  /** Edit mode: no hover lift, no opening; the corner marks are BoardGrid's (Figma 2.5). */
  editing?: boolean
  onRemove?: () => void
  /** Opens the metric window (CR-7); left out in edit mode and for the drag copy. */
  onOpen?: () => void
  /** Try again on a card that couldn't load (CR-20). */
  onRetry?: () => void
  /** Place on the board; the numbers fade in card by card. */
  index?: number
  className?: string
}

export function MetricCard({ metric, size, view, dragging = false, editing = false, onRemove, onOpen, onRetry, index = 0, className }: MetricCardProps) {
  // The chart follows the size: wide cards draw the line, tall wide cards weekly bars (Figma 2.5).
  // A card's own choice in its settings wins (10 CS-6).
  const bars = view?.bars ?? barsBySize(size)
  const { apps } = useDashboardData()
  // Up to two marks: the app, or the two it blends (CR-5).
  const marks = metric.apps.slice(0, 2).map((id) => apps.get(id)).filter((a): a is App => !!a)
  const body = view?.body ?? 'numbers'
  const openable = !!onOpen && !editing && opens(body)
  const tall = TALL.includes(size)
  const wide = WIDE.includes(size)
  const change = metric.change ? `${metric.change.direction === 'up' ? 'up' : 'down'} ${metric.change.label}` : 'no comparison'
  const label = openable
    ? `${metric.label}, ${body === 'today-empty' ? 'no data yet' : `${metric.value}, ${change}`}${view?.dot ? `, ${view.dot.tip}` : ''}. Open`
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
      <div className={cn('absolute left-4 top-4 flex h-5 min-w-0 items-center gap-1.5', marks.length > 1 ? 'right-[60px]' : 'right-10', size === 'full-lg' && 'right-[230px]', size === 'lg' && bars && 'right-[150px]')}>
        <Title text={metric.label} />
        {view?.dot && <SyncDot tone={view.dot.tone} tip={view.dot.tip} />}
      </div>

      {/* Top right: the legend (wide charts), then the app logo(s). In edit mode the remove badge and
          the resize arc sit on the card's corners, drawn by BoardGrid (Figma 2.5). */}
      <div className="absolute right-4 top-4 flex h-5 items-center gap-3">
        {body === 'numbers' && size === 'lg' && bars && <Legend items={[['soft', 'Week in progress']]} />}
        {body === 'numbers' && size === 'full-lg' && (bars ? <Legend items={[['soft', 'Week in progress']]} /> : <Legend items={[['ink', 'This period'], ['previous', compareName(metric.series.compare)]]} />)}
        {!metric.unmeasured && marks.length > 0 && (
          <span className="flex items-center gap-1.5">
            {marks.map((app) => <SourceMark key={app.id} app={app} className="block size-3.5" />)}
          </span>
        )}
      </div>

      <Body
        metric={metric} bars={bars} size={size} view={view} body={body} tall={tall} wide={wide} index={index}
        onRetry={onRetry} onRemove={onRemove}
      />

    </article>
  )
}

interface BodyProps {
  metric: Metric
  bars: boolean
  size: CardSize
  view?: CardView
  body: CardBody
  tall: boolean
  wide: boolean
  index: number
  onRetry?: () => void
  onRemove?: () => void
}

function Body({ metric, bars, size, view, body, tall, wide, index, onRetry, onRemove }: BodyProps) {
  const reduceMotion = useReducedMotion()
  const chartBox = chartBoxFor(size, bars)
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
    return <EmptyBody body={body} reason={metric.unmeasured} canEdit={!!view?.canEdit} onRetry={onRetry} onRemove={onRemove} tall={tall} />
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

  const series = metric.series
  // Measured, but nothing at all in these dates: say so once, instead of a "—" over an empty chart.
  if (metric.amount === null && series.daysWithData === 0 && !view?.chartLoading) {
    return (
      <div className={cn('absolute left-4 flex flex-col items-start gap-0.5', figureAt)}>
        <p className="m-0 text-[28px] font-medium leading-8 text-[var(--dashboard-muted)]">—</p>
        <p className="m-0 text-[12px] leading-4 text-[var(--dashboard-muted)]">No data for these dates</p>
      </div>
    )
  }
  return (
    <m.div
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25, delay: Math.min(index, 12) * 0.04 }}
    >
      <Figure metric={metric} syncing={!!view?.syncing} className={figureAt} inlinePill={tall && size !== 'sm-tall' ? view?.health : undefined} />
      {view?.health && (!tall || size === 'sm-tall') && (
        <div className={cn('absolute left-4 flex items-center gap-2', size === 'sm-tall' ? 'top-[84px]' : 'bottom-4')}>
          <HealthPillView pill={view.health} withTarget={wide} />
        </div>
      )}
      {chartBox && view?.chartLoading && (
        // The number is in; the chart's own days are on their way.
        <span aria-hidden data-chart-loading className={cn('dashboard-shape-shimmer rounded-lg opacity-40', chartBox)} />
      )}
      {chartBox && !view?.chartLoading && view?.chartFailed && (
        <p data-chart-failed className={cn('m-0 flex items-center justify-center text-center text-[12px] leading-4 text-[var(--dashboard-muted)]', chartBox)}>Couldn’t load the chart</p>
      )}
      {chartBox && !view?.chartLoading && !view?.chartFailed && (
        bars && size !== 'sm-tall' && size !== 'full'
          ? <WeeklyBars metric={metric} variant={size === 'md' ? 'compact' : 'full'} className={chartBox} />
          : <LineChart metric={metric} series={series} variant={tall && size !== 'sm-tall' ? 'full' : 'spark'} className={chartBox} />
      )}
    </m.div>
  )
}

/** Where the chart goes, by size (Figma 170:40175). */
function chartBoxFor(size: CardSize, bars: boolean): string | null {
  switch (size) {
    case 'sm': return null
    case 'sm-tall': return 'absolute bottom-4 left-4 right-4 top-[144px]'
    case 'md': return bars ? 'absolute bottom-4 left-[52.7%] right-4 top-[52px]' : 'absolute bottom-4 left-1/2 right-4 top-[52px]'
    case 'full': return 'absolute bottom-4 left-[320px] right-4 top-[52px]'
    default: return 'absolute bottom-4 left-4 right-4 top-24'
  }
}

const EMPTY_TEXT: Record<Exclude<CardBody, 'loading' | 'numbers' | 'today-empty'>, string> = {
  removed: 'This metric was removed.',
  'no-data-yet': 'No data yet',
  'couldnt-load': 'Couldn’t load.',
  'no-data': 'No data',
}

/** Empty, failed and locked cards (CR-20 – CR-23): one line where the number goes, and maybe a link. */
function EmptyBody({ body, reason, canEdit, onRetry, onRemove, tall }: { body: CardBody; reason: string | null; canEdit: boolean; onRetry?: () => void; onRemove?: () => void; tall: boolean }) {
  const where = cn('absolute left-4 flex flex-col items-start gap-1 text-[13px] leading-[17px] text-[var(--dashboard-figure)]', tall ? 'top-11' : 'bottom-4')
  const text = EMPTY_TEXT[body as keyof typeof EMPTY_TEXT]
  // Try again is for everyone; Remove card only for people who can edit (CR-20, CR-22).
  const action = body === 'couldnt-load' ? { label: 'Try again', run: onRetry } : canEdit ? { label: 'Remove card', run: onRemove } : null
  return (
    <div className={where}>
      {/* No data says why on hover: the warehouse's reason this store can't measure it (CR-22). */}
      <Tooltip content={reason} disabled={body !== 'no-data' || !reason} side="top" align="start">
        <p className="m-0">{text}</p>
      </Tooltip>
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
function Title({ text, muted = false }: { text: string; muted?: boolean }) {
  const ref = useRef<HTMLHeadingElement>(null)
  const [cut, setCut] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setCut(el.scrollWidth > el.clientWidth + 0.5))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const h = <h3 ref={ref} className={cn('m-0 min-w-0 truncate text-[13px] font-medium leading-5', muted ? 'text-[var(--dashboard-faint)]' : 'text-[var(--dashboard-label)]')}>{text}</h3>
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
}
const PILL_DOT: Record<HealthPill['tone'], string> = {
  good: 'bg-[var(--dashboard-positive)]',
  bad: 'bg-[var(--dashboard-negative)]',
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

function Figure({ metric, syncing, inlinePill, className }: { metric: Metric; syncing: boolean; inlinePill?: HealthPill | null; className?: string }) {
  const { change } = metric
  const Arrow = change?.direction === 'up' ? ArrowUp : ArrowDown
  return (
    <div className={cn('absolute left-4 flex items-baseline gap-2', inlinePill && 'right-4 min-w-0', className)}>
      <p data-syncing={syncing || undefined} className={cn('m-0 whitespace-nowrap text-[28px] font-medium leading-8 tracking-[-0.56px] text-[var(--dashboard-figure)]', syncing && 'dashboard-shimmer-text')}>
        {metric.value}
      </p>
      {change ? (
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
        // No comparison, or the period before is mostly empty: no change to show (CR-24).
        <p className="m-0 whitespace-nowrap text-[12px] leading-4 text-[var(--dashboard-muted)]">No comparison</p>
      )}
      {/* On a narrow card the target text gives way first, cut with an ellipsis. */}
      {inlinePill && <span className="flex min-w-0 items-center gap-2 self-center overflow-hidden pl-1"><HealthPillView pill={inlinePill} withTarget /></span>}
    </div>
  )
}
