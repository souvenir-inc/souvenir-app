// The Settings → Metrics table: one row per metric with its status, who made it, the apps it reads and when it last
// changed; filters (status, created by, area, app) and grouping. Pure, so the screen stays thin and this is testable.

import type { MetricEntry, Workspace } from '@/lib/api/warehouse'
import { appSlugsFor, categoryName, categoryOrder } from './display'
import { changedLine, type GovernanceLog } from './governance'
import { entryFlags, originOf, type Origin } from './library'

export type MetricStatus = 'confirmed' | 'proposed' | 'retired'
export const STATUS_ORDER: readonly MetricStatus[] = ['confirmed', 'proposed', 'retired']
export const STATUS_NAMES: Record<MetricStatus, string> = { confirmed: 'Confirmed', proposed: 'Proposed', retired: 'Retired' }

/** Who made a metric: Souvenir for built-ins, else the person the catalog names. */
export interface Creator {
  kind: 'souvenir' | 'person'
  name: string
}

export const SOUVENIR: Creator = { kind: 'souvenir', name: 'Souvenir' }

export interface TableRow {
  name: string
  label: string
  description: string
  category: string
  area: string
  origin: Origin
  status: MetricStatus
  creator: Creator
  apps: { slug: string; name: string }[]
  /** "12 Nov • Maya Chen" once someone changed the definition; null for untouched built-ins. */
  updated: string | null
}

/**
 * Every built-in starts Confirmed; a metric the catalog marks unverified waits for an admin (Proposed). The catalog
 * has no retired flag or change history yet, so nothing reads Retired and Last updated stays empty (one swap here).
 */
/**
 * The catalog names a metric's maker by login id ("google-oauth2|1053…"); `nameOf` turns that into a person's name
 * (a member of the workspace, or you). An id nobody matches reads "A teammate", never the raw id.
 */
export function tableRows(
  entries: readonly MetricEntry[],
  workspace: Pick<Workspace, 'connectors' | 'connections'> | undefined,
  nameOf: (id: string) => string | undefined = () => undefined,
  log: GovernanceLog = {},
): TableRow[] {
  const appsOf = appsOfArea(workspace)
  const person = (id: string) => nameOf(id) ?? (/[|@]/.test(id) || /^[0-9a-f-]{20,}$/i.test(id) ? 'A teammate' : id)
  return entries.map(entry => {
    const flags = entryFlags(entry)
    const origin = originOf(entry)
    const createdBy = flags.createdBy?.trim()
    return {
      name: entry.name,
      label: entry.label,
      description: entry.description ?? '',
      category: entry.category,
      area: categoryName(entry.category),
      origin,
      status: statusOf(flags.verified === false ? 'proposed' : 'confirmed', log[entry.name]?.action),
      creator: createdBy ? { kind: 'person', name: person(createdBy) } : origin === 'builtin' ? SOUVENIR : { kind: 'person', name: 'Your team' },
      apps: appsOf(entry.category),
      updated: changedLine(log[entry.name]),
    }
  })
}

/** The catalog's status, after what was confirmed or retired here (see governance.ts). */
function statusOf(catalog: MetricStatus, action: GovernanceLog[string]['action'] | undefined): MetricStatus {
  if (action === 'retired') return 'retired'
  if (action === 'confirmed') return 'confirmed'
  return catalog
}

/**
 * The apps that feed an area. Today's API says so per app (each connection lists the areas it feeds); an older answer
 * only lists the apps, so the library's own map stands in.
 */
function appsOfArea(workspace: Pick<Workspace, 'connectors' | 'connections'> | undefined): (category: string) => { slug: string; name: string }[] {
  const connections = workspace?.connections
  if (!connections) return category => appSlugsFor(category, workspace?.connectors ?? [])
  return category => connections
    .filter(connection => connection.feeds.some(feed => feed.category === category && feed.status !== 'not_applicable'))
    .map(connection => ({ slug: connection.connectorSlug, name: connection.name }))
}

export interface TableFilter {
  query: string
  status: readonly MetricStatus[]
  creator: readonly string[]
  area: readonly string[]
  app: readonly string[]
}

export type FilterKind = 'status' | 'creator' | 'area' | 'app'
export const FILTER_KINDS: readonly FilterKind[] = ['status', 'creator', 'area', 'app']
export const FILTER_NAMES: Record<FilterKind, string> = { status: 'Status', creator: 'Created by', area: 'Area', app: 'App' }

export const NO_TABLE_FILTER: TableFilter = { query: '', status: [], creator: [], area: [], app: [] }

export function picksOf(filter: TableFilter, kind: FilterKind): readonly string[] {
  return filter[kind]
}

export function hasPicks(filter: TableFilter): boolean {
  return FILTER_KINDS.some(kind => filter[kind].length > 0)
}

function matches(row: TableRow, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [row.label, row.name, row.description, row.area].some(text => text.toLowerCase().includes(q))
}

/** Picks inside one filter widen (or); different filters narrow (and). */
export function rowMatches(row: TableRow, filter: TableFilter, skip?: FilterKind): boolean {
  if (!matches(row, filter.query)) return false
  if (skip !== 'status' && filter.status.length > 0 && !filter.status.includes(row.status)) return false
  if (skip !== 'creator' && filter.creator.length > 0 && !filter.creator.includes(row.creator.name)) return false
  if (skip !== 'area' && filter.area.length > 0 && !filter.area.includes(row.category)) return false
  if (skip !== 'app' && filter.app.length > 0 && !row.apps.some(app => filter.app.includes(app.slug))) return false
  return true
}

export function filterTable(rows: readonly TableRow[], filter: TableFilter): TableRow[] {
  return rows.filter(row => rowMatches(row, filter))
}

export interface FilterOption {
  value: string
  label: string
  count: number
}

/** The options of one filter, each counted against the other filters (so a count is what picking it would show). */
export function optionsOf(rows: readonly TableRow[], filter: TableFilter, kind: FilterKind): FilterOption[] {
  const pool = rows.filter(row => rowMatches(row, filter, kind))
  const tally = new Map<string, FilterOption>()
  const add = (value: string, label: string) => {
    const option = tally.get(value) ?? { value, label, count: 0 }
    option.count += 1
    tally.set(value, option)
  }
  for (const row of pool) {
    if (kind === 'status') add(row.status, STATUS_NAMES[row.status])
    if (kind === 'creator') add(row.creator.name, row.creator.name)
    if (kind === 'area') add(row.category, row.area)
    if (kind === 'app') row.apps.forEach(app => add(app.slug, app.name))
  }
  if (kind === 'status') return STATUS_ORDER.map(status => tally.get(status) ?? { value: status, label: STATUS_NAMES[status], count: 0 })
  if (kind === 'area') {
    const all = new Map(rows.map(row => [row.category, row.area]))
    return categoryOrder(all.keys()).map(category => tally.get(category) ?? { value: category, label: all.get(category) ?? category, count: 0 })
  }
  const options = [...tally.values()]
  if (kind === 'creator') {
    for (const row of rows) if (!tally.has(row.creator.name)) options.push({ value: row.creator.name, label: row.creator.name, count: 0 })
    return dedupe(options).sort((a, b) => (a.value === SOUVENIR.name ? -1 : b.value === SOUVENIR.name ? 1 : a.label.localeCompare(b.label)))
  }
  for (const row of rows) for (const app of row.apps) if (!tally.has(app.slug)) options.push({ value: app.slug, label: app.name, count: 0 })
  return dedupe(options).sort((a, b) => a.label.localeCompare(b.label))
}

function dedupe(options: FilterOption[]): FilterOption[] {
  const seen = new Set<string>()
  return options.filter(option => (seen.has(option.value) ? false : (seen.add(option.value), true)))
}

export type GroupBy = 'area' | 'creator' | 'app' | 'none'
export const GROUP_NAMES: Record<GroupBy, string> = { area: 'Area', creator: 'Created by', app: 'App', none: 'None' }

export interface TableGroup {
  id: string
  title: string
  creator?: Creator
  rows: TableRow[]
}

/** Rows in groups, in the library's area order; a metric reading two apps sits under each. "None" is one group. */
export function groupTable(rows: readonly TableRow[], by: GroupBy): TableGroup[] {
  if (by === 'none') return rows.length ? [{ id: 'all', title: 'All metrics', rows: [...rows] }] : []
  const groups = new Map<string, TableGroup>()
  const put = (id: string, title: string, row: TableRow, creator?: Creator) => {
    const group = groups.get(id) ?? { id, title, creator, rows: [] }
    group.rows.push(row)
    groups.set(id, group)
  }
  for (const row of rows) {
    if (by === 'area') put(row.category, row.area, row)
    if (by === 'creator') put(`creator:${row.creator.name}`, row.creator.name, row, row.creator)
    if (by === 'app') {
      if (row.apps.length === 0) put('app:none', 'No app', row)
      else row.apps.forEach(app => put(`app:${app.slug}`, app.name, row))
    }
  }
  const list = [...groups.values()]
  if (by === 'area') {
    const order = categoryOrder(list.map(group => group.id))
    return order.map(id => groups.get(id)!).filter(Boolean)
  }
  if (by === 'creator') return list.sort((a, b) => (a.creator?.kind === 'souvenir' ? 1 : b.creator?.kind === 'souvenir' ? -1 : a.title.localeCompare(b.title)))
  return list.sort((a, b) => (a.id === 'app:none' ? 1 : b.id === 'app:none' ? -1 : a.title.localeCompare(b.title)))
}

/** "64 metrics • 9 custom • 1 proposed", or "3 of 64 metrics" while filtered. */
export function countLine(rows: readonly TableRow[], shown: number, filtered: boolean): string {
  if (filtered) return `${shown} of ${rows.length} metrics`
  const custom = rows.filter(row => row.origin === 'custom').length
  const proposed = rows.filter(row => row.status === 'proposed').length
  return [`${rows.length} metrics`, custom > 0 ? `${custom} custom` : null, proposed > 0 ? `${proposed} proposed` : null].filter(Boolean).join(' • ')
}

export function initials(name: string): string {
  const words = name.trim().split(/[\s._@-]+/).filter(Boolean)
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || '?'
}

/** The picked metrics as a CSV a spreadsheet opens: name, definition, area, status, created by, apps. */
export function toCsv(rows: readonly TableRow[]): string {
  const cell = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)
  const lines = [['Metric', 'Definition', 'Area', 'Status', 'Created by', 'Apps']]
  for (const row of rows) lines.push([row.label, row.description, row.area, STATUS_NAMES[row.status], row.creator.name, row.apps.map(app => app.name).join(' & ')])
  return lines.map(line => line.map(cell).join(',')).join('\n')
}
