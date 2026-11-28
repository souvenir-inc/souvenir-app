// The Settings → Metrics table: one row per metric with its status, who made it and the apps it reads; search,
// filters (status, created by, area, app) and grouping. Pure, so the screen stays thin and this is testable.
// Filter values and creator ids come from the catalog, so every tally is a Map (JS-1).

import type { MetricEntry, MetricStatus } from '@/lib/api/warehouse-schemas'
import { originOf, type Origin } from './catalog'
import { categoryName, categoryOrder } from './display'

/** Confirmed by an admin; proposed by a member and waiting for one; retired, still measuring but replaced. */
export type { MetricStatus }
export const STATUS_ORDER: readonly MetricStatus[] = ['confirmed', 'proposed', 'retired']
export const STATUS_NAMES: ReadonlyMap<MetricStatus, string> = new Map([['confirmed', 'Confirmed'], ['proposed', 'Proposed'], ['retired', 'Retired']])

/** Who made a metric: Souvenir for library metrics, else the person the catalog names. */
export interface Creator {
  kind: 'souvenir' | 'person'
  name: string
}

export const SOUVENIR: Creator = { kind: 'souvenir', name: 'Souvenir' }

export interface App { slug: string; name: string }

export interface TableRow {
  name: string
  label: string
  description: string
  category: string
  area: string
  origin: Origin
  status: MetricStatus
  creator: Creator
  apps: App[]
}

const LOGIN_ID = /[|@]|^[0-9a-f-]{20,}$/i

/**
 * Rows for the table. The catalog names a custom metric's maker by login id ("google-oauth2|1053…"); `nameOf`
 * turns that into a person's name (a workspace member, or you). An id nobody matches reads "A teammate", never
 * the raw id. `appsOf` gives the connected apps that feed an area.
 */
export function tableRows(
  entries: readonly MetricEntry[],
  appsOf: (category: string) => App[],
  nameOf: (id: string) => string | undefined = () => undefined,
): TableRow[] {
  const person = (id: string) => nameOf(id) ?? (LOGIN_ID.test(id.slice(0, 200)) ? 'A teammate' : id.slice(0, 80))
  return entries.map(entry => {
    const origin = originOf(entry)
    const createdBy = entry.createdBy?.trim()
    return {
      name: entry.name,
      label: entry.label,
      description: entry.description,
      category: entry.category,
      area: categoryName(entry.category),
      origin,
      status: entry.status,
      creator: createdBy ? { kind: 'person', name: person(createdBy) } : origin === 'builtin' ? SOUVENIR : { kind: 'person', name: 'Your team' },
      apps: appsOf(entry.category),
    }
  })
}

export interface TableFilter {
  query: string
  status: readonly string[]
  creator: readonly string[]
  area: readonly string[]
  app: readonly string[]
}

export type FilterKind = 'status' | 'creator' | 'area' | 'app'
export const FILTER_KINDS: readonly FilterKind[] = ['status', 'creator', 'area', 'app']
export const FILTER_NAMES: ReadonlyMap<FilterKind, string> = new Map([['status', 'Status'], ['creator', 'Created by'], ['area', 'Area'], ['app', 'App']])

export const NO_TABLE_FILTER: TableFilter = { query: '', status: [], creator: [], area: [], app: [] }

/** Longest search the table reads. */
export const MAX_QUERY_LENGTH = 100

export function isFiltered(filter: TableFilter): boolean {
  return filter.query.trim() !== '' || FILTER_KINDS.some(kind => filter[kind].length > 0)
}

function matches(row: TableRow, query: string): boolean {
  const q = query.slice(0, MAX_QUERY_LENGTH).trim().toLowerCase()
  if (!q) return true
  return [row.label, row.name, row.name.replace(/_/g, ' '), row.description, row.area].some(text => text.toLowerCase().includes(q))
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
  const tally = new Map<string, FilterOption>()
  const seed = (value: string, label: string) => { if (!tally.has(value)) tally.set(value, { value, label, count: 0 }) }
  // Every option shows, even at 0, so a pick never vanishes from its own menu.
  for (const row of rows) {
    if (kind === 'status') seed(row.status, STATUS_NAMES.get(row.status) ?? row.status)
    if (kind === 'creator') seed(row.creator.name, row.creator.name)
    if (kind === 'area') seed(row.category, row.area)
    if (kind === 'app') row.apps.forEach(app => seed(app.slug, app.name))
  }
  for (const row of rows) {
    if (!rowMatches(row, filter, kind)) continue
    const values = kind === 'status' ? [row.status] : kind === 'creator' ? [row.creator.name] : kind === 'area' ? [row.category] : row.apps.map(app => app.slug)
    for (const value of values) {
      const option = tally.get(value)
      if (option) option.count += 1
    }
  }
  const options = [...tally.values()]
  if (kind === 'status') return STATUS_ORDER.flatMap(status => tally.get(status) ?? [])
  if (kind === 'area') return categoryOrder(tally.keys()).flatMap(category => tally.get(category) ?? [])
  if (kind === 'creator') return options.sort((a, b) => (a.value === SOUVENIR.name ? -1 : b.value === SOUVENIR.name ? 1 : a.label.localeCompare(b.label)))
  return options.sort((a, b) => a.label.localeCompare(b.label))
}

export type GroupBy = 'area' | 'creator' | 'app' | 'none'
export const GROUP_NAMES: ReadonlyMap<GroupBy, string> = new Map([['area', 'Area'], ['creator', 'Created by'], ['app', 'App'], ['none', 'None']])

export interface TableGroup {
  id: string
  title: string
  rows: TableRow[]
}

/** Rows in groups, in the library's area order; a metric reading two apps sits under each. "None" is one group. */
export function groupTable(rows: readonly TableRow[], by: GroupBy): TableGroup[] {
  if (by === 'none') return rows.length ? [{ id: 'all', title: 'All metrics', rows: [...rows] }] : []
  const groups = new Map<string, TableGroup>()
  const put = (id: string, title: string, row: TableRow) => {
    const group = groups.get(id) ?? { id, title, rows: [] }
    group.rows.push(row)
    groups.set(id, group)
  }
  for (const row of rows) {
    if (by === 'area') put(`area:${row.category}`, row.area, row)
    if (by === 'creator') put(`creator:${row.creator.name}`, row.creator.name, row)
    if (by === 'app') {
      if (row.apps.length === 0) put('app:none', 'No app', row)
      else row.apps.forEach(app => put(`app:${app.slug}`, app.name, row))
    }
  }
  if (by === 'area') return categoryOrder(rows.map(row => row.category)).flatMap(category => groups.get(`area:${category}`) ?? [])
  const list = [...groups.values()]
  if (by === 'creator') return list.sort((a, b) => (a.title === SOUVENIR.name ? 1 : b.title === SOUVENIR.name ? -1 : a.title.localeCompare(b.title)))
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
  const words = name.trim().slice(0, 80).split(/[\s._@-]+/).filter(Boolean)
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || '?'
}
