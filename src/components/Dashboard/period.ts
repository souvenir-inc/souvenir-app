// A board's dates (docs-v2/dashboard/11-dates-tabs-reference-rules.md DT-1 – DT-7): the preset ids
// ("7d") and custom ranges ("custom:2025-10-12:2025-11-09"), their names, and how comparisons read.
// Pure, no imports beyond the presets, so series.ts and the UI can both use it.

import { COMPARISONS, PERIODS } from './mock-data'

const DAY = 86_400_000

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fromIso = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }

export const isCustom = (id: string) => id.startsWith('custom:')

/** A custom range's id, ends in order. */
export function customId(a: Date, b: Date): string {
  const [from, to] = a.getTime() <= b.getTime() ? [a, b] : [b, a]
  return `custom:${iso(from)}:${iso(to)}`
}

/** A custom range's first and last day, or null for a preset. */
export function customRange(id: string): { from: Date; to: Date } | null {
  if (!isCustom(id)) return null
  const [, a, b] = id.split(':')
  return { from: fromIso(a), to: fromIso(b) }
}

/** Days in a custom range, both ends counted. */
export const rangeDays = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / DAY) + 1

/** "12 Oct", "12 Oct 2024". */
export const dayMonth = (d: Date, year = false) =>
  d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}) })

/** "Last 7 days"; "12 Oct – 9 Nov" for a custom range. */
export function periodName(id: string): string {
  const r = customRange(id)
  if (r) return `${dayMonth(r.from)} – ${dayMonth(r.to)}`
  return PERIODS.find((p) => p.id === id)?.label ?? id
}

/** "vs previous" or "vs last year", as the period trigger shows it. */
export const compareShort = (id: string) => COMPARISONS.find((c) => c.id === id)?.label ?? ''

/** "12 Oct – 9 Nov · 29 days, compared with the 29 days before" (DT-4). */
export function rangeSummary(from: Date, to: Date, compare: string): string {
  const n = rangeDays(from, to)
  const days = `${n} day${n === 1 ? '' : 's'}`
  const vs = compare === 'last-year' ? 'compared with the same days last year' : compare === 'none' ? 'no comparison' : `compared with the ${days} before`
  return `${dayMonth(from)} – ${dayMonth(to)} · ${days}, ${vs}`
}

/** What the comparison is called beside "This period" (DT-7). */
export const compareName = (compare: string) => (compare === 'last-year' ? 'Same period last year' : 'Previous period')

/** The same day a year before. */
export const yearBefore = (d: Date) => new Date(d.getFullYear() - 1, d.getMonth(), d.getDate())
