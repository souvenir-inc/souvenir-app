// Settings → Data → Data rules, read from what exists today: the order rules the catalog's own definitions apply (their
// `where` clauses), and which app feeds each kind of data. There's no rules API yet, so nothing here can be switched
// or added; the screen shows each rule as built in and names the metrics it shapes. The swap: a rules endpoint.

import type { MetricEntry, Workspace } from '@/lib/api/warehouse'
import { categoryName, categoryOrder } from './display'

export interface DataRule {
  id: string
  title: string
  hint: string
  /** Metrics that apply the rule, directly or through a metric they're built on. */
  metrics: { name: string; label: string }[]
}

const onlySales = (where: string) => /(^|[^\w])is_sale\b/.test(where) && !/not\s+is_sale/.test(where)

const RULES: ReadonlyArray<{ id: string; title: string; hint: string; test: (where: string) => boolean }> = [
  // A test order is never a sale, so every sales-only definition leaves it out too.
  { id: 'test', title: 'Test orders', hint: 'Placed in test mode', test: where => /order_type\s*<>\s*'test'/.test(where) || onlySales(where) },
  { id: 'cancelled', title: 'Cancelled orders', hint: 'Cancelled after checkout', test: where => /cancelled_at\s+is\s+null/.test(where) },
  { id: 'not-sale', title: 'Orders that aren’t sales', hint: 'Replacements, exchanges, gifts & free orders', test: onlySales },
]

type Value = unknown

/** The metric names a formula reads, at any depth. */
function referenced(value: Value, out: Set<string> = new Set()): Set<string> {
  if (typeof value === 'string') out.add(value)
  else if (Array.isArray(value)) value.forEach(item => referenced(item, out))
  else if (value && typeof value === 'object') {
    const node = value as Record<string, unknown>
    if ('kind' in node && 'table' in node) return out
    for (const key of ['terms', 'left', 'right', 'numerator', 'denominator']) if (key in node) referenced(node[key], out)
  }
  return out
}

export function dataRules(entries: readonly MetricEntry[]): DataRule[] {
  const byName = new Map(entries.map(entry => [entry.name, entry]))
  const direct = new Map<string, Set<string>>()
  for (const entry of entries) {
    const value = entry.value as { kind?: string; table?: string; where?: string | null } | undefined
    if (!value || value.table !== 'orders' || !value.where) continue
    for (const rule of RULES) if (rule.test(value.where)) direct.set(rule.id, new Set([...(direct.get(rule.id) ?? []), entry.name]))
  }
  const applies = (name: string, rule: string, seen: Set<string> = new Set()): boolean => {
    if (direct.get(rule)?.has(name)) return true
    if (seen.has(name)) return false
    seen.add(name)
    return [...referenced(byName.get(name)?.value)].some(ref => byName.has(ref) && applies(ref, rule, seen))
  }
  return RULES
    .map(rule => ({
      id: rule.id,
      title: rule.title,
      hint: rule.hint,
      metrics: entries.filter(entry => applies(entry.name, rule.id)).map(entry => ({ name: entry.name, label: entry.label })),
    }))
    .filter(rule => rule.metrics.length > 0)
}

export interface AreaApps {
  category: string
  title: string
  apps: { slug: string; name: string; status: string; lastSyncedAt: string | null; error: string | null }[]
}

/** Each kind of data, with the connected apps that feed it, from the API's per-app feeds. */
export function appsByArea(workspace: Pick<Workspace, 'connections' | 'categories'> | undefined): AreaApps[] {
  const connections = workspace?.connections ?? []
  const areas = new Map<string, AreaApps>()
  for (const connection of connections) {
    for (const feed of connection.feeds) {
      if (feed.status === 'not_applicable') continue
      const area = areas.get(feed.category) ?? { category: feed.category, title: categoryName(feed.category), apps: [] }
      area.apps.push({ slug: connection.connectorSlug, name: connection.name, status: feed.status, lastSyncedAt: feed.lastSyncedAt ?? null, error: feed.error ?? null })
      areas.set(feed.category, area)
    }
  }
  return categoryOrder(areas.keys()).map(category => areas.get(category)!).filter(Boolean)
}

/** "Up to date • Synced 3 min ago", "Sync failed • Data from 9:42 am", "Syncing…" (copy rules: state • time). */
export function syncLine(status: string, lastSyncedAt: string | null, now: number = Date.now()): string {
  const at = lastSyncedAt ? Date.parse(lastSyncedAt) : NaN
  const ago = Number.isFinite(at) ? agoText(now - at) : null
  if (status === 'failed') return ago ? `Sync failed • Data from ${clock(at)}` : 'Sync failed'
  if (status === 'building') return 'First sync • Data on its way'
  if (status === 'syncing' || status === 'queued') return 'Syncing…'
  return ago ? `Up to date • Synced ${ago}` : 'Up to date'
}

function agoText(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  return `${days} ${days === 1 ? 'day' : 'days'} ago`
}

function clock(at: number): string {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(at)).toLowerCase()
}
