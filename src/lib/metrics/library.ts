// The library list: one row per catalog metric with what we know about it (built-in or custom, root or nested
// when the formula is known, its number for the window), plus search, filters and the grouping by area.

import type { Measurement, MetricEntry, MetricUnit, Workspace } from '@/lib/api/warehouse'
import { CUSTOM_CATEGORY } from '@/lib/api/warehouse'
import { dataUntil, earliestDate } from '@/lib/warehouse/freshness'
import { categoryName, categoryOrder } from './display'
import { displayOfMetric, fillMissingTotals, isAdditive, kindOf, type DisplayUnit, type FormulaKind, type FormulaLookup, type MetricValue } from './tree'

export type Origin = 'builtin' | 'custom'

export interface LibraryRow {
  name: string
  label: string
  description: string
  category: string
  unit: MetricUnit
  origin: Origin
  /** Root or nested when the formula is known; null for a built-in until the catalog shares formulas (S3). */
  kind: FormulaKind | null
  formula: MetricValue | null
  display: DisplayUnit
  value: number | null
  previous: number | null
  /** Why this store can't measure it, when it can't. */
  unavailable: string | null
}

export function originOf(entry: Pick<MetricEntry, 'category'>): Origin {
  return entry.category === CUSTOM_CATEGORY ? 'custom' : 'builtin'
}

export function unitLookup(catalog: readonly MetricEntry[]): (name: string) => MetricUnit | undefined {
  const units = new Map(catalog.map(entry => [entry.name, entry.unit]))
  return name => units.get(name)
}

export function libraryRows(catalog: readonly MetricEntry[], lookup: FormulaLookup, current?: Measurement, previous?: Measurement, fill: (name: string) => boolean = () => false): LibraryRow[] {
  const values = fillMissingTotals(current?.periods[0]?.values ?? {}, fill).values
  const before = fillMissingTotals(previous?.periods[0]?.values ?? {}, fill).values
  const unitOf = unitLookup(catalog)
  return catalog.map(entry => {
    const formula = lookup(entry.name) ?? null
    return {
      name: entry.name,
      label: entry.label,
      description: entry.description,
      category: entry.category,
      unit: entry.unit,
      origin: originOf(entry),
      kind: kindOf(formula),
      formula,
      display: displayOfMetric(entry.name, entry.unit, formula, unitOf),
      value: values[entry.name] ?? null,
      previous: before[entry.name] ?? null,
      unavailable: current?.unavailable[entry.name] ?? null,
    }
  })
}

export interface LibraryFilter {
  query: string
  category: string | 'all'
  origin: Origin | 'all'
  kind: FormulaKind | 'all'
}

export const NO_FILTER: LibraryFilter = { query: '', category: 'all', origin: 'all', kind: 'all' }

export function isFiltered(filter: LibraryFilter): boolean {
  return filter.query.trim() !== '' || filter.category !== 'all' || filter.origin !== 'all' || filter.kind !== 'all'
}

/** Every word of the search must appear in the label, name, description or area. */
export function matchesQuery(row: LibraryRow, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const haystack = [row.label, row.name, row.name.replace(/_/g, ' '), row.description, categoryName(row.category)].join(' ').toLowerCase()
  return words.every(word => haystack.includes(word))
}

export function filterRows(rows: readonly LibraryRow[], filter: LibraryFilter): LibraryRow[] {
  return rows.filter(row =>
    (filter.category === 'all' || row.category === filter.category)
    && (filter.origin === 'all' || row.origin === filter.origin)
    && (filter.kind === 'all' || row.kind === filter.kind)
    && matchesQuery(row, filter.query))
}

export interface LibrarySection {
  id: string
  title: string
  rows: LibraryRow[]
}

export const UNAVAILABLE_SECTION = 'unavailable'

/** Rows by area in the library's order, custom after the built-in areas; what the store can't measure goes last. */
export function sectionsOf(rows: readonly LibraryRow[]): LibrarySection[] {
  const measurable = rows.filter(row => row.unavailable === null)
  const unavailable = rows.filter(row => row.unavailable !== null)
  const sections: LibrarySection[] = categoryOrder(measurable.map(row => row.category)).map(category => ({
    id: category,
    title: categoryName(category),
    rows: measurable.filter(row => row.category === category),
  }))
  if (unavailable.length > 0) sections.push({ id: UNAVAILABLE_SECTION, title: 'Can’t measure yet', rows: unavailable })
  return sections
}

export interface CategoryOption {
  id: string
  title: string
  count: number
}

export function categoriesIn(rows: readonly LibraryRow[]): CategoryOption[] {
  return categoryOrder(rows.map(row => row.category)).map(category => ({
    id: category,
    title: categoryName(category),
    count: rows.filter(row => row.category === category).length,
  }))
}

/** Counts for the summary line: "78 metrics · 3 custom · 2 nested". */
export function countsOf(rows: readonly LibraryRow[]): { total: number; custom: number; root: number; nested: number } {
  return {
    total: rows.length,
    custom: rows.filter(row => row.origin === 'custom').length,
    root: rows.filter(row => row.kind === 'root').length,
    nested: rows.filter(row => row.kind === 'nested').length,
  }
}

/**
 * The last day a set of metrics has data for: the earliest last-sync day of the areas they read. Pass every name
 * in a metric's tree so a nested metric stops where its first root stops. Custom metrics carry no area of their
 * own; their roots do. Null when nothing cuts.
 */
export function dataUntilOf(names: readonly string[], categoryOf: (name: string) => string | undefined, workspace: Workspace | undefined): string | null {
  if (workspace === undefined) return null
  const categories = [...new Set(names.map(categoryOf).filter((c): c is string => c !== undefined && c !== CUSTOM_CATEGORY))]
  return earliestDate(categories.map(category => dataUntil(workspace, category)))
}

export interface UntilGroup {
  until: string | null
  names: string[]
}

/**
 * Metrics grouped by where their data stops, so each group's windows end on its own day: one request pair per
 * group, not per metric. Past `max` groups, the extra ones join the earliest (cutting earlier never draws a day
 * without data).
 */
export function groupByUntil(names: readonly string[], untilOf: (name: string) => string | null, max: number): UntilGroup[] {
  const groups = new Map<string, string[]>()
  for (const name of names) {
    const key = untilOf(name) ?? ''
    groups.set(key, [...(groups.get(key) ?? []), name])
  }
  // Earliest first; "no cut" ('') sorts first as a string, so put it last.
  const ordered = [...groups.entries()].sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))
  if (ordered.length <= max) return ordered.map(([key, list]) => ({ until: key || null, names: list }))
  const kept = ordered.slice(0, max - 1).map(([key, list]) => ({ until: key || null, names: list }))
  const rest = ordered.slice(max - 1)
  const earliest = rest.map(([key]) => key).filter(Boolean).sort()[0] ?? ''
  kept.push({ until: earliest || null, names: rest.flatMap(([, list]) => list) })
  return kept
}

/** Whether a metric's "no rows" reads as 0 for a period ending on `end` (or a single day starting on it). */
export type FillRule = (name: string, end?: string) => boolean

/**
 * Which metrics read "no rows" as 0: built-in totals (sums and counts, not rates) whose source has synced, for a
 * period that ends on or before the source's last sync day. Past that day "no rows" means "not synced yet", so it
 * stays missing (a "Today" after a failed sync is not $0). See `fillMissingTotals`.
 */
export function zeroFillRule(catalog: readonly MetricEntry[], workspace: Workspace | undefined): FillRule {
  const byName = new Map(catalog.map(entry => [entry.name, entry]))
  return (name, end) => {
    const entry = byName.get(name)
    if (entry === undefined || entry.category === CUSTOM_CATEGORY || workspace === undefined) return false
    const until = dataUntil(workspace, entry.category)
    return isAdditive(name, entry.unit) && until !== null && (end === undefined || end <= until)
  }
}

const SAYS_EXISTS = /\b(already|exists?|available|use the existing)\b/i

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Metrics a chat reply points to when it says one already exists ("This is already available as MER"), in the
 * order it names them, so the reply can offer "Open MER". Labels match as written (MER, not the word "revenue"
 * in a sentence); technical names match as written too (`ad_spend`).
 */
export function mentionedMetrics(reply: string, catalog: readonly MetricEntry[], limit = 2): MetricEntry[] {
  if (!SAYS_EXISTS.test(reply)) return []
  const found: Array<{ entry: MetricEntry; at: number }> = []
  for (const entry of catalog) {
    // A plain-word name ("revenue") is just a word in a sentence; only a technical name (`ad_spend`) counts.
    const forms = entry.name.includes('_') ? [entry.label, entry.name] : [entry.label]
    const pattern = new RegExp(`(^|[^A-Za-z0-9_])(${forms.map(escapeRegExp).join('|')})(?=$|[^A-Za-z0-9_])`)
    const match = pattern.exec(reply)
    if (match) found.push({ entry, at: match.index + match[1].length })
  }
  return found.sort((a, b) => a.at - b.at || b.entry.label.length - a.entry.label.length).slice(0, limit).map(item => item.entry)
}

/** The catalog's governance fields (S3/S5), read defensively so screens work before and after the schema has them. */
export function entryFlags(entry: MetricEntry): { overridden: boolean; createdBy: string | null; verified: boolean | null } {
  const loose = entry as MetricEntry & { overridden?: unknown; createdBy?: unknown; verified?: unknown }
  return {
    overridden: loose.overridden === true,
    createdBy: typeof loose.createdBy === 'string' ? loose.createdBy : null,
    verified: typeof loose.verified === 'boolean' ? loose.verified : null,
  }
}

/** Whose definition this is, in words: "Built in", "Adjusted by your organization" or "Custom". */
export function originLabel(entry: MetricEntry): string {
  if (entry.category === CUSTOM_CATEGORY || entryFlags(entry).createdBy !== null) return 'Custom'
  return entryFlags(entry).overridden ? 'Adjusted by your organization' : 'Built in'
}

/**
 * The metric reads a source that has never synced (an app connected but no data yet, like a shipping app on its
 * first sync). Whatever the API answers for it (it can say 0), there's nothing to show yet. Pass every name in the
 * metric's tree, so a margin built on a never-synced cost says "No data yet", not a margin.
 */
export function neverSynced(names: readonly string[], categoryOf: (name: string) => string | undefined, workspace: Workspace | undefined): boolean {
  if (workspace === undefined) return false
  const categories = new Set(names.map(categoryOf).filter((c): c is string => c !== undefined && c !== CUSTOM_CATEGORY))
  return workspace.categories.some(state => categories.has(state.category) && state.status !== 'not_applicable' && state.lastSyncedAt === null)
}
