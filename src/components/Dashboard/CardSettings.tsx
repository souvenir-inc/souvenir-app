'use client'

import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Copy, FileSpreadsheet, Image as ImageIcon, Search, Trash2, TriangleAlert, X } from 'lucide-react'
import { Button, IconButton, Input, SegmentedControl } from '@/components/ui'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { userFullName, useAuth } from '@/context/auth-context'
import { cn } from '@/lib/utils'
import { catalogOf, groupOf } from './catalog'
import { dims } from './grid-layout'
import { StillCards, barsBySize, type CardView } from './MetricCard'
import { PLAIN_BUTTON } from './plain-button'
import { useDashboardData } from './live/dashboard-data'
import { Metrics } from './live/metrics'
import { BoardSnapshot } from './share/BoardSnapshot'
import { fileBase, nodeToPng, numbersCsv, saveFile } from './share/export'
import type { BoardCard, Metric } from './types'

// A card's own settings (Figma 19:6354, 19:6807; S-8's look 174:56384; 10-cards-reference-rules.md
// CS-1 – CS-9): its metric (Change searches the catalog), its chart, and Duplicate, the two downloads
// and Remove. The board decides the dates; the target lives with the metric.

const FOCUS = 'outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]'

interface CardSettingsProps {
  card: BoardCard | null
  period: string
  compare: string
  /** How the card reads now, for its image. */
  cardView: (cardId: string) => CardView | undefined
  stamp: string
  /** Can this metric be picked: measured, and its apps connected (CS-4). */
  pickable: (m: Metric) => boolean
  onClose: () => void
  onSwap: (metricId: string) => void
  onChart: (chart: 'trend' | 'bars') => void
  onDuplicate: () => void
  onRemove: () => void
}

export function CardSettings({ card, ...rest }: CardSettingsProps) {
  return (
    <Dialog open={!!card} onOpenChange={(o) => { if (!o) rest.onClose() }}>
      {card && <Settings key={card.metricId} card={card} {...rest} />}
    </Dialog>
  )
}

function Settings({ card, period, compare, cardView, stamp, pickable, onSwap, onChart, onDuplicate, onRemove }: Omit<CardSettingsProps, 'card' | 'onClose'> & { card: BoardCard }) {
  const { metrics, apps, today } = useDashboardData()
  const { user } = useAuth()
  const metric = metrics.get(card.metricId)
  const [changing, setChanging] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [failed, setFailed] = useState<'numbers' | 'image' | null>(null)
  // The image is being made: the card is drawn off screen until it's a PNG.
  const [shooting, setShooting] = useState(false)
  if (!metric) return null
  const bars = card.chart ? card.chart === 'bars' : barsBySize(card.size)
  const current = Metrics.base(card.metricId)

  // The catalog search (CS-4): matching names, or everything when empty.
  const q = query.trim().toLowerCase()
  const list = catalogOf(metrics.all).filter((m) => !q || m.label.toLowerCase().includes(q) || groupOf(m, apps).toLowerCase().includes(q))
  const choosable = list.filter((m) => m.id !== current && pickable(m))
  const pick = (m: Metric) => {
    if (m.id === current) { setChanging(false); return }
    if (!pickable(m)) return
    onSwap(m.id)
    setChanging(false)
    setQuery('')
  }
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (choosable.length) setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + choosable.length) % choosable.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (choosable[active]) pick(choosable[active])
    } else if (e.key === 'Escape') {
      // Esc goes back to the field, not out of the dialog (CS-4).
      e.preventDefault()
      e.stopPropagation()
      setChanging(false)
      setQuery('')
    }
  }

  const file = fileBase(metric.label, period, today)
  // The numbers are already here: the file is made and saved at once, no waiting.
  const downloadNumbers = () => {
    setFailed(null)
    try {
      const csv = numbersCsv({ title: metric.label, metrics: [metric], period, compare, by: userFullName(user), on: today })
      saveFile(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${file}.csv`)
    } catch {
      setFailed('numbers')
    }
  }
  // The card is drawn off screen (CardShot), then into a PNG (S-9b).
  const downloadImage = () => {
    setFailed(null)
    setShooting(true)
  }
  const shot = (blob: Blob | null) => {
    setShooting(false)
    if (blob) saveFile(blob, `${file}.png`)
    else setFailed('image')
  }

  const action = cn('gap-1.5')
  const { w } = dims(card.size)
  return (
    <DialogContent
      hideClose
      aria-describedby={undefined}
      data-card-settings={card.metricId}
      style={{ width: 'min(460px, calc(100vw - 32px))', maxWidth: 'none', maxHeight: 'calc(100dvh - 96px)', borderRadius: 'var(--radius-xl)', padding: 0, background: 'var(--dashboard-card-bg)', display: 'flex', flexDirection: 'column' }}
      onEscapeKeyDown={(e) => { if (changing) { e.preventDefault(); setChanging(false); setQuery('') } }}
    >
      <div className="relative flex shrink-0 items-center px-5 pb-3 pt-5">
        <DialogTitle className="min-w-0 truncate pr-8 text-[length:var(--font-size-body-lg)] font-semibold leading-6 text-[var(--dashboard-figure)]">{metric.label}</DialogTitle>
        <DialogClose asChild>
          <IconButton variant="ghost" size="sm" iconSize={14} aria-label="Close" className="absolute right-3.5 top-4 size-7 rounded-md" icon={<X strokeWidth={1.5} absoluteStrokeWidth />} />
        </DialogClose>
      </div>

      <div className="kaya-scrollbar flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-5 pb-5">
        <div className="flex items-center justify-between">
          <p className="m-0 text-[length:var(--font-size-small)] font-medium leading-4 text-[var(--dashboard-label)]">Metric</p>
          {changing && (
            // Keep this metric, a text link (Figma 19:7214).
            <Button variant="link" onClick={() => { setChanging(false); setQuery('') }} className={cn(PLAIN_BUTTON, 'cursor-pointer !rounded-sm border-0 bg-transparent p-0 text-[length:var(--font-size-small)] font-medium leading-4 text-[var(--dashboard-figure)] underline underline-offset-2 hover:underline', FOCUS)}>
              Keep this metric
            </Button>
          )}
        </div>
        {changing ? (
          <div data-metric-search className="flex flex-col gap-1">
            {/* The catalog search (Figma 19:7214), on the Input primitive. */}
            <Input
              fluid
              autoFocus
              role="combobox"
              aria-expanded
              aria-controls="card-metrics"
              aria-activedescendant={choosable[active] ? `card-metric-${choosable[active].id}` : undefined}
              aria-label="Search metrics"
              placeholder="Search metrics"
              leftIcon={<Search size={14} strokeWidth={1.5} absoluteStrokeWidth />}
              value={query}
              onChange={(value) => { setQuery(value); setActive(0) }}
              onKeyDown={onKey}
            />
            <ul id="card-metrics" role="listbox" aria-label="Metrics" className="kaya-scrollbar m-0 max-h-[240px] list-none overflow-y-auto p-0">
              {list.length === 0 && <li className="px-2 py-2 text-[length:var(--font-size-body-sm)] text-[var(--dashboard-label)]">No metrics match “{query.trim()}”.</li>}
              {list.map((m) => {
                const can = m.id === current || pickable(m)
                const on = choosable[active]?.id === m.id
                return (
                  <li
                    key={m.id}
                    id={`card-metric-${m.id}`}
                    role="option"
                    aria-selected={m.id === current}
                    aria-disabled={!can}
                    data-metric-option={m.id}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(m)}
                    className={cn('flex items-center gap-2 rounded-lg px-2 py-1.5', can ? 'cursor-pointer hover:bg-[var(--dashboard-sync-bg)]' : 'cursor-default opacity-50', (on || m.id === current) && 'bg-[var(--dashboard-sync-bg)]')}
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[length:var(--font-size-body)] leading-5 text-[var(--dashboard-figure)]">{m.label}</span>
                      <span className="truncate text-[length:var(--font-size-small)] leading-4 text-[var(--dashboard-label)]">{groupOf(m, apps)}</span>
                    </span>
                    {m.id === current && <Check aria-hidden size={14} strokeWidth={1.5} absoluteStrokeWidth />}
                  </li>
                )
              })}
            </ul>
          </div>
        ) : (
          <div className="flex h-10 items-center gap-2 rounded-lg border border-solid border-[var(--neutral-200)] bg-[var(--dashboard-panel-bg)] pl-3 pr-1">
            <span data-metric-name className="min-w-0 flex-1 truncate text-[length:var(--font-size-body)] text-[var(--dashboard-figure)]">{metric.label}</span>
            <Button variant="outline" size="sm" data-change-metric onClick={() => setChanging(true)}>Change</Button>
          </div>
        )}

        <p className="m-0 pt-2 text-[length:var(--font-size-small)] font-medium leading-4 text-[var(--dashboard-label)]">Chart</p>
        {/* The Trend | Weekly bars switch (Figma 19:6761, S-8). */}
        <div data-chart={bars ? 'bars' : 'trend'} className="w-fit">
          <SegmentedControl<'trend' | 'bars'>
            aria-label="Chart"
            size="md"
            value={bars ? 'bars' : 'trend'}
            onValueChange={(k) => { if ((k === 'bars') !== bars) onChart(k) }}
            options={[
              { value: 'trend', label: <span data-chart-option="trend">Trend</span> },
              { value: 'bars', label: <span data-chart-option="bars">Weekly bars</span> },
            ]}
          />
        </div>

        <div className="flex flex-wrap gap-2 pt-3 max-[760px]:flex-col max-[760px]:items-stretch">
          <Button variant="outline" size="sm" data-card-action="duplicate" className={action} leftIcon={<Copy aria-hidden strokeWidth={1.5} absoluteStrokeWidth />} onClick={onDuplicate}>Duplicate</Button>
          <Button variant="outline" size="sm" data-card-action="numbers" disabled={shooting} leftIcon={<FileSpreadsheet aria-hidden strokeWidth={1.5} absoluteStrokeWidth />} onClick={downloadNumbers}>
            Download numbers
          </Button>
          <Button variant="outline" size="sm" data-card-action="image" loading={shooting} leftIcon={<ImageIcon aria-hidden strokeWidth={1.5} absoluteStrokeWidth />} onClick={downloadImage}>
            {shooting ? 'Preparing…' : 'Download image'}
          </Button>
          <Button variant="outline" size="sm" data-card-action="remove" leftIcon={<Trash2 aria-hidden strokeWidth={1.5} absoluteStrokeWidth />} onClick={onRemove}>Remove</Button>
        </div>
        {failed && (
          <p role="alert" data-card-download-failed className="m-0 flex items-center gap-1.5 pt-1 text-[length:var(--font-size-small)] leading-4 text-[var(--dashboard-error)]">
            <TriangleAlert aria-hidden size={12} strokeWidth={1.5} absoluteStrokeWidth />
            {failed === 'numbers' ? 'Couldn’t download the numbers. Try again.' : 'Couldn’t download the image.'}
          </p>
        )}
      </div>

      {/* The card drawn off screen for its image, with the stamp (S-9b). */}
      {shooting && <CardShot card={card} cardView={cardView} stamp={stamp} columns={w} onDone={shot} />}
    </DialogContent>
  )
}

interface CardShotProps {
  card: BoardCard
  cardView: (cardId: string) => CardView | undefined
  stamp: string
  columns: number
  /** The PNG, or null when it couldn't be made. */
  onDone: (blob: Blob | null) => void
}

/**
 * The card drawn off screen for its image, with the stamp (S-9b). Its numbers are drawn still
 * (StillCards: no fade-in to wait for), so it's turned into a PNG on the frame after it lays out.
 * Unmounting (the dialog closing) cancels the frame and drops a late result.
 */
function CardShot({ card, cardView, stamp, columns, onDone }: CardShotProps) {
  const ref = useRef<HTMLDivElement>(null)
  const done = useEffectEvent(onDone)
  useEffect(() => {
    let live = true
    const frame = requestAnimationFrame(() => {
      const node = ref.current
      const job = node ? nodeToPng(node) : Promise.reject(new Error('no image'))
      job.then((blob) => { if (live) done(blob) }, () => { if (live) done(null) })
    })
    return () => { live = false; cancelAnimationFrame(frame) }
  }, [])
  return createPortal(
    <div aria-hidden style={{ position: 'fixed', left: 0, top: 0, transform: 'translateX(-200vw)', pointerEvents: 'none' }}>
      <StillCards value>
        <BoardSnapshot ref={ref} cards={[{ ...card, x: 0, y: 0 }]} cardView={cardView} stamp={stamp} columns={columns} />
      </StillCards>
    </div>,
    document.body,
  )
}
