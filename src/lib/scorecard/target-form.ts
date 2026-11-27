// The target form's rules: what each field accepts, and how typed text becomes a scorecard row.
// People type a refund rate as "4.5" meaning 4.5 %, revenue as "55k", a tolerance as "10" meaning
// 10 %. The row keeps the warehouse's own scale (0.045, 55000, 0.1), so the form converts both ways.

import { z } from 'zod'
import type { Unit } from '@/lib/api/warehouse'
import type { ScorecardRow } from './status'

/** Longest number anyone types ("-1,234,567.89k"); also caps the parser's input (RG-1). */
export const NUMBER_MAX = 24
/** The backend sets no limit on a note; this keeps one short enough to read in the window. */
export const NOTE_MAX = 500

/** A percent metric is stored as a share (0.045) and typed as a percentage (4.5). */
export function inputScale(unit: Unit): number {
  return unit === 'percent' ? 100 : 1
}

/** A stored number as the field shows it, rounded to 4 places so 0.045 × 100 reads 4.5, not 4.499999. */
export function toInput(value: number, scale = 1): string {
  return String(Math.round(value * scale * 10_000) / 10_000)
}

/**
 * What was typed as a number ("55k", "$1.2M", "1,200", "4.5%", "3.1x", "-500"); null when it isn't one.
 * Linear on capped input: one anchored pattern, no nested repetition.
 */
export function parseAmount(text: string): number | null {
  const cleaned = text.slice(0, NUMBER_MAX).replace(/[,\s$%×]/g, '').replace(/x$/i, '')
  const match = /^(-?(?:\d+(?:\.\d*)?|\.\d+))([kmb])?$/i.exec(cleaned)
  if (!match) return null
  const suffix = match[2]?.toLowerCase()
  const factor = suffix === 'b' ? 1e9 : suffix === 'm' ? 1e6 : suffix === 'k' ? 1e3 : 1
  const value = Number(match[1]) * factor
  return Number.isFinite(value) ? value : null
}

export const NO_OWNER = ''

/** The form as typed: every field is text or a choice, so the inputs stay controlled strings. */
export interface TargetFormValues extends Record<string, unknown> {
  target: string
  direction: ScorecardRow['direction']
  tolerance: string
  owner: string
  note: string
}

export const targetFormSchema = z.object({
  target: z.string().trim()
    .min(1, 'Enter a target, like 55k or 4.5.')
    .refine((text) => parseAmount(text) !== null, 'Enter the target as a number, like 55k or 4.5.')
    .transform((text) => parseAmount(text) as number),
  direction: z.enum(['up', 'down']),
  tolerance: z.string().trim()
    .refine((text) => text === '' || parseAmount(text) !== null, 'Enter the tolerance as a number from 0 to 100.')
    .transform((text) => (text === '' ? 0 : (parseAmount(text) as number)))
    .refine((n) => n >= 0 && n <= 100, 'Enter a tolerance from 0 to 100%.'),
  owner: z.string(),
  note: z.string().trim().max(NOTE_MAX, `Keep the note to ${NOTE_MAX} characters.`),
})

export type TargetFormOutput = z.output<typeof targetFormSchema>

/** A new target leans the metric's way and allows 10 % short before it's off track. */
export const DEFAULT_TOLERANCE = 0.1

/** The form's starting values: the saved row, or an empty target that leans the metric's way. */
export function formValuesOf(row: ScorecardRow | null, unit: Unit, upIsGood: boolean): TargetFormValues {
  if (!row) return { target: '', direction: upIsGood ? 'up' : 'down', tolerance: toInput(DEFAULT_TOLERANCE, 100), owner: NO_OWNER, note: '' }
  return {
    target: toInput(row.target, inputScale(unit)),
    direction: row.direction,
    tolerance: toInput(row.tolerance, 100),
    owner: row.owner ?? NO_OWNER,
    note: row.note,
  }
}

/** The row to save for a metric from what the form parsed. */
export function rowOf(metric: string, values: TargetFormOutput, unit: Unit): ScorecardRow {
  return {
    metric,
    target: values.target / inputScale(unit),
    direction: values.direction,
    tolerance: values.tolerance / 100,
    owner: values.owner === NO_OWNER ? null : values.owner,
    note: values.note,
  }
}
