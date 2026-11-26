// Formulas for the custom metrics made in this browser, kept per workspace.
//
// The catalog returns no formulas yet (ask S3), so once a custom metric is saved its "How it's calculated" tree
// would be lost. We keep the `value` we sent to the warehouse here. This is the one seam S3 replaces: when the
// catalog carries `value`, `formulaLookup` reads it from there first and this store stops mattering.
//
// Browser storage can be missing, full or blocked, so every access is wrapped and failure means "no formula".

import type { MetricEntry } from '@/lib/api/warehouse'
import { isMetricValue, type FormulaLookup, type MetricValue } from './tree'

export interface SavedFormula {
  value: MetricValue
  /** ISO time it was saved through our UI. */
  savedAt: string
}

export type FormulaRegistry = Readonly<Record<string, SavedFormula>>

export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const KEY_PREFIX = 'souvenir.metric-formulas.v1:'
export const REGISTRY_EVENT = 'souvenir:metric-formulas'

export function registryKey(workspaceId: string): string {
  return `${KEY_PREFIX}${workspaceId}`
}

function browserStore(): KeyValueStore | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/** The stored text, as is. Stable between calls while nothing changes, so it suits useSyncExternalStore. */
export function readRaw(workspaceId: string, store: KeyValueStore | null = browserStore()): string | null {
  if (store === null || workspaceId === '') return null
  try {
    return store.getItem(registryKey(workspaceId))
  } catch {
    return null
  }
}

/** Parses stored text, keeping only entries that are still a valid formula. */
export function parseRegistry(raw: string | null): FormulaRegistry {
  if (raw === null) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    const out: Record<string, SavedFormula> = {}
    for (const [name, entry] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof entry !== 'object' || entry === null) continue
      const { value, savedAt } = entry as Record<string, unknown>
      if (isMetricValue(value)) out[name] = { value, savedAt: typeof savedAt === 'string' ? savedAt : '' }
    }
    return out
  } catch {
    return {}
  }
}

export function readRegistry(workspaceId: string, store: KeyValueStore | null = browserStore()): FormulaRegistry {
  return parseRegistry(readRaw(workspaceId, store))
}

function write(workspaceId: string, registry: FormulaRegistry, store: KeyValueStore | null): boolean {
  if (store === null || workspaceId === '') return false
  try {
    if (Object.keys(registry).length === 0) store.removeItem(registryKey(workspaceId))
    else store.setItem(registryKey(workspaceId), JSON.stringify(registry))
  } catch {
    return false
  }
  // Same-tab listeners; other tabs hear the browser's own storage event.
  try {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(REGISTRY_EVENT, { detail: { workspaceId } }))
  } catch {
    // Nothing is listening in this environment.
  }
  return true
}

/** Keeps the formula of a custom metric the warehouse just accepted. False when the browser wouldn't store it. */
export function rememberFormula(workspaceId: string, name: string, value: MetricValue, store: KeyValueStore | null = browserStore(), now = new Date()): boolean {
  if (!isMetricValue(value)) return false
  const registry = readRegistry(workspaceId, store)
  return write(workspaceId, { ...registry, [name]: { value, savedAt: now.toISOString() } }, store)
}

/** Drops a formula, after its metric is deleted. */
export function forgetFormula(workspaceId: string, name: string, store: KeyValueStore | null = browserStore()): boolean {
  const registry = readRegistry(workspaceId, store)
  if (!(name in registry)) return true
  const rest = Object.fromEntries(Object.entries(registry).filter(([key]) => key !== name))
  return write(workspaceId, rest, store)
}

/** Formulas for metrics that are no longer custom metrics in the catalog (deleted elsewhere) are ignored. */
export function liveFormulas(registry: FormulaRegistry, catalog: readonly MetricEntry[]): FormulaRegistry {
  const custom = new Set(catalog.filter(entry => entry.category === 'custom').map(entry => entry.name))
  return Object.fromEntries(Object.entries(registry).filter(([name]) => custom.has(name)))
}

/** A catalog entry's own formula, once the catalog returns one (S3). Unvalidated today, so checked here. */
function catalogValue(entry: MetricEntry | undefined): MetricValue | null {
  const value = (entry as (MetricEntry & { value?: unknown }) | undefined)?.value
  return isMetricValue(value) ? value : null
}

/**
 * Where a metric's formula comes from: the catalog first (S3), then this browser's registry for custom metrics.
 * A built-in with no formula in the catalog has none: we never guess one.
 */
export function formulaLookup(catalog: readonly MetricEntry[], registry: FormulaRegistry, extra?: Readonly<Record<string, MetricValue>>): FormulaLookup {
  const byName = new Map(catalog.map(entry => [entry.name, entry]))
  return name => {
    if (extra?.[name]) return extra[name]
    const entry = byName.get(name)
    const fromCatalog = catalogValue(entry)
    if (fromCatalog !== null) return fromCatalog
    // A built-in's formula only ever comes from the catalog (S3); without it, it has none. Never a guess.
    if (entry !== undefined && entry.category !== 'custom') return null
    return registry[name]?.value ?? null
  }
}

/** Where a known formula came from: the catalog itself (S3), or, for a custom metric it lacks, this browser. */
export function formulaSource(entry: MetricEntry | undefined, registry: FormulaRegistry): 'catalog' | 'this-browser' | null {
  if (catalogValue(entry) !== null) return 'catalog'
  if (entry !== undefined && entry.category === 'custom' && registry[entry.name] !== undefined) return 'this-browser'
  return null
}
