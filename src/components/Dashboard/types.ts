// Dashboard data model. Server-shaped data (Metric) is kept apart from the board layout (BoardCard),
// so a metric can be shown at any size and the layout can be saved on its own later.

/** The apps cards read from (Figma 95:18703 lists eleven). */
export type MetricSource =
  | 'shopify' | 'meta' | 'google-ads' | 'tiktok' | 'google-analytics' | 'pinterest'
  | 'stripe' | 'paypal' | 'zendesk' | 'reddit' | 'hubspot' | 'shipstation'

/**
 * The six card sizes (05-cards-reading-rules.md CR-1), named for the 12-column grid:
 *   sm 3×1 Small · sm-tall 3×2 Small, tall · md 6×1 Wide · lg 6×2 Medium · full 12×1 Full width ·
 *   full-lg 12×2 Large. On the 4-column design grid that's 1, 2 or 4 columns by 1 or 2 rows.
 */
export type CardSize = 'sm' | 'sm-tall' | 'md' | 'lg' | 'full' | 'full-lg'

export interface MetricChange {
  /** Already formatted, e.g. "6.1%". */
  label: string
  direction: 'up' | 'down'
  /** Whether the move is good news; a falling CPA is positive. Drives the colour, not the arrow. */
  sentiment: 'positive' | 'negative'
}

export interface WeeklyPoint {
  week: string
  value: number
  /** The current, unfinished week: drawn in the soft colour. */
  inProgress?: boolean
}

export interface Metric {
  id: string
  label: string
  source: MetricSource
  /** Already formatted, e.g. "$48.2k". */
  value: string
  change: MetricChange
  /** One point per day of the period; `previous` is the comparison period. */
  trend: { current: number[]; previous: number[] }
  weekly: WeeklyPoint[]
  /** Formats raw chart values (axis ticks, tooltips). */
  format: 'number' | 'currency' | 'percent' | 'ratio'
  /** A second app it reads from (MER: Shopify and Meta Ads): both logos, the worse dot (CR-5, CR-25). */
  alsoFrom?: MetricSource
  /** A sum or count shown by week instead of a line (CR-2). */
  bars?: boolean
  /** No connected app records it: "No data" (CR-22). */
  unmeasured?: boolean
  /** How it's doing against a target or the benchmark (CR-28). */
  health?: Health
  /** One plain sentence for the metric window's Definition tab. */
  definition?: string
  /** Made in the Metric library: Σ instead of an app logo (06 AC-10). */
  custom?: boolean
}

/** A card's health (CR-28): against a target, or the benchmark when there's none. */
export type Health =
  | {
      by: 'target'
      verdict: 'on' | 'off'
      /** How far off, e.g. "−12%". */
      off?: string
      /** As wider cards show it, e.g. "$55k", "46 a day". */
      target: string
      /** A target per day, drawn on the full chart (CR-13). */
      perDay?: number
    }
  | { by: 'benchmark'; verdict: 'below' | 'above' | 'red' }

export interface BoardCard {
  metricId: string
  size: CardSize
  /** Top-left cell on the 4-column design grid (grid-layout.ts). */
  x: number
  y: number
}

export interface Period {
  id: string
  /** As shown on the trigger, e.g. "vs previous". */
  label: string
  /** As shown in the menu, when it reads differently. */
  menuLabel?: string
}
