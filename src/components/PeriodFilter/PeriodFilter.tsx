'use client'

import { useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { Check, ChevronDown, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react'
import { Tooltip } from '@/components/Tooltip'
import {
  comparisonButtonLabel, comparisonName, comparisonRange, periodButtonLabel, rangeText, shortDate, viewDates, viewSummary,
} from '@/lib/warehouse/compare'
import {
  comparisonFor, comparisonOptions, PERIOD_OPTIONS, periodLabel, periodWindow, useDefaultPeriod, usePeriod,
  type DashboardComparison, type DateRange, type PeriodView, type QuickPeriod,
} from '@/lib/warehouse/period'
import {
  dayLook, fieldText, monthOf, monthTitle, monthWeeks, moveFocus, parseTyped, shiftMonth, shownMonths, spokenDay,
  type CalendarMarks, type MonthKey,
} from './calendar'
import styles from './PeriodFilter.module.css'

/**
 * The dashboard header's period and comparison (Figma "Header · Period filter (final, 19 Nov)", D97–D108): two buttons
 * side by side, each with a small caption and its own menu. Dates are a filter: anyone can look at any dates, nothing is
 * saved, and while you're off your default both menus end with Reset.
 * - Period: the calendar is always open, left of the presets. A preset applies on click; pointing at one previews its
 *   days. Picking days (or typing them) ticks Custom range and shows Cancel and Apply; nothing changes until Apply.
 * - Comparison: what the period is compared with. Custom range opens the same calendar for days of your own.
 */
export interface PeriodFilterProps {
  /** Today on the store calendar. */
  today: string
  /** The last synced day when every app is behind (rolling periods end there); null when any app is current. */
  until: string | null
  /** The first day the store has data for; null while unknown (G11). Earlier days read lighter. */
  dataFrom: string | null
  /** Pages whose numbers read a comparison show its button; the others show the period alone. */
  withComparison: boolean
  /** Offline: both buttons are greyed out and their hover says why. */
  offline?: boolean
}

type Which = 'period' | 'comparison'

// Two months side by side from 1280 px; one month below that (D107).
const WIDE = '(min-width: 1280px)'
function subscribeWide(listener: () => void) {
  const query = window.matchMedia(WIDE)
  query.addEventListener('change', listener)
  return () => query.removeEventListener('change', listener)
}
/** The calendar column's width with two months, or one under 1280 px (fields 324 + 16 each side). */
const CALENDAR_WIDTH_TWO = 560
const CALENDAR_WIDTH_ONE = 356
const useTwoMonths = () => useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches, () => true)

export function PeriodFilter({ today, until, dataFrom, withComparison, offline = false }: PeriodFilterProps) {
  const view = usePeriod()
  const { defaultPeriod } = useDefaultPeriod()
  const [open, setOpen] = useState<Which | null>(null)
  const twoMonths = useTwoMonths()
  const dates = viewDates(view, today, until)
  const periodText = periodButtonLabel(view, dates, today)
  const comparisonText = comparisonButtonLabel(view, today)
  const reset = view.offDefault ? { label: `${periodLabel(defaultPeriod)} • Previous period`, run: () => { view.reset(); setOpen(null) } } : null
  const panel = { view, today, until, dataFrom, twoMonths, reset, onDone: () => setOpen(null) }

  if (offline) {
    return (
      <div className={styles.pair}>
        <Tooltip content="Offline • Dates change once you’re back online" side="bottom" align="end">
          <span tabIndex={0} className={styles.offline} role="group"
            aria-label={`Period: ${periodText}${withComparison ? `, comparison: ${comparisonText}` : ''}. Offline`}>
            <TriggerFace caption="Period" value={periodText} disabled />
            {withComparison && <><span className={styles.divider} aria-hidden /><TriggerFace caption="Comparison" value={comparisonText} disabled /></>}
          </span>
        </Tooltip>
      </div>
    )
  }

  return (
    <div className={styles.pair} data-open={open ?? undefined}>
      <Menu
        which="period" open={open === 'period'} onOpenChange={next => setOpen(next ? 'period' : null)}
        caption="Period" value={periodText} tip={rangeText(dates.current, today)}
      >
        <PeriodPanel {...panel} />
      </Menu>
      {withComparison && (
        <>
          <span className={styles.divider} aria-hidden />
          <Menu
            which="comparison" open={open === 'comparison'} onOpenChange={next => setOpen(next ? 'comparison' : null)}
            caption="Comparison" value={comparisonText} muted={comparisonText === 'Off'}
            tip={dates.comparison ? rangeText(dates.comparison, today) : null}
          >
            <ComparisonPanel {...panel} />
          </Menu>
        </>
      )}
    </div>
  )
}

function TriggerFace({ caption, value, open = false, muted = false, disabled = false }: {
  caption: string; value: string; open?: boolean; muted?: boolean; disabled?: boolean
}) {
  return (
    <span className={styles.face} data-disabled={disabled || undefined}>
      <span className={styles.caption}>{caption}</span>
      <span className={styles.value} data-muted={muted || undefined}>
        {value}
        <ChevronDown size={12} strokeWidth={1.75} absoluteStrokeWidth aria-hidden className={styles.chevron} data-open={open || undefined} />
      </span>
    </span>
  )
}

function Menu({ which, open, onOpenChange, caption, value, muted, tip, children }: {
  which: Which; open: boolean; onOpenChange: (open: boolean) => void; caption: string; value: string; muted?: boolean
  /** The button's own days, on hover. */
  tip: string | null
  children: ReactNode
}) {
  const contentRef = useRef<HTMLDivElement>(null)
  // The period's menu opens with its presets under the button (their left edges line up) and the calendar to their
  // left; the comparison's ends on the button's right edge (Figma "Period · menu open", "Comparison · menu open").
  const twoMonths = useTwoMonths()
  const calendarWidth = twoMonths ? CALENDAR_WIDTH_TWO : CALENDAR_WIDTH_ONE
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={onOpenChange} modal>
      {/* The hover steps aside while the menu is open. */}
      <Tooltip content={tip} side="bottom" align="end" open={open ? false : undefined} disabled={!tip}>
        <PopoverPrimitive.Trigger asChild>
          <button
            type="button"
            className={styles.trigger}
            data-which={which}
            data-open={open || undefined}
            aria-label={`${caption}: ${value}`}
            aria-haspopup="dialog"
            onKeyDown={event => {
              // Menu-button keys: ↓ opens too (Enter and Space click).
              if (event.key === 'ArrowDown' && !open) { event.preventDefault(); onOpenChange(true) }
            }}
          >
            <TriggerFace caption={caption} value={value} open={open} muted={muted} />
          </button>
        </PopoverPrimitive.Trigger>
      </Tooltip>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          ref={contentRef}
          align={which === 'period' ? 'start' : 'end'}
          alignOffset={which === 'period' ? -(calendarWidth + 1) : 0}
          side="bottom"
          sideOffset={6}
          collisionPadding={16}
          aria-label={caption}
          className={styles.panel}
          style={{ zIndex: 50 }}
          // Focus lands on the ticked row, as in a menu; Tab then reaches From, To and the calendar.
          onOpenAutoFocus={event => {
            event.preventDefault()
            contentRef.current?.querySelector<HTMLElement>('[role="option"][tabindex="0"]')?.focus({ preventScroll: true })
          }}
        >
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

// ── The two panels ──────────────────────────────────────────────────────────────────────────────────────────────────

interface PanelProps {
  view: ReturnType<typeof usePeriod>
  today: string
  until: string | null
  dataFrom: string | null
  twoMonths: boolean
  /** Shown while you're off your default: the menu's last row. */
  reset: { label: string; run: () => void } | null
  onDone: () => void
}

/** Days being picked in a calendar: the first day, then the last (null until it's picked). */
interface Draft {
  from: string
  to: string | null
}

/** A typed day after today: the field turns red and the footer says why. */
interface DayError {
  field: 'from' | 'to'
  day: string
}

const draftRange = (draft: Draft | null): DateRange | null => (draft?.to ? { start: draft.from, end: draft.to } : null)

function PeriodPanel({ view, today, until, dataFrom, twoMonths, reset, onDone }: PanelProps) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<DayError | null>(null)
  const [preview, setPreview] = useState<QuickPeriod | null>(null)
  const fromRef = useRef<HTMLInputElement>(null)
  const dates = viewDates(view, today, until)
  const daysOf = (period: QuickPeriod) => {
    const span = periodWindow(period, today, until)
    return { start: span.start, end: span.end }
  }
  const picked = draftRange(draft)
  const previewing = preview !== null && draft === null ? preview : null
  const previewView: PeriodView | null = previewing ? { ...view, period: previewing } : null

  const rows: Row[] = [
    ...PERIOD_OPTIONS.map(option => ({
      id: option.value, label: option.label, dates: rangeText(daysOf(option.value), today),
      selected: draft === null && view.period === option.value,
    })),
    {
      id: 'custom', label: 'Custom range',
      dates: picked ? rangeText(picked, today) : view.period === 'custom' && view.custom ? rangeText(view.custom, today) : null,
      selected: draft !== null || view.period === 'custom',
    },
    ...(reset ? [{ id: 'reset', label: 'Reset', dates: reset.label, selected: false, reset: true, divider: true }] : []),
  ]

  const footer = footerFor({
    today, draft, error,
    rest: viewSummary(previewView ?? view, previewView ? viewDates(previewView, today, until) : dates, today),
    ready: picked ? viewSummary({ ...view, period: 'custom', custom: picked }, viewDates({ ...view, period: 'custom', custom: picked }, today, until), today) : '',
  })

  return (
    <div className={styles.body} data-calendar>
      <RangePicker
        today={today}
        dataFrom={dataFrom}
        twoMonths={twoMonths}
        applied={dates.current}
        preview={previewing ? daysOf(previewing) : null}
        draft={draft}
        onDraft={next => { setDraft(next); setError(null) }}
        error={error}
        onError={setError}
        footer={footer}
        onApply={() => { if (picked) { view.setCustom(picked); onDone() } }}
        onCancel={onDone}
        fromRef={fromRef}
      />
      <div className={styles.listColumn}>
        <OptionList
          label="Periods"
          rows={rows}
          onPreview={id => setPreview(id && id !== 'custom' && id !== 'reset' ? (id as QuickPeriod) : null)}
          onPick={id => {
            if (id === 'reset') return reset?.run()
            if (id === 'custom') return fromRef.current?.focus()
            view.setPeriod(id as QuickPeriod)
            onDone()
          }}
        />
      </div>
    </div>
  )
}

function ComparisonPanel({ view, today, until, dataFrom, twoMonths, reset, onDone }: PanelProps) {
  const active = comparisonFor(view.period, view.comparison)
  const [calendar, setCalendar] = useState(active === 'custom')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<DayError | null>(null)
  const [preview, setPreview] = useState<DashboardComparison | null>(null)
  const fromRef = useRef<HTMLInputElement>(null)
  const span = periodWindow(view.period, today, until, view.custom)
  const current = { start: span.start, end: span.end }
  const previous = { start: span.previousStart, end: span.previousEnd }
  const daysOf = (id: DashboardComparison) => comparisonRange(view.period, id, current, previous, null)
  const picked = draftRange(draft)
  const applied = active === 'custom' ? view.compareCustom : null

  // Pick the days once the calendar is open: focus moves into From.
  const openCalendar = () => {
    setCalendar(true)
    requestAnimationFrame(() => fromRef.current?.focus())
  }

  const rows: Row[] = [
    ...comparisonOptions(view.period).map(id => ({
      id,
      label: comparisonName(view.period, id),
      dates: id === 'none' ? null
        : id === 'custom' ? (picked ? rangeText(picked, today) : applied ? rangeText(applied, today) : null)
          : rangeText(daysOf(id)!, today),
      selected: calendar ? id === 'custom' : id === active,
      divider: id === 'none',
    })),
    ...(reset ? [{ id: 'reset', label: 'Reset', dates: reset.label, selected: false, reset: true, divider: true }] : []),
  ]

  const ready = picked ? { ...view, comparison: 'custom' as const, compareCustom: picked } : null
  const footer = footerFor({
    today, draft, error,
    rest: applied ? viewSummary(view, viewDates(view, today, until), today) : `${rangeText(current, today)} • Pick the first day to compare with`,
    ready: ready ? viewSummary(ready, viewDates(ready, today, until), today) : '',
  })
  const previewDays = calendar && draft === null && preview && preview !== 'custom' && preview !== 'none' ? daysOf(preview) : null

  return (
    <div className={styles.body} data-calendar={calendar || undefined}>
      {calendar && (
        <RangePicker
          today={today}
          dataFrom={dataFrom}
          twoMonths={twoMonths}
          applied={applied}
          preview={previewDays}
          draft={draft}
          onDraft={next => { setDraft(next); setError(null) }}
          error={error}
          onError={setError}
          footer={footer}
          onApply={() => { if (picked) { view.setCompareCustom(picked); onDone() } }}
          onCancel={onDone}
          fromRef={fromRef}
        />
      )}
      <div className={styles.listColumn}>
        <OptionList
          label="Comparisons"
          rows={rows}
          onPreview={id => setPreview(id && id !== 'reset' ? (id as DashboardComparison) : null)}
          onPick={id => {
            if (id === 'reset') return reset?.run()
            if (id === 'custom') return openCalendar()
            view.setComparison(id as Exclude<DashboardComparison, 'custom'>)
            onDone()
          }}
        />
      </div>
    </div>
  )
}

interface Footer {
  text: string
  error: boolean
  /** Cancel and Apply show once a day is picked; Apply is off until both ends are. */
  buttons: { canApply: boolean } | null
}

function footerFor({ today, draft, error, rest, ready }: {
  today: string; draft: Draft | null; error: DayError | null; rest: string; ready: string
}): Footer {
  if (error) {
    return { text: `${shortDate(error.day)} is after today • Pick a day up to ${shortDate(today)}`, error: true, buttons: { canApply: false } }
  }
  if (draft && !draft.to) return { text: `From ${shortDate(draft.from)} • Pick the last day`, error: false, buttons: { canApply: false } }
  if (draft) return { text: ready, error: false, buttons: { canApply: true } }
  return { text: rest, error: false, buttons: null }
}

// ── The list of presets (or comparisons) ────────────────────────────────────────────────────────────────────────────

interface Row {
  id: string
  label: string
  /** The days it covers, on the right. */
  dates: string | null
  selected: boolean
  /** A line above it. */
  divider?: boolean
  reset?: boolean
}

/**
 * Rows as a listbox: one tab stop, ↑ ↓ Home End move, a letter jumps to the next row starting with it, Enter or Space
 * picks. Pointing at a row or focusing it previews its days.
 */
function OptionList({ label, rows, onPick, onPreview }: {
  label: string; rows: Row[]; onPick: (id: string) => void; onPreview: (id: string | null) => void
}) {
  const start = Math.max(0, rows.findIndex(row => row.selected))
  const [active, setActive] = useState(start)
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const at = Math.min(active, rows.length - 1)

  const focusRow = (index: number) => {
    const next = (index + rows.length) % rows.length
    setActive(next)
    refs.current[next]?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); focusRow(at + 1) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); focusRow(at - 1) }
    else if (event.key === 'Home') { event.preventDefault(); focusRow(0) }
    else if (event.key === 'End') { event.preventDefault(); focusRow(rows.length - 1) }
    else if (event.key.length === 1 && /\S/.test(event.key) && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const letter = event.key.toLowerCase()
      for (let step = 1; step <= rows.length; step++) {
        const index = (at + step) % rows.length
        if (rows[index].label.toLowerCase().startsWith(letter)) { focusRow(index); break }
      }
    }
  }

  return (
    <div role="listbox" aria-label={label} className={styles.list} onKeyDown={onKeyDown} onPointerLeave={() => onPreview(null)}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onPreview(null) }}>
      {rows.map((row, index) => (
        <div key={row.id} role="presentation">
          {row.divider && <div className={styles.rowDivider} role="separator" />}
          <button
            ref={node => { refs.current[index] = node }}
            type="button"
            role="option"
            aria-selected={row.selected}
            tabIndex={index === at ? 0 : -1}
            className={styles.row}
            data-selected={row.selected || undefined}
            data-reset={row.reset || undefined}
            onClick={() => onPick(row.id)}
            onFocus={() => { setActive(index); onPreview(row.id) }}
            onPointerEnter={() => onPreview(row.id)}
          >
            {row.reset && <RotateCcw size={14} strokeWidth={1.75} aria-hidden className={styles.resetIcon} />}
            <span className={styles.rowLabel}>{row.label}</span>
            {row.dates && <span className={styles.rowDates}>{row.dates}</span>}
            <span className={styles.tick} aria-hidden>{row.selected && <Check size={14} strokeWidth={2} />}</span>
          </button>
        </div>
      ))}
    </div>
  )
}

// ── From, To, the calendar and the footer ───────────────────────────────────────────────────────────────────────────

function RangePicker({
  today, dataFrom, twoMonths, applied, preview, draft, onDraft, error, onError, footer, onApply, onCancel, fromRef,
}: {
  today: string
  dataFrom: string | null
  twoMonths: boolean
  /** The days on screen now, shown solid while nothing is being picked. */
  applied: DateRange | null
  /** A row's days while it's pointed at or focused. */
  preview: DateRange | null
  draft: Draft | null
  onDraft: (draft: Draft | null) => void
  error: DayError | null
  onError: (error: DayError | null) => void
  footer: Footer
  onApply: () => void
  onCancel: () => void
  fromRef: RefObject<HTMLInputElement | null>
}) {
  const [pointer, setPointer] = useState<string | null>(null)
  const picked = draft ? draftRange(draft) : applied
  // The fields show what the calendar shows: a preview, the days being picked, or the days on screen.
  const shown = preview && !draft ? preview : picked
  const fieldFrom = draft ? draft.from : shown?.start ?? null
  const fieldTo = draft ? draft.to : shown?.end ?? null

  const pick = (day: string) => {
    if (!draft || draft.to) return onDraft({ from: day, to: null })
    onDraft(day < draft.from ? { from: day, to: draft.from } : { from: draft.from, to: day })
  }

  const commit = (field: 'from' | 'to', text: string): boolean => {
    const day = parseTyped(text, today)
    if (!day) {
      if (error?.field === field) onError(null)
      return false
    }
    if (day > today) { onError({ field, day }); return true }
    if (field === 'from') {
      const to = fieldTo && fieldTo >= day ? fieldTo : null
      onDraft({ from: day, to })
    } else {
      const from = fieldFrom ?? day
      onDraft(from <= day ? { from, to: day } : { from: day, to: from })
    }
    return true
  }

  const marks: CalendarMarks = {
    today, dataFrom, pointer,
    picked: draft ? draftRange(draft) : applied,
    pickingFrom: draft && !draft.to ? draft.from : null,
    preview: draft ? null : preview,
  }
  const focusStart = draft?.from ?? applied?.end ?? today

  return (
    <div className={styles.calendarColumn}>
      <div className={styles.fields}>
        <DateField label="From" inputRef={fromRef} value={fieldFrom} placeholder="First day"
          invalid={error?.field === 'from'} onCommit={text => commit('from', text)} />
        <span className={styles.fieldDash} aria-hidden>–</span>
        <DateField label="To" value={fieldTo} placeholder="Last day"
          invalid={error?.field === 'to'} onCommit={text => commit('to', text)} />
      </div>
      <Calendar marks={marks} count={twoMonths ? 2 : 1} focusStart={focusStart} onPick={pick} onPointer={setPointer} />
      {dataFrom && <p className={styles.dataNote}>Your data starts on {fieldText(dataFrom)}. Earlier days show as no data.</p>}
      <div className={styles.footer}>
        <p className={styles.footerText} data-error={footer.error || undefined} aria-live="polite">{footer.text}</p>
        {footer.buttons && (
          <div className={styles.footerButtons}>
            <button type="button" className={styles.cancel} onClick={onCancel}>Cancel</button>
            <button type="button" className={styles.apply} disabled={!footer.buttons.canApply} onClick={onApply}>Apply</button>
          </div>
        )}
      </div>
    </div>
  )
}

/** A From or To field: shows "18 Oct 2026" and takes typing; Enter or leaving the field reads what was typed. */
function DateField({ label, value, placeholder, invalid, onCommit, inputRef }: {
  label: string; value: string | null; placeholder: string; invalid: boolean
  /** False when the text isn't a date: the field goes back to its day. */
  onCommit: (text: string) => boolean
  inputRef?: RefObject<HTMLInputElement | null>
}) {
  const [text, setText] = useState(value ? fieldText(value) : '')
  const [editing, setEditing] = useState(false)
  const [shownValue, setShownValue] = useState(value)
  if (!editing && value !== shownValue) {
    setShownValue(value)
    setText(value ? fieldText(value) : '')
  }
  const done = () => {
    setEditing(false)
    if (text.trim() === (value ? fieldText(value) : '')) return
    if (!onCommit(text)) setText(value ? fieldText(value) : '')
  }
  return (
    <label className={styles.field} data-invalid={invalid || undefined}>
      <span className={styles.fieldLabel}>{label}</span>
      <input
        ref={inputRef}
        className={styles.fieldInput}
        value={text}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        onFocus={() => setEditing(true)}
        onChange={event => { setEditing(true); setText(event.target.value) }}
        onBlur={done}
        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); done() } }}
      />
    </label>
  )
}

const WEEKDAYS = [['M', 'Monday'], ['T', 'Tuesday'], ['W', 'Wednesday'], ['T', 'Thursday'], ['F', 'Friday'], ['S', 'Saturday'], ['S', 'Sunday']]

/** Where a day sits in a range, for the band behind it. */
function placeIn(day: string, range: DateRange | null): 'single' | 'start' | 'end' | 'mid' | undefined {
  if (!range || day < range.start || day > range.end) return undefined
  if (range.start === range.end) return 'single'
  return day === range.start ? 'start' : day === range.end ? 'end' : 'mid'
}

/**
 * One or two months, Monday first. The days are one grid for the keyboard: arrows move a day or a week, Page Up and
 * Page Down a month, Home and End the week's ends; Enter or Space picks. Days after today can't be picked or focused.
 */
function Calendar({ marks, count, focusStart, onPick, onPointer }: {
  marks: CalendarMarks; count: 1 | 2; focusStart: string; onPick: (day: string) => void; onPointer: (day: string | null) => void
}) {
  const { today } = marks
  const [focusDay, setFocusDay] = useState(focusStart > today ? today : focusStart)
  const [last, setLast] = useState<MonthKey>(() => shownMonths(focusStart, today, count).at(-1)!)
  const months = count === 2 ? [shiftMonth(last, -1), last] : [last]
  const moved = useRef(false)
  const gridRef = useRef<HTMLDivElement>(null)
  const canNext = last < monthOf(today)
  // The one day Tab lands on: the focused day, or the first of the months shown once they've moved away from it.
  const tabDay = months.includes(monthOf(focusDay)) ? focusDay : `${months[0]}-01` > today ? today : `${months[0]}-01`

  useLayoutEffect(() => {
    if (!moved.current) return
    moved.current = false
    gridRef.current?.querySelector<HTMLElement>(`[data-day="${focusDay}"]`)?.focus()
  }, [focusDay, last])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (!target.dataset.day) return
    const next = moveFocus(target.dataset.day, event.key)
    if (!next) return
    event.preventDefault()
    const day = next > today ? today : next
    moved.current = true
    setFocusDay(day)
    if (monthOf(day) > last) setLast(monthOf(day))
    else if (!months.includes(monthOf(day))) setLast(count === 2 ? shiftMonth(monthOf(day), 1) : monthOf(day))
  }

  return (
    <div className={styles.months} ref={gridRef} onKeyDown={onKeyDown} onPointerLeave={() => onPointer(null)}>
      {months.map((month, index) => (
        <div key={month} className={styles.month}>
          <div className={styles.monthHead}>
            {index === 0
              ? <button type="button" className={styles.monthNav} aria-label="Previous month" onClick={() => setLast(shiftMonth(last, -1))}>
                  <ChevronLeft size={16} strokeWidth={1.75} aria-hidden />
                </button>
              : <span className={styles.monthNavSpace} />}
            <span className={styles.monthTitle} aria-live="polite">{monthTitle(month)}</span>
            {index === months.length - 1
              ? <button type="button" className={styles.monthNav} aria-label="Next month" disabled={!canNext} onClick={() => setLast(shiftMonth(last, 1))}>
                  <ChevronRight size={16} strokeWidth={1.75} aria-hidden />
                </button>
              : <span className={styles.monthNavSpace} />}
          </div>
          <table role="grid" className={styles.grid} aria-label={monthTitle(month)}>
            <thead>
              <tr>{WEEKDAYS.map(([short, long], i) => <th key={i} scope="col" abbr={long} className={styles.weekday}>{short}</th>)}</tr>
            </thead>
            <tbody>
              {monthWeeks(month).map((week, w) => (
                <tr key={w}>
                  {week.map((day, d) => {
                    if (!day) return <td key={d} className={styles.cell} />
                    const look = dayLook(day, marks)
                    return (
                      <td key={d} className={styles.cell}
                        data-range={marks.pickingFrom ? undefined : placeIn(day, marks.picked)}
                        data-preview={placeIn(day, marks.preview)}>
                        <button
                          type="button"
                          className={styles.day}
                          data-day={day}
                          data-solid={look.end || undefined}
                          data-ring={look.previewStart || look.pickingTo || undefined}
                          data-today={look.today || undefined}
                          data-before={look.beforeData || undefined}
                          disabled={look.future}
                          tabIndex={day === tabDay ? 0 : -1}
                          aria-label={spokenDay(day)}
                          aria-pressed={look.end || (look.band && !marks.pickingFrom) || undefined}
                          aria-current={look.today ? 'date' : undefined}
                          onClick={() => { setFocusDay(day); onPick(day) }}
                          onPointerEnter={() => onPointer(day)}
                        >
                          {Number(day.slice(8, 10))}
                          {look.firstData && <span className={styles.dataDot} aria-hidden />}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
