'use client'

// "Is this number normal for stores like this one?": the researched band for a metric drawn as a bar, where this
// store sits on it, the sources behind it, and an edit for the workspace's own band. Context only; the target sets
// the colour.

import { useState, type FormEvent } from 'react'
import { ExternalLink, Pencil } from 'lucide-react'
import { Button } from '@/components/Button'
import { InputField } from '@/components/InputField'
import type { MetricUnit } from '@/lib/api/warehouse'
import {
  bandFor, benchmarkFlagDetail, benchmarkOf, flagLabel, judgeBenchmark, NO_BENCHMARK_REASON, type BenchmarkBand, type BenchmarkVerdict,
} from '@/lib/scorecard/benchmarks'
import { useBenchmarkEdits } from '@/lib/scorecard/hooks'
import { formatOf, formatValue, fromInput, inputAffix, toInput } from '@/lib/scorecard/present'
import { useWorkspace } from '@/lib/warehouse/queries'
import styles from './Scorecard.module.css'

const VERDICT_TEXT: Record<BenchmarkVerdict, string> = {
  inside: 'Healthy',
  near: 'Outside healthy',
  outside: 'Red flag',
  not_judged: '',
}

/** "2.0%–4.0%", "at least 3.0×", "at most $40". */
export function bandText(band: BenchmarkBand, format: ReturnType<typeof formatOf>): string {
  const { low, high } = band.healthy
  if (low !== undefined && high !== undefined) return `${formatValue(low, format)}–${formatValue(high, format)}`
  if (low !== undefined) return `at least ${formatValue(low, format)}`
  if (high !== undefined) return `at most ${formatValue(high, format)}`
  return 'no range set'
}

export function redFlagText(band: BenchmarkBand, format: ReturnType<typeof formatOf>): string | null {
  const flag = band.redFlag
  if (!flag) return null
  const parts = [
    flag.below !== undefined ? `below ${formatValue(flag.below, format)}` : null,
    flag.above !== undefined ? `above ${formatValue(flag.above, format)}` : null,
  ].filter(Boolean)
  return parts.length > 0 ? `Red flag ${parts.join(' or ')}` : null
}

export interface BenchmarkPanelProps {
  metric: string
  label: string
  unit: MetricUnit
  /** The metric's value for the period on screen, and that period's name ("last 30 days"). */
  actual: number | null
  periodLabel: string
}

/** Where a value sits on the bar, 0–100, given the bar's ends. */
function at(value: number, min: number, max: number): number {
  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100))
}

/** The bar's ends: every edge and the store's value, with room either side (never below zero for values that can't be). */
export function barScale(band: BenchmarkBand, actual: number | null): { min: number; max: number } {
  const values = [band.healthy.low, band.healthy.high, band.redFlag?.below, band.redFlag?.above, actual ?? undefined]
    .filter((value): value is number => value !== undefined && Number.isFinite(value))
  if (values.length === 0) return { min: 0, max: 1 }
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const pad = (hi - lo || Math.abs(hi) || 1) * 0.25
  return { min: lo >= 0 ? Math.max(0, lo - pad) : lo - pad, max: hi + pad }
}

/** The healthy band shaded on a track, the red-flag zones tinted, and a marker for the store's own number. */
function RangeBar({ band, actual, verdict, format, periodLabel }: {
  band: BenchmarkBand
  actual: number | null
  verdict: BenchmarkVerdict
  format: ReturnType<typeof formatOf>
  periodLabel: string
}) {
  const { min, max } = barScale(band, actual)
  const healthyFrom = at(band.healthy.low ?? min, min, max)
  const healthyTo = at(band.healthy.high ?? max, min, max)
  const below = band.redFlag?.below
  const above = band.redFlag?.above
  const marker = actual === null ? null : at(actual, min, max)
  const edge = marker === null ? undefined : marker < 12 ? 'start' : marker > 88 ? 'end' : undefined
  const verdictText = VERDICT_TEXT[verdict]
  return (
    <div className={styles.rangeBar}>
      {marker !== null && (
        <span className={styles.rangeMarkerLabel} data-verdict={verdict} data-edge={edge} style={{ left: `${marker}%` }}
          title={`Yours, ${periodLabel}${verdictText ? `: ${verdictText}` : ''}`}>
          Yours {formatValue(actual, format)}
        </span>
      )}
      <div className={styles.rangeTrack} aria-hidden>
        {below !== undefined && <span className={styles.rangeRed} style={{ left: 0, width: `${at(below, min, max)}%` }} />}
        {above !== undefined && <span className={styles.rangeRed} style={{ left: `${at(above, min, max)}%`, right: 0 }} />}
        <span className={styles.rangeHealthy} style={{ left: `${healthyFrom}%`, width: `${Math.max(1, healthyTo - healthyFrom)}%` }} />
      </div>
      {marker !== null && <span className={styles.rangeMarker} data-verdict={verdict} style={{ left: `${marker}%` }} aria-hidden />}
    </div>
  )
}

export function BenchmarkPanel({ metric, label, unit, actual, periodLabel }: BenchmarkPanelProps) {
  const workspace = useWorkspace()
  const { edits, setBand } = useBenchmarkEdits(workspace.data?.id)
  const [editing, setEditing] = useState(false)
  const benchmark = benchmarkOf(metric)
  const format = formatOf(null, unit, metric)
  const inForce = bandFor(metric, edits)

  if (!benchmark && !edits[metric]) {
    return (
      <div className={styles.benchmark}>
        <p className={styles.body}>{NO_BENCHMARK_REASON[metric] ?? `No benchmark for ${label.toLowerCase()} yet.`}</p>
        {!NO_BENCHMARK_REASON[metric] && !editing && (
          <button type="button" className={styles.textButton} onClick={() => setEditing(true)}>
            <Pencil size={12} strokeWidth={1.75} aria-hidden /> Set your own range
          </button>
        )}
        {editing && <BandForm initial={{ healthy: {} }} direction="higher" format={format}
          onSave={async band => { await setBand(metric, band); setEditing(false) }} onCancel={() => setEditing(false)} />}
      </div>
    )
  }

  const band = inForce!.band
  const edited = inForce!.edited
  const match = edits[metric] ? 'exact' : benchmark!.match
  // The same verdict as the flag pill on cards and in the header: red past the red-flag line, orange outside healthy.
  const judged = judgeBenchmark(actual, band, match) !== 'not_judged'
  const flagged = benchmarkFlagDetail(metric, actual, edits)
  const verdict: BenchmarkVerdict = !judged ? 'not_judged' : !flagged ? 'inside' : flagged.level === 'red' ? 'outside' : 'near'
  const status = !judged ? null : flagged ? flagLabel(flagged) : 'Healthy'
  const flag = redFlagText(band, format)
  // One short line under the bar: why a band measured differently isn't judged, else what the range means.
  const line = !edited && benchmark
    ? benchmark.match === 'mismatch' && benchmark.matchNote ? `For reference, not judged. ${benchmark.matchNote}` : benchmark.note
    : null

  return (
    <div className={styles.benchmark}>
      <div className={styles.blockHead}>
        <span className={styles.benchmarkLabel}>{edited ? 'Your healthy range' : 'Healthy for Shopify stores'}</span>
        {!editing && (
          <button type="button" className={styles.textButton} onClick={() => setEditing(true)}>
            <Pencil size={12} strokeWidth={1.75} aria-hidden /> Edit
          </button>
        )}
      </div>

      {status && actual !== null && (
        <p className={styles.benchmarkStatus}>
          <span className={styles.pill} data-status={flagged ? flagged.level : 'green'}><span className={styles.pillDot} aria-hidden />{status}</span>
          <span>Yours, {periodLabel}: <strong>{formatValue(actual, format)}</strong></span>
        </p>
      )}
      <RangeBar band={band} actual={actual} verdict={verdict} format={format} periodLabel={periodLabel} />
      <p className={styles.rangeCaption}>
        Healthy {bandText(band, format)}{flag ? ` · ${flag.charAt(0).toLowerCase()}${flag.slice(1)}` : ''}
      </p>

      {line && (
        <p className={styles.body} title={benchmark?.match === 'approximate' ? benchmark.matchNote : undefined}>{line}</p>
      )}
      {edited && benchmark && (
        <p className={styles.description}>
          Researched default {bandText(benchmark.band, format)} ·{' '}
          <button type="button" className={styles.textButton} onClick={() => void setBand(metric, null).catch(() => {})}>Reset to default</button>
        </p>
      )}

      {editing && (
        <BandForm initial={band} direction={benchmark?.direction ?? 'higher'} format={format}
          onSave={async next => { await setBand(metric, next); setEditing(false) }} onCancel={() => setEditing(false)} />
      )}

      {benchmark && !edited && benchmark.sources.length > 0 && (
        <details className={styles.sources}>
          <summary>Sources ({benchmark.sources.length}) · confidence {benchmark.confidence}</summary>
          <ul>
            {benchmark.sources.map(source => (
              <li key={`${source.publisher}-${source.title}`}>
                <span className={styles.rowTitle}>
                  {source.url
                    ? <a href={source.url} target="_blank" rel="noreferrer">{source.publisher}: {source.title} <ExternalLink size={11} strokeWidth={1.75} aria-hidden /></a>
                    : `${source.publisher}: ${source.title}`}
                </span>
                <span className={styles.rowMeta}>
                  {[source.date, source.sample].filter(Boolean).join(' · ')}
                  <span className={styles.evidence} data-evidence={source.evidence}>{source.evidence}</span>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

function BandForm({ initial, direction, format, onSave, onCancel }: {
  initial: BenchmarkBand
  direction: 'higher' | 'lower' | 'range'
  format: ReturnType<typeof formatOf>
  onSave: (band: BenchmarkBand) => Promise<void>
  onCancel: () => void
}) {
  const [low, setLow] = useState(toInput(initial.healthy.low, format))
  const [high, setHigh] = useState(toInput(initial.healthy.high, format))
  const [below, setBelow] = useState(toInput(initial.redFlag?.below, format))
  const [above, setAbove] = useState(toInput(initial.redFlag?.above, format))
  const [saving, setSaving] = useState(false)
  const affix = inputAffix(format)
  const node = (text: string | null) => (text ? <span className={styles.affix}>{text}</span> : undefined)
  const parsed = [low, high, below, above].map(text => fromInput(text, format))
  const invalid = parsed.some(value => value !== null && Number.isNaN(value))
  const [l, h, b, a] = parsed as Array<number | null>

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (invalid || (l === null && h === null)) return
    setSaving(true)
    try {
      const band: BenchmarkBand = { healthy: { ...(l !== null ? { low: l } : {}), ...(h !== null ? { high: h } : {}) } }
      if (b !== null || a !== null) band.redFlag = { ...(b !== null ? { below: b } : {}), ...(a !== null ? { above: a } : {}) }
      await onSave(band)
    } catch {
      // The hook already said why.
    } finally {
      setSaving(false)
    }
  }

  const field = (text: string, set: (value: string) => void, aria: string, placeholder: string) => (
    <InputField size="small" fluid aria-label={aria} placeholder={placeholder} inputMode="decimal" value={text} onChange={set}
      leftIcon={node(affix.prefix)} rightIcon={node(affix.suffix)} />
  )

  return (
    <form className={styles.bandForm} onSubmit={save}>
      <div className={styles.bandRow}>
        <span className={styles.fieldLabel}>Healthy from</span>
        {field(low, setLow, 'Healthy from', direction === 'lower' ? 'none' : 'low')}
        <span className={styles.and}>to</span>
        {field(high, setHigh, 'Healthy to', direction === 'higher' ? 'none' : 'high')}
      </div>
      <div className={styles.bandRow}>
        <span className={styles.fieldLabel}>Red flag below</span>
        {field(below, setBelow, 'Red flag below', 'optional')}
        <span className={styles.and}>or above</span>
        {field(above, setAbove, 'Red flag above', 'optional')}
      </div>
      <div className={styles.editorFoot}>
        <span />
        <div className={styles.footGroup}>
          <Button variant="secondary" size="sm" type="button" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button size="sm" type="submit" disabled={saving || invalid || (l === null && h === null)} loading={saving}>Save</Button>
        </div>
      </div>
    </form>
  )
}
