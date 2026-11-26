'use client'

import { useId, useState } from 'react'
import { ArrowLeft, Info, Settings2 } from 'lucide-react'
import { Switch } from '@/components/Switch'
import { TabItem } from '@/components/TabItem'
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { MetricUnit } from '@/lib/api/warehouse'
import { formatGap, formatOf, formatTarget, formatValue, healthLabel } from '@/lib/scorecard/present'
import { PERIOD_LABELS, TARGET_PERIODS, WEEKS_IN, windowDays, type Health, type MetricTarget, type TargetPeriod, type TargetSettings } from '@/lib/scorecard/targets'
import { useMetricHealth, type MetricHealthExtras } from './Health'
import { TargetEditor } from './TargetEditor'
import styles from './Scorecard.module.css'

/** The orange band a third colour starts with: within 10% short of the target. */
const THREE_COLOURS = 0.1

/** How the settings apply, behind the (i): what a period on screen is judged against. */
const SETTINGS_INFO = 'Targets apply to every metric in this store. Today, 7, 30, 60 and 90 days are each judged '
  + 'against the target for the closest period, scaled to the days on screen. Averages and rates, like refund rate, '
  + 'are compared as they are.'

export interface HealthPanelProps extends MetricHealthExtras {
  metric: string
  label: string
  unit: MetricUnit
  /** The metric's total for the window on screen. */
  actual: number | null
  /** The header's window, already ended where the data stops. */
  window: { start: string; end: string }
  /** Drop the card frame, for a tab inside a metric's modal. Target settings then open in place, not in a dialog. */
  bare?: boolean
}

/**
 * Where the metric stands, in one sentence: "On track: 1,564 against ≥ 1,500", "Off target: 1,200 against ≥ 1,500
 * (−20%)", "No target yet", or why it can't be judged ("Too few to judge: only 12 orders").
 */
export function standingSentence(health: Health, actual: number | null, target: MetricTarget | null, format: ReturnType<typeof formatOf>): string {
  if (!target) return 'No target yet'
  const against = health.expected && actual !== null
    ? `${formatValue(actual, format)} against ${formatTarget(health.expected, target.direction, format)}`
    : null
  if (health.verdict === 'green') return against ? `On track: ${against}` : 'On track'
  if (health.verdict === 'amber' || health.verdict === 'red') {
    const word = health.verdict === 'amber' ? 'Close' : 'Off target'
    const gap = formatGap(health.gapPct)
    return against ? `${word}: ${against}${gap ? ` (${gap})` : ''}` : healthLabel(health)
  }
  return health.reason ? `${healthLabel(health)}: ${health.reason}` : healthLabel(health)
}

/**
 * A metric's target and health: one sentence saying where it stands for the period on screen, then the target form
 * (condition, number, period, what it comes to per month, quarter and year). Target settings are one click away.
 */
export function HealthPanel({ metric, label, unit, actual, window, bare = false, ...extras }: HealthPanelProps) {
  const { healthFor, targetOf, clock } = useMetricHealth()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const health = healthFor(metric, unit, actual, window, extras)
  const target = targetOf(metric)
  const format = formatOf(null, unit, metric)
  const titleId = `target-title-${metric}`

  // Inside the metric pop-up, settings swap the tab's content in place: no second dialog over the first.
  if (bare && settingsOpen) {
    return (
      <section className={styles.healthPanel} data-bare="" aria-label="Target settings">
        <div className={styles.settingsHead}>
          <button type="button" className={styles.textButton} onClick={() => setSettingsOpen(false)}>
            <ArrowLeft size={13} strokeWidth={1.75} aria-hidden /> Target
          </button>
          <SettingsTitle />
        </div>
        <TargetSettingsForm />
      </section>
    )
  }

  return (
    <section className={styles.healthPanel} data-bare={bare ? '' : undefined} aria-labelledby={titleId}>
      {!bare && <h2 className={styles.sectionTitle}>Target</h2>}
      <div className={styles.healthHead}>
        <p id={titleId} className={styles.standing} data-status={target ? health.verdict : 'none'}>
          <span className={styles.standingDot} aria-hidden />
          {standingSentence(health, actual, target, format)}
        </p>
        <button type="button" className={styles.textButton} onClick={() => setSettingsOpen(true)}>
          <Settings2 size={13} strokeWidth={1.75} aria-hidden /> Target settings
        </button>
      </div>
      {/* Keyed by the saved target, so the form starts from what was saved after every save. */}
      <TargetEditor key={target?.setAt ?? 'none'} metric={metric} label={label} unit={unit}
        pace={extras.unavailable ? null : { value: actual, days: windowDays(window, clock) }} />
      {!bare && <TargetSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />}
    </section>
  )
}

function SettingsTitle() {
  return (
    <span className={styles.settingsTitle}>
      Target settings
      <span className={styles.infoIcon} title={SETTINGS_INFO} aria-label={SETTINGS_INFO} role="img">
        <Info size={13} strokeWidth={1.75} aria-hidden />
      </span>
    </span>
  )
}

/** "100 orders a week → 433 a month · 1,300 a quarter · 5,200 a year", spelled out. */
export function workedExample(settings: TargetSettings): string {
  const base = 100
  const from = settings.base
  const others = TARGET_PERIODS.filter(period => period !== from)
    .map(period => `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(base * WEEKS_IN[period] / WEEKS_IN[from])} ${PERIOD_LABELS[period].per}`)
  return `100 orders ${PERIOD_LABELS[from].per} → ${others.join(' · ')}`
}

const SHORT: Record<TargetPeriod, string> = { week: 'wk', month: 'mo', quarter: 'qtr', year: 'yr' }

/** "100 / wk → 433 / mo · 1,300 / qtr · 5,200 / yr": the switch's one-line example. */
export function compactExample(settings: TargetSettings): string {
  const from = settings.base
  const others = TARGET_PERIODS.filter(period => period !== from)
    .map(period => `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(100 * WEEKS_IN[period] / WEEKS_IN[from])} / ${SHORT[period]}`)
  return `100 / ${SHORT[from]} → ${others.join(' · ')}`
}

function ColourDots({ colours }: { colours: ReadonlyArray<'green' | 'orange' | 'red'> }) {
  return (
    <span className={styles.colourDots} aria-hidden>
      {colours.map(colour => <span key={colour} data-colour={colour} />)}
    </span>
  )
}

/**
 * The target settings, three rows of a label and a control: which period targets are typed in, whether the other
 * periods are worked out, and two or three colours. Changes apply at once. Shared by the pop-up and the dialog.
 */
export function TargetSettingsForm() {
  const { settings, setSettings } = useMetricHealth()
  const id = useId()
  const save = (next: Partial<TargetSettings>) => void setSettings(next).catch(() => {})
  const three = settings.amberBand > 0
  const [bandText, setBandText] = useState(String(Math.round((settings.amberBand || THREE_COLOURS) * 100)))

  const setBand = (text: string) => {
    setBandText(text)
    const percent = Number(text)
    if (text.trim() !== '' && Number.isFinite(percent) && percent >= 1 && percent <= 50) save({ amberBand: percent / 100 })
  }

  return (
    <div className={styles.settingsForm}>
      <div className={styles.settingsRow}>
        <span className={styles.settingsLabel} id={`${id}-base`}>Targets per</span>
        <div className={styles.segment} role="radiogroup" aria-labelledby={`${id}-base`}>
          {TARGET_PERIODS.map(period => (
            <TabItem key={period} type="button" size="small" role="radio" aria-checked={settings.base === period}
              selected={settings.base === period} onClick={() => save({ base: period })}>
              {PERIOD_LABELS[period].noun[0].toUpperCase() + PERIOD_LABELS[period].noun.slice(1)}
            </TabItem>
          ))}
        </div>
      </div>

      <label className={styles.settingsRow}>
        <span className={styles.settingsLabel}>
          Auto-calculate other periods
          {settings.derive && <span className={styles.settingsExample}>{compactExample(settings)}</span>}
        </span>
        <Switch checked={settings.derive} onCheckedChange={derive => save({ derive })} aria-label="Auto-calculate other periods" />
      </label>

      <div className={styles.settingsRow}>
        <span className={styles.settingsLabel} id={`${id}-colours`}>Colours</span>
        <div className={styles.settingsControl}>
          {three && (
            <label className={styles.bandInput}>
              orange within
              <input type="number" min={1} max={50} inputMode="numeric" value={bandText}
                onChange={event => setBand(event.target.value)} aria-label="Orange within this many percent of the target" />
              %
            </label>
          )}
          <div className={styles.segment} role="radiogroup" aria-labelledby={`${id}-colours`}>
            <TabItem type="button" size="small" role="radio" aria-checked={!three} selected={!three} onClick={() => save({ amberBand: 0 })}>
              <ColourDots colours={['green', 'red']} />Green / red
            </TabItem>
            <TabItem type="button" size="small" role="radio" aria-checked={three} selected={three}
              onClick={() => { setBandText(String(Math.round(THREE_COLOURS * 100))); save({ amberBand: THREE_COLOURS }) }}>
              <ColourDots colours={['green', 'orange', 'red']} />Green / orange / red
            </TabItem>
          </div>
        </div>
      </div>
    </div>
  )
}

/** The target settings in a dialog, where there's no pop-up around them (the metric library's Tracked section). */
export function TargetSettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={next => { if (!next) onClose() }}>
      {open && (
        <DialogContent size="md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle><SettingsTitle /></DialogTitle>
          </DialogHeader>
          <DialogBody>
            <TargetSettingsForm />
          </DialogBody>
        </DialogContent>
      )}
    </Dialog>
  )
}

/** "Targets: per week", or "Targets: set per period" when each period is set by hand. */
export function settingsSummary(settings: TargetSettings): string {
  return settings.derive ? `Targets: per ${PERIOD_LABELS[settings.base].noun}` : 'Targets: set per period'
}

/** The setting in context, for the Tracked section's header: "Targets: per week · Edit". */
export function TargetSettingsButton() {
  const { settings } = useMetricHealth()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className={styles.textButton} onClick={() => setOpen(true)} aria-haspopup="dialog">
        <Settings2 size={13} strokeWidth={1.75} aria-hidden />
        {settingsSummary(settings)}
        <span className={styles.editHint}>· Edit</span>
      </button>
      <TargetSettingsDialog open={open} onClose={() => setOpen(false)} />
    </>
  )
}
