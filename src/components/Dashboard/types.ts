// Dashboard data model. A Metric is what the warehouse measured for one period (live/metrics.ts);
// the board layout (BoardCard) is kept apart, so a metric can be shown at any size.

import type { Judgement, ScorecardRow } from '@/lib/scorecard/status'

/** A connection feeding the warehouse, by its connection id. */
export type AppId = string

export interface App {
  id: AppId
  /** The connector it is, e.g. "shopify_app", "metaads". */
  slug: string
  name: string
}

/**
 * The six card sizes (05-cards-reading-rules.md CR-1), named for the 12-column grid:
 *   sm 3×1 Small · sm-tall 3×2 Small, tall · md 6×1 Wide · lg 6×2 Medium · full 12×1 Full width ·
 *   full-lg 12×2 Large. On the 4-column design grid that's 1, 2 or 4 columns by 1 or 2 rows.
 */
export type CardSize = 'sm' | 'sm-tall' | 'md' | 'lg' | 'full' | 'full-lg'

export type MetricFormat = 'number' | 'currency' | 'percent' | 'ratio'

export interface MetricChange {
  /** Already formatted, e.g. "6.1%". */
  label: string
  direction: 'up' | 'down'
  /** Whether the move is good news; a falling CPA is positive. Drives the colour, not the arrow. */
  sentiment: 'positive' | 'negative'
}

export interface Day { date: Date; value: number | null }

export interface Series {
  days: Day[]
  /** The same days of the comparison period; empty with no comparison. */
  previous: Day[]
  /** Whether the comparison period has enough data to compare with (CR-24). */
  comparable: boolean
  /** What the previous days are: 'previous', 'last-year' or 'none' (11 DT-7). */
  compare: string
  daysWithData: number
}

export interface Week {
  start: Date
  /** The last day counted: today for the week in progress. */
  end: Date
  value: number | null
  /** The current, unfinished week: drawn in the soft colour. */
  inProgress: boolean
}

/** How a metric is doing against its scorecard target (CR-28). */
export interface Health {
  verdict: 'on' | 'off'
  /** The scorecard verdict from lib/scorecard/status.ts judge(), with the row it was judged by; when set, card-states words the pill and the reason from it, so cards and the metric window agree. */
  judgement?: Judgement
  rule?: Pick<ScorecardRow, 'direction' | 'tolerance'>
  /** How far off, e.g. "−12%". */
  off?: string
  /** As wider cards show it, e.g. "$55k". */
  target: string
}

export interface Metric {
  id: string
  label: string
  /** One plain sentence for the metric window's Definition tab. */
  definition: string
  format: MetricFormat
  /** Adds up over days (a sum or count) rather than sitting around a rate (CR-3). */
  sum: boolean
  /** Added in this workspace: Σ instead of an app logo (06 AC-10). */
  custom: boolean
  /** A rise is good news (green): its scorecard's direction, else up. */
  upIsGood: boolean
  /** The connections whose data it reads, in workspace order. */
  apps: AppId[]
  /** The period's number; null before it's measured or when nothing was recorded. */
  amount: number | null
  /** The comparison period's number; null with no comparison or nothing recorded. */
  previous: number | null
  /** `amount` formatted for the card, e.g. "$48.2k"; "—" when there is none. */
  value: string
  /** Against the comparison period; null with no comparison or nothing to compare. */
  change: MetricChange | null
  series: Series
  /** The last five weeks, the last one in progress (CR-11). */
  weekly: Week[]
  /** Why this store can't measure it, when it can't (CR-22). */
  unmeasured: string | null
  /** The warehouse's code for why (`no_connection`, `feed_failed`, `first_sync`, or one added later): the UI words it from this, never from the free text above. */
  unavailableCode?: string | null
  /** Connector slugs that would let this store measure it, pre-built apps first; empty when connecting isn't the fix. */
  connectWith?: string[]
  health: Health | null
}

export interface BoardCard {
  metricId: string
  size: CardSize
  /** Top-left cell on the 4-column design grid (grid-layout.ts). */
  x: number
  y: number
  /** The card's own chart, set in card settings (10 CS-6); unset, the size's default. */
  chart?: 'trend' | 'bars'
}

export interface Period {
  id: string
  /** As shown on the trigger, e.g. "vs previous". */
  label: string
  /** As shown in the menu, when it reads differently. */
  menuLabel?: string
}
