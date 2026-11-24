'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import { customId, customRange, rangeSummary } from './period'
import { useDashboardData } from './live/dashboard-data'

// A custom range (Figma 4.2, 20:8181; 11-dates-tabs-reference-rules.md DT-2 – DT-5): two months side by
// side, the ends dark, the days between filled; the footer says how long it is and what it's compared
// with; Apply sets your view.

const FOCUS = 'outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]'
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const day0 = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1)
const sameMonth = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()

interface CustomRangeProps {
  /** The period in use; a custom one opens on its range (DT-5). */
  period: string
  compare: string
  onApply: (periodId: string) => void
  onClose: () => void
  className?: string
}

export function CustomRange({ period, compare, onApply, onClose, className }: CustomRangeProps) {
  const current = customRange(period)
  // The store's day: a range can't run past the store's today (DT-2).
  const { today } = useDashboardData()
  const [from, setFrom] = useState<Date | null>(current?.from ?? null)
  const [to, setTo] = useState<Date | null>(current?.to ?? null)
  const [hover, setHover] = useState<Date | null>(null)
  // The right-hand month: the range's end, or this month.
  const [right, setRight] = useState(() => new Date((current?.to ?? today).getFullYear(), (current?.to ?? today).getMonth(), 1))
  const ref = useRef<HTMLDivElement>(null)
  const earliest = addMonths(today, -12)
  const canBack = addMonths(right, -1).getTime() > new Date(earliest.getFullYear(), earliest.getMonth(), 1).getTime()
  const canForward = !sameMonth(right, today)

  // Esc or a click outside closes it (DT-4).
  useEffect(() => {
    const down = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) onClose() }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose() } }
    document.addEventListener('pointerdown', down)
    document.addEventListener('keydown', key, true)
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key, true) }
  }, [onClose])

  // The first click sets the start, the second the end; an end before the start swaps (DT-3).
  const pick = (d: Date) => {
    if (!from || to) { setFrom(d); setTo(null); return }
    if (d.getTime() < from.getTime()) { setTo(from); setFrom(d) } else setTo(d)
  }
  const end = to ?? (from && hover ? hover : null)
  const [lo, hi] = from && end ? (from.getTime() <= end.getTime() ? [from, end] : [end, from]) : [from, from]

  const month = (first: Date) => {
    const lead = (first.getDay() + 6) % 7 // Monday first
    const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
    const cells: (Date | null)[] = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => new Date(first.getFullYear(), first.getMonth(), i + 1))]
    return (
      <div className="flex w-[280px] flex-col gap-2" data-month={first.getMonth() + 1}>
        <p className="m-0 h-6 text-[13px] font-medium leading-6 text-[var(--dashboard-figure)]">
          {first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
        </p>
        <div role="grid" aria-label={first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })} className="grid grid-cols-7 gap-y-1">
          {WEEKDAYS.map((w, i) => <span key={i} aria-hidden className="flex h-6 items-center justify-center text-[11px] font-medium text-[var(--dashboard-faint)]">{w}</span>)}
          {cells.map((d, i) => {
            if (!d) return <span key={i} />
            const t = d.getTime()
            const future = t > day0(today)
            const isEnd = (lo && t === day0(lo)) || (hi && t === day0(hi))
            const inside = lo && hi && t > day0(lo) && t < day0(hi)
            // The fill runs between the ends, rounded at a week's or a range's edges.
            const col = i % 7
            const band = inside || (isEnd && lo && hi && day0(lo) !== day0(hi))
            const bandStart = band && (col === 0 || (lo && t === day0(lo)) || d.getDate() === 1)
            const bandEnd = band && (col === 6 || (hi && t === day0(hi)) || d.getDate() === new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())
            return (
              <span key={i} role="gridcell" className={cn('flex h-8 items-center justify-center', band && 'bg-[var(--dashboard-chip-bg)]', bandStart && 'rounded-l-lg', bandEnd && 'rounded-r-lg')}>
                {/* eslint-disable-next-line no-restricted-syntax -- ds-allow: a day in the range picker (Figma 20:8181) */}
                <button
                  type="button"
                  data-day={`${d.getMonth() + 1}-${d.getDate()}`}
                  disabled={future}
                  aria-pressed={!!isEnd}
                  aria-label={d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  onClick={() => pick(d)}
                  onPointerEnter={() => setHover(d)}
                  className={cn(
                    'flex size-8 items-center justify-center rounded-lg border-0 p-0 text-[13px] leading-5',
                    isEnd ? 'bg-[var(--dashboard-figure)] font-medium text-[var(--dashboard-toast-action-text)]' : 'bg-transparent text-[var(--dashboard-figure)]',
                    future ? 'cursor-default text-[var(--dashboard-faint)] opacity-50' : !isEnd && 'cursor-pointer hover:bg-[var(--dashboard-hover-band)]',
                    isEnd && 'cursor-pointer',
                    FOCUS,
                  )}
                >
                  {d.getDate()}
                </button>
              </span>
            )
          })}
        </div>
      </div>
    )
  }

  const nav = 'flex size-7 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent p-0 text-[var(--dashboard-label)] hover:bg-[var(--dashboard-hover-band)] disabled:cursor-default disabled:opacity-30'
  return (
    <div
      ref={ref}
      // eslint-disable-next-line no-restricted-syntax -- ds-allow: a non-modal panel under the period, like its menu (Figma 20:8181)
      role="dialog"
      aria-label="Custom range"
      data-custom-range
      onPointerLeave={() => setHover(null)}
      className={cn('flex w-[640px] max-w-[calc(100vw-32px)] flex-col gap-4 rounded-xl border border-solid border-[var(--dashboard-badge-bg)] bg-[var(--dashboard-card-bg)] px-5 pb-4 pt-4 shadow-[var(--dashboard-popover-shadow)]', className)}
    >
      <div className="relative flex justify-between gap-6">
        <div className="flex flex-1 flex-col">
          <div className="absolute right-0 top-0 flex gap-0.5">
            {/* eslint-disable-next-line no-restricted-syntax -- ds-allow: month navigation (our call, DT-3) */}
            <button type="button" aria-label="Earlier month" disabled={!canBack} onClick={() => setRight((r) => addMonths(r, -1))} className={cn(nav, FOCUS)}><ChevronLeft aria-hidden size={14} strokeWidth={1.5} absoluteStrokeWidth /></button>
            {/* eslint-disable-next-line no-restricted-syntax -- ds-allow: month navigation (our call, DT-3) */}
            <button type="button" aria-label="Later month" disabled={!canForward} onClick={() => setRight((r) => addMonths(r, 1))} className={cn(nav, FOCUS)}><ChevronRight aria-hidden size={14} strokeWidth={1.5} absoluteStrokeWidth /></button>
          </div>
          {month(addMonths(right, -1))}
        </div>
        {month(right)}
      </div>
      <div className="flex items-center gap-2">
        <p data-range-summary className="m-0 min-w-0 flex-1 truncate text-[12px] leading-4 text-[var(--dashboard-label)]">
          {lo && hi && to ? rangeSummary(lo, hi, compare) : from ? 'Pick the last day' : 'Pick the first day'}
        </p>
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" data-range-apply disabled={!from || !to} onClick={() => { if (from && to) onApply(customId(from, to)) }}>Apply</Button>
      </div>
    </div>
  )
}
