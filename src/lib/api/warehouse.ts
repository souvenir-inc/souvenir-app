'use client'

import { z } from 'zod'
import { WAREHOUSE_ENDPOINT } from '@/lib/config'
import { apiFetchJson, apiFetchVoid } from './client'
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

async function call<T>(schema: z.ZodType<T>, url: string, init: RequestInit = {}): Promise<T> {
  return schema.parse(await apiFetchJson<unknown>(url, init))
}

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
    return (await call(z.array(warehouseSummarySchema), WAREHOUSE_ENDPOINT, { signal })).map(wire => new Warehouse(wire))
  }

  static async get(id: string, signal?: AbortSignal): Promise<Warehouse> {
    return new Warehouse(await call(warehouseSummarySchema, `${WAREHOUSE_ENDPOINT}/${id}`, { signal }))
  }

  /** Created under the id the app chose (crypto.randomUUID()), or renamed and pointed at other connections. */
  static async put(id: string, request: WarehouseRequest, signal?: AbortSignal): Promise<Warehouse> {
    return new Warehouse(await call(warehouseSummarySchema, `${WAREHOUSE_ENDPOINT}/${id}`, json('PUT', request, signal)))
  }

  /** Every organization connection with a lake, for any warehouse to read. */
  static async connectable(signal?: AbortSignal): Promise<AttachedConnection[]> {
    return call(z.array(attachedConnectionSchema), `${WAREHOUSE_ENDPOINT}/connections`, { signal })
  }

  /** Where a board can be posted: the channels Souvenir is in, when the organization has Slack. */
  static async slackChannels(signal?: AbortSignal): Promise<SlackChannels> {
    return call(slackChannelsSchema, `${WAREHOUSE_ENDPOINT}/slack/channels`, { signal })
  }

  get url(): string {
    return `${WAREHOUSE_ENDPOINT}/${this.id}`
  }

  async delete(): Promise<void> {
    await apiFetchVoid(this.url, { method: 'DELETE' })
  }

  async sync(): Promise<Warehouse> {
    return new Warehouse(await call(warehouseSummarySchema, `${this.url}/sync`, { method: 'POST' }))
  }

  async syncConnection(connectionId: string): Promise<ConnectionState> {
    return call(connectionStateSchema, `${this.url}/connections/${connectionId}/sync`, { method: 'POST' })
  }

  async metrics(signal?: AbortSignal): Promise<MetricEntry[]> {
    return call(z.array(metricEntrySchema), `${this.url}/metrics`, { signal })
  }

  async putMetric(metric: CustomMetric): Promise<MetricEntry[]> {
    return call(z.array(metricEntrySchema), `${this.url}/metrics`, json('PUT', metric))
  }

  /** One turn of the metric conversation; nothing is kept until the proposed metric is put. */
  async draftMetric(messages: DraftMessage[], signal?: AbortSignal): Promise<MetricDraft> {
    return call(metricDraftSchema, `${this.url}/metrics/draft`, json('POST', { messages }, signal))
  }

  async deleteMetric(name: string): Promise<void> {
    await apiFetchVoid(`${this.url}/metrics/${encodeURIComponent(name)}`, { method: 'DELETE' })
  }

  async measure(request: MeasureRequest, signal?: AbortSignal): Promise<Measurement> {
    return call(measurementSchema, `${this.url}/metrics`, json('POST', request, signal))
  }

  async scorecards(signal?: AbortSignal): Promise<Scorecard[]> {
    return call(z.array(scorecardSchema), `${this.url}/scorecards`, { signal })
  }

  async putScorecard(id: string, request: ScorecardRequest): Promise<Scorecard> {
    return call(scorecardSchema, `${this.url}/scorecards/${id}`, json('PUT', request))
  }

  async deleteScorecard(id: string): Promise<void> {
    await apiFetchVoid(`${this.url}/scorecards/${id}`, { method: 'DELETE' })
  }

  async boards(signal?: AbortSignal): Promise<Board[]> {
    return call(z.array(boardSchema), `${this.url}/boards`, { signal })
  }

  async putBoard(id: string, request: BoardRequest): Promise<Board> {
    return call(boardSchema, `${this.url}/boards/${id}`, json('PUT', request))
  }

  async deleteBoard(id: string): Promise<void> {
    await apiFetchVoid(`${this.url}/boards/${id}`, { method: 'DELETE' })
  }

  /** Where the viewer keeps the boards they see, replacing what they had; nobody else’s tabs change. */
  async arrange(arrangement: Arrangement): Promise<void> {
    await apiFetchVoid(`${this.url}/arrangement`, json('PUT', arrangement))
  }

  /** Admins only: the board members open on, one everyone in the organization can see; null clears it. */
  async setDefaultBoard(board: string | null): Promise<Warehouse> {
    return new Warehouse(await call(warehouseSummarySchema, `${this.url}/default-board`, json('PUT', { board })))
  }

  /** One turn of the conversation about a new board; nothing is kept until the board is put. */
  async draftBoard(messages: DraftMessage[], signal?: AbortSignal): Promise<BoardDraft> {
    return call(boardDraftSchema, `${this.url}/boards/draft`, json('POST', { messages }, signal))
  }

  /** The board's picture into a Slack channel, with a line of text above it. */
  async postToSlack(id: string, image: Blob, filename: string, channelId: string, text: string): Promise<void> {
    const body = new FormData()
    body.append('image', image, filename)
    body.append('channelId', channelId)
    body.append('text', text)
    await apiFetchVoid(`${this.url}/boards/${id}/slack`, { method: 'POST', body })
  }

  async boardStatus(id: string, signal?: AbortSignal): Promise<BoardStatus> {
    return call(boardStatusSchema, `${this.url}/boards/${id}/status`, { signal })
  }

  async refreshBoard(id: string): Promise<BoardStatus> {
    return call(boardStatusSchema, `${this.url}/boards/${id}/refresh`, { method: 'POST' })
  }

  async tables(signal?: AbortSignal): Promise<TableSummary[]> {
    return call(z.array(tableSummarySchema), `${this.url}/tables`, { signal })
  }

  async rows(table: string, limit: number, offset: number, signal?: AbortSignal): Promise<TableRows> {
    const query = new URLSearchParams({ limit: String(limit), offset: String(offset) })
    return call(tableRowsSchema, `${this.url}/tables/${encodeURIComponent(table)}?${query}`, { signal })
  }
}
