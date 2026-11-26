// Words and numbers for targets and health. Pure, so the wording is tested without React.

import type { MetricUnit } from '@/lib/api/warehouse'
import { formatCount, formatCurrency, formatCurrencyCompact, formatPercent } from '@/lib/home/format'
import type { Direction, DisplayFormat, ResolvedTarget, Row } from './model'
import { PERIOD_LABELS, type Health, type HealthGrey, type MetricTarget, type TargetNumber } from './targets'
import { isMultipleName } from './template'

/** How a row's numbers read: the row's display format, else one inferred from the metric. */
export function formatOf(row: Pick<Row, 'display'> | null, unit: MetricUnit, name: string): DisplayFormat {
  if (row?.display?.format) return row.display.format
  if (isMultipleName(name)) return 'multiple'
  if (unit === 'ratio') return 'percent'
  if (unit === 'money') return 'money'
  return 'number'
}

/** A value as the table shows it: compact money, whole counts, percentages, multiples. Null is a dash. */
export function formatValue(value: number | null, format: DisplayFormat): string {
  if (value === null) return '—'
  switch (format) {
    case 'money': return formatCurrencyCompact(value)
    case 'percent': return formatPercent(value * 100, 1)
    case 'multiple': return `${new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(value)}×`
    case 'number': return formatCount(value)
  }
}

/** A value spelled out in full, for the side panel's headline and sentences. */
export function formatExact(value: number | null, format: DisplayFormat): string {
  if (value === null) return 'no data'
  if (format === 'money') return formatCurrency(value)
  if (format === 'percent') return formatPercent(value * 100, 2)
  return formatValue(value, format)
}

// ── Target input ─────────────────────────────────────────────────────────────
// People type a refund rate as "4" meaning 4%, and a MER as "3" meaning 3×. The model keeps the warehouse's own
// scale (0.04, 3), so the edit form converts both ways.

function inputScale(format: DisplayFormat): number {
  return format === 'percent' ? 100 : 1
}

export function toInput(value: number | null | undefined, format: DisplayFormat): string {
  if (value === null || value === undefined) return ''
  return String(Math.round(value * inputScale(format) * 10_000) / 10_000)
}

/** The model value for what was typed ("120k", "$1.2M", "2B", "4%", "3x"): null for blank, NaN for not a number. */
export function fromInput(text: string, format: DisplayFormat): number | null {
  const cleaned = text.replace(/[,\s$%×]/g, '').replace(/x$/i, '')
  if (cleaned === '') return null
  const match = /^(-?\d*\.?\d+)([kmb])?$/i.exec(cleaned)
  if (!match) return Number.NaN
  const unit = match[2]?.toLowerCase()
  const scale = unit === 'b' ? 1_000_000_000 : unit === 'm' ? 1_000_000 : unit === 'k' ? 1_000 : 1
  return (Number(match[1]) * scale) / inputScale(format)
}

export type ParsedTarget =
  | { kind: 'none' }
  | { kind: 'value'; value: number }
  | { kind: 'range'; low: number; high: number }
  | { kind: 'invalid'; message: string }

/** A target typed in one field: a number, or for a range "4k–6k" (also "4k-6k", "4k to 6k"). Blank clears it. */
export function parseTarget(text: string, format: DisplayFormat, direction: Direction): ParsedTarget {
  if (text.trim() === '') return { kind: 'none' }
  if (direction === 'range') {
    const joined = text
      .replace(/\s+to\s+/i, '|')
      .replace(/[–—]/g, '|')
      .replace(/(\d[kmb%]?)\s*-\s*(?=[$\d.])/i, '$1|')
    const parts = joined.split('|').filter(part => part.trim() !== '')
    if (parts.length !== 2) return { kind: 'invalid', message: 'Enter a range, like 4k–6k' }
    const [low, high] = parts.map(part => fromInput(part, format))
    if (low === null || high === null || Number.isNaN(low) || Number.isNaN(high)) return { kind: 'invalid', message: 'Enter a range, like 4k–6k' }
    return { kind: 'range', low: Math.min(low, high), high: Math.max(low, high) }
  }
  const value = fromInput(text, format)
  if (value === null) return { kind: 'none' }
  if (Number.isNaN(value)) return { kind: 'invalid', message: 'Enter a number, like 120k' }
  return { kind: 'value', value }
}

/** True when what's typed reads as a range ("4k–6k", "4000 - 6000", "4k to 6k"). */
export function looksLikeRange(text: string): boolean {
  return /\d[kmb%]?\s*(?:–|—|-|\bto\b)\s*[$\d.]/i.test(text.trim())
}

/** A typed target: a range if it reads as one (that makes the metric "stay in range"), else a number. */
export function parseTargetAuto(text: string, format: DisplayFormat, direction: Direction): ParsedTarget {
  return parseTarget(text, format, looksLikeRange(text) ? 'range' : direction)
}

/** The symbol around a target input. */
export function inputAffix(format: DisplayFormat): { prefix: string | null; suffix: string | null } {
  if (format === 'money') return { prefix: '$', suffix: null }
  if (format === 'percent') return { prefix: null, suffix: '%' }
  if (format === 'multiple') return { prefix: null, suffix: '×' }
  return { prefix: null, suffix: null }
}

// ── Direction and target ─────────────────────────────────────────────────────

export const DIRECTION_LABELS: Record<Direction, string> = {
  higher: 'Higher is better',
  lower: 'Lower is better',
  range: 'Stay in a range',
}

/** "≥ $120k", "≤ 4.0%", "$4k–$6k". */
export function formatTarget(target: ResolvedTarget | null, direction: Direction, format: DisplayFormat): string | null {
  if (target === null) return null
  if (target.kind === 'range' || direction === 'range') {
    const low = target.kind === 'range' ? target.low : target.value
    const high = target.kind === 'range' ? target.high : target.value
    return low === high ? `= ${formatValue(low, format)}` : `${formatValue(low, format)}–${formatValue(high, format)}`
  }
  return `${direction === 'higher' ? '≥' : '≤'} ${formatValue(target.value, format)}`
}

/** "−3%", "+6%": the gap to target, signed so negative is bad. */
export function formatGap(gapPct: number | null): string | null {
  if (gapPct === null) return null
  const rounded = Math.round(gapPct * 100)
  if (rounded === 0) return gapPct < 0 ? '−<1%' : '0%'
  return `${rounded < 0 ? '−' : '+'}${Math.abs(rounded)}%`
}

// ── Health (targets on the metrics page) ─────────────────────────────────────

const HEALTH_GREY_LABELS: Record<HealthGrey, string> = {
  no_target: 'Set a target',
  no_data: 'No data',
  no_data_yet: 'No data yet',
  unavailable: "Can't measure",
  too_small: 'Too few to judge',
  too_early: 'Too early',
}

/** The pill's words: "On track", "Close −3%", "Off target −12%", or why there's no colour. */
export function healthLabel(health: Health): string {
  if (health.verdict === 'green') return 'On track'
  if (health.verdict === 'amber' || health.verdict === 'red') {
    const gap = formatGap(health.gapPct)
    return `${health.verdict === 'amber' ? 'Close' : 'Off target'}${gap ? ` ${gap}` : ''}`
  }
  return HEALTH_GREY_LABELS[health.verdict]
}

/** "4.5 days", "7 days", "today so far": how long the period the target was scaled to is. */
export function spanLabel(days: number): string {
  if (days < 1) return 'today so far'
  const rounded = Math.round(days * 10) / 10
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} ${rounded === 1 ? 'day' : 'days'}`
}

/** A period target's number as the table writes it: "≥ 433", "≤ 4.0%", "$4k–$6k". */
export function formatPeriodTarget(number: TargetNumber, direction: Direction, format: DisplayFormat): string | null {
  const resolvedTarget: ResolvedTarget = 'value' in number ? { kind: 'value', value: number.value } : { kind: 'range', low: number.low, high: number.high }
  return formatTarget(resolvedTarget, direction, format)
}

/**
 * How the target on screen came about, in one sentence:
 * "Weekly target ≥ 100, so ≥ 429 for these 30 days." or "Monthly ≥ 433 (worked out from weekly ≥ 100), so…".
 */
export function scalingSentence(target: MetricTarget, health: Health, format: DisplayFormat): string | null {
  const basis = health.basis
  if (basis === null) return null
  const label = PERIOD_LABELS[basis.period].adjective
  const typed = formatPeriodTarget(basis.number, target.direction, format)
  const origin = basis.derived && basis.from
    ? ` (worked out from the ${PERIOD_LABELS[basis.from].adjective.toLowerCase()} target)`
    : ''
  if (!health.additive) return `${label} target ${typed}${origin}. A rate is compared as it is, whatever the period.`
  const scaled = formatTarget(health.expected, target.direction, format)
  const span = health.days < 1 ? 'today so far' : `these ${spanLabel(health.days)}`
  return `${label} target ${typed}${origin}, so ${scaled} for ${span}.`
}
