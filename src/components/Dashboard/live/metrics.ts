import type { Definition, Measurement, MetricEntry, Scorecard, Term, Unavailable, UnavailableCode, Unit } from '@/lib/api/warehouse'
import { formatFigure } from '../format'
import { addDays, isoDate, rangeDays, type Window } from '../period'
import type { AppId, Day, Health, Metric, MetricChange, MetricFormat, Series, Week } from '../types'
import { judge, needsAttention, type ScorecardRow } from '@/lib/scorecard/status'
import type { Apps } from './apps'

const FORMAT: Record<Unit, MetricFormat> = { money: 'currency', count: 'number', percent: 'percent', ratio: 'ratio' }
const WEEKS = 5

// Why a metric can't be measured, in the app's words: the warehouse's own `reason` is never shown
// (API-ER-06). A phrase, not a sentence: cards capitalise it, the metric window reads "This store
// can't measure it yet: …", the new-board list puts it after the name.
const UNAVAILABLE_COPY = new Map<string, string>([
  ['no_connection', 'no connected app records it'],
  ['first_sync', 'its app is still on its first sync'],
  ['feed_failed', 'its app’s last sync failed'],
] satisfies [UnavailableCode, string][])
const UNAVAILABLE_FALLBACK = 'this store can’t read it right now'

/** App copy for an Unavailable, by its code; a code added later reads the generic line. */
export function unavailableCopy(unavailable: Pick<Unavailable, 'code'>): string {
  return UNAVAILABLE_COPY.get(unavailable.code) ?? UNAVAILABLE_FALLBACK
}

/** What the warehouse measured for the board's dates; anything not yet back is undefined. */
export interface Readings {
  catalog: MetricEntry[]
  scorecards: Scorecard[]
  apps: Apps
  /** The period's totals for every metric, and the comparison period's. */
  total?: Measurement
  totalBefore?: Measurement
  /** By day over the chart's days, and the comparison days, for the board's metrics. */
  daily?: Measurement
  dailyBefore?: Measurement
  /** By week over the last five weeks, for the board's metrics. */
  weekly?: Measurement
  chart: Window
  chartBefore: Window | null
  compare: string
  today: Date
}

/** The first day of the week the warehouse counts in (Monday), five weeks back from today's. */
export function weeksWindow(today: Date): Window {
  const monday = addDays(today, -((today.getDay() + 6) % 7))
  return { from: addDays(monday, -7 * (WEEKS - 1)), to: today }
}

/** The card’s figure, rounded (the card re-reads `amount` for the viewer’s number style): one formatter for the app (format.ts). */
export function figure(amount: number | null, format: MetricFormat): string {
  return formatFigure(amount, format)
}

// The warehouse returns every day and week of the range, with 0 where there were no rows, so
// a store that connected last week reads as weeks of zeros and then its data. The first period
// in which any of the measured metrics is non-zero is where the store's data starts; periods
// before it are "no data yet" rather than zero. Zeros after it are real (a day with no refunds).
const dataStarts = new WeakMap<Measurement, string | null>()

/** The first period start with any recorded value, or null when nothing in it is non-zero. */
export function firstRecorded(m: Measurement): string | null {
  if (!dataStarts.has(m)) {
    const first = m.periods.find((p) => Object.values(p.values).some((v) => v !== null && v !== 0))
    dataStarts.set(m, first?.start ?? null)
  }
  return dataStarts.get(m) ?? null
}

/** Whether a period of this reading comes before the store's data starts. */
export function beforeData(m: Measurement | undefined, start: string): boolean {
  if (!m) return false
  const first = firstRecorded(m)
  return first === null || start < first
}

/** Why the totals couldn't measure a metric; undefined when they could. Metric names are outside keys (JS-1). */
function unavailableIn(total: Measurement | undefined, name: string): Unavailable | undefined {
  return total && Object.hasOwn(total.unavailable, name) ? total.unavailable[name] : undefined
}

/** Every metric in the catalog as the board's dates read it; `get` takes a card id ("revenue#2"). */
export class Metrics {
  readonly all: Metric[]
  private readonly byId: Map<string, Metric>
  private readonly entries: Map<string, MetricEntry>

  constructor(readings: Readings) {
    this.entries = new Map(readings.catalog.map((entry) => [entry.name, entry]))
    this.all = readings.catalog.map((entry) => this.read(entry, readings))
    this.byId = new Map(this.all.map((metric) => [metric.id, metric]))
  }

  /** A card id names its metric before any "#2" (06 AC-6). */
  static base(cardId: string): string {
    return cardId.split('#')[0]
  }

  get(cardId: string): Metric | undefined {
    return this.byId.get(Metrics.base(cardId))
  }

  private read(entry: MetricEntry, r: Readings): Metric {
    const scale = entry.unit === 'percent' ? 100 : 1
    const format = FORMAT[entry.unit]
    const scaled = (v: number | null | undefined) => (v === undefined || v === null ? null : v * scale)
    const value = (m: Measurement | undefined, start: string) => scaled(m?.periods.find((p) => p.start === start)?.values[entry.name])
    // A chart's days and weeks: those before the store recorded anything read as "no data yet".
    const charted = (m: Measurement | undefined, start: string) => (beforeData(m, start) ? null : value(m, start))
    const rawAmount = r.total?.periods[0]?.values[entry.name] ?? null
    const amount = scaled(rawAmount)
    const before = scaled(r.totalBefore?.periods[0]?.values[entry.name])
    const row = r.scorecards.flatMap((card) => card.rows).find((x) => x.metric === entry.name)
    const upIsGood = row?.direction !== 'down'
    const unavailable = unavailableIn(r.total, entry.name)
    const series = this.series(r, (m, day) => charted(m, isoDate(day)))
    return {
      id: entry.name,
      label: entry.label,
      definition: entry.description,
      format,
      sum: summed(entry.value),
      custom: entry.category === 'custom',
      upIsGood,
      apps: this.appsOf(entry, r.apps),
      amount,
      previous: before,
      value: figure(amount, format),
      change: changeOf(amount, before, upIsGood, series.comparable),
      series,
      weekly: this.weeks(r, (m, day) => charted(m, isoDate(day))),
      unmeasured: unavailable ? unavailableCopy(unavailable) : null,
      unavailableCode: unavailable?.code ?? null,
      connectWith: unavailable?.connectors ?? [],
      health: row && rawAmount !== null ? healthOf(rawAmount, row, scale, format) : null,
    }
  }

  private series(r: Readings, at: (m: Measurement | undefined, day: Date) => number | null): Series {
    const n = rangeDays(r.chart.from, r.chart.to)
    const days: Day[] = Array.from({ length: n }, (_, i) => {
      const date = addDays(r.chart.from, i)
      return { date, value: at(r.daily, date) }
    })
    const previous: Day[] = r.chartBefore
      ? Array.from({ length: n }, (_, i) => {
          const date = addDays(r.chartBefore!.from, i)
          return { date, value: at(r.dailyBefore, date) }
        })
      : []
    // "Mostly empty": under half the comparison days have data (CR-24).
    const comparable = previous.filter((d) => d.value !== null).length >= n / 2
    return { days, previous, comparable, compare: r.compare, daysWithData: days.filter((d) => d.value !== null).length }
  }

  private weeks(r: Readings, at: (m: Measurement | undefined, day: Date) => number | null): Week[] {
    const first = weeksWindow(r.today).from
    return Array.from({ length: WEEKS }, (_, i) => {
      const start = addDays(first, 7 * i)
      const inProgress = i === WEEKS - 1
      return { start, end: inProgress ? r.today : addDays(start, 6), value: at(r.weekly, start), inProgress }
    })
  }

  /** The connections a metric reads: its category's, or for blended and custom ones those of the metrics it is built from. */
  private appsOf(entry: MetricEntry, apps: Apps): AppId[] {
    const categories = new Set<string>()
    const visit = (e: MetricEntry, seen: Set<string>) => {
      if (seen.has(e.name)) return
      seen.add(e.name)
      if (e.category !== 'blended' && e.category !== 'custom') { categories.add(e.category); return }
      for (const name of namesIn(e.value)) {
        const used = this.entries.get(name)
        if (used) visit(used, seen)
      }
    }
    visit(entry, new Set())
    const ids = new Set([...categories].flatMap((c) => apps.feeding(c)))
    return [...ids].sort((a, b) => apps.rank(a) - apps.rank(b))
  }
}

/** The metric names an expression is built from. */
function namesIn(value: Definition | Term): string[] {
  if (typeof value === 'string') return [value]
  if (typeof value === 'number' || 'kind' in value) return []
  switch (value.op) {
    case 'add':
    case 'multiply': return value.terms.flatMap(namesIn)
    case 'subtract': return [...namesIn(value.left), ...namesIn(value.right)]
    case 'ratio': return [...namesIn(value.numerator), ...namesIn(value.denominator)]
  }
}

/** Adds up over days: an aggregate, or a sum or difference of them (CR-3). */
function summed(value: Definition): boolean {
  return 'kind' in value || value.op === 'add' || value.op === 'subtract'
}

function changeOf(amount: number | null, before: number | null, upIsGood: boolean, comparable: boolean): MetricChange | null {
  if (!comparable || amount === null || before === null || before === 0) return null
  const p = ((amount - before) / Math.abs(before)) * 100
  const up = p >= 0
  return { label: `${Math.abs(p).toFixed(1)}%`, direction: up ? 'up' : 'down', sentiment: up === upIsGood ? 'positive' : 'negative' }
}

/**
 * The card's health against its scorecard row, judged in the warehouse's units (lib/scorecard/status:
 * the same verdict as the metric window and Needs attention; right for negative targets too). Off only
 * when off track; at risk still reads as on (the backend counts it on track). `scale` turns the
 * row's target into the card's units for display (a percent's 0.045 is 4.5).
 */
function healthOf(raw: number, row: Pick<ScorecardRow, 'target' | 'direction' | 'tolerance'>, scale: number, format: MetricFormat): Health {
  // Card copy stays CR-28's ("On track" / "Off target −12%"); the judgement only decides the verdict.
  const on = !needsAttention(judge(raw, row))
  const off = row.target ? ((raw - row.target) / Math.abs(row.target)) * 100 : 0
  return {
    verdict: on ? 'on' : 'off',
    off: on ? undefined : `${off >= 0 ? '+' : '−'}${Math.abs(off).toFixed(0)}%`,
    target: figure(row.target * scale, format),
  }
}
