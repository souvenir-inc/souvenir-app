'use client'

import { useState, useSyncExternalStore } from 'react'
import { ChevronDown } from 'lucide-react'
import { PopoverContent, PopoverRoot, PopoverTrigger } from '@/components/Popover'
import { Tooltip } from '@/components/Tooltip'
import { cn } from '@/lib/utils'

// Needs attention (05-cards-reading-rules.md CR-31 – CR-34; Figma 173:54812, 173:55163), Option B:
// one quiet pill in the header before the period, counting the metrics that aren't doing well
// across every board. Its dot is red when any of them is red, amber otherwise. A click opens the
// list under it: red first, then amber; 7 rows, then it scrolls. A row opens that metric's window.
// Under 1100 px the pill shortens to "● 4" so the tabs keep their room. With nothing flagged, no pill.

const FOCUS = 'outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]'

export interface AttentionItem {
  metricId: string
  label: string
  /** "Store overview, Ads". */
  boards: string
  /** "Off target −12%", "Red flag". */
  reason: string
  value: string
  tone: 'red' | 'amber'
}

const DOT = { red: 'bg-[var(--dashboard-sync-failed)]', amber: 'bg-[var(--dashboard-sync-behind)]' }

const narrowQuery = '(max-width: 1099px)'
const subscribeNarrow = (cb: () => void) => {
  const mq = window.matchMedia(narrowQuery)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}
const useNarrow = () => useSyncExternalStore(subscribeNarrow, () => window.matchMedia(narrowQuery).matches, () => false)

export function NeedsAttention({ items, onOpenMetric }: { items: AttentionItem[]; onOpenMetric: (metricId: string) => void }) {
  const [open, setOpen] = useState(false)
  const narrow = useNarrow()
  if (!items.length) return null
  const tone = items.some((i) => i.tone === 'red') ? 'red' : 'amber'
  const words = `${items.length} need attention`
  const trigger = (
    <PopoverTrigger asChild>
      {/* eslint-disable-next-line no-restricted-syntax -- ds-allow: the quiet header pill of Figma 173:54812 (dot, count, chevron) */}
      <button
        type="button"
        data-needs-attention={tone}
        aria-label={words}
        className={cn('flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border-0 bg-transparent px-2.5 text-[length:var(--font-size-body-sm)] font-medium leading-5 text-[var(--dashboard-figure)] transition-colors duration-fast hover:bg-[var(--dashboard-tabs-track)]', open && 'bg-[var(--dashboard-tabs-track)]', FOCUS)}
      >
        <span aria-hidden className={cn('size-[7px] rounded-full', DOT[tone])} />
        {narrow ? items.length : words}
        {!narrow && <ChevronDown aria-hidden size={12} strokeWidth={1.75} absoluteStrokeWidth className="text-[var(--dashboard-muted)]" />}
      </button>
    </PopoverTrigger>
  )
  return (
    <PopoverRoot open={open} onOpenChange={setOpen}>
      {narrow ? <Tooltip content={words} side="bottom" disabled={open}>{trigger}</Tooltip> : trigger}
      <PopoverContent
        side="bottom" align="end" sideOffset={6} collisionPadding={8} variant="dropdown" maxHeight={false}
        aria-label="Needs attention"
        style={{ width: 360, maxWidth: 'calc(100vw - 16px)', boxShadow: 'var(--dashboard-list-shadow)', border: '1px solid var(--dashboard-list-border)', borderRadius: 'var(--radius-xl)' }}
      >
        <div className="flex flex-col p-1.5">
          <div className="flex items-center gap-1.5 px-2.5 py-2">
            <span className="text-[length:var(--font-size-body-sm)] font-medium leading-4 text-[var(--neutral-700)]">Needs attention</span>
            <span className="rounded-md bg-[var(--dashboard-sync-bg)] px-1.5 py-px text-[length:var(--font-size-caption)] font-medium leading-[14px] text-[var(--neutral-700)]">{items.length}</span>
          </div>
          <div className="relative">
            <ul aria-label="Flagged metrics" className={cn('m-0 list-none p-0', items.length > 7 && 'dashboard-thin-scroll max-h-[357px] overflow-y-auto')}>
              {items.map((it) => (
                <li key={it.metricId}>
                  {/* eslint-disable-next-line no-restricted-syntax -- ds-allow: a list row that opens the metric window (Figma 173:55168) */}
                  <button
                    type="button"
                    data-attention-row={it.metricId}
                    onClick={() => { setOpen(false); onOpenMetric(it.metricId) }}
                    className={cn('flex w-full cursor-pointer items-center gap-2.5 rounded-lg border-0 bg-transparent px-2.5 py-2 text-left hover:bg-[var(--dashboard-hover-band)] focus-visible:bg-[var(--dashboard-hover-band)]', FOCUS)}
                  >
                    <span aria-hidden className={cn('size-[7px] shrink-0 rounded-full', DOT[it.tone])} />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-[length:var(--font-size-body-sm)] font-medium leading-4 text-[var(--dashboard-figure)]">{it.label}</span>
                      <span className="truncate text-[length:var(--font-size-small)] leading-4 text-[var(--dashboard-muted)]">{it.boards} · {it.reason}</span>
                    </span>
                    <span className="shrink-0 text-[length:var(--font-size-body-sm)] leading-4 text-[var(--dashboard-figure)]">{it.value}</span>
                  </button>
                </li>
              ))}
            </ul>
            {items.length > 7 && <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-b from-transparent to-[var(--dashboard-card-bg)]" />}
          </div>
        </div>
      </PopoverContent>
    </PopoverRoot>
  )
}
