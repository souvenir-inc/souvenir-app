'use client'

import { z } from 'zod'
import { WAREHOUSE_ENDPOINT } from '@/lib/config'
import { logger } from '@/lib/logger'
import { ResponseShapeError } from '@/lib/query-policy'
import { ApiError, apiFetchJson, apiFetchVoid } from './client'
import {
  attachedConnectionSchema,
  boardDraftSchema,
  boardSchema,
  boardStatusSchema,
  connectionStateSchema,
  measurementSchema,
  metricDraftSchema,
  metricEntrySchema,
  scorecardSchema,
  slackChannelsSchema,
  tableRowsSchema,
  tableSummarySchema,
  warehouseSummarySchema,
  type Arrangement,
  type AttachedConnection,
  type Board,
  type BoardDraft,
  type BoardRequest,
  type BoardStatus,
  type ConnectionState,
  type CustomMetric,
  type MeasureRequest,
  type Measurement,
  type DraftMessage,
  type MetricDraft,
  type MetricEntry,
  type Scorecard,
  type ScorecardRequest,
  type SlackChannels,
  type TableRows,
  type TableSummary,
  type WarehouseRequest,
  type WarehouseSummaryWire,
} from './warehouse-schemas'

export type * from './warehouse-schemas'
export { UNAVAILABLE_CODES } from './warehouse-schemas'

// ── Paths (API-CL-04, VS-7) ─────────────────────────────────────────────────────
// Warehouses, boards, scorecards and connections are UUIDs on the server (FastAPI refuses anything
// else), so an id that isn't one never leaves the browser; every segment is encoded as well.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const isWarehouseId = (id: string): boolean => UUID.test(id)

/** A UUID path segment, encoded; anything else is refused here as "not found" (non-retryable). */
function uuidSegment(id: string, what: 'warehouse' | 'board' | 'scorecard' | 'connection'): string {
  if (!isWarehouseId(id)) throw new ApiError(404, 'invalid_id', 'We couldn’t find that. It may have been deleted or moved.', `not a ${what} id`)
  return encodeURIComponent(id)
}

/** A free-text path segment (a metric or table name), encoded. */
const nameSegment = (name: string) => encodeURIComponent(name)

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

/** One of the organization's warehouses: the connections it reads, and its metrics, scorecards, boards and tables. */
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

  static async list(signal?: AbortSignal): Promise<Warehouse[]> {
    return (await call(z.array(warehouseSummarySchema), 'GET /warehouse', WAREHOUSE_ENDPOINT, get(signal))).map(wire => new Warehouse(wire))
  }

  static async get(id: string, signal?: AbortSignal): Promise<Warehouse> {
    return new Warehouse(await call(warehouseSummarySchema, 'GET /warehouse/{id}', `${WAREHOUSE_ENDPOINT}/${uuidSegment(id, 'warehouse')}`, get(signal)))
  }

  /** Created under the id the app chose (crypto.randomUUID()), or renamed and pointed at other connections. */
  static async put(id: string, request: WarehouseRequest, signal?: AbortSignal): Promise<Warehouse> {
    return new Warehouse(await call(warehouseSummarySchema, 'PUT /warehouse/{id}', `${WAREHOUSE_ENDPOINT}/${uuidSegment(id, 'warehouse')}`, json('PUT', request, signal)))
  }

  /** Every organization connection with a lake, for any warehouse to read. */
  static async connectable(signal?: AbortSignal): Promise<AttachedConnection[]> {
    return call(z.array(attachedConnectionSchema), 'GET /warehouse/connections', `${WAREHOUSE_ENDPOINT}/connections`, get(signal))
  }

  /** Where a board can be posted: the channels Souvenir is in, when the organization has Slack. */
  static async slackChannels(signal?: AbortSignal): Promise<SlackChannels> {
    return call(slackChannelsSchema, 'GET /warehouse/slack/channels', `${WAREHOUSE_ENDPOINT}/slack/channels`, get(signal))
  }

  /** The warehouse's own path; throws if its id isn't a UUID (a summary the server sent always is). */
  get url(): string {
    return `${WAREHOUSE_ENDPOINT}/${uuidSegment(this.id, 'warehouse')}`
  }

  async delete(): Promise<void> {
    await apiFetchVoid(this.url, { method: 'DELETE' })
  }

  async sync(): Promise<Warehouse> {
    return new Warehouse(await call(warehouseSummarySchema, 'POST /warehouse/{id}/sync', `${this.url}/sync`, { method: 'POST' }))
  }

  /** How each connection this warehouse reads is syncing, without a board's metrics (`metrics` is empty). */
  async connectionStates(signal?: AbortSignal): Promise<ConnectionState[]> {
    return call(z.array(connectionStateSchema), 'GET /warehouse/{id}/connections', `${this.url}/connections`, get(signal))
  }

  async syncConnection(connectionId: string): Promise<ConnectionState> {
    return call(connectionStateSchema, 'POST /warehouse/{id}/connections/{connectionId}/sync',
      `${this.url}/connections/${uuidSegment(connectionId, 'connection')}/sync`, { method: 'POST' })
  }

  async metrics(signal?: AbortSignal): Promise<MetricEntry[]> {
    return call(z.array(metricEntrySchema), 'GET /warehouse/{id}/metrics', `${this.url}/metrics`, get(signal))
  }

  async putMetric(metric: CustomMetric): Promise<MetricEntry[]> {
    return call(z.array(metricEntrySchema), 'PUT /warehouse/{id}/metrics', `${this.url}/metrics`, json('PUT', metric))
  }

  /** One turn of the metric conversation; nothing is kept until the proposed metric is put. */
  async draftMetric(messages: DraftMessage[], signal?: AbortSignal): Promise<MetricDraft> {
    return call(metricDraftSchema, 'POST /warehouse/{id}/metrics/draft', `${this.url}/metrics/draft`, json('POST', { messages }, signal))
  }

  async deleteMetric(name: string): Promise<void> {
    await apiFetchVoid(`${this.url}/metrics/${nameSegment(name)}`, { method: 'DELETE' })
  }

  async measure(request: MeasureRequest, signal?: AbortSignal): Promise<Measurement> {
    return call(measurementSchema, 'POST /warehouse/{id}/metrics', `${this.url}/metrics`, json('POST', request, signal))
  }

  async scorecards(signal?: AbortSignal): Promise<Scorecard[]> {
    return call(z.array(scorecardSchema), 'GET /warehouse/{id}/scorecards', `${this.url}/scorecards`, get(signal))
  }

  async putScorecard(id: string, request: ScorecardRequest): Promise<Scorecard> {
    return call(scorecardSchema, 'PUT /warehouse/{id}/scorecards/{scorecardId}', `${this.url}/scorecards/${uuidSegment(id, 'scorecard')}`, json('PUT', request))
  }

  async deleteScorecard(id: string): Promise<void> {
    await apiFetchVoid(`${this.url}/scorecards/${uuidSegment(id, 'scorecard')}`, { method: 'DELETE' })
  }

  async boards(signal?: AbortSignal): Promise<Board[]> {
    return call(z.array(boardSchema), 'GET /warehouse/{id}/boards', `${this.url}/boards`, get(signal))
  }

  async putBoard(id: string, request: BoardRequest): Promise<Board> {
    return call(boardSchema, 'PUT /warehouse/{id}/boards/{boardId}', `${this.url}/boards/${uuidSegment(id, 'board')}`, json('PUT', request))
  }

  async deleteBoard(id: string): Promise<void> {
    await apiFetchVoid(`${this.url}/boards/${uuidSegment(id, 'board')}`, { method: 'DELETE' })
  }

  /** Where the viewer keeps the boards they see, replacing what they had; nobody else’s tabs change. */
  async arrange(arrangement: Arrangement): Promise<void> {
    await apiFetchVoid(`${this.url}/arrangement`, json('PUT', arrangement))
  }

  /** Admins only: the board members open on, one everyone in the organization can see; null clears it. */
  async setDefaultBoard(board: string | null): Promise<Warehouse> {
    return new Warehouse(await call(warehouseSummarySchema, 'PUT /warehouse/{id}/default-board', `${this.url}/default-board`, json('PUT', { board })))
  }

  /** One turn of the conversation about a new board; nothing is kept until the board is put. */
  async draftBoard(messages: DraftMessage[], signal?: AbortSignal): Promise<BoardDraft> {
    return call(boardDraftSchema, 'POST /warehouse/{id}/boards/draft', `${this.url}/boards/draft`, json('POST', { messages }, signal))
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

  async tables(signal?: AbortSignal): Promise<TableSummary[]> {
    return call(z.array(tableSummarySchema), 'GET /warehouse/{id}/tables', `${this.url}/tables`, get(signal))
  }

  async rows(table: string, limit: number, offset: number, signal?: AbortSignal): Promise<TableRows> {
    const query = new URLSearchParams({ limit: String(limit), offset: String(offset) })
    return call(tableRowsSchema, 'GET /warehouse/{id}/tables/{name}', `${this.url}/tables/${nameSegment(table)}?${query}`, get(signal))
  }
}
