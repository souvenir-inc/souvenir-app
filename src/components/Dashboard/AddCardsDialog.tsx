'use client'

import { useMemo, useRef, useState } from 'react'
import { Check, LayoutGrid, Plug, Search, Sigma, User, X, XCircle } from 'lucide-react'
import { Button, IconButton } from '@/components/ui'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { ORG_CONNECTORS_ROUTE } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { OTHER_ROLES, ROLE_METRICS, YOUR_ROLE, catalogOf, groupOf, groupRank, matchOf, nameList } from './catalog'
import { SourceLogo } from './icons'
import { useDashboardData } from './live/dashboard-data'
import { Metrics } from './live/metrics'
import { measurable } from './templates'
import type { App, Metric } from './types'

// The Add cards picker (Figma 170:45414, docs-v2/dashboard/06-add-cards-rules.md AC-3 – AC-15),
// Option A: grouped by role. Search across every metric; tick as many as you like; Add puts them at
// the end of the board in the order picked.

const FOCUS = 'outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]'
type View = string // a role id, 'all' or 'custom'

interface AddCardsDialogProps {
  open: boolean
  /** Card ids on the board ("revenue", "revenue#2"), for the On board tag (AC-6). */
  onBoard: string[]
  onClose: () => void
  /** The picked metric ids, in the order picked (AC-16). */
  onAdd: (metricIds: string[]) => void
}

export function AddCardsDialog({ open, ...rest }: AddCardsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) rest.onClose() }}>
      {open && <Picker {...rest} />}
    </Dialog>
  )
}

/** A line in the list: a group heading, a metric row, a gap, or the call-out for metrics no app feeds (AC-8). */
type Line =
  | { kind: 'heading'; text: string }
  | { kind: 'row'; metric: Metric; match?: { at: number; length: number } | null }
  | { kind: 'callout'; count: number }
  | { kind: 'gap'; size: 4 | 8 }

function Picker({ onBoard, onClose, onAdd }: Omit<AddCardsDialogProps, 'open'>) {
  const { metrics, apps } = useDashboardData()
  const catalog = catalogOf(metrics.all)
  const [view, setView] = useState<View>('founder')
  const [query, setQuery] = useState('')
  const [picks, setPicks] = useState<string[]>([])
  const [focus, setFocus] = useState(0)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  // Keyed by the ids, so the list below is worked out again only when the cards change.
  const boardKey = [...new Set(onBoard.map(Metrics.base))].sort().join(',')
  const boardIds = useMemo(() => new Set(boardKey ? boardKey.split(',') : []), [boardKey])
  const pickable = measurable

  // ── What the list shows ─────────────────────────────────────────────────────
  const lines = useMemo<Line[]>(() => {
    const searching = query.trim().length > 0
    const source: { metric: Metric; match?: { at: number; length: number } | null }[] = searching
      ? catalog.flatMap((metric) => { const match = matchOf(metric, query, apps); return match === false ? [] : [{ metric, match }] })
      : (view === 'all' ? catalog : view === 'custom' ? catalog.filter((m) => m.custom) : (ROLE_METRICS[view] ?? []).map((id) => metrics.get(id)).filter((m): m is Metric => !!m))
          .map((metric) => ({ metric }))
    // A metric already on this board leaves the list: adding it is done.
    const fresh = source.filter((x) => !boardIds.has(x.metric.id))
    const on = fresh.filter((x) => pickable(x.metric))
    // Not pickable for two different reasons: no connected app feeds it (Connect helps), or its app is
    // connected but the warehouse has nothing for it yet (first sync, a failed feed; waiting helps).
    const needsApp = (m: Metric) => !m.custom && m.apps.length === 0
    const off = fresh.filter((x) => !pickable(x.metric) && needsApp(x.metric))
    const waiting = fresh.filter((x) => !pickable(x.metric) && !needsApp(x.metric))
    const out: Line[] = []
    if (searching || view === 'all') {
      // Grouped by app, A–Z inside each group (AC-10, AC-13).
      const groups = new Map<string, typeof on>()
      for (const x of [...on].sort((a, b) => groupRank(a.metric, apps) - groupRank(b.metric, apps) || a.metric.label.localeCompare(b.metric.label))) {
        const g = groupOf(x.metric, apps)
        groups.set(g, [...(groups.get(g) ?? []), x])
      }
      for (const [g, xs] of groups) {
        out.push({ kind: 'heading', text: g.toUpperCase() })
        for (const x of xs) out.push({ kind: 'row', metric: x.metric, match: x.match })
      }
    } else {
      for (const x of on) out.push({ kind: 'row', metric: x.metric, match: x.match })
    }
    // Metrics no connected app feeds: one call-out to Connectors, the metrics faded under it (AC-8).
    if (off.length) {
      if (searching || view === 'all') out.push({ kind: 'heading', text: 'NEEDS AN APP' })
      else out.push({ kind: 'gap', size: 8 })
      out.push({ kind: 'callout', count: off.length })
      out.push({ kind: 'gap', size: 4 })
      for (const x of off) out.push({ kind: 'row', metric: x.metric, match: x.match })
    }
    if (waiting.length) {
      out.push({ kind: 'heading', text: 'WAITING FOR DATA' })
      for (const x of waiting) out.push({ kind: 'row', metric: x.metric, match: x.match })
    }
    return out
  }, [query, view, catalog, metrics, apps, pickable, boardIds])

  const rows = lines.filter((l): l is Extract<Line, { kind: 'row' }> => l.kind === 'row')
  const focusIndex = Math.min(focus, Math.max(0, rows.length - 1))

  const toggle = (m: Metric) => {
    if (!pickable(m)) return
    setPicks((p) => (p.includes(m.id) ? p.filter((x) => x !== m.id) : [...p, m.id]))
  }
  const add = () => { if (picks.length) onAdd(picks) }
  const clearSearch = () => { setQuery(''); searchRef.current?.focus() }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const next = Math.max(0, Math.min(rows.length - 1, focusIndex + (e.key === 'ArrowDown' ? 1 : -1)))
      setFocus(next)
      listRef.current?.querySelector<HTMLElement>(`[data-row-index="${next}"]`)?.focus()
    } else if (e.key === ' ' && e.target !== searchRef.current) {
      e.preventDefault()
      const r = rows[focusIndex]
      if (r) toggle(r.metric)
    } else if (e.key === 'Enter' && !(e.target as HTMLElement).closest('button')) {
      e.preventDefault()
      add()
    }
  }

  const already = picks.filter((id) => boardIds.has(id)).map((id) => metrics.get(id)?.label ?? id)
  const searching = query.trim().length > 0
  let rowIndex = -1

  return (
    <DialogContent
      hideClose
      aria-describedby={undefined}
      data-add-cards
      style={{ width: 'min(800px, calc(100vw - 304px))', minWidth: 'min(720px, calc(100vw - 32px))', height: 690, maxHeight: 'calc(100dvh - 64px)', borderRadius: 'var(--radius-2xl)', padding: 0, background: 'var(--neutral-50)' }}
      onOpenAutoFocus={(e) => { e.preventDefault(); searchRef.current?.focus() }}
      // Esc clears a search first; a second Esc closes (AC-12, AC-15).
      onEscapeKeyDown={(e) => { if (query) { e.preventDefault(); clearSearch() } }}
      onKeyDown={onKey}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="relative flex h-[60px] shrink-0 items-end px-6 pb-3.5">
          <DialogTitle className="text-[length:var(--font-size-body-lg)] font-semibold leading-6 text-[var(--dashboard-figure)]">Add cards</DialogTitle>
          <DialogClose asChild>
            <IconButton variant="ghost" size="sm" iconSize={14} aria-label="Close" className="absolute right-3.5 top-3.5 size-7 rounded-md" icon={<X strokeWidth={1.5} absoluteStrokeWidth />} />
          </DialogClose>
        </div>

        {/* The search field, with the cursor in it (AC-3, AC-13). */}
        <div className="mx-6 flex h-10 shrink-0 items-center gap-2 rounded-lg border border-solid border-[var(--neutral-200)] bg-[var(--dashboard-card-bg)] pl-3 pr-2.5 shadow-[var(--dashboard-field-shadow)] focus-within:border-[var(--dashboard-list-border)]">
          <Search aria-hidden size={16} strokeWidth={1.5} absoluteStrokeWidth className="shrink-0 text-[var(--dashboard-muted)]" />
          {/* eslint-disable-next-line no-restricted-syntax -- ds-allow: the borderless text field inside the drawn search box (Figma 170:45419) */}
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setFocus(0) }}
            placeholder="Search metrics"
            aria-label="Search metrics"
            className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-[length:var(--font-size-body)] leading-[var(--line-height-body)] text-[var(--dashboard-figure)] outline-none placeholder:text-[var(--dashboard-muted)]"
          />
          {query && (
            // eslint-disable-next-line no-restricted-syntax -- ds-allow: the search field's clear (Figma "clear search", 16px x-circle)
            <button type="button" aria-label="Clear search" onClick={clearSearch} className={cn('flex size-5 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 text-[var(--dashboard-faint)] hover:text-[var(--dashboard-figure)]', FOCUS)}>
              <XCircle aria-hidden size={16} strokeWidth={1.5} absoluteStrokeWidth />
            </button>
          )}
        </div>

        <div className="flex min-h-0 flex-1 gap-4 px-4 pb-4 pt-4">
          {/* The rail: your role, other roles, browse (AC-4). It loses its highlight while searching. */}
          <nav aria-label="Browse metrics" className="flex w-[232px] shrink-0 flex-col gap-0.5 overflow-y-auto rounded-xl bg-[var(--dashboard-tabs-track)] p-2 max-[1099px]:w-[184px]">
            <RailHeading first>YOUR ROLE</RailHeading>
            <RailItem icon={<User />} label={YOUR_ROLE.label} selected={!searching && view === YOUR_ROLE.id} onClick={() => { setView(YOUR_ROLE.id); setQuery('') }} />
            <span aria-hidden className="h-px shrink-0 bg-[var(--dashboard-rail-rule)]" />
            <RailHeading>OTHER ROLES</RailHeading>
            {OTHER_ROLES.map((r) => (
              <RailItem key={r.id} icon={<User />} label={r.label} selected={!searching && view === r.id} onClick={() => { setView(r.id); setQuery('') }} />
            ))}
            <span aria-hidden className="h-px shrink-0 bg-[var(--dashboard-rail-rule)]" />
            <RailHeading>BROWSE</RailHeading>
            <RailItem icon={<LayoutGrid />} label="All metrics" selected={!searching && view === 'all'} onClick={() => { setView('all'); setQuery('') }} />
            <RailItem icon={<Sigma />} label="Custom metrics" selected={!searching && view === 'custom'} onClick={() => { setView('custom'); setQuery('') }} />
          </nav>

          <div ref={listRef} role="listbox" aria-multiselectable aria-label="Metrics" className="dashboard-thin-scroll flex min-w-0 flex-1 flex-col gap-0.5 overflow-y-auto pr-1">
            {rows.length === 0 && lines.every((l) => l.kind !== 'callout') ? (
              // No match (AC-15).
              <div className="flex flex-col items-center gap-3 pt-16 text-[length:var(--font-size-body)] leading-5 text-[var(--dashboard-label)]">
                <p className="m-0">No metrics match “{query.trim()}”.</p>
                {/* eslint-disable-next-line no-restricted-syntax -- ds-allow: the outlined Clear search of Figma 170:55881 */}
                <button type="button" onClick={clearSearch} className={cn('h-8 cursor-pointer rounded-lg border border-solid border-[var(--dashboard-list-border)] bg-[var(--dashboard-card-bg)] px-3 text-[length:var(--font-size-body-sm)] font-medium text-[var(--dashboard-figure)] shadow-[var(--dashboard-button-shadow)] hover:bg-[var(--neutral-100)]', FOCUS)}>Clear search</button>
              </div>
            ) : lines.map((l, i) => {
              if (l.kind === 'heading') return <p key={`h${i}`} className="m-0 px-2.5 pb-1.5 pt-2.5 text-[length:var(--font-size-caption)] font-semibold leading-4 tracking-[var(--dashboard-section-tracking)] text-[var(--dashboard-muted)] first:pt-1">{l.text}</p>
              if (l.kind === 'gap') return <span key={`g${i}`} aria-hidden className="shrink-0" style={{ height: l.size }} />
              if (l.kind === 'callout') return <CallOut key="callout" count={l.count} />
              rowIndex += 1
              const idx = rowIndex
              const m = l.metric
              const can = pickable(m)
              const picked = picks.includes(m.id)
              const firstSync = m.apps.some((id) => apps.firstSync(id))
              const marks = m.apps.slice(0, 2).map((id) => apps.get(id)).filter((a): a is App => !!a)
              const tag = firstSync || (!can && l.metric.apps.length > 0) ? 'No data yet' : null
              return (
                <div
                  key={`r${m.id}`}
                  role="option"
                  aria-selected={picked}
                  aria-disabled={!can}
                  data-row-index={idx}
                  data-metric-row={m.id}
                  tabIndex={idx === focusIndex ? 0 : -1}
                  onFocus={() => setFocus(idx)}
                  onClick={() => { setFocus(idx); toggle(m) }}
                  className={cn(
                    'flex h-9 shrink-0 items-center gap-2.5 rounded-lg border border-solid pl-2.5 pr-2 outline-none',
                    can ? 'cursor-pointer' : 'cursor-default',
                    picked ? 'border-[var(--neutral-200)] bg-[var(--dashboard-card-bg)] shadow-[var(--dashboard-lift-shadow)]' : 'border-transparent hover:bg-[var(--dashboard-tabs-track)] focus-visible:bg-[var(--dashboard-tabs-track)]',
                    'focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-[var(--focus-ring)]',
                  )}
                >
                  <Checkbox state={!can ? 'none' : picked ? 'on' : 'off'} />
                  <span className={cn('flex shrink-0 items-center gap-[var(--space-0-75)]', !can && 'opacity-45')}>
                    {m.custom ? <CustomMark /> : marks.map((app) => <SourceLogo key={app.id} app={app} className="size-4" />)}
                  </span>
                  <span title={m.label} className={cn('min-w-0 flex-1 truncate text-[length:var(--font-size-body)] leading-[var(--line-height-body)] text-[var(--dashboard-figure)]', picked && 'font-medium', !can && 'opacity-45')}>
                    <Highlight text={m.label} match={l.match} />
                  </span>
                  {tag && <span className="shrink-0 rounded-full bg-[var(--dashboard-sync-bg)] px-2 py-0.5 text-[length:var(--font-size-caption)] font-medium leading-4 text-[var(--neutral-700)]">{tag}</span>}
                </div>
              )
            })}
          </div>
        </div>

        {/* Footer: what's picked on the left; Cancel and Add on the right (AC-11). */}
        <div className="flex h-16 shrink-0 items-center gap-3 border-0 border-t border-solid border-[var(--neutral-200)] px-6">
          {picks.length > 0 && (
            <p data-picked className="m-0 flex shrink-0 items-center gap-2 text-[length:var(--font-size-body)] leading-[var(--line-height-body)]">
              <span className="font-medium text-[var(--dashboard-figure)]">{picks.length} picked</span>
              {/* eslint-disable-next-line no-restricted-syntax -- ds-allow: the footer's quiet text link (Figma 170:64075) */}
              <button type="button" onClick={() => setPicks([])} className={cn('cursor-pointer rounded-sm border-0 bg-transparent p-0 text-[length:var(--font-size-body)] text-[var(--dashboard-label)] hover:text-[var(--dashboard-figure)]', FOCUS)}>Clear</button>
            </p>
          )}
          {already.length > 0 && <span aria-hidden className="h-4 w-px shrink-0 bg-[var(--neutral-200)]" />}
          {already.length > 0 && (
            <p data-already className="m-0 min-w-0 truncate text-[length:var(--font-size-body-sm)] leading-5 text-[var(--dashboard-label)]">
              {nameList(already)} {already.length === 1 ? 'is' : 'are'} already on this board
            </p>
          )}
          <div className="ml-auto flex shrink-0 gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={add} disabled={!picks.length}>{picks.length <= 1 ? (picks.length ? 'Add card' : 'Add cards') : `Add ${picks.length} cards`}</Button>
          </div>
        </div>
      </div>
    </DialogContent>
  )
}

function RailHeading({ children, first = false }: { children: React.ReactNode; first?: boolean }) {
  return <p className={cn('m-0 pl-2.5 text-[length:var(--font-size-caption)] font-semibold leading-4 tracking-[var(--dashboard-section-tracking)] text-[var(--dashboard-muted)]', first ? 'py-1.5' : 'pb-1.5 pt-2.5')}>{children}</p>
}

function RailItem({ icon, label, selected, onClick }: { icon: React.ReactElement<{ size?: number }>; label: string; selected: boolean; onClick: () => void }) {
  return (
    // eslint-disable-next-line no-restricted-syntax -- ds-allow: the picker's rail item (Figma 170:38065)
    <button
      type="button"
      aria-current={selected ? 'true' : undefined}
      onClick={onClick}
      title={label}
      className={cn(
        'flex h-9 w-full shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-solid px-2.5 text-left text-[length:var(--font-size-body)] leading-[var(--line-height-body)]',
        selected ? 'border-[var(--neutral-200)] bg-[var(--dashboard-card-bg)] font-medium text-[var(--dashboard-figure)] shadow-[var(--dashboard-lift-shadow)]' : 'border-transparent bg-transparent text-[var(--neutral-700)] hover:bg-[var(--dashboard-hover-band)]',
        FOCUS,
      )}
    >
      <span aria-hidden className="flex shrink-0 [&_svg]:size-4 [&_svg]:stroke-[1.5]">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  )
}

function Checkbox({ state }: { state: 'off' | 'on' | 'none' }) {
  if (state === 'none') return <span aria-hidden className="size-4 shrink-0" />
  return (
    <span aria-hidden className={cn('flex size-4 shrink-0 items-center justify-center rounded', state === 'on' ? 'bg-[var(--dashboard-figure)] text-[var(--dashboard-card-bg)]' : 'border-[length:var(--add-cards-dialog-border-width)] border-solid border-[var(--dashboard-checkbox-border)] bg-[var(--dashboard-card-bg)]')}>
      {state === 'on' && <Check size={12} strokeWidth={2.5} absoluteStrokeWidth />}
    </span>
  )
}

/** The name with the matched letters bold (AC-13). */
function Highlight({ text, match }: { text: string; match?: { at: number; length: number } | null }) {
  if (!match) return <>{text}</>
  return (
    <>
      {text.slice(0, match.at)}
      <strong className="font-semibold">{text.slice(match.at, match.at + match.length)}</strong>
      {text.slice(match.at + match.length)}
    </>
  )
}

/** Metrics no connected app feeds (AC-8): Connect goes to Connectors, where apps are linked. */
function CallOut({ count }: { count: number }) {
  return (
    <div data-callout className="flex h-14 shrink-0 items-center gap-3 rounded-lg border border-solid border-[var(--neutral-200)] bg-[var(--dashboard-card-bg)] p-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-solid border-[var(--neutral-200)] bg-[var(--dashboard-panel-bg)] text-[var(--dashboard-label)]">
        <Plug aria-hidden size={16} strokeWidth={1.5} absoluteStrokeWidth />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[length:var(--font-size-body)] font-medium leading-5 text-[var(--dashboard-figure)]">Not measured here yet</span>
        <span className="truncate text-[length:var(--font-size-small)] leading-4 text-[var(--dashboard-label)]">{count} metric{count === 1 ? '' : 's'} need an app this store hasn’t connected</span>
      </span>
      { }
      <a
        href={ORG_CONNECTORS_ROUTE}
        className={cn('flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-solid border-[var(--dashboard-list-border)] bg-[var(--dashboard-card-bg)] py-1.5 pl-2.5 pr-3 text-[length:var(--font-size-body-sm)] font-medium leading-[var(--line-height-compact)] text-[var(--dashboard-figure)] no-underline shadow-[var(--dashboard-button-shadow)] hover:bg-[var(--neutral-100)]', FOCUS)}
      >
        <Plug aria-hidden size={14} strokeWidth={1.5} absoluteStrokeWidth />Connect
      </a>
    </div>
  )
}

/** A custom metric's mark: Σ on a small soft tile (Figma "Logo16 / Custom", 170:38000). */
function CustomMark() {
  return (
    <span aria-hidden className="flex size-4 shrink-0 items-center justify-center rounded-xs bg-[var(--dashboard-sync-bg)] text-[var(--dashboard-label)]">
      <Sigma size={11} strokeWidth={1.75} absoluteStrokeWidth />
    </span>
  )
}
