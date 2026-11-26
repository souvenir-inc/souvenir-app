'use client'

// Setting a target in one line that reads like a sentence:  [≥ at least ▾] [$ 120k] [per week ▾]
// "Between" gives two fields: [↔ between ▾] [$ from] and [$ to] [per week ▾].
// The condition defaults to the metric's natural one (at least for revenue, at most for refund rate), the period to
// the workspace's (weekly), so most of the time it's: type the number, press Enter. Underneath, always: what it
// comes to per month, quarter and year. Used on the Target tab and in the popover behind "Set target".

import { useState, type FormEvent } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/Button'
import type { MetricUnit } from '@/lib/api/warehouse'
import type { Direction } from '@/lib/scorecard/model'
import { formatOf, formatValue, inputAffix, looksLikeRange, parseTarget, parseTargetAuto, toInput, type ParsedTarget } from '@/lib/scorecard/present'
import {
  PERIOD_DAYS, PERIOD_LABELS, TARGET_PERIODS, targetsByPeriod, WEEKS_IN, type MetricTarget, type TargetNumber, type TargetPeriod,
} from '@/lib/scorecard/targets'
import { defaultDirection, isAdditive } from '@/lib/scorecard/template'
import { useMetricHealth } from './Health'
import styles from './Scorecard.module.css'

const CONDITION_OPTIONS: ReadonlyArray<{ value: Direction; label: string }> = [
  { value: 'higher', label: '≥ at least' },
  { value: 'lower', label: '≤ at most' },
  { value: 'range', label: '↔ between' },
]

function textOf(number: TargetNumber | undefined, format: ReturnType<typeof formatOf>): string {
  if (!number) return ''
  return 'value' in number ? toInput(number.value, format) : `${toInput(number.low, format)}–${toInput(number.high, format)}`
}

function scaled(number: TargetNumber, factor: number): TargetNumber {
  return 'value' in number ? { value: number.value * factor } : { low: number.low * factor, high: number.high * factor }
}

function numberText(number: TargetNumber, format: ReturnType<typeof formatOf>): string {
  return 'value' in number ? formatValue(number.value, format) : `${formatValue(number.low, format)}–${formatValue(number.high, format)}`
}

/** A value rounded to two significant figures (percent units for rates), the way someone would type it. */
function roughValue(value: number, format: ReturnType<typeof formatOf>): number | null {
  const shown = format === 'percent' ? value * 100 : value
  if (!Number.isFinite(shown) || shown === 0) return null
  const step = 10 ** (Math.floor(Math.log10(Math.abs(shown))) - 1)
  return Math.round(shown / step) * step
}

/** The rounded pace in the app's compact style, without the $ the field already shows: 2.4M, 560k, 1.2B, 45, 3.2. */
export function roughInput(value: number, format: ReturnType<typeof formatOf>): string {
  const rounded = roughValue(value, format)
  if (rounded === null) return ''
  const trim = (n: number) => String(Number(n.toFixed(1)))
  if (format === 'money' || format === 'number') {
    if (Math.abs(rounded) >= 1e9) return `${trim(rounded / 1e9)}B`
    if (Math.abs(rounded) >= 1e6) return `${trim(rounded / 1e6)}M`
    if (Math.abs(rounded) >= 1e3) return `${trim(rounded / 1e3)}k`
  }
  return trim(rounded)
}

export interface TargetEditorProps {
  metric: string
  label: string
  unit: MetricUnit
  /** Called after a save or a removal (to close a popover). */
  onDone?: () => void
  /** Kept for callers; clicking outside a popover already closes it. */
  onCancel?: () => void
  /** Where the metric stands now, shown under the line (the Target tab passes the period's health). */
  status?: React.ReactNode
  /** Focus the number at once (in a popover). */
  autoFocus?: boolean
  /**
   * The metric's actual over a span of days, so the empty field can show its own current pace for the chosen
   * period as the placeholder (never a made-up number). Omit when unknown: the field starts empty.
   */
  pace?: { value: number | null; days: number } | null
}

/** What's typed for one period: the one number, or the two ends of a "between". */
interface Draft { single: string; low: string; high: string }

function draftOf(number: TargetNumber | undefined, format: ReturnType<typeof formatOf>): Draft {
  if (!number) return { single: '', low: '', high: '' }
  return 'value' in number
    ? { single: toInput(number.value, format), low: '', high: '' }
    : { single: '', low: toInput(number.low, format), high: toInput(number.high, format) }
}

/** The typed text in the shape `textOf` gives a saved target, to tell whether anything changed. */
function draftText(draft: Draft, range: boolean): string {
  if (!range) return draft.single.trim()
  const low = draft.low.trim()
  const high = draft.high.trim()
  return low === '' && high === '' ? '' : `${low}–${high}`
}

function parseDraft(draft: Draft, range: boolean, format: ReturnType<typeof formatOf>, condition: Direction): ParsedTarget {
  if (!range) return parseTargetAuto(draft.single, format, condition)
  const low = draft.low.trim()
  const high = draft.high.trim()
  if (low === '' && high === '') return { kind: 'none' }
  if (low === '' || high === '') return { kind: 'invalid', message: 'Enter both numbers' }
  return parseTarget(`${low}–${high}`, format, 'range')
}

export function TargetEditor({ metric, label, unit, onDone, status, autoFocus = false, pace = null }: TargetEditorProps) {
  const { targetOf, settings, saveTarget } = useMetricHealth()
  const target = targetOf(metric)
  const format = formatOf(null, unit, metric)
  const additive = isAdditive(metric, unit)
  const affix = inputAffix(format)
  const periods = targetsByPeriod(target, settings, additive)
  // Open on the period the person typed in (with auto-calculate on there's one), else the workspace's.
  const typedPeriod = (target && TARGET_PERIODS.find(p => target.values[p] && !periods[p]?.derived)) || settings.base
  const savedCondition = target?.direction ?? defaultDirection(metric)

  const [condition, setCondition] = useState<Direction>(savedCondition)
  const [period, setPeriod] = useState<TargetPeriod>(typedPeriod)
  const [drafts, setDrafts] = useState<Record<TargetPeriod, Draft>>(() => Object.fromEntries(
    TARGET_PERIODS.map(p => [p, draftOf(target?.values[p], format)]),
  ) as Record<TargetPeriod, Draft>)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const range = condition === 'range'
  const draft = drafts[period]
  const update = (patch: Partial<Draft>) => { setDrafts({ ...drafts, [period]: { ...draft, ...patch } }); setError(null) }
  const parsed = parseDraft(draft, range, format, condition)
  // A range typed into the one field ("300–380") saves as "between".
  const nextCondition: Direction = parsed.kind === 'range' ? 'range' : condition
  const number: TargetNumber | null = parsed.kind === 'value' ? { value: parsed.value } : parsed.kind === 'range' ? { low: parsed.low, high: parsed.high } : null
  const typed = draftText(draft, range)
  // Anything that changes the target counts: the number, the condition, or (with auto-calculate on) which period
  // the number is for: 100 a week and 100 a month are different targets.
  const changed = typed !== textOf(target?.values[period], format)
    || nextCondition !== savedCondition
    || (settings.derive && period !== typedPeriod && typed !== '')

  // The placeholder is the metric's own pace for this period, rounded: a running total scaled by days, a rate as is.
  const paceValue = pace?.value != null && pace.days > 0
    ? (additive ? pace.value / pace.days * PERIOD_DAYS[period] : pace.value)
    : null
  const placeholder = paceValue === null ? '' : roughInput(paceValue, format)
  const paceTitle = paceValue === null ? undefined : `About ${formatValue(paceValue, format)} ${PERIOD_LABELS[period].per} at the current pace`

  // What the target comes to for the other periods, always shown. Auto-calculate on: worked out from this one
  // (a running total scales with the weeks in the period; an average or rate is the same for every period).
  // Off: each period's own number, and clicking one moves the form to it.
  const otherPeriods = TARGET_PERIODS.filter(p => p !== period)
  const breakdown = otherPeriods.map(p => {
    if (settings.derive) {
      const value = number === null ? null : additive ? scaled(number, WEEKS_IN[p] / WEEKS_IN[period]) : number
      return { period: p, text: value === null ? '—' : numberText(value, format) }
    }
    const own = target?.values[p]
    return { period: p, text: own ? numberText(own, format) : 'Not set' }
  })
  const breakdownNote = !settings.derive
    ? 'Auto-calculate is off, so each period has its own target. Click one to set it.'
    : additive
      ? `Worked out from the ${PERIOD_LABELS[period].adjective.toLowerCase()} number above.`
      : `${label} is an average, so the target is the same for every period.`

  const switchCondition = (next: Direction) => {
    // Carry the number across: at least 300 → between 300 and …, and back.
    if (next === 'range' && draft.low === '' && draft.high === '') update({ low: draft.single })
    else if (next !== 'range' && draft.single === '') update({ single: draft.low })
    setCondition(next)
    setError(null)
  }

  // A range typed into the one field becomes the two "between" fields once the field is left.
  const splitTypedRange = () => {
    if (range || !looksLikeRange(draft.single)) return
    const typedRange = parseTarget(draft.single, format, 'range')
    if (typedRange.kind !== 'range') return
    update({ single: '', low: toInput(typedRange.low, format), high: toInput(typedRange.high, format) })
    setCondition('range')
  }

  const save = async (event?: FormEvent) => {
    event?.preventDefault()
    if (parsed.kind === 'invalid') { setError(parsed.message); return }
    setSaving(true)
    try {
      // With auto-calculate on, the one number is the target and the rest follow; with it off, this period changes.
      const values: MetricTarget['values'] = settings.derive ? {} : { ...(target?.values ?? {}) }
      delete values[period]
      if (number) values[period] = number
      await saveTarget(metric, nextCondition, values)
      onDone?.()
    } catch {
      // useTargets already told the person why.
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    setSaving(true)
    try {
      await saveTarget(metric, condition, {})
      onDone?.()
    } catch {
      // useTargets already told the person why.
    } finally {
      setSaving(false)
    }
  }

  const field = (value: string, onChange: (text: string) => void, aria: string, hint: string, first: boolean, extra?: { onBlur?: () => void; title?: string }) => (
    <span className={styles.numberWrap}>
      {affix.prefix && <span className={styles.affix} aria-hidden>{affix.prefix}</span>}
      <input
        className={styles.numberInput}
        value={value}
        onChange={event => onChange(event.target.value)}
        onBlur={extra?.onBlur}
        placeholder={hint}
        title={extra?.title}
        inputMode="decimal"
        aria-label={aria}
        aria-invalid={error ? true : undefined}
        autoFocus={autoFocus && first}
      />
      {affix.suffix && <span className={styles.affix} aria-hidden>{affix.suffix}</span>}
    </span>
  )

  return (
    <form className={styles.editor} onSubmit={save} aria-label={`${label} target`}>
      <div className={styles.targetRow} data-error={error ? '' : undefined}>
        <span className={styles.selectWrap}>
          <select className={styles.select} value={condition} aria-label="Condition" onChange={event => switchCondition(event.target.value as Direction)}>
            {CONDITION_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <ChevronDown size={12} strokeWidth={1.75} aria-hidden className={styles.selectChevron} />
        </span>
        {range
          ? (
            <>
              {field(draft.low, text => update({ low: text }), `${label} target, from`, 'from', true)}
              <span className={styles.and}>and</span>
              {field(draft.high, text => update({ high: text }), `${label} target, to`, 'to', false)}
            </>
          )
          : field(draft.single, text => update({ single: text }), `${label} target`, placeholder, true, { onBlur: splitTypedRange, title: paceTitle })}
        <span className={styles.selectWrap}>
          <select className={styles.select} value={period} aria-label="Period"
            onChange={event => {
              const next = event.target.value as TargetPeriod
              // Auto-calculate on: carry the number over, so switching "per week" to "per month" keeps what was typed.
              if (settings.derive) setDrafts({ ...drafts, [next]: draft })
              setPeriod(next)
              setError(null)
            }}>
            {TARGET_PERIODS.map(p => <option key={p} value={p}>per {PERIOD_LABELS[p].noun}</option>)}
          </select>
          <ChevronDown size={12} strokeWidth={1.75} aria-hidden className={styles.selectChevron} />
        </span>
      </div>

      {error && <p className={styles.editorError} role="alert">{error}</p>}

      <div className={styles.breakdown}>
        <dl className={styles.breakdownGrid}>
          {breakdown.map(item => (
            <div key={item.period} className={styles.breakdownItem}>
              <dt>Per {PERIOD_LABELS[item.period].noun}</dt>
              <dd>
                {settings.derive
                  ? item.text
                  : (
                    <button type="button" className={styles.breakdownButton} data-empty={item.text === 'Not set' ? '' : undefined}
                      onClick={() => { setPeriod(item.period); setError(null) }}>
                      {item.text}
                    </button>
                  )}
              </dd>
            </div>
          ))}
        </dl>
        <p className={styles.formHint}>{breakdownNote}</p>
      </div>

      {status && <div className={styles.editorStatus}>{status}</div>}

      <div className={styles.editorFoot}>
        {target
          ? <button type="button" className={styles.textButton} onClick={() => void remove()} disabled={saving}>Remove target</button>
          : <span />}
        <Button size="sm" type="submit" disabled={saving || !changed || (number === null && !target)} loading={saving}>
          {number === null && target && parsed.kind === 'none' ? 'Clear' : 'Save'}
        </Button>
      </div>
    </form>
  )
}

/** The short form of a metric's target for a row or card: "≥ $120k / wk", or null. */
export function targetSummary(target: MetricTarget | null, unit: MetricUnit, metric: string): string | null {
  if (!target) return null
  const period = TARGET_PERIODS.find(p => target.values[p])
  if (!period) return null
  const number = target.values[period]!
  const format = formatOf(null, unit, metric)
  const per = { week: 'wk', month: 'mo', quarter: 'qtr', year: 'yr' }[period]
  if ('value' in number) return `${target.direction === 'lower' ? '≤' : '≥'} ${formatValue(number.value, format)} / ${per}`
  return `${formatValue(number.low, format)}–${formatValue(number.high, format)} / ${per}`
}
