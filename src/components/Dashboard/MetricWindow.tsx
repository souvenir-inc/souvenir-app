'use client'

import { useState } from 'react'
import { ArrowDown, ArrowUp, LayoutGrid, Plus, X } from 'lucide-react'
import { PopoverContent, PopoverRoot, PopoverTrigger } from '@/components/Popover'
import { IconButton } from '@/components/ui'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { LineChart } from './chart/LineChart'
import { HealthPillView, type CardView } from './MetricCard'
import { formatMetricValue } from './format'
import { SourceLogo } from './icons'
import { useDashboardData } from './live/dashboard-data'
import { Metrics } from './live/metrics'
import { chartWindow, compareName, periodName, rangeDays } from './period'
import { changeLabel, dayMonth, formatExact, weekdayDayMonth } from './series'
import { ago } from './sync/sync-model'
import { useSyncSnapshot } from './sync/sync-store'
import type { App, AppId, Metric } from './types'
import type { Board } from './tabs/board-state'

// The metric window (Figma 170:75690, 05-cards-reading-rules.md CR-15 – CR-17), drawn as it is today
// in Scorecards: the name, the header's period, the number and its change, then Trend, Target,
// Definition, Sources and Other related. Trend opens first, with the same days as the board. Esc,
// × or a click outside closes it, and focus goes back to the card (the dialog returns it).

const FOCUS = 'outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]'
const TABS = ['Trend', 'Target', 'Definition', 'Sources', 'Other related'] as const
type Tab = (typeof TABS)[number]

interface MetricWindowProps {
  metric: Metric | null
  view?: CardView
  periodId: string
  /** The open board's other cards, for Other related. */
  related: Metric[]
  onClose: () => void
  onOpenMetric: (metricId: string) => void
  onNotReady: (what: string) => void
  /** Boards you can edit, in tab order (06 AC-22). */
  boards: Board[]
  onAddToBoard: (boardId: string) => void
}

export function MetricWindow({ metric, ...rest }: MetricWindowProps) {
  return (
    <Dialog open={!!metric} onOpenChange={(o) => { if (!o) rest.onClose() }}>
      {metric && <Window key={metric.id} metric={metric} {...rest} />}
    </Dialog>
  )
}

function Window({ metric, view, periodId, related, onOpenMetric, onNotReady, boards, onAddToBoard }: Omit<MetricWindowProps, 'metric' | 'onClose'> & { metric: Metric }) {
  const [tab, setTab] = useState<Tab>('Trend')
  const [table, setTable] = useState(false)
  const { today } = useDashboardData()
  const chart = chartWindow(periodId, today)
  const n = rangeDays(chart.from, chart.to)
  const periodLabel = periodName(periodId)
  const series = metric.series
  const lastYear = series.compare === 'last-year'
  const { change } = metric
  const comparable = change !== null
  const Arrow = change?.direction === 'up' ? ArrowUp : ArrowDown
  const good = change?.sentiment === 'positive'
  return (
    <DialogContent
      size="lg"
      hideClose
      aria-describedby={undefined}
      data-metric-window={metric.id}
      style={{ width: 760, maxWidth: 'calc(100vw - 32px)', height: 760, maxHeight: 'calc(100dvh - 64px)', borderRadius: 'var(--radius-2xl)', boxShadow: 'var(--dashboard-window-shadow)', padding: 0, background: 'var(--dashboard-card-bg)' }}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="relative shrink-0 border-0 border-b border-solid border-[var(--neutral-200)] px-7 pb-[18px] pt-7">
          <DialogTitle className="text-[15px] font-medium leading-5 text-[var(--neutral-800)]">{metric.label}</DialogTitle>
          <p className="m-0 mt-1 text-[length:var(--font-size-small)] leading-4 text-[var(--dashboard-muted)]">{periodLabel}</p>
          <div className="mt-[var(--space-2-5)] flex items-end gap-3.5">
            <p className="m-0 text-[44px] font-normal leading-[52px] tracking-[-0.88px] text-[var(--dashboard-figure)]">{metric.value}</p>
            <p className="m-0 flex items-center gap-0.5 pb-2 text-[length:var(--font-size-body-sm)] leading-5">
              {comparable ? (
                <>
                  <Arrow aria-hidden size={13} strokeWidth={1.75} absoluteStrokeWidth className={good ? 'text-[var(--dashboard-positive)]' : 'text-[var(--dashboard-negative)]'} />
                  <span className={good ? 'text-[var(--dashboard-positive)]' : 'text-[var(--dashboard-negative)]'}>{change?.label}</span>
                  <span className="whitespace-pre text-[var(--dashboard-muted)]">{lastYear ? '  vs the same days last year' : `  vs the previous ${n} days`}</span>
                </>
              ) : <span className="text-[var(--dashboard-muted)]">No comparison</span>}
            </p>
          </div>
          <div className="absolute right-5 top-[18px] flex items-center gap-2">
            <AddToBoard metric={metric} boards={boards} onPick={onAddToBoard} />
            <DialogClose asChild>
              <IconButton variant="ghost" size="sm" iconSize={14} aria-label="Close" className="size-7 rounded-md" icon={<X strokeWidth={1.5} absoluteStrokeWidth />} />
            </DialogClose>
          </div>
        </header>

        <div role="tablist" aria-label={`${metric.label} details`} className="flex shrink-0 gap-6 px-7 pt-3">
          {TABS.map((t, i) => (
            // eslint-disable-next-line no-restricted-syntax -- ds-allow: the window's underlined text tabs (Figma 170:75705)
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              tabIndex={tab === t ? 0 : -1}
              onClick={() => setTab(t)}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
                e.preventDefault()
                const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length]
                setTab(next)
                ;(e.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role=tab]')[TABS.indexOf(next)])?.focus()
              }}
              className={cn('flex cursor-pointer flex-col gap-2 border-0 bg-transparent p-0 pt-2 text-[length:var(--font-size-body-sm)] leading-[17px]', tab === t ? 'font-medium text-[var(--dashboard-figure)]' : 'text-[var(--dashboard-muted)] hover:text-[var(--dashboard-figure)]', FOCUS)}
            >
              {t}
              <span aria-hidden className={cn('h-0.5 w-full rounded-[1px]', tab === t ? 'bg-[var(--dashboard-figure)]' : 'bg-transparent')} />
            </button>
          ))}
        </div>

        <div role="tabpanel" aria-label={tab} className="min-h-0 flex-1 overflow-y-auto px-7 pb-7 pt-5">
          {tab === 'Trend' && (
            <>
              <div className="flex items-center justify-between gap-4">
                <p className="m-0 text-[15px] leading-5 text-[var(--dashboard-figure)]">
                  {change ? `${change.direction === 'up' ? 'Up' : 'Down'} ${change.label} on ${lastYear ? 'the same days last year' : `the previous ${n} days`}` : 'Nothing to compare with yet'}
                </p>
                <div role="radiogroup" aria-label="Show as" className="flex shrink-0 gap-0.5 rounded-lg bg-[var(--dashboard-hover-band)] p-[3px]">
                  {(['Chart', 'Table'] as const).map((k) => (
                    // eslint-disable-next-line no-restricted-syntax -- ds-allow: the Chart | Table switch (Figma 170:75722)
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={(k === 'Table') === table}
                      onClick={() => setTable(k === 'Table')}
                      className={cn('cursor-pointer rounded-[7px] border-0 px-2.5 py-1 text-[length:var(--font-size-small)] leading-4', (k === 'Table') === table ? 'bg-[var(--dashboard-card-bg)] font-medium text-[var(--dashboard-figure)] shadow-[var(--dashboard-control-shadow)]' : 'bg-transparent text-[var(--dashboard-muted)]', FOCUS)}
                    >
                      {k}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-[18px] flex items-center gap-5 text-[length:var(--font-size-small)] leading-4">
                <span className="flex items-center gap-1.5 text-[var(--dashboard-label)]"><span aria-hidden className="h-0.5 w-2.5 rounded-[1px] bg-[var(--dashboard-chart-ink)]" />{periodLabel}<strong className="font-medium text-[var(--dashboard-figure)]">{metric.value}</strong></span>
                {comparable && metric.previous !== null && <span className="flex items-center gap-1.5 text-[var(--dashboard-label)]"><span aria-hidden className="h-0.5 w-2.5 rounded-[1px] bg-[var(--dashboard-chart-previous)]" />Previous {n} days<strong className="font-medium text-[var(--dashboard-figure)]">{formatMetricValue(metric.previous, metric.format)}</strong></span>}
                {/* eslint-disable-next-line no-restricted-syntax -- ds-allow: the legend's underlined text link (Figma 170:75736) */}
                <button type="button" onClick={() => onNotReady('Targets')} className={cn('cursor-pointer border-0 bg-transparent p-0 text-[length:var(--font-size-small)] text-[var(--dashboard-figure)] underline underline-offset-2', FOCUS)}>Set a target</button>
              </div>
              {!table && <LineChart metric={metric} series={series} variant="full" className="mt-6 h-[264px]" />}
              {table && (
                <table className="mt-5 w-full border-collapse text-[length:var(--font-size-body-sm)] leading-5">
                  <thead>
                    <tr className="text-left text-[length:var(--font-size-small)] text-[var(--dashboard-muted)]">
                      <th className="py-2 font-normal">Day</th><th className="py-2 text-right font-normal">This period</th><th className="py-2 text-right font-normal">{lastYear ? 'Last year' : compareName('previous')}</th><th className="py-2 text-right font-normal">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {series.days.map((d, i) => {
                      const p = series.comparable ? series.previous[i] : undefined
                      const rising = d.value != null && p?.value != null && d.value >= p.value
                      return (
                        <tr key={i} className="border-0 border-t border-solid border-[var(--neutral-200)]">
                          <td className="py-2 text-[var(--dashboard-label)]">{weekdayDayMonth(d.date)}</td>
                          <td className="py-2 text-right text-[var(--dashboard-figure)]">{d.value != null ? formatExact(d.value, metric.format) : 'No data'}</td>
                          <td className="py-2 text-right text-[var(--dashboard-muted)]">{p?.value != null ? `${formatExact(p.value, metric.format)} · ${dayMonth(p.date)}` : '—'}</td>
                          <td className={cn('py-2 text-right', d.value != null && p?.value != null ? (rising === metric.upIsGood ? 'text-[var(--dashboard-positive)]' : 'text-[var(--dashboard-negative)]') : 'text-[var(--dashboard-muted)]')}>
                            {d.value != null && p?.value != null ? changeLabel(d.value, p.value) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </>
          )}
          {tab === 'Target' && (
            view?.health
              ? <div className="flex items-center gap-2"><HealthPillView pill={view.health} withTarget /></div>
              : <EmptyTab text="This metric has no target yet." action={['Set a target', () => onNotReady('Targets')]} />
          )}
          {tab === 'Definition' && <p className="m-0 max-w-[560px] text-[length:var(--font-size-body)] leading-[var(--line-height-body)] text-[var(--dashboard-figure)]">{metric.definition || 'No definition for this metric yet.'}</p>}
          {tab === 'Sources' && <Sources apps={metric.apps} unmeasured={metric.unmeasured} />}
          {tab === 'Other related' && (
            related.length ? (
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {related.map((r) => (
                  <li key={r.id}>
                    {/* eslint-disable-next-line no-restricted-syntax -- ds-allow: a full-width row that opens another metric in this window */}
                    <button type="button" onClick={() => onOpenMetric(r.id)} className={cn('flex w-full cursor-pointer items-center justify-between rounded-lg border-0 bg-transparent px-2.5 py-2 text-left text-[length:var(--font-size-body-sm)] leading-5 hover:bg-[var(--dashboard-hover-band)]', FOCUS)}>
                      <span className="text-[var(--dashboard-figure)]">{r.label}</span>
                      <span className="text-[var(--dashboard-muted)]">{r.value}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : <EmptyTab text="No other cards on this board read from the same app." />
          )}
        </div>
      </div>
    </DialogContent>
  )
}

function EmptyTab({ text, action }: { text: string; action?: [string, () => void] }) {
  return (
    <div className="flex flex-col items-start gap-2 text-[length:var(--font-size-body-sm)] leading-5 text-[var(--dashboard-muted)]">
      <p className="m-0">{text}</p>
      {action && (
        // eslint-disable-next-line no-restricted-syntax -- ds-allow: underlined text action
        <button type="button" onClick={action[1]} className={cn('cursor-pointer border-0 bg-transparent p-0 text-[length:var(--font-size-body-sm)] text-[var(--dashboard-figure)] underline underline-offset-2', FOCUS)}>{action[0]}</button>
      )}
    </div>
  )
}

function Sources({ apps: ids, unmeasured }: { apps: AppId[]; unmeasured: string | null }) {
  const s = useSyncSnapshot()
  const { apps } = useDashboardData()
  // The reason says which: no app fills it, its first sync is still running, or its sync is failing.
  if (unmeasured) return <EmptyTab text={`This store can’t measure it yet: ${unmeasured}.`} />
  if (!ids.length) return <EmptyTab text="Built from this workspace’s own definition." />
  return (
    <ul className="m-0 flex list-none flex-col p-0">
      {ids.map((id) => apps.get(id)).filter((app): app is App => !!app).map((app) => {
        const a = s.apps[app.id]
        const state = a?.state
        const when = state === 'first' ? 'First sync…' : state === 'syncing' ? 'Syncing…' : state === 'failed' ? 'Sync failed' : a?.syncedAt != null ? `Synced ${ago(a.syncedAt, s.now).toLowerCase()}` : ''
        return (
          <li key={app.id} className="flex h-10 items-center gap-2.5 border-0 border-b border-solid border-[var(--neutral-200)] last:border-b-0">
            <SourceLogo app={app} className="size-4 shrink-0" />
            <span className="flex-1 text-[length:var(--font-size-body-sm)] text-[var(--dashboard-figure)]">{app.name}</span>
            <span className={cn('text-[length:var(--font-size-small)]', state === 'failed' ? 'text-[var(--dashboard-sync-failed)]' : 'text-[var(--dashboard-muted)]')}>{when}</span>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Add to board (Figma 170:81298, 170:81325; AC-22, AC-23): your boards you can edit, in tab order;
 * one that already has the metric says "Already on it" and can still be picked. The menu closes and
 * the window stays open.
 */
function AddToBoard({ metric, boards, onPick }: { metric: Metric; boards: Board[]; onPick: (boardId: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <PopoverRoot open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {/* eslint-disable-next-line no-restricted-syntax -- ds-allow: the window's white Add to board (Figma 170:81298) */}
        <button
          type="button"
          data-add-to-board
          className={cn('flex h-9 cursor-pointer items-center gap-1 rounded-lg border border-solid border-[var(--dashboard-hover-band)] bg-[var(--dashboard-card-bg)] pl-2.5 pr-3 text-[length:var(--font-size-body)] font-medium leading-[var(--line-height-body)] text-[var(--dashboard-figure)] shadow-[var(--dashboard-control-shadow)] hover:bg-[var(--neutral-100)]', FOCUS)}
        >
          <Plus aria-hidden size={16} strokeWidth={1.5} absoluteStrokeWidth />Add to board
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom" align="end" sideOffset={6} collisionPadding={8} variant="dropdown" maxHeight={false}
        // Inside the window, so the dialog doesn't treat the menu as outside it.
        portal={false}
        aria-label="Add to board"
        style={{ width: 260, boxShadow: 'var(--dashboard-popover-shadow)', borderRadius: 'var(--radius-xl)' }}
      >
        <div role="menu" aria-label="Your boards" className="flex flex-col p-1.5">
          <p className="m-0 py-1.5 pl-2.5 text-[length:var(--font-size-small)] font-medium leading-4 text-[var(--neutral-700)]">Your boards</p>
          {boards.map((b) => (
            // eslint-disable-next-line no-restricted-syntax -- ds-allow: a board row of the Add to board menu (Figma 170:81328)
            <button
              key={b.id}
              type="button"
              role="menuitem"
              data-board-option={b.id}
              onClick={() => { setOpen(false); onPick(b.id) }}
              className={cn('flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-lg border-0 bg-transparent px-2.5 text-left text-[length:var(--font-size-body-sm)] leading-5 text-[var(--dashboard-figure)] hover:bg-[var(--dashboard-sync-bg)] focus-visible:bg-[var(--dashboard-sync-bg)]', FOCUS)}
            >
              <LayoutGrid aria-hidden size={16} strokeWidth={1.5} absoluteStrokeWidth className="shrink-0 text-[var(--dashboard-label)]" />
              <span className="min-w-0 flex-1 truncate">{b.label}</span>
              {b.cards.some((c) => Metrics.base(c.metricId) === metric.id) && (
                <span className="shrink-0 rounded-full bg-[var(--dashboard-sync-bg)] px-2 py-0.5 text-[length:var(--font-size-caption)] font-medium leading-4 text-[var(--neutral-700)]">Already on it</span>
              )}
            </button>
          ))}
        </div>
      </PopoverContent>
    </PopoverRoot>
  )
}
