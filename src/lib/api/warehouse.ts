import { z } from 'zod'
import { ApiError, apiFetchJson, apiFetchVoid } from './client'
import { API_BASE_URL } from '../config'

const WAREHOUSE = `${API_BASE_URL}/warehouse`

const categoryStateSchema = z.object({
  category:     z.string(),
  /** `queued`, `building`, `syncing`, `ready`, `failed` or `not_applicable`. */
  status:       z.string(),
  /** Why the last sync failed; null when it didn't. Older responses leave it out. */
  error:        z.string().nullable().optional(),
  lastSyncedAt: z.string().nullable(),
})

/** One connected app on the workspace and the warehouse categories it feeds. */
const connectionSchema = z.object({
  connectionId:  z.string(),
  connectorSlug: z.string(),
  name:          z.string(),
  feeds:         z.array(categoryStateSchema),
})

/** The workspace as the app reads it. `GET /warehouse` used to answer in exactly this shape. */
const workspaceSchema = z.object({
  id:          z.string(),
  name:        z.string(),
  /** Only the old response carried it; nothing reads it. */
  slug:        z.string().optional(),
  timezone:    z.string(),
  /** Connector slugs feeding the workspace. */
  connectors:  z.array(z.string()),
  /** One state per category, folded across the apps that feed it. */
  categories:  z.array(categoryStateSchema),
  /** Per app, as the API reports it now. Missing when the response came in the old shape. */
  connections: z.array(connectionSchema).optional(),
})

/** Today's `GET /warehouse` workspace: its apps, each with the categories it feeds. */
const connectedWorkspaceSchema = z.object({
  id:          z.string(),
  name:        z.string(),
  timezone:    z.string(),
  connections: z.array(connectionSchema),
})

type CategoryState = z.infer<typeof categoryStateSchema>

/** Worst first: any failure wins, then a feed still on its first build, then one syncing or waiting to. */
const STATUS_RANK: Record<string, number> = { failed: 0, building: 1, syncing: 2, queued: 3, ready: 4 }
const rankOf = (status: string) => STATUS_RANK[status] ?? STATUS_RANK.queued

/**
 * One category's state when several apps feed it: the worst status among them, and the oldest of their last
 * syncs (the category's data only reaches as far as its slowest app). Apps with nothing for the category
 * (`not_applicable`) don't count unless none has anything.
 */
function foldFeeds(category: string, feeds: CategoryState[]): CategoryState {
  if (feeds.length === 1) return feeds[0]
  const applicable = feeds.filter(feed => feed.status !== 'not_applicable')
  if (applicable.length === 0) return { category, status: 'not_applicable', error: null, lastSyncedAt: null }
  const status = applicable.reduce((worst, feed) => (rankOf(feed.status) < rankOf(worst) ? feed.status : worst), applicable[0].status)
  const synced = applicable
    .map(feed => feed.lastSyncedAt)
    .filter((at): at is string => at !== null)
    .sort((a, b) => Date.parse(a) - Date.parse(b))
  return { category, status, error: applicable.find(feed => feed.error)?.error ?? null, lastSyncedAt: synced[0] ?? null }
}

function fromConnections(workspace: z.infer<typeof connectedWorkspaceSchema>): Workspace {
  const feedsByCategory = new Map<string, CategoryState[]>()
  for (const connection of workspace.connections) {
    for (const feed of connection.feeds) feedsByCategory.set(feed.category, [...(feedsByCategory.get(feed.category) ?? []), feed])
  }
  return {
    id:          workspace.id,
    name:        workspace.name,
    timezone:    workspace.timezone,
    connectors:  [...new Set(workspace.connections.map(connection => connection.connectorSlug))],
    categories:  [...feedsByCategory].map(([category, feeds]) => foldFeeds(category, feeds)),
    connections: workspace.connections,
  }
}

const workspaceResponseSchema = z.union([connectedWorkspaceSchema.transform(fromConnections), workspaceSchema])

/**
 * `GET /warehouse` answers a list of workspaces (one per store today, so the first is the org's), each listing its
 * apps. The old answer, one workspace with `connectors` and `categories`, still parses. No workspace, or one with no
 * app left on it, reads as the 404 the API gives before the first link, so the page shows "connect a store".
 */
export function parseWorkspace(response: unknown): Workspace {
  const first: unknown = Array.isArray(response) ? response[0] : response
  if (first === undefined) throw new ApiError(404, 'workspace_not_found', 'No store workspace yet')
  const workspace = workspaceResponseSchema.parse(first)
  if (workspace.connections?.length === 0) throw new ApiError(404, 'workspace_not_found', 'No store workspace yet')
  return workspace
}

// The API now names shares "percent" (and keeps "ratio" for multiples like ROAS); the app's "ratio" already reads as a
// share (charts, editors), so "percent" folds into it here and nothing downstream changes. Without this the whole
// catalog fails to parse and every metric screen shows the load error.
const metricUnitSchema = z.enum(['money', 'count', 'ratio', 'percent']).transform(unit => (unit === 'percent' ? 'ratio' : unit))

const metricEntrySchema = z.object({
  name:        z.string(),
  label:       z.string(),
  unit:        metricUnitSchema,
  description: z.string(),
  /** The library category, or "custom" for one this workspace added. */
  category:    z.string(),
  /** The formula, the same JSON `PUT` takes (S3). Optional so an older response still parses. */
  value:       z.custom<MetricAggregate | MetricExpression>(v => typeof v === 'object' && v !== null).optional(),
  /** This organization adjusted the built-in (S4). */
  overridden:  z.boolean().optional(),
  /** Who made a custom metric; null for built-ins (S5). */
  createdBy:   z.string().nullable().optional(),
  verified:    z.boolean().optional(),
})

export const CUSTOM_CATEGORY = 'custom'

/** A base figure: one table's rows summed on a column or counted, placed on days by `day`, optionally filtered. */
export interface MetricAggregate {
  kind: 'sum' | 'count'
  table: string
  column: string | null
  day: string
  where: string | null
}

export type MetricTerm = string | number | MetricExpression

export type MetricExpression =
  | { op: 'add'; terms: MetricTerm[] }
  | { op: 'subtract'; left: MetricTerm; right: MetricTerm }
  | { op: 'multiply'; terms: MetricTerm[] }
  | { op: 'ratio'; numerator: MetricTerm; denominator: MetricTerm }

const customMetricSchema = z.object({
  name:        z.string(),
  label:       z.string(),
  unit:        metricUnitSchema,
  description: z.string(),
  value:       z.custom<MetricAggregate | MetricExpression>(value => typeof value === 'object' && value !== null),
})

export interface MetricChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/** What one turn of the metric conversation comes back with: words, and the metric once it is settled. */
const metricDraftSchema = z.object({ reply: z.string(), metric: customMetricSchema.nullable() })

export const grainSchema = z.enum(['day', 'week', 'month', 'total'])

const periodSchema = z.object({
  start:  z.string(),
  values: z.record(z.string(), z.number().nullable()),
})

/**
 * Why this store cannot measure a metric. The API sends `{ code, reason, connectors }` (26 Nov); it sent the bare reason
 * before. Callers read the reason either way.
 */
const unavailableSchema = z.union([
  z.string(),
  z.object({ code: z.string().optional(), reason: z.string().optional() }).transform(value => value.reason ?? value.code ?? 'Unavailable'),
])

const measurementSchema = z.object({
  grain:       grainSchema,
  start:       z.string(),
  end:         z.string(),
  timezone:    z.string(),
  periods:     z.array(periodSchema),
  /** Metric name → why this store cannot measure it (a table no connection fills). */
  unavailable: z.record(z.string(), unavailableSchema),
})

export type Workspace = z.infer<typeof workspaceSchema>
export type MetricUnit = z.infer<typeof metricUnitSchema>
export type MetricEntry = z.infer<typeof metricEntrySchema>
export type CustomMetric = z.infer<typeof customMetricSchema>
export type MetricDraft = z.infer<typeof metricDraftSchema>
export type Grain = z.infer<typeof grainSchema>
export type Period = z.infer<typeof periodSchema>
export type Measurement = z.infer<typeof measurementSchema>

export interface MeasureRequest {
  metrics: string[]
  /** ISO dates, inclusive. */
  start: string
  end: string
  grain: Grain
}

/**
 * Every route under the workspace takes its id (`/warehouse/{warehouseId}/metrics`), while callers only know the
 * org, which the API reads from the caller. The id is remembered from the latest `GET /warehouse`: the page asks for
 * the workspace first, so this rarely costs a request of its own. A failed or cancelled lookup is forgotten.
 */
let rememberedId: Promise<string> | null = null

function remember(id: Promise<string>): void {
  rememberedId = id
  id.catch(() => { if (rememberedId === id) rememberedId = null })
}

async function workspaceId(fresh = false): Promise<string> {
  if (!fresh && rememberedId) {
    try { return await rememberedId } catch { /* the page's own request failed or was cancelled: ask again */ }
  }
  const id = apiFetchJson<unknown>(WAREHOUSE).then(response => parseWorkspace(response).id)
  remember(id)
  return id
}

/**
 * Calls a route under the workspace. A 403 or 404 can mean the remembered id is stale (another org since, or a
 * rebuilt workspace), so the id is looked up again and the call made once more if it changed.
 */
async function underWorkspace<T>(call: (base: string) => Promise<T>): Promise<T> {
  const base = (id: string) => `${WAREHOUSE}/${encodeURIComponent(id)}`
  const id = await workspaceId()
  try {
    return await call(base(id))
  } catch (error) {
    if (!(error instanceof ApiError && (error.status === 403 || error.status === 404))) throw error
    const fresh = await workspaceId(true)
    if (fresh === id) throw error
    return call(base(fresh))
  }
}

export async function fetchWorkspace(signal?: AbortSignal): Promise<Workspace> {
  const workspace = apiFetchJson<unknown>(WAREHOUSE, { signal }).then(parseWorkspace)
  remember(workspace.then(w => w.id))
  return workspace
}

export async function fetchMetricCatalog(signal?: AbortSignal): Promise<MetricEntry[]> {
  return underWorkspace(async base => z.array(metricEntrySchema).parse(await apiFetchJson<unknown>(`${base}/metrics`, { signal })))
}

export async function putMetric(metric: CustomMetric, signal?: AbortSignal): Promise<MetricEntry[]> {
  return underWorkspace(async base => z.array(metricEntrySchema).parse(await apiFetchJson<unknown>(`${base}/metrics`, {
    method: 'PUT', body: JSON.stringify(metric), headers: { 'Content-Type': 'application/json' }, signal,
  })))
}

export async function draftMetric(messages: MetricChatMessage[], signal?: AbortSignal): Promise<MetricDraft> {
  return underWorkspace(async base => metricDraftSchema.parse(await apiFetchJson<unknown>(`${base}/metrics/draft`, {
    method: 'POST', body: JSON.stringify({ messages }), headers: { 'Content-Type': 'application/json' }, signal,
  })))
}

export async function deleteMetric(name: string, signal?: AbortSignal): Promise<void> {
  await underWorkspace(base => apiFetchVoid(`${base}/metrics/${encodeURIComponent(name)}`, { method: 'DELETE', signal }))
}

export async function measure(request: MeasureRequest, signal?: AbortSignal): Promise<Measurement> {
  return underWorkspace(async base => measurementSchema.parse(await apiFetchJson<unknown>(`${base}/metrics`, {
    method: 'POST', body: JSON.stringify(request), headers: { 'Content-Type': 'application/json' }, signal,
  })))
}
