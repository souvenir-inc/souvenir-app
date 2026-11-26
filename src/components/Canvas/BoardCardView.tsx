'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import type { MeasureRequest, MetricEntry } from '@/lib/api/warehouse'
import { formatPercent } from '@/lib/home/format'
import { ConnectorGlyph } from '@/components/ConnectorGlyph'
import { HealthPill, StatusPill, TargetField, type useMetricHealth } from '@/components/Scorecard'
import type { Health } from '@/lib/scorecard/targets'
import type { FlagLevel } from './AttentionRow'
import { ChannelIcon } from '@/components/Home/ChannelIcon'
import { Tooltip } from '@/components/Tooltip'
import { isAdditive } from '@/lib/metrics/tree'
import { rangeText } from '@/lib/warehouse/compare'
import { Skeleton } from '@/components/Skeleton'
import { Sparkline, TargetBullet, TrendChart, WeeklyBars, alignComparison, formatChartValue, formatSpan, type ValueFormat } from '@/components/charts'
import { layoutOf, SIZE_SPAN, type BoardCard, type CardSize } from './board'
import { cardChange, comparedValue, type CardData, type CardNeeds, type RangeKey } from './batching'
import { polarityOf, SHOPIFY_SLUGS, toneOfChange, valueFormatOf, type CardSource } from './metrics'
import { SyncDot, SyncShimmer, useCardSync } from '@/components/SyncStatus'
import { useCardData } from './useCardData'
import type { CardWindow } from './windows'
import styles from './Canvas.module.css'

export interface BoardCardViewProps {
  card: BoardCard
  /** The catalog entry, or undefined when the metric is no longer in the catalog. */
  entry: MetricEntry | undefined
  catalogReady: boolean
  needs: CardNeeds
  requests: ReadonlyMap<RangeKey, MeasureRequest>
  onChange: (patch: Partial<Omit<BoardCard, 'id'>>) => void
  onRemove: () => void
  onHandlePointerDown: (event: React.PointerEvent) => void
  /** Given, a click (or Enter / Space) on the card's body opens the metric up close (in edit mode, the card's settings). */
  onOpen?: (metric: string) => void
  /** Edit mode: a click opens the card's settings, so any card opens, even one with nothing to show. */
  editing?: boolean
  /** The apps this card's numbers come from, with their catalog logos, shown beside the title as on Home. */
  sources?: ReadonlyArray<CardSource & { logo: string | null }>
  /**
   * Held as a plain skeleton (no title): a saved starter card that may yet be swapped for a metric the store can
   * measure, until that's known, so its old name never flashes. Its numbers still start loading.
   */
  held?: boolean
  /**
   * The metric's source has never synced: whatever comes back (often 0) is missing data, not a real number, so the
   * card reads "No data yet" instead.
   */
  waiting?: boolean
  /** Added on this visit: a "New" badge after the title until the board is next opened. */
  isNew?: boolean
  /** The scorecard's health, for a pill beside the number when the metric has a target (see CardHealthKit). */
  healthKit?: CardHealthKit
  /** Hears each card's health (null when it has none). */
  onHealth?: (cardId: string, report: HealthReport | null) => void
  /**
   * The warehouse areas the card's numbers come from (blended metrics read several), for its sync status: a dot after
   * the name when one of their apps failed or is behind, the number shimmering while one syncs, and a skeleton during
   * an app's first sync (Pending #18; D49, D50, D64). None outside the dashboard shell.
   */
  categories?: readonly string[]
}

/** What a card needs to judge its number: the Scorecard's `healthFor` and `targetOf`, and the source's last data day. */
export interface CardHealthKit {
  healthFor: ReturnType<typeof useMetricHealth>['healthFor']
  targetOf: ReturnType<typeof useMetricHealth>['targetOf']
  untilOf: (metric: string) => string | null
  /** The Scorecard's benchmark flag, for a metric with no target (see CardFlagKit). */
  flags?: CardFlagKit
}

/**
 * The scorecard's flag for a number (target health when there's a target, otherwise the industry benchmark), for the
 * "Needs attention" row. The card itself shows the Scorecard chat's StatusPill, which applies the same rule.
 */
export interface CardFlagKit {
  flagFor: (
    metric: string, unit: MetricEntry['unit'], value: number | null, window: { start: string; end: string }, dataUntil?: string | null,
  ) => FlagLevel | null
}

/** One card's health, keyed by metric and window so two cards of the same number count once. */
export interface HealthReport {
  key: string
  health: Health
}

type Sources = ReadonlyArray<CardSource & { logo: string | null }>

/** The marks for the apps a card reads, as on Home's metric strip: 16px, named for screen readers. */
function SourceMarks({ sources }: { sources: Sources }) {
  return (
    <span className={styles.sources} role="img" aria-label={`From ${sources.map(source => source.name).join(', ')}`}>
      {sources.map(source => SHOPIFY_SLUGS.has(source.slug)
        ? <ChannelIcon key={source.slug} channel="shopify" size={16} />
        : <ConnectorGlyph key={source.slug} slug={source.slug} name={source.name} logoUrl={source.logo} size={16}
            className={styles.sourceLogo} />)}
    </span>
  )
}

/** Clicks on these inside a card's body are theirs, not the card's. */
const OWN_CLICKS = 'button, a, input, textarea, select, [role="menu"], [role="dialog"]'

/** One card: its title bar (drag handle, period chip, menu) and the body its kind draws. */
export function BoardCardView({
  card, entry, catalogReady, needs, requests, onChange, onRemove, onHandlePointerDown, onOpen, editing = false,
  sources, held = false, waiting = false, isNew = false, healthKit, onHealth, categories: given,
}: BoardCardViewProps) {
  const label = entry?.label ?? card.metric
  // One array per set of areas, so the sync status isn't worked out again on every render.
  const areasKey = (given ?? []).join('|')
  const categories = useMemo(() => (areasKey ? areasKey.split('|') : []), [areasKey])
  // An app's first sync: the card is loading, not empty ("No data yet" is for a first sync that failed, D64).
  const { firstSync } = useCardSync(categories)
  const { data, failed, retry } = useCardData(card, needs, requests)
  const format = valueFormatOf(entry)
  // Only a metric the catalog still has can open.
  const opens = onOpen !== undefined && (editing || (entry !== undefined && !held && !waiting))
  // On a narrow card the header is the title's: the source marks sit at the end of the number row instead.
  const narrow = SIZE_SPAN[card.size].cols === 3
  const marks = sources && sources.length > 0 ? <SourceMarks sources={sources} /> : null

  // Health against the scorecard target, for the period this card shows.
  const hasTarget = Boolean(healthKit?.targetOf(card.metric))
  const judged = needs.window.measured ?? needs.window.current
  const health = healthKit && entry && data && !data.unavailable && !held && !waiting && hasTarget && card.kind !== 'target'
    ? healthKit.healthFor(card.metric, entry.unit, data.value, judged, { unavailable: null, dataUntil: healthKit.untilOf(card.metric) })
    : null
  const healthKey = health ? `${health.verdict}|${health.gapPct ?? ''}` : ''
  useEffect(() => {
    if (!onHealth) return
    onHealth(card.id, health ? { key: `${card.metric}|${judged.start}|${judged.end}`, health } : null)
    return () => onHealth(card.id, null)
    // Reported when the verdict changes, not on every render (the health object is new each time).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onHealth, card.id, card.metric, judged.start, judged.end, healthKey])

  // "On track" / "Off target −12%", and the target itself, under the number. A narrow card shows just the pill (the
  // target is set in the metric window's Target tab, a click away); a wider one adds the target and the badges.
  const showTarget = card.kind !== 'target' && entry !== undefined && hasTarget
  // No target: the industry benchmark may still flag it ("Red flag", "Below healthy"). The Scorecard's StatusPill draws
  // it (and nothing when the number is healthy), so a card never shows two pills.
  const flags = healthKit?.flags
  const flag = !hasTarget && flags && entry && data && !data.unavailable && !held && !waiting && card.kind !== 'target'
    ? flags.flagFor(card.metric, entry.unit, data.value, judged)
    : null
  const healthLine = flag && entry && data ? (
    <div className={styles.healthLine}>
      <StatusPill health={null} metric={card.metric} unit={entry.unit} value={data.value} />
    </div>
  ) : showTarget ? (
    <div className={styles.healthLine}>
      {health && <HealthPill health={health} metric={narrow ? undefined : card.metric} />}
      {(!narrow || !health) && (
        // With the card's own window and number, the empty target field suggests the metric's current pace.
        <TargetField metric={card.metric} label={label} unit={entry.unit} window={judged} actual={data?.value ?? null} />
      )}
    </div>
  ) : null

  if (held) {
    return (
      <article className={styles.card} aria-busy aria-label="Loading">
        <header className={styles.head}><Skeleton style={{ width: '45%', height: 14, borderRadius: 6 }} /></header>
        <div className={styles.body} data-layout={layoutOf(card.size)}><CardSkeleton size={card.size} /></div>
      </article>
    )
  }

  return (
    <article className={styles.card} aria-label={`${label}, ${needs.window.label}`}>
      <header
        className={styles.head}
        onPointerDown={event => {
          // The title bar is the handle; its buttons keep their own clicks.
          if ((event.target as HTMLElement).closest('button')) return
          onHandlePointerDown(event)
        }}
      >
        <span className={styles.titleGroup}>
          <h3 className={styles.title} title={entry?.description}>{label}</h3>
          {isNew && <span className={styles.newBadge}>New</span>}
          <SyncDot categories={categories} />
        </span>
        {!narrow && marks}
      </header>

      {/* Keyed by size: when a card snaps to a new size, its new layout fades in rather than jumping. */}
      <div
        className={styles.body}
        key={card.size}
        data-layout={layoutOf(card.size)}
        // The body opens the metric up close; the title bar stays the drag handle, so a click never fights a drag.
        {...(opens ? {
          'data-clickable': '',
          role: 'button',
          tabIndex: 0,
          'aria-label': editing ? `Edit ${label}. Space to pick up and move, Delete to remove.` : `Open ${label}`,
          onClick: (event: React.MouseEvent<HTMLDivElement>) => {
            if ((event.target as HTMLElement).closest(OWN_CLICKS)) return
            onOpen(card.metric)
          },
          onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
            // In edit mode the grid has the keys (Space lifts the card, Enter opens its settings, Delete removes it).
            if (editing) return
            if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return
            event.preventDefault()
            onOpen(card.metric)
          },
        } : {})}
      >
        {catalogReady && !entry ? (
          <div className={styles.state}>
            <span className={styles.stateTitle}>This metric was removed.</span>
            <button type="button" className={styles.linkButton} onClick={onRemove}>Remove card</button>
          </div>
        ) : waiting && firstSync ? (
          <CardSkeleton size={card.size} />
        ) : waiting ? (
          // Never synced: a 0 here would be missing data, not a real number.
          <div className={styles.state}>
            <span className={styles.stateTitle}>No data yet</span>
            <button type="button" className={styles.linkButton} onClick={onRemove}>Remove card</button>
          </div>
        ) : data === null ? (
          failed ? (
            <div className={styles.state}>
              <span className={styles.stateTitle}>Couldn&apos;t load.</span>
              <button type="button" className={styles.linkButton} onClick={retry}>Try again</button>
            </div>
          ) : <CardSkeleton size={card.size} />
        ) : data.unavailable ? (
          <div className={styles.state}>
            {/* One plain line and an action; why the store can't measure it lives in the build notes, not on screen. */}
            <span className={styles.stateTitle}>No data</span>
            <button type="button" className={styles.linkButton} onClick={onRemove}>Remove card</button>
          </div>
        ) : (
          <CardBody card={card} label={label} data={data} format={format} window={needs.window} additive={isAdditive(card.metric, entry?.unit)}
            marks={narrow ? marks : null} healthLine={healthLine} onTarget={target => onChange({ target })} categories={categories} />
        )}
      </div>
    </article>
  )
}

function CardSkeleton({ size }: { size: CardSize }) {
  const tall = SIZE_SPAN[size].rows === 2
  return (
    <div aria-busy aria-label="Loading" className={styles.skeleton}>
      <Skeleton style={{ width: '46%', height: 30, borderRadius: 8 }} />
      {tall && <Skeleton style={{ width: '100%', flex: 1, minHeight: 120, borderRadius: 8, opacity: 0.6 }} />}
    </div>
  )
}

/**
 * What a change is measured against, on hover: "Today so far vs all of yesterday ($6.9k)", "10 – 16 Nov vs 3 – 9 Nov
 * ($41.2k)"; per-day averages say so.
 */
function versusText(window: CardWindow, compared: string, perDay: boolean): string {
  const asOf = window.current.end
  const against = window.comparison ? rangeText(window.comparison, asOf) : ''
  if (window.id === 'today') {
    const what = window.comparisonLabel === 'Yesterday' ? 'all of yesterday'
      : window.comparisonLabel === '7-day average' || window.comparisonLabel === 'Same day last week' ? window.comparisonLabel.toLowerCase()
        : against
    return `Today so far vs ${what}${perDay && window.comparisonLabel !== '7-day average' ? ', per day' : ''} (${compared})`
  }
  const current = window.measured ? rangeText(window.measured, asOf) : window.label
  return perDay ? `Per-day average, ${current} vs ${against} (${compared} a day)` : `${current} vs ${against} (${compared})`
}

function Delta({ data, metric, format, window, additive, short }: {
  data: CardData; metric: string; format: ValueFormat; window: CardWindow; additive: boolean; short: boolean
}) {
  if (window.empty) return <span className={styles.delta} data-tone="flat">{short ? 'No data yet' : `No data for ${window.label.toLowerCase()} yet`}</span>
  if (!window.comparison) return null
  const change = cardChange(data, window, additive)
  const versus = window.comparisonLabel ? `vs ${window.comparisonLabel.charAt(0).toLowerCase()}${window.comparisonLabel.slice(1)}` : ''
  if (change === null) {
    return <span className={styles.delta} data-tone="flat">{short ? 'No comparison' : `No data to compare ${versus}`}</span>
  }
  const tone = toneOfChange(change, polarityOf(metric))
  const up = change > 0
  const flat = Math.abs(change) < 0.05
  const perDay = window.perDay && additive
  const hover = versusText(window, formatChartValue(comparedValue(data, window, additive), format), perDay)
  return (
    <Tooltip content={hover} side="bottom">
      <span className={styles.delta} data-tone={tone}>
        {!flat && (up ? <ArrowUp size={12} strokeWidth={1.75} aria-hidden /> : <ArrowDown size={12} strokeWidth={1.75} aria-hidden />)}
        <span aria-hidden>{formatPercent(Math.abs(change), 1)}</span>
        <span className="sr-only">{flat ? 'no change' : `${up ? 'up' : 'down'} ${formatPercent(Math.abs(change), 1)}`}: {hover}</span>
        {!short && <span className={styles.versus} aria-hidden>{versus}</span>}
      </span>
    </Tooltip>
  )
}

function Figure({ data, metric, format, window, additive, short, marks, categories }: {
  data: CardData; metric: string; format: ValueFormat; window: CardWindow; additive: boolean; short: boolean
  /** A narrow card's source marks, at the row's far end. */
  marks?: React.ReactNode
  /** The number shimmers while an app it reads syncs. */
  categories: readonly string[]
}) {
  return (
    <div className={styles.figureRow}>
      <span className={styles.value}><SyncShimmer categories={categories}>{formatChartValue(data.value, format)}</SyncShimmer></span>
      <Delta data={data} metric={metric} format={format} window={window} additive={additive} short={short} />
      {marks && <span className={styles.figureMarks}>{marks}</span>}
    </div>
  )
}

// Cards don't repeat how far the data reaches: the header's sync status says when it last synced (Dev). The window
// still ends at the last day with data (`windowFor`); only the caption is gone.
function Caption({ window, legend }: { window: CardWindow; legend: boolean }) {
  return (
    <div className={styles.caption}>
      <span>{formatSpan(window.series.start, window.series.end)}</span>
      {legend && window.seriesComparison && (
        <span className={styles.legend} aria-hidden>
          <span className={styles.legendSwatch} />This period
          <span className={styles.legendSwatch} data-faded />{window.comparisonLabel}
        </span>
      )}
    </div>
  )
}


// Rows are 156px, so a one-row body has about 94px and a two-row body about 266px (see Canvas.module.css).
const SIDE_CHART = 60
const BELOW_CHART = 168
const FULL_CHART = 188

function ChartSkeleton({ height }: { height: number }) {
  return <Skeleton style={{ width: '100%', height, borderRadius: 8, opacity: 0.5 }} />
}

/**
 * What a card draws, by its size (see `layoutOf`): the figure alone; the figure with a small chart beside it or
 * below it; or the figure with the full chart. The kind decides which chart: a line for a metric, bars by week,
 * or a bullet against a target.
 */
function CardBody({ card, label, data, format, window, additive, marks, healthLine, onTarget, categories }: {
  card: BoardCard
  label: string
  data: CardData
  format: ValueFormat
  window: CardWindow
  /** A total rather than a rate: per-day comparisons divide it by its days. */
  additive: boolean
  marks?: React.ReactNode
  /** The health pill and target, under the number, when the metric has a target. */
  healthLine?: React.ReactNode
  onTarget: (target: number) => void
  categories: readonly string[]
}) {
  // A health line takes a row; the charts below give that room back.
  const lineRoom = healthLine ? 30 : 0
  const layout = layoutOf(card.size)
  const wide = SIZE_SPAN[card.size].cols === 12
  const short = SIZE_SPAN[card.size].cols === 3
  const spoken = `${label}, ${window.label.toLowerCase()}`
  const figure = <Figure data={data} metric={card.metric} format={format} window={window} additive={additive} short={short} marks={marks}
    categories={categories} />
  const direction = polarityOf(card.metric) === 'lower' ? 'lower' : 'higher'

  if (card.kind === 'target') {
    return (
      <>
        {figure}
        {typeof card.target === 'number'
          ? <div className={styles.sparkSlot}>
              <TargetBullet value={data.value} target={card.target} format={format} label={label} direction={direction} />
            </div>
          : <TargetForm format={format} label={label} onSet={onTarget} />}
      </>
    )
  }

  const weekly = card.kind === 'weekly'
  const small = (height: number) => weekly
    ? data.weeks
      ? <WeeklyBars bars={data.weeks} format={format} label={`${label} by week`} height={height} compact direction={direction} />
      : window.empty ? <div style={{ height }} /> : <ChartSkeleton height={height} />
    : data.series
      ? <Sparkline values={data.series.map(p => p.value)} comparison={data.comparisonSeries?.map(p => p.value)}
          label={spoken} format={format} height={height} />
      : <div style={{ height }} />

  if (layout === 'figure') {
    return <>{figure}{healthLine}</>
  }

  if (layout === 'figure-side') {
    return (
      <div className={styles.side}>
        <div className={styles.sideFigure}>{figure}{healthLine}</div>
        <div className={styles.sideChart}>{small(SIDE_CHART)}</div>
      </div>
    )
  }

  if (layout === 'figure-below') {
    return (
      <>
        {figure}
        {healthLine}
        <div className={styles.sparkSlot}>{small(BELOW_CHART - lineRoom)}</div>
      </>
    )
  }

  // figure-chart: the full chart, axes and all.
  if (weekly) {
    return (
      <>
        {figure}
        {healthLine}
        <div className={styles.chartSlot}>
          {data.weeks
            ? <WeeklyBars bars={data.weeks} format={format} label={`${label} by week`} height={FULL_CHART - lineRoom} direction={direction} />
            : window.empty ? <div style={{ height: FULL_CHART - lineRoom }} /> : <ChartSkeleton height={FULL_CHART - lineRoom} />}
        </div>
        <div className={styles.caption}>
          <span>{data.weeks?.at(-1)?.partial ? 'By week · the lighter bar is a week still filling in' : 'By week'}</span>
        </div>
      </>
    )
  }
  const points = alignComparison(data.series ?? [], data.comparisonSeries ?? undefined)
  return (
    <>
      {figure}
      {healthLine}
      <div className={styles.chartSlot}>
        {data.series
          ? <TrendChart points={points} format={format} label={spoken} comparisonLabel={window.comparisonLabel ?? 'Period before'}
              polarity={polarityOf(card.metric)} height={FULL_CHART - lineRoom} />
          : <ChartSkeleton height={FULL_CHART - lineRoom} />}
      </div>
      <Caption window={window} legend={wide} />
    </>
  )
}

/** Sets a target on an "Against target" card. Ratios are typed as percents ("4" means 4%). */
function TargetForm({ format, label, onSet }: { format: ValueFormat; label: string; onSet: (target: number) => void }) {
  const [text, setText] = useState('')
  const percent = format === 'ratio'
  const parsed = Number(text.replace(/[,$%x\s]/g, ''))
  const valid = text.trim() !== '' && Number.isFinite(parsed)
  return (
    <form
      className={styles.targetForm}
      onSubmit={event => {
        event.preventDefault()
        if (valid) onSet(percent ? parsed / 100 : parsed)
      }}
    >
      <input
        className={styles.targetInput}
        inputMode="decimal"
        placeholder={percent ? 'Target %' : 'Target'}
        aria-label={`Target for ${label}${percent ? ', in percent' : ''}`}
        value={text}
        onChange={event => setText(event.target.value)}
      />
      <button type="submit" className={styles.linkButton} disabled={!valid}>Set target</button>
    </form>
  )
}
