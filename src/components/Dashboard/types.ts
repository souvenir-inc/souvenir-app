// Dashboard data model. Server-shaped data (Metric) is kept apart from the board layout (BoardCard),
// so a metric can be shown at any size and the layout can be saved on its own later.

export type MetricSource = 'shopify' | 'meta'

/** sm = 1×1 figure only · md = 2×1 figure + sparkline · lg = 2×2 figure + weekly bars. */
export type CardSize = 'sm' | 'md' | 'lg'

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
}

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
