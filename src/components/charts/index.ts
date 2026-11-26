// The chart kit: one visual language for every chart on Scorecards, Boards and the metric pages.
//
// Importing from here is always light. Sparkline and TargetBullet are plain SVG/HTML, cheap enough for one
// per scorecard row. TrendChart and WeeklyBars are Recharts (~290 KB), so the ones exported here load that
// chunk the first time one renders, holding their height until then.

export { Sparkline, type SparklineProps } from './Sparkline'
export { TargetBullet, type TargetBulletProps } from './TargetBullet'
export { ChartTooltip, type ChartTooltipRow } from './ChartTooltip'
export {
  formatAxisValue, formatChartValue, formatChartValueExact, formatDay, formatDayLong, formatSpan, type ValueFormat,
} from './format'
export {
  alignComparison, describeSeries, extentOf, meetsTarget, niceTicks, paddedDomain, sparkGeometry, targetStatus, ticksFor,
  type DatedValue, type Series, type SparkGeometry, type TargetBand, type TargetDirection, type TargetStatus, type TrendPoint,
} from './scale'
export { AXIS_TICK, CHART_COLORS, TONE_COLOR, type ChartTone } from './theme'
export { TrendChart, WeeklyBars } from './lazy'
export type { TrendChartProps, TrendTarget } from './TrendChartImpl'
export type { WeeklyBar, WeeklyBarsProps } from './WeeklyBarsImpl'
