import { z } from 'zod'

// Wire schemas for /warehouse as souvenir-server serializes them (services/warehouse/schemas.py).
// Metric definitions follow souvenir-warehouse's warehouse/query/metrics.py.

// percent: a share or rate kept as a fraction (0.04 is 4%). ratio: a multiple or a score.
export const unitSchema = z.enum(['money', 'count', 'percent', 'ratio'])
export const grainSchema = z.enum(['day', 'week', 'month', 'total'])

export const feedStateSchema = z.object({
  category:     z.string(),
  // Free text on the wire (queued, building, syncing, ready, failed, reconnect, not_applicable today):
  // a new status must not fail the whole warehouse list.
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
  id:          z.string(),
  name:        z.string(),
  timezone:    z.string(),
  connections: z.array(attachedConnectionSchema),
  /** The board members open on until they arrange their own. */
  defaultBoard: z.string().nullable().default(null),
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
  yours:         z.boolean(),
})

export const boardStatusSchema = z.object({
  dot:          z.enum(['syncing', 'failed', 'behind', 'up_to_date']).nullable(),
  lastSyncedAt: z.string().nullable(),
  syncableAt:   z.string().nullable(),
  connections:  z.array(connectionStateSchema),
})

export const aggregateSchema = z.object({
  kind:   z.enum(['sum', 'count']),
  table:  z.string(),
  column: z.string().nullable().default(null), // absent for count
  day:    z.string(),
  where:  z.string().nullable().default(null),
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
  z.object({ op: z.literal('add'), terms: z.array(termSchema) }),
  z.object({ op: z.literal('subtract'), left: termSchema, right: termSchema }),
  z.object({ op: z.literal('multiply'), terms: z.array(termSchema) }),
  z.object({ op: z.literal('ratio'), numerator: termSchema, denominator: termSchema }),
]))

export const definitionSchema = z.union([aggregateSchema, expressionSchema])

export const metricEntrySchema = z.object({
  name:        z.string(),
  label:       z.string(),
  unit:        unitSchema,
  description: z.string(),
  category:    z.string(),
  value:       definitionSchema,
  overridden:  z.boolean(),
  createdBy:   z.string().nullable(),
  verified:    z.boolean(),
})

export const customMetricSchema = z.object({
  name:        z.string().regex(/^[a-z][a-z0-9_]*$/).max(64),
  label:       z.string().min(1),
  unit:        unitSchema,
  description: z.string(),
  value:       definitionSchema,
  verified:    z.boolean(),
})

export const draftMessageSchema = z.object({
  role:    z.enum(['user', 'assistant']),
  content: z.string().min(1),
})

export const metricDraftSchema = z.object({
  reply:  z.string(),
  metric: customMetricSchema.nullable(),
})

export const measureRequestSchema = z.object({
  metrics: z.array(z.string()),
  start:   z.iso.date(),
  end:     z.iso.date(),
  grain:   grainSchema,
})

export const measurementSchema = z.object({
  grain:       grainSchema,
  start:       z.iso.date(),
  end:         z.iso.date(),
  timezone:    z.string(),
  periods:     z.array(z.object({ start: z.iso.date(), values: z.record(z.string(), z.number().nullable()) })),
  unavailable: z.record(z.string(), z.string()),
})

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

export const roleSchema = z.enum(['view', 'edit'])
/** What every member of the organization may do with a board; none leaves it to its maker and the people added. */
export const generalSchema = z.enum(['none', 'view', 'edit'])

export const grantSchema = z.object({
  userId: z.string().min(1),
  role:   roleSchema,
})

export const boardRequestSchema = z.object({
  name:    z.string().min(1),
  layout:  z.record(z.string(), z.unknown()),
  metrics: z.array(z.string()),
  general: generalSchema,
  grants:  z.array(grantSchema),
})

export const boardSchema = boardRequestSchema.extend({
  id:        z.string(),
  createdBy: z.string(),
  updatedAt: z.string(),
  /** What the viewer may do with it. */
  role:      z.enum(['owner', 'edit', 'view']),
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
export type FeedState = z.infer<typeof feedStateSchema>
export type AttachedConnection = z.infer<typeof attachedConnectionSchema>
export type WarehouseSummaryWire = z.infer<typeof warehouseSummarySchema>
export type WarehouseRequest = z.infer<typeof warehouseRequestSchema>
export type ConnectionState = z.infer<typeof connectionStateSchema>
export type BoardStatus = z.infer<typeof boardStatusSchema>
export type Definition = z.infer<typeof definitionSchema>
export type MetricEntry = z.infer<typeof metricEntrySchema>
export type CustomMetric = z.infer<typeof customMetricSchema>
export type DraftMessage = z.infer<typeof draftMessageSchema>
export type MetricDraft = z.infer<typeof metricDraftSchema>
export type MeasureRequest = z.infer<typeof measureRequestSchema>
export type Measurement = z.infer<typeof measurementSchema>
export type ScorecardRequest = z.infer<typeof scorecardRequestSchema>
export type Scorecard = z.infer<typeof scorecardSchema>
export type BoardRequest = z.infer<typeof boardRequestSchema>
export type Board = z.infer<typeof boardSchema>
export type Role = z.infer<typeof roleSchema>
export type General = z.infer<typeof generalSchema>
export type Grant = z.infer<typeof grantSchema>
export type BoardDraft = z.infer<typeof boardDraftSchema>
export type SlackChannels = z.infer<typeof slackChannelsSchema>
export type TableSummary = z.infer<typeof tableSummarySchema>
export type TableRows = z.infer<typeof tableRowsSchema>
