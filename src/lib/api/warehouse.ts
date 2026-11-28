'use client'

import { z } from 'zod'
import { WAREHOUSE_ENDPOINT } from '@/lib/config'
import { logger } from '@/lib/logger'
import { ResponseShapeError } from '@/lib/query-policy'
import { ApiError, apiFetch, apiFetchJson, apiFetchVoid, buildApiError } from './client'
import {
  aiNotesSchema,
  attachedConnectionSchema,
  boardDraftSchema,
  boardSchema,
  boardStatusSchema,
  categorySchema,
  connectionStateSchema,
  measurementSchema,
  metricDraftSchema,
  metricEntrySchema,
  metricLinkSchema,
  metricRowsSchema,
  metricVersionSchema,
  orderDetailSchema,
  orderTypePreviewSchema,
  orderTypeSchema,
  proposalSchema,
  scorecardSchema,
  slackChannelsSchema,
  tableRowsSchema,
  tableSummarySchema,
  warehouseSummarySchema,
  type AiNotes,
  type Arrangement,
  type AttachedConnection,
  type Board,
  type BoardDraft,
  type BoardRequest,
  type BoardStatus,
  type Category,
  type CategoryRequest,
  type ConnectionState,
  type CustomMetricRequest,
  type DraftMessage,
  type ExportRequest,
  type LinkRequest,
  type MeasureRequest,
  type Measurement,
  type MetricDraft,
  type MetricDraftRequest,
  type MetricEntry,
  type MetricLink,
  type MetricRows,
  type MetricRowsQuery,
  type MetricVersion,
  type OrderDetail,
  type OrderType,
  type OrderTypePreview,
  type OrderTypeRequest,
  type Proposal,
  type ProposalRequest,
  type ProposalStatus,
  type Scorecard,
  type ScorecardRequest,
  type SlackChannels,
  type StatusRequest,
  type TableRows,
  type TableSummary,
  type WarehouseRequest,
  type WarehouseSummaryWire,
} from './warehouse-schemas'

export type * from './warehouse-schemas'
export { UNAVAILABLE_CODES } from './warehouse-schemas'

// ── Paths (API-CL-04, VS-7) ─────────────────────────────────────────────────────
// Warehouses, boards, scorecards, connections and proposals are UUIDs on the server (FastAPI refuses anything
// else), so an id that isn't one never leaves the browser; every segment is encoded as well.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const isWarehouseId = (id: string): boolean => UUID.test(id)

/** A UUID path segment, encoded; anything else is refused here as "not found" (non-retryable). */
function uuidSegment(id: string, what: 'warehouse' | 'board' | 'scorecard' | 'connection' | 'proposal'): string {
  if (!isWarehouseId(id)) throw new ApiError(404, 'invalid_id', 'We couldn’t find that. It may have been deleted or moved.', `not a ${what} id`)
  return encodeURIComponent(id)
}

/** A free-text path segment (a metric, table, category, order or rule name), encoded. */
const nameSegment = (name: string) => encodeURIComponent(name)

/** The query string of the given values, leaving out the ones not set. */
function query(values: Record<string, string | number | null | undefined>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) if (value !== null && value !== undefined) params.set(key, String(value))
  const text = params.toString()
  return text === '' ? '' : `?${text}`
}

// ── Calls ──────────────────────────────────────────────────────────────────────

/**
 * Parses a response; a shape the contract doesn't allow is logged once with the endpoint and the
 * issue paths (never the values) and thrown as a ResponseShapeError, which isn't retried (API-TV-09).
 */
function parse<T>(schema: z.ZodType<T>, raw: unknown, endpoint: string): T {
  const parsed = schema.safeParse(raw)
  if (parsed.success) return parsed.data
  logger.event('warehouse.response_shape', { endpoint, paths: parsed.error.issues.map((issue) => issue.path.join('.')) })
  throw new ResponseShapeError(endpoint, parsed.error.issues)
}

/** `endpoint` names the route for logs (`GET /warehouse/{id}/metrics`), never the ids in it. */
async function call<T>(schema: z.ZodType<T>, endpoint: string, url: string, init: RequestInit): Promise<T> {
  return parse(schema, await apiFetchJson<unknown>(url, init), endpoint)
}

/** A read: always cancellable (API-CL-05). */
const get = (signal: AbortSignal | undefined): RequestInit => ({ signal })

function json(method: 'POST' | 'PUT', body: unknown, signal?: AbortSignal): RequestInit {
  return { method, body: JSON.stringify(body), signal }
}

const catalog = z.array(metricEntrySchema)

/**
 * One of the organization's warehouses, and every route of souvenir-server's /warehouse on it: its connections and
 * syncs, the metric library (versions, status, categories, rows, links, notes for Souvenir AI, proposals), data
 * rules, scorecards, boards and store tables. One method per route, in the server's order.
 */
export class Warehouse {
  readonly id: string
  readonly name: string
  readonly timezone: string
  readonly connections: AttachedConnection[]
  /** The board members open on until they arrange their own. */
  readonly defaultBoard: string | null

  constructor(wire: WarehouseSummaryWire) {
    this.id = wire.id
    this.name = wire.name
    this.timezone = wire.timezone
    this.connections = wire.connections
    this.defaultBoard = wire.defaultBoard
  }

  // ── The organization's warehouses ──

  static async list(signal?: AbortSignal): Promise<Warehouse[]> {
    return (await call(z.array(warehouseSummarySchema), 'GET /warehouse', WAREHOUSE_ENDPOINT, get(signal))).map(wire => new Warehouse(wire))
  }

  /** Every organization connection with a lake, for any warehouse to read. */
  static async connectable(signal?: AbortSignal): Promise<AttachedConnection[]> {
    return call(z.array(attachedConnectionSchema), 'GET /warehouse/connections', `${WAREHOUSE_ENDPOINT}/connections`, get(signal))
  }

  /** Where a board can be posted: the channels the member and Souvenir share, when the organization has Slack. */
  static async slackChannels(signal?: AbortSignal): Promise<SlackChannels> {
    return call(slackChannelsSchema, 'GET /warehouse/slack/channels', `${WAREHOUSE_ENDPOINT}/slack/channels`, get(signal))
  }

  static async get(id: string, signal?: AbortSignal): Promise<Warehouse> {
    return new Warehouse(await call(warehouseSummarySchema, 'GET /warehouse/{id}', `${WAREHOUSE_ENDPOINT}/${uuidSegment(id, 'warehouse')}`, get(signal)))
  }

  /** Created under the id the app chose (crypto.randomUUID()), or renamed and pointed at other connections. */
  static async put(id: string, request: WarehouseRequest, signal?: AbortSignal): Promise<Warehouse> {
    return new Warehouse(await call(warehouseSummarySchema, 'PUT /warehouse/{id}', `${WAREHOUSE_ENDPOINT}/${uuidSegment(id, 'warehouse')}`, json('PUT', request, signal)))
  }

  /** The warehouse's own path; throws if its id isn't a UUID (a summary the server sent always is). */
  get url(): string {
    return `${WAREHOUSE_ENDPOINT}/${uuidSegment(this.id, 'warehouse')}`
  }

  /** Admins only: the board members open on, one everyone in the organization can see; null clears it. */
  async setDefaultBoard(board: string | null): Promise<Warehouse> {
    return new Warehouse(await call(warehouseSummarySchema, 'PUT /warehouse/{id}/default-board', `${this.url}/default-board`, json('PUT', { board })))
  }

  async delete(): Promise<void> {
    await apiFetchVoid(this.url, { method: 'DELETE' })
  }

  async sync(): Promise<Warehouse> {
    return new Warehouse(await call(warehouseSummarySchema, 'POST /warehouse/{id}/sync', `${this.url}/sync`, { method: 'POST' }))
  }

  async connectionStates(signal?: AbortSignal): Promise<ConnectionState[]> {
    return call(z.array(connectionStateSchema), 'GET /warehouse/{id}/connections', `${this.url}/connections`, get(signal))
  }

  async syncConnection(connectionId: string): Promise<ConnectionState> {
    return call(connectionStateSchema, 'POST /warehouse/{id}/connections/{connectionId}/sync',
      `${this.url}/connections/${uuidSegment(connectionId, 'connection')}/sync`, { method: 'POST' })
  }

  // ── The metric library ──

  async metrics(signal?: AbortSignal): Promise<MetricEntry[]> {
    return call(catalog, 'GET /warehouse/{id}/metrics', `${this.url}/metrics`, get(signal))
  }

  /** Admins only: the metric's next version, confirmed. Members propose instead. */
  async putMetric(metric: CustomMetricRequest): Promise<MetricEntry[]> {
    return call(catalog, 'PUT /warehouse/{id}/metrics', `${this.url}/metrics`, json('PUT', metric))
  }

  /** One turn of the metric conversation; nothing is kept until the metric is saved or proposed. */
  async draftMetric(request: MetricDraftRequest, signal?: AbortSignal): Promise<MetricDraft> {
    return call(metricDraftSchema, 'POST /warehouse/{id}/metrics/draft', `${this.url}/metrics/draft`, json('POST', request, signal))
  }

  /** Admins only: confirm, retire or bring back several metrics at once; all move or none does. */
  async setStatus(request: StatusRequest): Promise<MetricEntry[]> {
    return call(catalog, 'POST /warehouse/{id}/metrics/status', `${this.url}/metrics/status`, json('POST', request))
  }

  /** Admins only. */
  async deleteMetric(name: string): Promise<void> {
    await apiFetchVoid(`${this.url}/metrics/${nameSegment(name)}`, { method: 'DELETE' })
  }

  /** Every version with who, when and what changed, newest first. */
  async versions(name: string, signal?: AbortSignal): Promise<MetricVersion[]> {
    return call(z.array(metricVersionSchema), 'GET /warehouse/{id}/metrics/{name}/versions', `${this.url}/metrics/${nameSegment(name)}/versions`, get(signal))
  }

  /** Admins only: an older version saved again as the newest. */
  async restore(name: string, version: number): Promise<MetricEntry[]> {
    return call(catalog, 'POST /warehouse/{id}/metrics/{name}/versions/{version}/restore',
      `${this.url}/metrics/${nameSegment(name)}/versions/${version}/restore`, { method: 'POST' })
  }

  /** Undo after saving: the newest version goes, by its author and only shortly after. */
  async undo(name: string): Promise<MetricEntry[]> {
    return call(catalog, 'DELETE /warehouse/{id}/metrics/{name}/versions/latest', `${this.url}/metrics/${nameSegment(name)}/versions/latest`, { method: 'DELETE' })
  }

  /** Admins only: move a metric to a category. */
  async setCategory(name: string, category: string): Promise<MetricEntry> {
    return call(metricEntrySchema, 'PUT /warehouse/{id}/metrics/{name}/category', `${this.url}/metrics/${nameSegment(name)}/category`, json('PUT', { category }))
  }

  /** The rows behind a base of the metric, counted or left out, a page at a time. */
  async metricRows(name: string, request: MetricRowsQuery, signal?: AbortSignal): Promise<MetricRows> {
    return call(metricRowsSchema, 'GET /warehouse/{id}/metrics/{name}/rows',
      `${this.url}/metrics/${nameSegment(name)}/rows${query({ ...request })}`, get(signal))
  }

  /** Every row behind the number, as a CSV file. */
  async export(name: string, request: ExportRequest): Promise<Blob> {
    const response = await apiFetch(`${this.url}/metrics/${nameSegment(name)}/export`, json('POST', request))
    if (!response.ok) throw await buildApiError(response)
    return response.blob()
  }

  async links(name: string, signal?: AbortSignal): Promise<MetricLink[]> {
    return call(z.array(metricLinkSchema), 'GET /warehouse/{id}/metrics/{name}/links', `${this.url}/metrics/${nameSegment(name)}/links`, get(signal))
  }

  async link(name: string, request: LinkRequest): Promise<MetricLink[]> {
    return call(z.array(metricLinkSchema), 'POST /warehouse/{id}/metrics/{name}/links', `${this.url}/metrics/${nameSegment(name)}/links`, json('POST', request))
  }

  async unlink(name: string, other: string): Promise<void> {
    await apiFetchVoid(`${this.url}/metrics/${nameSegment(name)}/links/${nameSegment(other)}`, { method: 'DELETE' })
  }

  async aiNotes(name: string, signal?: AbortSignal): Promise<AiNotes> {
    return call(aiNotesSchema, 'GET /warehouse/{id}/metrics/{name}/ai-notes', `${this.url}/metrics/${nameSegment(name)}/ai-notes`, get(signal))
  }

  /** Admins only. */
  async putAiNotes(name: string, notes: AiNotes): Promise<AiNotes> {
    return call(aiNotesSchema, 'PUT /warehouse/{id}/metrics/{name}/ai-notes', `${this.url}/metrics/${nameSegment(name)}/ai-notes`, json('PUT', notes))
  }

  async measure(request: MeasureRequest, signal?: AbortSignal): Promise<Measurement> {
    return call(measurementSchema, 'POST /warehouse/{id}/metrics', `${this.url}/metrics`, json('POST', request, signal))
  }

  /** One order line by line, and what each metric took from it. */
  async order(orderId: string, signal?: AbortSignal): Promise<OrderDetail> {
    return call(orderDetailSchema, 'GET /warehouse/{id}/orders/{orderId}', `${this.url}/orders/${nameSegment(orderId)}`, get(signal))
  }

  async categories(signal?: AbortSignal): Promise<Category[]> {
    return call(z.array(categorySchema), 'GET /warehouse/{id}/categories', `${this.url}/categories`, get(signal))
  }

  /** Admins only: created under the key the app chose, or renamed. */
  async putCategory(key: string, request: CategoryRequest): Promise<Category[]> {
    return call(z.array(categorySchema), 'PUT /warehouse/{id}/categories/{key}', `${this.url}/categories/${nameSegment(key)}`, json('PUT', request))
  }

  // ── Proposals ──

  /** The Review list, newest first. */
  async proposals(status: ProposalStatus | null, signal?: AbortSignal): Promise<Proposal[]> {
    return call(z.array(proposalSchema), 'GET /warehouse/{id}/proposals', `${this.url}/proposals${query({ status })}`, get(signal))
  }

  /** A new metric or a change, for an admin to confirm; every admin is told. */
  async propose(request: ProposalRequest): Promise<Proposal> {
    return call(proposalSchema, 'POST /warehouse/{id}/proposals', `${this.url}/proposals`, json('POST', request))
  }

  /** Admins only: a change is saved as the metric's next version; its author is told. */
  async confirmProposal(id: string): Promise<Proposal> {
    return call(proposalSchema, 'POST /warehouse/{id}/proposals/{proposalId}/confirm', `${this.url}/proposals/${uuidSegment(id, 'proposal')}/confirm`, { method: 'POST' })
  }

  /** Admins only, with a reason its author is told. */
  async dismissProposal(id: string, reason: string): Promise<Proposal> {
    return call(proposalSchema, 'POST /warehouse/{id}/proposals/{proposalId}/dismiss', `${this.url}/proposals/${uuidSegment(id, 'proposal')}/dismiss`, json('POST', { reason }))
  }

  /** Its author takes it back. */
  async withdrawProposal(id: string): Promise<Proposal> {
    return call(proposalSchema, 'POST /warehouse/{id}/proposals/{proposalId}/withdraw', `${this.url}/proposals/${uuidSegment(id, 'proposal')}/withdraw`, { method: 'POST' })
  }

  // ── Data rules ──

  async orderTypes(signal?: AbortSignal): Promise<OrderType[]> {
    return call(z.array(orderTypeSchema), 'GET /warehouse/{id}/order-types', `${this.url}/order-types`, get(signal))
  }

  async previewOrderType(condition: string, signal?: AbortSignal): Promise<OrderTypePreview> {
    return call(orderTypePreviewSchema, 'POST /warehouse/{id}/order-types/preview', `${this.url}/order-types/preview`, json('POST', { condition }, signal))
  }

  /** Admins only: add, change or switch a rule; every metric recounts with it. */
  async putOrderType(request: OrderTypeRequest): Promise<OrderType[]> {
    return call(z.array(orderTypeSchema), 'PUT /warehouse/{id}/order-types', `${this.url}/order-types`, json('PUT', request))
  }

  /** Admins only. */
  async deleteOrderType(name: string): Promise<void> {
    await apiFetchVoid(`${this.url}/order-types/${nameSegment(name)}`, { method: 'DELETE' })
  }

  // ── Scorecards ──

  async scorecards(signal?: AbortSignal): Promise<Scorecard[]> {
    return call(z.array(scorecardSchema), 'GET /warehouse/{id}/scorecards', `${this.url}/scorecards`, get(signal))
  }

  async putScorecard(id: string, request: ScorecardRequest): Promise<Scorecard> {
    return call(scorecardSchema, 'PUT /warehouse/{id}/scorecards/{scorecardId}', `${this.url}/scorecards/${uuidSegment(id, 'scorecard')}`, json('PUT', request))
  }

  async deleteScorecard(id: string): Promise<void> {
    await apiFetchVoid(`${this.url}/scorecards/${uuidSegment(id, 'scorecard')}`, { method: 'DELETE' })
  }

  // ── Boards ──

  async boards(signal?: AbortSignal): Promise<Board[]> {
    return call(z.array(boardSchema), 'GET /warehouse/{id}/boards', `${this.url}/boards`, get(signal))
  }

  /** One turn of the conversation about a new board; nothing is kept until the board is put. */
  async draftBoard(messages: DraftMessage[], signal?: AbortSignal): Promise<BoardDraft> {
    return call(boardDraftSchema, 'POST /warehouse/{id}/boards/draft', `${this.url}/boards/draft`, json('POST', { messages }, signal))
  }

  async putBoard(id: string, request: BoardRequest): Promise<Board> {
    return call(boardSchema, 'PUT /warehouse/{id}/boards/{boardId}', `${this.url}/boards/${uuidSegment(id, 'board')}`, json('PUT', request))
  }

  /** The viewer's own tabs, hidden boards and boards they left, replacing what they had. */
  async arrange(arrangement: Arrangement): Promise<void> {
    await apiFetchVoid(`${this.url}/arrangement`, json('PUT', arrangement))
  }

  /** The board's picture into a Slack channel, with a line of text above it. */
  async postToSlack(id: string, image: Blob, filename: string, channelId: string, text: string): Promise<void> {
    const body = new FormData()
    body.append('image', image, filename)
    body.append('channelId', channelId)
    body.append('text', text)
    await apiFetchVoid(`${this.url}/boards/${uuidSegment(id, 'board')}/slack`, { method: 'POST', body })
  }

  async boardStatus(id: string, signal?: AbortSignal): Promise<BoardStatus> {
    return call(boardStatusSchema, 'GET /warehouse/{id}/boards/{boardId}/status', `${this.url}/boards/${uuidSegment(id, 'board')}/status`, get(signal))
  }

  async refreshBoard(id: string): Promise<BoardStatus> {
    return call(boardStatusSchema, 'POST /warehouse/{id}/boards/{boardId}/refresh', `${this.url}/boards/${uuidSegment(id, 'board')}/refresh`, { method: 'POST' })
  }

  async deleteBoard(id: string): Promise<void> {
    await apiFetchVoid(`${this.url}/boards/${uuidSegment(id, 'board')}`, { method: 'DELETE' })
  }

  // ── Store tables ──

  async tables(signal?: AbortSignal): Promise<TableSummary[]> {
    return call(z.array(tableSummarySchema), 'GET /warehouse/{id}/tables', `${this.url}/tables`, get(signal))
  }

  async rows(table: string, limit: number, offset: number, signal?: AbortSignal): Promise<TableRows> {
    return call(tableRowsSchema, 'GET /warehouse/{id}/tables/{name}', `${this.url}/tables/${nameSegment(table)}${query({ limit, offset })}`, get(signal))
  }
}
