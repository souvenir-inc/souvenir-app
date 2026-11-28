'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { PopoverAnchor, PopoverContent, PopoverRoot } from '@/components/Popover'
import { Button, IconButton } from '@/components/ui'
import { cn } from '@/lib/utils'
import { formatLongDate, formatMonthYear } from './format'
import { addDays, customId, customRange, isoDate, rangeSummary, startOfDay } from './period'
import { useDashboardData } from './live/dashboard-data'
import { PLAIN_BUTTON } from './plain-button'

// A custom range (Figma 4.2, 20:8181; 11-dates-tabs-reference-rules.md DT-2 – DT-5): two months side by
// side, the ends dark, the days between filled; the footer says how long it is and what it's compared
// with; Apply sets your view. A non-modal popover (the Popover primitive: Esc or a click outside closes
// it, focus goes back to the period). The months are one date grid (A11Y-KB-03): one day is a Tab
// stop, arrows move a day or a week, Home / End go to the week's ends, Page Up / Page Down a month
// (with Shift a year), Enter or Space picks.

const WEEKDAYS = [['M', 'Monday'], ['T', 'Tuesday'], ['W', 'Wednesday'], ['T', 'Thursday'], ['F', 'Friday'], ['S', 'Saturday'], ['S', 'Sunday']] as const
const monthOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)
const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1)
const sameMonth = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
const sameDay = (a: Date, b: Date) => startOfDay(a).getTime() === startOfDay(b).getTime()
const daysIn = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()

/** The same day `n` months on, kept inside the month (31 Jan + 1 month → 28 Feb). */
function shiftMonths(d: Date, n: number): Date {
  const first = addMonths(d, n)
  return new Date(first.getFullYear(), first.getMonth(), Math.min(d.getDate(), daysIn(first)))
}

/** Where a key moves the focused day in the date grid, kept between `min` and `max`; null for other keys. */
export function nextDay(day: Date, e: { key: string; shiftKey?: boolean }, min: Date, max: Date): Date | null {
  const weekday = (day.getDay() + 6) % 7 // Monday first
  let next: Date
  switch (e.key) {
    case 'ArrowLeft': next = addDays(day, -1); break
    case 'ArrowRight': next = addDays(day, 1); break
    case 'ArrowUp': next = addDays(day, -7); break
    case 'ArrowDown': next = addDays(day, 7); break
    case 'Home': next = addDays(day, -weekday); break
    case 'End': next = addDays(day, 6 - weekday); break
    case 'PageUp': next = shiftMonths(day, e.shiftKey ? -12 : -1); break
    case 'PageDown': next = shiftMonths(day, e.shiftKey ? 12 : 1); break
    default: return null
  }
  if (next.getTime() < min.getTime()) return min
  if (next.getTime() > max.getTime()) return max
  return next
}

interface CustomRangeProps {
  /** The period in use; a custom one opens on its range (DT-5). */
  period: string
  compare: string
  onApply: (periodId: string) => void
  onClose: () => void
  /** Where the panel's top-right corner goes, relative to the caller's positioned box. */
  className?: string
}

export function CustomRange({ period, compare, onApply, onClose, className }: CustomRangeProps) {
  // The store's day: a range can't run past the store's today (DT-2).
  const { today } = useDashboardData()
  const current = customRange(period)
  const anchorRef = useRef<HTMLSpanElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  // What had focus when it opened, so closing gives it back (A11Y-FO-02); a click outside keeps the new focus.
  const returnTo = useRef<HTMLElement | null>(null)
  const interactedOutside = useRef(false)
  useLayoutEffect(() => {
    const active = document.activeElement
    returnTo.current = active instanceof HTMLElement && active !== document.body ? active : null
  }, [])

  const close = () => onClose()
  const restoreFocus = (e: Event) => {
    e.preventDefault()
    if (interactedOutside.current) return
    // The period button opened it through its menu, which may be gone by now: fall back to the
    // first button beside the anchor (the period button in the header).
    const target = returnTo.current?.isConnected ? returnTo.current : anchorRef.current?.parentElement?.querySelector<HTMLElement>('button')
    target?.focus()
  }

  return (
    <PopoverRoot open onOpenChange={(open) => { if (!open) close() }}>
      <PopoverAnchor asChild>
        <span ref={anchorRef} aria-hidden className={cn('pointer-events-none block size-0', className)} />
      </PopoverAnchor>
      <PopoverContent
        ref={contentRef}
        side="bottom"
        align="end"
        sideOffset={0}
        collisionPadding={16}
        maxHeight={false}
        aria-label="Custom range"
        data-custom-range
        style={{ width: 640, maxWidth: 'calc(100vw - 32px)', background: 'var(--dashboard-card-bg)', border: '1px solid var(--dashboard-badge-bg)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--dashboard-popover-shadow)' }}
        onOpenAutoFocus={(e) => { e.preventDefault(); contentRef.current?.querySelector<HTMLElement>('[data-day][tabindex="0"]')?.focus() }}
        onCloseAutoFocus={restoreFocus}
        // Esc closes this panel only, not the board's edit mode or anything under it (A11Y-KB-04).
        onEscapeKeyDown={(e) => e.stopPropagation()}
        onInteractOutside={() => { interactedOutside.current = true }}
      >
        <RangeCalendar
          today={today}
          initialFrom={current?.from ?? null}
          initialTo={current?.to ?? null}
          compare={compare}
          onCancel={close}
          onApply={(from, to) => onApply(customId(from, to))}
        />
      </PopoverContent>
    </PopoverRoot>
  )
}

interface RangeCalendarProps {
  today: Date
  initialFrom: Date | null
  initialTo: Date | null
  compare: string
  onCancel: () => void
  onApply: (from: Date, to: Date) => void
}

/** The two months, the summary and Cancel / Apply: the panel's body, without the popover. */
export function RangeCalendar({ today, initialFrom, initialTo, compare, onCancel, onApply }: RangeCalendarProps) {
  const [from, setFrom] = useState<Date | null>(initialFrom)
  const [to, setTo] = useState<Date | null>(initialTo)
  const [hover, setHover] = useState<Date | null>(null)
  // The right-hand month: the range's end, or this month.
  const [right, setRight] = useState(() => monthOf(initialTo ?? today))
  // The day that holds the grid's one Tab stop (roving tabindex).
  const [focusDay, setFocusDay] = useState(() => startOfDay(initialTo ?? today))
  // Set when a key moved the day, so the effect below moves focus to it (not on a click or a render).
  const [keyed, setKeyed] = useState(0)
  const gridRef = useRef<HTMLDivElement>(null)

  const lastDay = startOfDay(today)
  const firstDay = addMonths(today, -12)
  const left = addMonths(right, -1)
  const canBack = left.getTime() > firstDay.getTime()
  const canForward = !sameMonth(right, today)
  const visible = (d: Date) => sameMonth(d, left) || sameMonth(d, right)
  // The Tab stop: the focused day when it's on screen, else the first day of the right-hand month.
  const tabDay = visible(focusDay) ? focusDay : right

  useEffect(() => {
    if (!keyed) return
    gridRef.current?.querySelector<HTMLElement>(`[data-day-iso="${isoDate(focusDay)}"]`)?.focus()
  }, [keyed, focusDay])

  // The first click sets the start, the second the end; an end before the start swaps (DT-3).
  const pick = (d: Date) => {
    setFocusDay(d)
    if (!from || to) { setFrom(d); setTo(null); return }
    if (d.getTime() < from.getTime()) { setTo(from); setFrom(d) } else setTo(d)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Only on a day: the month buttons keep their own keys.
    if (!(e.target instanceof HTMLElement) || !e.target.closest('[data-day]')) return
    const next = nextDay(tabDay, e, firstDay, lastDay)
    if (!next) return
    e.preventDefault()
    // Bring the day's month on screen: as the left month when it's earlier, the right one when later.
    if (next.getTime() < left.getTime()) setRight(addMonths(monthOf(next), 1))
    else if (next.getTime() >= addMonths(right, 1).getTime()) setRight(monthOf(next))
    setFocusDay(next)
    // The range previews to the focused day, as it does to the hovered one.
    if (from && !to) setHover(next)
    setKeyed((k) => k + 1)
  }

  const end = to ?? (from && hover ? hover : null)
  const [lo, hi] = from && end ? (from.getTime() <= end.getTime() ? [from, end] : [end, from]) : [from, from]

  return (
    <div className="flex flex-col gap-4 px-5 pb-4 pt-4" onPointerLeave={() => setHover(null)}>
      <div ref={gridRef} className="relative flex justify-between gap-6" onKeyDown={onKeyDown}>
        <div className="flex flex-1 flex-col">
          <div className="absolute right-0 top-0 flex gap-0.5">
            <IconButton variant="ghost" size="xs" aria-label="Earlier month" disabled={!canBack} onClick={() => setRight((r) => addMonths(r, -1))} className="size-7 rounded-md" icon={<ChevronLeft strokeWidth={1.5} absoluteStrokeWidth />} />
            <IconButton variant="ghost" size="xs" aria-label="Later month" disabled={!canForward} onClick={() => setRight((r) => addMonths(r, 1))} className="size-7 rounded-md" icon={<ChevronRight strokeWidth={1.5} absoluteStrokeWidth />} />
          </div>
          <Month first={left} today={lastDay} lo={lo} hi={hi} tabDay={tabDay} onPick={pick} onHover={setHover} />
        </div>
        <Month first={right} today={lastDay} lo={lo} hi={hi} tabDay={tabDay} onPick={pick} onHover={setHover} />
      </div>
      <div className="flex items-center gap-2">
        <p data-range-summary aria-live="polite" className="m-0 min-w-0 flex-1 truncate text-[length:var(--font-size-small)] leading-4 text-[var(--dashboard-label)]">
          {lo && hi && to ? rangeSummary(lo, hi, compare) : from ? 'Pick the last day' : 'Pick the first day'}
        </p>
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" data-range-apply disabled={!from || !to} onClick={() => { if (from && to) onApply(from, to) }}>Apply</Button>
      </div>
    </div>
  )
}

interface MonthProps {
  first: Date
  today: Date
  lo: Date | null
  hi: Date | null
  tabDay: Date
  onPick: (d: Date) => void
  onHover: (d: Date) => void
}

// The Button primitive brought to a calendar day's look: a 32 px square, body font, no lift.
const DAY = cn(PLAIN_BUTTON, 'size-8 p-0 !rounded-lg border-0 text-[length:var(--font-size-body-sm)] leading-5 focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-default')

function Month({ first, today, lo, hi, tabDay, onPick, onHover }: MonthProps) {
  const headingId = useId()
  const lead = (first.getDay() + 6) % 7 // Monday first
  const count = daysIn(first)
  const cells: (Date | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: count }, (_, i) => new Date(first.getFullYear(), first.getMonth(), i + 1))]
  while (cells.length % 7) cells.push(null)
  const weeks = Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7))
  const t0 = (d: Date) => startOfDay(d).getTime()
  return (
    <div className="flex w-[280px] flex-col gap-2" data-month={first.getMonth() + 1}>
      <p id={headingId} className="m-0 h-6 text-[length:var(--font-size-body-sm)] font-medium leading-6 text-[var(--dashboard-figure)]">
        {formatMonthYear(first)}
      </p>
      <div role="grid" aria-labelledby={headingId} className="flex flex-col gap-1">
        <div role="row" className="grid grid-cols-7">
          {WEEKDAYS.map(([short, long], i) => (
            <span key={i} role="columnheader" aria-label={long} className="flex h-6 items-center justify-center text-[length:var(--font-size-caption)] font-medium text-[var(--dashboard-faint)]">{short}</span>
          ))}
        </div>
        {weeks.map((week, w) => (
          <div key={w} role="row" className="grid grid-cols-7">
            {week.map((d, col) => {
              if (!d) return <span key={col} role="gridcell" />
              const t = d.getTime()
              const future = t > t0(today)
              const isEnd = !!((lo && t === t0(lo)) || (hi && t === t0(hi)))
              const inside = !!(lo && hi && t > t0(lo) && t < t0(hi))
              // The fill runs between the ends, rounded at a week's or a range's edges.
              const band = inside || (isEnd && !!lo && !!hi && t0(lo) !== t0(hi))
              const bandStart = band && (col === 0 || (lo && t === t0(lo)) || d.getDate() === 1)
              const bandEnd = band && (col === 6 || (hi && t === t0(hi)) || d.getDate() === daysIn(d))
              return (
                <span key={col} role="gridcell" aria-selected={isEnd || inside} className={cn('flex h-8 items-center justify-center', band && 'bg-[var(--dashboard-chip-bg)]', bandStart && 'rounded-l-lg', bandEnd && 'rounded-r-lg')}>
                  <Button
                    variant="link"
                    data-day={`${d.getMonth() + 1}-${d.getDate()}`}
                    data-day-iso={isoDate(d)}
                    tabIndex={sameDay(d, tabDay) ? 0 : -1}
                    disabled={future}
                    aria-label={formatLongDate(d)}
                    aria-current={sameDay(d, today) ? 'date' : undefined}
                    onClick={() => onPick(d)}
                    onPointerEnter={() => onHover(d)}
                    className={cn(
                      DAY,
                      isEnd ? 'bg-[var(--dashboard-figure)] font-medium text-[var(--dashboard-toast-action-text)]' : 'bg-transparent text-[var(--dashboard-figure)]',
                      !future && !isEnd && 'hover:bg-[var(--dashboard-hover-band)]',
                      future && 'text-[var(--dashboard-faint)]',
                    )}
                  >
                    {d.getDate()}
                  </Button>
                </span>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
