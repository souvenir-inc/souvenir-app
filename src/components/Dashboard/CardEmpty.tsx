'use client'

import { CalendarX2, CircleSlash, Hourglass, Plug, TriangleAlert, Archive, type LucideIcon } from 'lucide-react'
import { ORG_CONNECTORS_ROUTE } from '@/lib/routes'
import { cn } from '@/lib/utils'

// What a card shows when it has no number to show: one design for every reason (no data yet, needs an
// app, couldn't load, nothing in these dates, removed). An icon, a headline, why, and the one thing
// that helps. Wide cards keep a faint chart in the chart's place, so the card reads as "waiting", not
// broken. The same faint chart stands in for a chart with too little history to draw.

export type EmptyKind = 'first-sync' | 'needs-app' | 'no-data' | 'couldnt-load' | 'no-dates' | 'removed'

const ICON: Record<EmptyKind, LucideIcon> = {
  'first-sync': Hourglass,
  'needs-app': Plug,
  'no-data': CircleSlash,
  'couldnt-load': TriangleAlert,
  'no-dates': CalendarX2,
  removed: Archive,
}

const HEADLINE: Record<EmptyKind, string> = {
  'first-sync': 'No data yet',
  'needs-app': 'Needs an app',
  'no-data': 'No data',
  'couldnt-load': 'Couldn’t load',
  'no-dates': 'No data for these dates',
  removed: 'Metric removed',
}

export interface EmptyAction {
  label: string
  run?: () => void
  href?: string
}

/** "Shopify", "Shopify and Meta Ads", "Shopify, Meta Ads and Klaviyo". */
export const listNames = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`

/** Why, in a sentence, for each kind; `apps` are the names of the apps the metric reads. */
export function emptyDetail(kind: EmptyKind, opts: { apps: string[]; reason?: string | null }): string {
  switch (kind) {
    case 'first-sync':
      return opts.apps.length ? `${listNames(opts.apps)} ${opts.apps.length === 1 ? 'is' : 'are'} doing a first sync. This fills in when it’s done.` : 'The first sync is still running. This fills in when it’s done.'
    case 'needs-app':
      return 'No connected app tracks this yet.'
    case 'no-data':
      return opts.reason ? capitalise(opts.reason) : 'This store has nothing for this metric.'
    case 'couldnt-load':
      return 'Something went wrong reading this number.'
    case 'no-dates':
      return 'Nothing was recorded in this period. Try a longer range.'
    case 'removed':
      return 'This metric is no longer in your store’s library.'
  }
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/\.?$/, '.')

/** The empty card's own action: Connect for a missing app, Try again for a failed read, else Remove for editors. */
export function emptyAction(kind: EmptyKind, opts: { canEdit: boolean; onRetry?: () => void; onRemove?: () => void }): EmptyAction | null {
  if (kind === 'needs-app') return { label: 'Connect an app', href: ORG_CONNECTORS_ROUTE }
  if (kind === 'couldnt-load') return opts.onRetry ? { label: 'Try again', run: opts.onRetry } : null
  if ((kind === 'no-data' || kind === 'removed') && opts.canEdit && opts.onRemove) return { label: 'Remove card', run: opts.onRemove }
  return null
}

const LINK = 'cursor-pointer rounded-sm border-0 bg-transparent p-0 text-[length:var(--font-size-body-sm)] font-medium leading-[17px] text-[var(--dashboard-figure)] underline underline-offset-2 outline-none hover:text-[var(--dashboard-label)] focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-[var(--focus-ring)]'

/**
 * The empty state itself, placed where the number goes. `compact` (the small 3×1 card) keeps it to
 * the headline and its action; the reason is on hover.
 */
export function CardEmptyState({ kind, detail, action, compact, className }: { kind: EmptyKind; detail: string; action: EmptyAction | null; compact: boolean; className?: string }) {
  const Icon = ICON[kind]
  const tone = kind === 'couldnt-load' ? 'text-[var(--dashboard-sync-failed)]' : 'text-[var(--dashboard-muted)]'
  return (
    <div data-card-empty={kind} className={cn('flex max-w-[260px] flex-col items-start gap-1', className)}>
      <span className="flex items-center gap-1.5" title={compact ? detail : undefined}>
        <span aria-hidden className={cn('flex size-6 shrink-0 items-center justify-center rounded-md bg-[var(--dashboard-chart-area)]', tone)}>
          <Icon size={14} strokeWidth={1.75} absoluteStrokeWidth />
        </span>
        <span className="text-[length:var(--font-size-body)] font-medium leading-5 text-[var(--dashboard-figure)]">{HEADLINE[kind]}</span>
      </span>
      {!compact && <p className="m-0 line-clamp-2 text-[length:var(--font-size-small)] leading-4 text-[var(--dashboard-label)]">{detail}</p>}
      {compact && <span className="sr-only">{detail}</span>}
      {action && (action.href
        ? <a href={action.href} data-no-drag onClick={(e) => e.stopPropagation()} className={cn(LINK, 'mt-0.5')}>{action.label}</a>
        // eslint-disable-next-line no-restricted-syntax -- ds-allow: the card's underlined text action (Figma 170:89079)
        : <button type="button" data-no-drag onClick={(e) => { e.stopPropagation(); action.run?.() }} className={cn(LINK, 'mt-0.5')}>{action.label}</button>)}
    </div>
  )
}

// The faint chart: five soft bars (or a soft line) on a dashed baseline, never mistaken for data.
// Low and light on purpose: it should read as "a chart goes here", never as numbers.
const GHOST_BARS = [0.22, 0.34, 0.27, 0.4, 0.3]

/** A faint stand-in chart, with an optional caption over it ("1 week of data so far"). */
export function ChartGhost({ bars, caption, note, className }: { bars: boolean; caption?: string; note?: string; className?: string }) {
  return (
    <div data-chart-ghost className={cn('pointer-events-none flex flex-col', className)}>
      <div aria-hidden className="relative min-h-0 flex-1">
        {bars ? (
          <div className="absolute inset-x-0 bottom-0 top-2 flex items-end justify-around gap-[8%] px-[4%]">
            {GHOST_BARS.map((h, i) => (
              <span key={i} className="w-full max-w-11 rounded-t-xs bg-[var(--dashboard-chart-soft)] opacity-35" style={{ height: `${h * 100}%` }} />
            ))}
          </div>
        ) : (
          <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="absolute inset-0 size-full">
            <path d="M0,37 C12,35 18,31 30,32 C42,33 48,28 60,29 C72,30 80,26 100,27" fill="none" stroke="var(--dashboard-chart-soft)" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinecap="round" opacity={0.7} />
          </svg>
        )}
        <span className="absolute inset-x-0 bottom-0 border-t border-dashed border-[var(--dashboard-chart-soft)]" />
        {caption && (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 text-center">
            <span className="rounded-md bg-[var(--dashboard-card-bg)] px-2 py-0.5 text-[length:var(--font-size-small)] font-medium leading-4 text-[var(--dashboard-label)] shadow-[0_0_0_4px_var(--dashboard-card-bg)]">{caption}</span>
            {note && <span className="rounded-md bg-[var(--dashboard-card-bg)] px-2 text-[length:var(--font-size-caption)] leading-4 text-[var(--dashboard-muted)]">{note}</span>}
          </span>
        )}
      </div>
      {(caption || note) && <span className="sr-only">{[caption, note].filter(Boolean).join('. ')}</span>}
    </div>
  )
}
