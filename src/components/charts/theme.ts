// The chart kit's palette and type, as CSS variables from the theme tokens, so every chart follows
// light and dark mode the way Home does. Charts never hard-code a colour; they read one of these.

export const CHART_COLORS = {
  /** The series being looked at. Near-black, like Home's figures. */
  ink: 'var(--neutral-900)',
  /** The comparison series drawn behind it. */
  comparison: 'var(--neutral-300)',
  /** Hairlines: grid, baseline, bar track. */
  grid: 'var(--border-default)',
  /** Axis and caption text. */
  axis: 'var(--neutral-500)',
  /** Fill under an area, faded out by the gradient. */
  wash: 'var(--neutral-900)',
  /** A target band or a target tick. */
  target: 'var(--success-500)',
  targetWash: 'var(--success-500)',
  positive: 'var(--success-600)',
  negative: 'var(--danger-500)',
  caution: 'var(--warning-500)',
  surface: 'var(--neutral-white)',
} as const

export type ChartTone = 'neutral' | 'positive' | 'negative'

export const TONE_COLOR: Record<ChartTone, string> = {
  neutral: CHART_COLORS.ink,
  positive: CHART_COLORS.positive,
  negative: CHART_COLORS.negative,
}

/** Tick text on every axis: 11px caption, muted, tabular so figures don't jitter. */
export const AXIS_TICK = {
  fill: CHART_COLORS.axis,
  fontSize: 11,
  fontVariantNumeric: 'tabular-nums',
} as const

/** Entrance only; data updates don't replay the animation. */
export const CHART_ANIMATION_MS = 420
