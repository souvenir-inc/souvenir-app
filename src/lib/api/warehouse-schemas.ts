import { z } from 'zod'

// Wire schemas for /warehouse, one per model in souvenir-server's services/warehouse/schemas.py and named after it.
// Responses: every field the server sends is required, nothing defaulted. Requests: a field may be optional only
// where the server's model gives it a default; ones the app always sends stay required. Metric definitions (`value`) follow souvenir-warehouse's
// warehouse/query/metrics.py, which the server passes through as a dict.

// percent: a share or rate kept as a fraction (0.04 is 4%). ratio: a multiple or a score.
export const unitSchema = z.enum(['money', 'count', 'percent', 'ratio'])
export const grainSchema = z.enum(['day', 'week', 'month', 'total'])
export const rowGroupSchema = z.enum(['counted', 'left_out'])

// ── Warehouses and their connections ─────────────────────────────────────────────

export const feedStateSchema = z.object({
  category:     z.string(),
  /** Free text on the server (queued, building, syncing, ready, failed, reconnect or not_applicable today). */
  status:       z.string(),
  error:        z.string().nullable(),
  lastSyncedAt: z.string().nullable(),
})

export const attachedConnectionSchema = z.object({
  connectionId:  z.string(),
  connectorSlug: z.string(),
  name:          z.string(),
  feeds:         z.array(feedStateSchema),
})

export const warehouseSummarySchema = z.object({
  id:           z.string(),
  name:         z.string(),
  timezone:     z.string(),
  connections:  z.array(attachedConnectionSchema),
  /** The board members open on until they arrange their own. */
  defaultBoard: z.string().nullable(),
})

export const warehouseRequestSchema = z.object({
  name:        z.string().min(1),
  timezone:    z.string().min(1),
  connections: z.array(z.string()),
})

export const connectionStateSchema = z.object({
  connectionId:  z.string(),
  connectorSlug: z.string(),
  name:          z.string(),
  state:         z.enum(['syncing', 'slow', 'first_sync', 'reconnect', 'failed', 'behind', 'up_to_date']),
  error:         z.string().nullable(),
  lastSyncedAt:  z.string().nullable(),
  syncingSince:  z.string().nullable(),
  syncableAt:    z.string().nullable(),
  /** The board's metrics it feeds; empty when no board was asked about. */
  metrics:       z.array(z.string()),
  /** The viewer owns the account, so Reconnect is theirs to press. */
  yours:         z.boolean(),
})

export const boardStatusSchema = z.object({
  dot:          z.enum(['syncing', 'failed', 'behind', 'up_to_date']).nullable(),
  lastSyncedAt: z.string().nullable(),
  syncableAt:   z.string().nullable(),
  connections:  z.array(connectionStateSchema),
})

// ── Metric definitions ───────────────────────────────────────────────────────────

export const aggregateSchema = z.object({
  kind:   z.enum(['sum', 'count']),
  table:  z.string(),
  /** The column summed; null for a count. */
  column: z.string().nullable(),
  day:    z.string(),
  where:  z.string().nullable(),
})

export type Aggregate = z.infer<typeof aggregateSchema>
export type Term = string | number | Expression
export type Expression =
  | { op: 'add'; terms: Term[] }
  | { op: 'subtract'; left: Term; right: Term }
  | { op: 'multiply'; terms: Term[] }
  | { op: 'ratio'; numerator: Term; denominator: Term }

const termSchema: z.ZodType<Term> = z.lazy(() => z.union([z.string(), z.number(), expressionSchema]))

export const expressionSchema: z.ZodType<Expression> = z.lazy(() => z.discriminatedUnion('op', [
  z.object({ op: z.literal('add'), terms: z.array(termSchema).min(2) }),
  z.object({ op: z.literal('subtract'), left: termSchema, right: termSchema }),
  z.object({ op: z.literal('multiply'), terms: z.array(termSchema).min(2) }),
  z.object({ op: z.literal('ratio'), numerator: termSchema, denominator: termSchema }),
]))

/** Deeper than any real metric (the formula editor caps nesting at 32); stops a hostile `value` from overflowing the stack in the recursive parse below (JS-8). */
export const MAX_DEFINITION_DEPTH = 64

/** How deeply objects/arrays nest in a value, worked out without recursion; stops counting once past `limit`. */
export function nestingDepth(value: unknown, limit = MAX_DEFINITION_DEPTH): number {
  let deepest = 0
  const stack: [unknown, number][] = [[value, 0]]
  while (stack.length > 0) {
    const [node, depth] = stack.pop()!
    if (node === null || typeof node !== 'object') continue
    deepest = Math.max(deepest, depth + 1)
    if (deepest > limit) return deepest
    for (const child of Object.values(node)) stack.push([child, depth + 1])
  }
  return deepest
}

export const definitionSchema = z
  .unknown()
  .refine(value => nestingDepth(value) <= MAX_DEFINITION_DEPTH, { message: 'Metric definition nests too deeply' })
  .pipe(z.union([aggregateSchema, expressionSchema]))

/** A metric as it is drafted, proposed or saved. */
export const metricDefinitionSchema = z.object({
  name:        z.string().regex(/^[a-z][a-z0-9_]*$/).max(64),
  label:       z.string().min(1),
  unit:        unitSchema,
  description: z.string(),
  value:       definitionSchema,
})

/** A definition as one version of a metric keeps it: everything but the name. */
export const savedDefinitionSchema = metricDefinitionSchema.omit({ name: true })

// ── The metric library ───────────────────────────────────────────────────────────

export const metricStatusSchema = z.enum(['confirmed', 'proposed', 'retired'])

export const metricEntrySchema = z.object({
  name:        z.string(),
  label:       z.string(),
  unit:        unitSchema,
  description: z.string(),
  /** The library category, or custom for one this workspace added. */
  category:    z.string(),
  value:       definitionSchema,
  /** This workspace's own definition stands in for the library's. */
  overridden:  z.boolean(),
  createdBy:   z.string().nullable(),
  status:      metricStatusSchema,
  /** A library metric's version 1 is the library's own; sent back with a save. */
  version:     z.number().int(),
  updatedBy:   z.string().nullable(),
  updatedAt:   z.string().nullable(),
  confirmedBy: z.string().nullable(),
  confirmedAt: z.string().nullable(),
  /** The metric a retired one points to instead. */
  replacement: z.string().nullable(),
  /** Why it was retired. */
  reason:      z.string().nullable(),
})

/** An admin saves a metric's next version, confirmed. */
export const customMetricRequestSchema = metricDefinitionSchema.extend({
  /** The version last read; one saved since is refused with 409, and none overwrites. */
  version: z.number().int().nullable().optional(),
  changes: z.array(z.string()).optional(),
  chatId:  z.string().nullable().optional(),
})

export const metricVersionSchema = z.object({
  version:    z.number().int(),
  definition: savedDefinitionSchema,
  /** Null for a library metric's version 1, the library's own. */
  by:         z.string().nullable(),
  at:         z.string().nullable(),
  changes:    z.array(z.string()),
  chatId:     z.string().nullable(),
})

/** Several metrics confirmed, retired or brought back at once; all move or none does. */
export const statusRequestSchema = z.object({
  names:       z.array(z.string()).min(1),
  /** confirmed also brings a retired metric back. */
  status:      z.enum(['confirmed', 'retired']),
  replacement: z.string().nullable().optional(),
  reason:      z.string().nullable().optional(),
})

export const categorySchema = z.object({
  key:     z.string(),
  name:    z.string(),
  builtIn: z.boolean(),
})

export const categoryRequestSchema = z.object({ name: z.string().min(1) })

export const metricCategoryRequestSchema = z.object({ category: z.string().min(1) })

export const checkSchema = z.object({
  /** red blocks saving; amber warns. */
  level:   z.enum(['red', 'amber']),
  code:    z.enum(['units_mismatch', 'duplicate', 'look_alike', 'app_not_connected', 'missing_days', 'rule_fits_better', 'newer_version']),
  message: z.string(),
  /** The other metric it is about, when there is one. */
  metric:  z.string().nullable(),
})

export const previewSchema = z.object({
  start: z.iso.date(),
  end:   z.iso.date(),
  value: z.number().nullable(),
})

export const impactSchema = z.object({
  metric: z.string(),
  before: z.number().nullable(),
  after:  z.number().nullable(),
})

export const proposalStatusSchema = z.enum(['open', 'confirmed', 'dismissed', 'withdrawn'])

export const proposalSchema = z.object({
  id:          z.string(),
  kind:        z.enum(['new', 'change']),
  name:        z.string(),
  /** The definition now, for a change. */
  before:      savedDefinitionSchema.nullable(),
  after:       savedDefinitionSchema,
  /** The last seven full days with the definition now. */
  beforeValue: z.number().nullable(),
  /** The same days with the proposed one. */
  afterValue:  z.number().nullable(),
  baseVersion: z.number().int().nullable(),
  chatId:      z.string().nullable(),
  createdBy:   z.string(),
  status:      proposalStatusSchema,
  reason:      z.string().nullable(),
  answeredBy:  z.string().nullable(),
  answeredAt:  z.string().nullable(),
  createdAt:   z.string(),
})

/** Anyone who can see metrics proposes a new metric or a change. */
export const proposalRequestSchema = z.object({
  kind:        z.enum(['new', 'change']),
  metric:      metricDefinitionSchema,
  /** For a change: the version it was drafted from. */
  baseVersion: z.number().int().nullable().optional(),
  chatId:      z.string().nullable().optional(),
})

export const dismissRequestSchema = z.object({ reason: z.string().min(1) })

export const linkRequestSchema = z.object({
  other:  z.string().min(1),
  reason: z.string().min(1),
})

export const metricLinkSchema = z.object({
  /** The metric linked to the one asked about. */
  metric:    z.string(),
  reason:    z.string(),
  createdBy: z.string(),
  createdAt: z.string(),
})

export const aiNoteSchema = z.object({
  at:   z.iso.date(),
  by:   z.string(),
  text: z.string().min(1),
})

export const aiNotesSchema = z.object({
  /** What people also call it. */
  otherNames: z.array(z.string()),
  notes:      z.array(aiNoteSchema),
  /** Questions checked to be answered with this metric. */
  examples:   z.array(z.string()),
})

export const countedRowSchema = z.object({
  id:        z.string(),
  at:        z.iso.date(),
  amount:    z.number().nullable(),
  /** For a left-out order, the type that kept it out of sales, or filter. */
  leftOutBy: z.string().nullable(),
})

export const metricRowsSchema = z.object({
  base:   z.string(),
  table:  z.string(),
  group:  rowGroupSchema,
  total:  z.number().nullable(),
  count:  z.number().int(),
  rows:   z.array(countedRowSchema),
  /** Pass it back for the next page; null on the last. */
  cursor: z.string().nullable(),
})

/** GET …/metrics/{name}/rows: the query it takes. */
export interface MetricRowsQuery {
  start: string
  end: string
  base?: string | null
  group?: z.infer<typeof rowGroupSchema>
  cursor?: string | null
  limit?: number
}

export const orderDetailSchema = z.object({
  order:       z.record(z.string(), z.unknown()),
  lines:       z.array(z.record(z.string(), z.unknown())),
  refunds:     z.array(z.record(z.string(), z.unknown())),
  refundLines: z.array(z.record(z.string(), z.unknown())),
  /** What each base metric takes from this order. */
  counted:     z.record(z.string(), z.number()),
})

export const exportRequestSchema = z.object({
  start: z.iso.date(),
  end:   z.iso.date(),
  /** Which base of the metric; the metric itself when it is a base. */
  base:  z.string().nullable().optional(),
  group: rowGroupSchema.optional(),
})

// ── Data rules (order types) ─────────────────────────────────────────────────────

export const leftOutSchema = z.object({
  orders: z.number().int(),
  sales:  z.number(),
})

export const orderTypeSchema = z.object({
  name:        z.string(),
  label:       z.string(),
  description: z.string(),
  condition:   z.string(),
  sale:        z.boolean(),
  enabled:     z.boolean(),
  builtIn:     z.boolean(),
  /** Always on: test orders are never sales. */
  locked:      z.boolean(),
  orders:      z.number().int(),
  /** Orders of the last 30 days it keeps out of sales; switched off, the ones it would. */
  leftOut30d:  leftOutSchema,
  /** Metrics that change with it. */
  metrics:     z.array(z.string()),
  createdBy:   z.string().nullable(),
  /** Its version. */
  updatedAt:   z.string().nullable(),
})

export const orderTypeRequestSchema = z.object({
  name:        z.string().regex(/^[a-z][a-z0-9_]*$/).max(64),
  label:       z.string().min(1),
  description: z.string(),
  condition:   z.string().min(1),
  sale:        z.boolean(),
  enabled:     z.boolean().optional(),
  /** The updatedAt last read; one changed since is refused with 409. */
  version:     z.string().nullable().optional(),
})

export const orderTypePreviewRequestSchema = z.object({ condition: z.string().min(1) })

export const orderTypePreviewSchema = z.object({
  matches:  z.number().int(),
  /** Those orders by the type they take today. */
  now:      z.record(z.string(), z.number().int()),
  examples: z.array(z.record(z.string(), z.unknown())),
})

// ── Scorecards ───────────────────────────────────────────────────────────────────

export const scorecardRowSchema = z.object({
  metric:    z.string().min(1),
  target:    z.number(),
  direction: z.enum(['up', 'down']),
  tolerance: z.number().min(0),
  owner:     z.string().nullable(),
  note:      z.string(),
})

export const scorecardRequestSchema = z.object({
  name: z.string().min(1),
  rows: z.array(scorecardRowSchema),
})

export const scorecardSchema = scorecardRequestSchema.extend({
  id:        z.string(),
  createdBy: z.string(),
  updatedAt: z.string(),
})

// ── Boards ───────────────────────────────────────────────────────────────────────

export const roleSchema = z.enum(['view', 'edit'])
/** What every member of the organization may do with a board; none leaves it to its maker and the people added. */
export const generalSchema = z.enum(['none', 'view', 'edit'])

export const grantSchema = z.object({
  userId: z.string().min(1),
  role:   roleSchema,
})

const boardContentSchema = z.object({
  name:    z.string().min(1),
  layout:  z.record(z.string(), z.unknown()),
  metrics: z.array(z.string()),
  general: generalSchema,
  grants:  z.array(grantSchema),
})

/** A board as its owner keeps it; from anyone else who may edit it, only the layout and metrics are taken. */
export const boardRequestSchema = boardContentSchema.extend({
  /** Its owner has put it away: nobody else sees it until they take it back; DELETE removes it for good. */
  deleted: z.boolean(),
  /** The updatedAt last read; a board someone changed since is refused with 409, and null overwrites. */
  version: z.string().nullable(),
})

/** Where the viewer keeps a board, and its place among their boards in that state. */
export const placementSchema = z.object({
  state:    z.enum(['tabs', 'hidden', 'left']),
  position: z.number().int(),
})

export const boardSchema = boardContentSchema.extend({
  id:        z.string(),
  createdBy: z.string(),
  /** Its version, sent back with a change. */
  updatedAt: z.string(),
  /** What the viewer may do with it. */
  role:      z.enum(['owner', 'edit', 'view']),
  /** Null until the viewer places it. */
  placement: placementSchema.nullable(),
  /** When its owner put it away; only they still see it. */
  deletedAt: z.string().nullable(),
})

/** The viewer’s own tabs, hidden boards and boards they left, each in their order. A board sits in one list. */
export const arrangementSchema = z.object({
  tabs:   z.array(z.string()),
  hidden: z.array(z.string()),
  left:   z.array(z.string()),
})

export const draftedBoardSchema = z.object({
  name:    z.string().min(1).max(40),
  period:  z.enum(['today', 'yesterday', '7d', '30d', '60d', '90d']),
  compare: z.enum(['previous', 'last-year', 'none']),
  cards:   z.array(z.object({ metric: z.string(), size: z.enum(['sm', 'sm-tall', 'md', 'lg', 'full', 'full-lg']) })).min(1),
})

export const boardDraftSchema = z.object({
  reply: z.string(),
  board: draftedBoardSchema.nullable(),
})

export const slackChannelsSchema = z.object({
  connected: z.boolean(),
  channels:  z.array(z.object({ id: z.string(), name: z.string() })),
})

// ── Drafting in conversation ─────────────────────────────────────────────────────

export const draftMessageSchema = z.object({
  role:    z.enum(['user', 'assistant']),
  content: z.string().min(1),
})

export const metricDraftRequestSchema = z.object({
  messages: z.array(draftMessageSchema).min(1),
  /** The metric being changed; none for a new one. */
  metric:   z.string().nullable().optional(),
})

export const draftQuestionSchema = z.object({
  id:      z.string(),
  text:    z.string(),
  options: z.array(z.string()).min(2).max(4),
})

export const metricDraftSchema = z.object({
  reply:        z.string(),
  /** Counts the drafts in this conversation. */
  draftVersion: z.number().int(),
  /** The metric the conversation has settled on, once it has. */
  metric:       metricDefinitionSchema.nullable(),
  /** The version of the metric being changed. */
  baseVersion:  z.number().int().nullable(),
  /** Up to 3 questions to settle first. */
  questions:    z.array(draftQuestionSchema),
  /** Red ones block saving. */
  checks:       z.array(checkSchema),
  /** The draft over the last seven full days. */
  preview:      previewSchema.nullable(),
  /** Metrics built on it, before and after. */
  impact:       z.array(impactSchema),
})

// ── Measuring ────────────────────────────────────────────────────────────────────

export const measureRequestSchema = z.object({
  metrics:  z.array(z.string()),
  start:    z.iso.date(),
  end:      z.iso.date(),
  grain:    grainSchema,
  /** Also value every part of each metric's formula. */
  explain:  z.boolean().optional(),
  /** Measure these metrics with an earlier version. */
  versions: z.record(z.string(), z.number().int()).optional(),
})

export const recordsSchema = z.object({
  count: z.number().int(),
  table: z.string(),
})

export interface Part {
  term: string
  metric: string | null
  op: 'add' | 'subtract' | 'multiply' | 'ratio' | null
  value: number | null
  records: z.infer<typeof recordsSchema> | null
  parts: Part[]
}

export const partSchema: z.ZodType<Part> = z.lazy(() => z.object({
  term:    z.string(),
  metric:  z.string().nullable(),
  op:      z.enum(['add', 'subtract', 'multiply', 'ratio']).nullable(),
  value:   z.number().nullable(),
  records: recordsSchema.nullable(),
  parts:   z.array(partSchema),
}))

/** Why a metric can’t be measured yet: connect an app, wait for its first sync, or fix a failing sync. */
export const UNAVAILABLE_CODES = ['no_connection', 'feed_failed', 'first_sync'] as const

export const unavailableSchema = z.object({
  code:       z.enum(UNAVAILABLE_CODES),
  /** The warehouse's own wording: never shown, the UI maps `code` to app copy (API-ER-06). */
  reason:     z.string(),
  /** Connector slugs that would fill it, pre-built apps first; empty unless code is no_connection. */
  connectors: z.array(z.string()),
})

export const measurementSchema = z.object({
  grain:       grainSchema,
  start:       z.iso.date(),
  end:         z.iso.date(),
  timezone:    z.string(),
  periods:     z.array(z.object({ start: z.iso.date(), values: z.record(z.string(), z.number().nullable()) })),
  unavailable: z.record(z.string(), unavailableSchema),
  /** Asked with explain: each metric's formula, every part valued over the period. */
  parts:       z.record(z.string(), partSchema).nullable(),
})

// ── Store tables ─────────────────────────────────────────────────────────────────

export const columnSchema = z.object({ name: z.string(), type: z.string() })

export const tableSummarySchema = z.object({
  name:    z.string(),
  meaning: z.string(),
  columns: z.array(columnSchema),
  rows:    z.number().int(),
})

export const tableRowsSchema = z.object({
  name:    z.string(),
  columns: z.array(columnSchema),
  rows:    z.array(z.record(z.string(), z.unknown())),
  total:   z.number().int(),
})

export type Unit = z.infer<typeof unitSchema>
export type Grain = z.infer<typeof grainSchema>
export type RowGroup = z.infer<typeof rowGroupSchema>
export type FeedState = z.infer<typeof feedStateSchema>
export type AttachedConnection = z.infer<typeof attachedConnectionSchema>
export type WarehouseSummaryWire = z.infer<typeof warehouseSummarySchema>
export type WarehouseRequest = z.infer<typeof warehouseRequestSchema>
export type ConnectionState = z.infer<typeof connectionStateSchema>
export type BoardStatus = z.infer<typeof boardStatusSchema>
export type Definition = z.infer<typeof definitionSchema>
export type MetricDefinition = z.infer<typeof metricDefinitionSchema>
export type SavedDefinition = z.infer<typeof savedDefinitionSchema>
export type MetricStatus = z.infer<typeof metricStatusSchema>
export type MetricEntry = z.infer<typeof metricEntrySchema>
export type CustomMetricRequest = z.infer<typeof customMetricRequestSchema>
export type MetricVersion = z.infer<typeof metricVersionSchema>
export type StatusRequest = z.infer<typeof statusRequestSchema>
export type Category = z.infer<typeof categorySchema>
export type CategoryRequest = z.infer<typeof categoryRequestSchema>
export type Check = z.infer<typeof checkSchema>
export type Preview = z.infer<typeof previewSchema>
export type Impact = z.infer<typeof impactSchema>
export type ProposalStatus = z.infer<typeof proposalStatusSchema>
export type Proposal = z.infer<typeof proposalSchema>
export type ProposalRequest = z.infer<typeof proposalRequestSchema>
export type LinkRequest = z.infer<typeof linkRequestSchema>
export type MetricLink = z.infer<typeof metricLinkSchema>
export type AiNote = z.infer<typeof aiNoteSchema>
export type AiNotes = z.infer<typeof aiNotesSchema>
export type CountedRow = z.infer<typeof countedRowSchema>
export type MetricRows = z.infer<typeof metricRowsSchema>
export type OrderDetail = z.infer<typeof orderDetailSchema>
export type ExportRequest = z.infer<typeof exportRequestSchema>
export type LeftOut = z.infer<typeof leftOutSchema>
export type OrderType = z.infer<typeof orderTypeSchema>
export type OrderTypeRequest = z.infer<typeof orderTypeRequestSchema>
export type OrderTypePreview = z.infer<typeof orderTypePreviewSchema>
export type DraftMessage = z.infer<typeof draftMessageSchema>
export type MetricDraftRequest = z.infer<typeof metricDraftRequestSchema>
export type DraftQuestion = z.infer<typeof draftQuestionSchema>
export type MetricDraft = z.infer<typeof metricDraftSchema>
export type MeasureRequest = z.infer<typeof measureRequestSchema>
export type Unavailable = z.infer<typeof unavailableSchema>
export type UnavailableCode = Unavailable['code']
export type Measurement = z.infer<typeof measurementSchema>
export type ScorecardRequest = z.infer<typeof scorecardRequestSchema>
export type Scorecard = z.infer<typeof scorecardSchema>
export type BoardRequest = z.infer<typeof boardRequestSchema>
export type Board = z.infer<typeof boardSchema>
export type Placement = z.infer<typeof placementSchema>
export type Arrangement = z.infer<typeof arrangementSchema>
export type Role = z.infer<typeof roleSchema>
export type General = z.infer<typeof generalSchema>
export type Grant = z.infer<typeof grantSchema>
export type BoardDraft = z.infer<typeof boardDraftSchema>
export type SlackChannels = z.infer<typeof slackChannelsSchema>
export type TableSummary = z.infer<typeof tableSummarySchema>
export type TableRows = z.infer<typeof tableRowsSchema>
