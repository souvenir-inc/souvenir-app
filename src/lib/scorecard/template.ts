// Starter scorecards and the defaults behind them. A template is data, not code. Targets are always empty in a
// template: a target is a plan someone sets, never a number we invent.

import type { MetricEntry, MetricUnit } from '@/lib/api/warehouse'
import type {
  Band, Direction, DisplayFormat, MetricSlot, Row, Rule, Scorecard, ScorecardTemplate, Target, TemplateRow,
} from './model'

/**
 * Dev's checkpoint 1 decisions (scope §10), each one line. These are Scope 1's defaults until Dev decides;
 * changing one here changes every new row and the weekly template.
 */
export const DECISIONS = {
  /** D-1: only the target rule colours a row; history, duration and trend show as badges. */
  colourFromTargetOnly: true,
  /** D-2: the weekly template's amber band. 0 is two colours (any miss is red, with the gap shown); 0.05 adds amber within 5%. */
  weeklyAmberBand: 0,
  /** D-3: the running week is an outlined pace chip, never a filled colour. false colours it against the pro-rated target. */
  currentWeekAsPace: true,
  /** D-4: rates need this many orders (or impressions, for ad rates) in the period before they get a colour. */
  minOrders: 30,
  minImpressions: 1_000,
  /** D-5: changing a target applies from the running week on, so past weeks keep the colour they had. */
  targetsKeepHistory: true,
  /** Weeks start Monday in the store's timezone. */
  weekStart: 'monday' as const,
  /** Duration: a red this many weeks running gets a badge. */
  redStreakWeeks: 2,
}

/** The amber band people can switch on per row (D-2's three-colour option). */
export const THREE_COLOUR_BAND = 0.05

export function bandOf(amber: number): Band {
  return { kind: 'relative', amber }
}

/** The rules every new row starts with. */
export function defaultRules(amber = DECISIONS.weeklyAmberBand): Rule[] {
  const band = bandOf(amber)
  return [
    { id: 'target', type: 'target', effect: 'status', enabled: true, band },
    {
      id: 'history', type: 'history', effect: DECISIONS.colourFromTargetOnly ? 'flag' : 'status', enabled: true,
      method: 'pooled_change', compareTo: 'previous', periods: 4, noise: 0.05, alert: 0.10,
    },
    { id: 'duration', type: 'duration', effect: 'flag', enabled: true, watches: 'target', atLeast: 'red', periods: DECISIONS.redStreakWeeks },
    { id: 'trend', type: 'trend', effect: 'flag', enabled: false, periods: 3, minMove: 0.05, direction: 'adverse' },
    { id: 'pacing', type: 'pacing', effect: DECISIONS.currentWeekAsPace ? 'flag' : 'status', enabled: true, curve: 'linear', band },
  ]
}

/** Money and count metrics that are levels, not running totals (an average, a price, a return on spend). */
const RATE_LIKE = new Set([
  'aov', 'revenue_per_customer', 'cpc', 'cpm', 'platform_cpa', 'platform_roas', 'revenue_per_message', 'frequency',
])

/** A running total fills up over a period (pro-rate its target mid-week); a rate or average is a level. */
export function isAdditive(name: string, unit: MetricUnit | null): boolean {
  return unit !== 'ratio' && !RATE_LIKE.has(name) && !isMultipleName(name)
}

/** Returns on spend read as a multiple (3.2×), not a percentage (320%). */
export function isMultipleName(name: string): boolean {
  return /(^|_)(mer|roas)($|_)/.test(name) || name === 'marketing_efficiency_ratio' || name === 'marketing_efficiency'
}

/** The denominator that makes a rate trustworthy, for the rates we know (until S3 tells us each rate's denominator). */
export function minSampleFor(name: string): Row['minSample'] {
  if (['refund_rate', 'discount_rate', 'cancellation_rate', 'aov', 'revenue_per_customer'].includes(name)) {
    return { metric: 'orders', min: DECISIONS.minOrders }
  }
  if (['ctr', 'cpc', 'cpm', 'platform_conversion_rate'].includes(name)) return { metric: 'impressions', min: DECISIONS.minImpressions }
  return undefined
}

/** Lower is better for costs, losses and leakage; higher for everything else unless a template says otherwise. */
const LOWER_IS_BETTER = new Set([
  'refund_rate', 'discount_rate', 'cancellation_rate', 'refunds', 'refund_count', 'cancelled_orders', 'discounts',
  'cpc', 'cpm', 'platform_cpa', 'unsubscribe_rate', 'bounce_rate', 'unsubscribes', 'bounces',
])

export function defaultDirection(name: string): Direction {
  return LOWER_IS_BETTER.has(name) ? 'lower' : 'higher'
}

export function displayFor(name: string): Row['display'] {
  return isMultipleName(name) ? { format: 'multiple' as DisplayFormat } : undefined
}

let idCounter = 0

/** A short id, unique within a scorecard. */
export function newId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${Date.now().toString(36)}${idCounter.toString(36)}`
}

/** The metric a row reads, or null for a manual row. */
export function metricOf(row: Row): string | null {
  return row.source.kind === 'metric' ? row.source.metric : null
}

/** A row for one library metric, with the defaults for its kind and no target. */
export function rowFor(name: string, order: number, overrides: Partial<Row> = {}): Row {
  return {
    id: newId(name),
    source: { kind: 'metric', metric: name },
    direction: defaultDirection(name),
    targets: [],
    rules: defaultRules(),
    minSample: minSampleFor(name),
    display: displayFor(name),
    order,
    ...overrides,
  }
}

/** `effectiveFrom` for a target that applies to every week, including the ones before it was set. */
export const ALL_WEEKS = '0001-01-01'

/**
 * A row's targets after someone types a new one. The first target applies to all weeks, so the history colours in.
 * After that (D-5), a change applies from the running week on and past weeks keep the target they had, unless the
 * person chooses all weeks (fixing a typo, say).
 */
export function nextTargets(existing: Target[], typed: Target | null, appliesTo: 'all' | 'from_now', currentWeek: string): Target[] {
  if (typed === null) return []
  if (existing.length === 0 || appliesTo === 'all' || !DECISIONS.targetsKeepHistory) return [{ ...typed, effectiveFrom: ALL_WEEKS }]
  // A change on the day the latest target was set is a correction (a typo, a second thought): it replaces that
  // target where it stood rather than starting a new one.
  const latest = [...existing].sort((a, b) => a.setAt.localeCompare(b.setAt)).at(-1)!
  if (isCorrection(latest, typed)) return [...existing.filter(target => target.id !== latest.id), { ...typed, effectiveFrom: latest.effectiveFrom }]
  return [...existing.filter(target => target.effectiveFrom !== currentWeek), { ...typed, effectiveFrom: currentWeek }]
}

/** True when `typed` comes the same day as `latest` was set. */
export function isCorrection(latest: Target | undefined, typed: Pick<Target, 'setAt'>): boolean {
  return latest !== undefined && latest.setAt.slice(0, 10) === typed.setAt.slice(0, 10)
}

export interface TargetInput {
  value?: number
  low?: number
  high?: number
  effectiveFrom: string
  setBy?: string
  now?: Date
}

/** A typed fixed target from a date. */
export function typedTarget({ value, low, high, effectiveFrom, setBy, now = new Date() }: TargetInput): Target {
  return {
    id: newId('target'),
    kind: 'fixed',
    ...(low !== undefined && high !== undefined ? { low, high } : { value }),
    effectiveFrom,
    window: 'period',
    origin: 'typed',
    setBy: setBy ?? '',
    setAt: now.toISOString(),
  }
}

/** The MER slot: filled once someone creates MER in the metric library. */
export const MER_SLOT: MetricSlot = {
  label: 'MER',
  hint: 'Revenue ÷ ad spend. Create it in the metric library and it fills in here.',
  candidates: ['mer', 'blended_mer', 'marketing_efficiency_ratio', 'marketing_efficiency'],
  // However the chat names it: "MER", "Blended MER", "Marketing efficiency", "Revenue per dollar of ads".
  match: '(^|[^a-z])mer([^a-z]|$)|marketing.?efficiency|revenue.{0,12}(per|/|÷).{0,12}(ad|ads|advertising|marketing)',
}

/** Whether a catalog metric fills a slot: one of its names, or a custom metric matching its pattern. */
export function slotMatches(slot: MetricSlot, entry: Pick<MetricEntry, 'name' | 'label' | 'category'>): boolean {
  if (slot.candidates.includes(entry.name)) return true
  if (!slot.match || entry.category !== 'custom') return false
  try {
    const pattern = new RegExp(slot.match, 'i')
    return pattern.test(entry.name.replaceAll('_', ' ')) || pattern.test(entry.label)
  } catch {
    return false
  }
}

const metricRow = (metric: string, direction: Direction, extra: Partial<TemplateRow> = {}): TemplateRow => ({
  source: { kind: 'metric', metric }, direction, minSample: minSampleFor(metric), display: displayFor(metric), ...extra,
})

/** Matt Putra's Monday review, fitted to what the warehouse measures today: Shopify plus Meta Ads. */
export const MONDAY_STORE_REVIEW: ScorecardTemplate = {
  id: 'monday-store-review',
  version: 1,
  name: 'Monday store review',
  method: 'weekly_scorecard',
  description: 'The weekly numbers for one store. Discuss the reds; green moves on.',
  source: { title: 'Matt Putra, weekly scorecard (EOS)' },
  cadence: 'week',
  weekStart: DECISIONS.weekStart,
  periodsShown: 6,
  rows: [
    metricRow('revenue', 'higher'),
    metricRow('orders', 'higher'),
    metricRow('aov', 'higher'),
    metricRow('new_customers', 'higher'),
    metricRow('refund_rate', 'lower'),
    metricRow('discount_rate', 'lower'),
    metricRow('cancellation_rate', 'lower'),
    // Spend is judged against a budget: off plan either way is worth a word.
    metricRow('ad_spend', 'range'),
    metricRow('ctr', 'higher'),
    metricRow('mer', 'higher', { display: { format: 'multiple' }, slot: MER_SLOT }),
  ],
  requires: ['store', 'ads'],
  size: [8, 15],
}

export const TEMPLATES: ScorecardTemplate[] = [MONDAY_STORE_REVIEW]

/** A new scorecard from a template: every row with its defaults, targets left for people to set. */
export function scorecardFromTemplate(template: ScorecardTemplate, workspaceId: string, now = new Date()): Scorecard {
  const stamp = now.toISOString()
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    method: template.method,
    template: { id: template.id, version: template.version },
    cadence: template.cadence,
    weekStart: template.weekStart,
    periodsShown: template.periodsShown,
    scope: { kind: 'store', workspaceId },
    visibility: { level: 'org' },
    sections: [],
    rows: template.rows.map((row, order) => {
      const metric = row.source.kind === 'metric' ? row.source.metric : `manual-${order}`
      return rowFor(metric, order, {
        source: row.source,
        direction: row.direction,
        minSample: row.minSample,
        display: row.display,
        ...(row.slot ? { slot: row.slot } : {}),
      })
    }),
    view: { layout: 'grid', columns: ['target'] },
    state: 'active',
    version: 0,
    createdBy: '',
    createdAt: stamp,
    updatedBy: '',
    updatedAt: stamp,
  }
}
