// The scorecard model, in one file so a change to Scope 1's model is a change here first.
// Source: docs-v2/dashboard-v2/scope/scorecards.md §5.9 (types) and §6 (rules). Everything in that sketch is
// typed here; tonight's build uses the subset marked "tonight" there. Unbuilt parts (sections, manual rows,
// schedule/path/relative/benchmark targets, benchmark/combined rules, actions) are typed so data saved now
// survives when they land.
//
// The model is method-agnostic: the weekly scorecard (EOS, Matt Putra) is one template; OKRs, lead/lag, a North
// Star tree and a monthly board pack are other templates over the same shapes.

export type MethodKey = 'weekly_scorecard' | 'okr' | 'lead_lag' | 'north_star' | 'board_pack' | 'balanced' | 'custom'
export type Cadence = 'day' | 'week' | 'month' | 'quarter' | 'year'
/** `range`: stay inside a band (ad spend on budget, inventory 6–10 weeks). */
export type Direction = 'higher' | 'lower' | 'range'
export type Colour = 'green' | 'amber' | 'red'
/** Honest "can't judge" states. Grey is not a colour; each one says what's missing. */
export type Grey = 'no_data' | 'unavailable' | 'too_small' | 'in_progress' | 'no_target' | 'no_history' | 'before_data'
/** `neutral`: a flag rule ran and found nothing worth saying. */
export type Verdict = Colour | Grey | 'neutral'
export type MemberId = string
/** YYYY-MM-DD in the store's timezone. */
export type ISODate = string

// ── Scorecard ────────────────────────────────────────────────────────────────

export type ScorecardScope =
  | { kind: 'store'; workspaceId: string }
  | { kind: 'group'; workspaceIds: string[]; combine: 'total' | 'each' }

export interface Visibility {
  level: 'org' | 'team' | 'people' | 'private'
  teamIds?: string[]
  memberIds?: MemberId[]
}

export type ViewColumn = 'target' | 'gap' | 'vs_last_year' | 'vs_previous' | 'trend' | 'total'

export interface Scorecard {
  id: string
  name: string
  description?: string
  method: MethodKey
  template?: { id: string; version: number }
  cadence: Cadence
  weekStart: 'monday' | 'sunday'
  /** Closed periods the strip shows. */
  periodsShown: number
  scope: ScorecardScope
  visibility: Visibility
  sections: Section[]
  rows: Row[]
  view: { layout: 'grid' | 'progress' | 'tree'; columns: ViewColumn[] }
  state: 'draft' | 'active' | 'archived'
  /** Bumps on every save; the S2 API uses it to stop two people overwriting each other. */
  version: number
  createdBy: MemberId
  createdAt: string
  updatedBy: MemberId
  updatedAt: string
}

export interface Section {
  id: string
  title: string
  kind: 'objective' | 'perspective' | 'area' | 'team'
  description?: string
  order: number
}

// ── Row ──────────────────────────────────────────────────────────────────────

export type RowSource =
  | { kind: 'metric'; metric: string }
  | { kind: 'manual'; label: string; unit: 'money' | 'count' | 'ratio' | 'yes_no' }

export type DisplayFormat = 'money' | 'number' | 'percent' | 'multiple'

/**
 * A row whose metric doesn't exist yet in this workspace (MER before someone creates it). Build-side addition:
 * the row shows grey with the hint until any of `candidates` appears in the catalog.
 */
export interface MetricSlot {
  label: string
  hint: string
  candidates: string[]
  /** A pattern (regex source, case-insensitive) a custom metric's name or label can match to fill the slot. */
  match?: string
}

export interface Row {
  /** Stable id, not the metric name: the same metric can appear twice. */
  id: string
  source: RowSource
  /** Display override; the metric's name stays the key. */
  label?: string
  direction: Direction
  weight?: number
  goalType?: 'committed' | 'aspirational'
  /** What good is, each from a start date. Empty: no target. */
  targets: Target[]
  rules: Rule[]
  sectionId?: string
  parentId?: string
  role?: 'outcome' | 'driver' | 'guardrail'
  /** Don't colour a period unless this count reaches `min` in it (rates on fewer than 30 orders are noise). */
  minSample?: { metric: string; min: number }
  display?: { format?: DisplayFormat; decimals?: number }
  order: number
  /** Build-side addition: a placeholder for a metric still to be created. */
  slot?: MetricSlot
}

// ── Target ───────────────────────────────────────────────────────────────────

export type TargetOrigin = 'typed' | 'plan' | 'template' | 'benchmark' | 'last_year' | 'formula' | 'suggested'

export type TargetKind =
  | { kind: 'fixed'; value?: number; low?: number; high?: number }
  | { kind: 'schedule'; schedule: Record<ISODate, number> }
  | { kind: 'path'; baseline: number; value: number; by: ISODate }
  | { kind: 'relative'; relativeTo: 'last_year' | 'previous_period'; change: number }
  | { kind: 'benchmark'; benchmarkId: string }

/**
 * For any period, the target in force is the newest one whose `effectiveFrom` is on or before the period's start.
 * Changing a target doesn't repaint the past.
 */
export type Target = {
  id: string
  effectiveFrom: ISODate
  window: 'period' | 'month' | 'quarter' | 'year'
  measureAs?: 'period' | 'to_date' | 'latest'
  origin: TargetOrigin
  setBy: MemberId
  setAt: string
  reason?: string
} & TargetKind

/** A target resolved to numbers for one period. */
export type ResolvedTarget = { kind: 'value'; value: number } | { kind: 'range'; low: number; high: number }

// ── Rules ────────────────────────────────────────────────────────────────────

export type Band =
  /** 0.05: a miss within 5% of the target is amber. 0: two colours, any miss is red. */
  | { kind: 'relative'; amber: number }
  /** Within `amber` units (percentage points for rates, as a fraction: 0.005 is half a point). */
  | { kind: 'absolute'; amber: number }
  | { kind: 'progress'; green: number; amber: number }
  | { kind: 'lines'; redBelow?: number; redAbove?: number }

export type RuleEffect = 'status' | 'flag'

interface RuleFrame {
  id: string
  /** `status` rules decide the colour; `flag` rules add a badge and a line in "why red". */
  effect: RuleEffect
  enabled: boolean
  label?: string
}

export type TargetRule = RuleFrame & { type: 'target'; band: Band; line?: number }
export type HistoryRule = RuleFrame & {
  type: 'history'
  method: 'pooled_change' | 'natural_limits'
  compareTo: 'previous' | 'last_year'
  periods: number
  /** A move smaller than this either way is noise. */
  noise: number
  /** Worse by this much or more is red; better by this much is "better than usual". */
  alert: number
}
export type BenchmarkRule = RuleFrame & { type: 'benchmark'; benchmarkId?: string }
export type PacingRule = RuleFrame & { type: 'pacing'; curve: 'linear' | 'last_year'; band: Band }
export type DurationRule = RuleFrame & { type: 'duration'; watches: string; atLeast: 'amber' | 'red'; periods: number; raiseTo?: Colour }
export type TrendRule = RuleFrame & { type: 'trend'; periods: number; minMove: number; direction: 'adverse' | 'either' }
export type CombinedRule = RuleFrame & { type: 'combined'; op: 'all' | 'any' | 'at_least'; k?: number; of: string[]; result: Colour }

export type Rule = TargetRule | HistoryRule | BenchmarkRule | PacingRule | DurationRule | TrendRule | CombinedRule
export type RuleType = Rule['type']

// ── Manual values and templates ───────────────────────────────────────────

export interface ManualValue {
  rowId: string
  period: ISODate
  value: number | null
  kind: 'actual' | 'forecast'
  enteredBy: MemberId
  enteredAt: string
  comment?: string
}

export interface ScorecardTemplate {
  id: string
  version: number
  name: string
  method: MethodKey
  description: string
  source?: { title: string; url?: string }
  cadence: Cadence
  weekStart: 'monday' | 'sunday'
  periodsShown: number
  rows: TemplateRow[]
  /** Data categories the rows need. */
  requires: string[]
  size: [number, number]
}

export interface TemplateRow {
  source: RowSource
  direction: Direction
  minSample?: Row['minSample']
  display?: Row['display']
  slot?: MetricSlot
}

// ── Computed (never stored tonight) ──────────────────────────────────────────

export type Flag =
  | 'red_streak' | 'amber_streak' | 'trend_adverse' | 'worse_than_history' | 'better_than_history'
  | 'outside_benchmark' | 'behind_pace' | 'ahead_of_pace' | 'provisional'

export interface RuleResult {
  ruleId: string
  type: RuleType
  verdict: Verdict
  actual: number | null
  reference: number | { low: number; high: number } | null
  /** actual − reference, signed so negative is bad. */
  gap: number | null
  /** gap as a fraction of the reference. */
  gapPct: number | null
  /** A code the UI turns into words. */
  explain: string
}

/** One row in one period. */
export interface RowResult {
  rowId: string
  period: ISODate
  value: number | null
  verdict: Verdict
  /** Extra words for a grey verdict ("only 7 orders", the API's unavailable reason). */
  reason?: string
  provisional: boolean
  target: ResolvedTarget | null
  rules: RuleResult[]
  flags: Flag[]
  /**
   * Build-side addition: the last day the row's source has data, when it falls inside or before this period.
   * A period after it is `no_data` ("no data yet"); a period containing it is `in_progress` (partial).
   */
  dataUntil?: ISODate
}

/** The running period: "so far", against where the target says we should be by now. */
export interface PaceResult {
  period: ISODate
  value: number | null
  /** Completed days in the store's timezone (today excluded) and the period's length. */
  completedDays: number
  periodDays: number
  /** The target pro-rated by completed days for a running total; the full target for a rate. */
  expected: ResolvedTarget | null
  /** gap to expected as a fraction, signed so negative is behind. */
  gapPct: number | null
  verdict: Verdict
  flag: 'ahead_of_pace' | 'behind_pace' | null
  /** Build-side addition: set when the source's data stops before the completed days do. */
  dataUntil?: ISODate
}

export interface HistoryResult extends RuleResult {
  recent: number | null
  earlier: number | null
  /** Relative change from earlier to recent, as measured (not signed by direction). */
  change: number | null
}

/** Everything the engine says about one row. */
export interface RowJudgement {
  /** Closed periods, oldest first. */
  cells: RowResult[]
  /** The period still running, if the measurement includes it. */
  current: PaceResult | null
  /** The row's verdict: its last closed period. */
  verdict: Verdict
  reason?: string
  flags: Flag[]
  history: HistoryResult | null
  /** Closed periods running, ending with the latest judged one, at or past the duration rule's level. */
  streak: number
}
