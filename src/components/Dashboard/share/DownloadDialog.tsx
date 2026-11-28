'use client'

import { useState } from 'react'
import { FileSpreadsheet, Image as ImageIcon, TriangleAlert, X } from 'lucide-react'
import { Button, IconButton } from '@/components/ui'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useDashboardData } from '../live/dashboard-data'
import type { Board } from '../tabs/board-state'
import { datesLabel } from './share-model'

// One Download dialog in More, for everyone (Figma 174:57768; 09 SH-31 – SH-37), Option B: Image (the
// board) or Numbers (any cards, one sheet).

const FOCUS = 'outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]'

interface DownloadDialogProps {
  open: boolean
  board: Board
  period: string
  compare: string
  onClose: () => void
  /** The image: the dialog closes and a toast takes over (SH-33). */
  onImage: () => void
  /** The numbers: resolves once saved; rejects to show the failure line (SH-36). */
  onNumbers: (metricIds: string[]) => Promise<void>
}

export function DownloadDialog({ open, ...rest }: DownloadDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) rest.onClose() }}>
      {open && <Download {...rest} />}
    </Dialog>
  )
}

function Download({ board, period, compare, onClose, onImage, onNumbers }: Omit<DownloadDialogProps, 'open'>) {
  const { metrics } = useDashboardData()
  const ids = [...new Set(board.cards.map((c) => c.metricId))]
  const [kind, setKind] = useState<'image' | 'numbers'>('image')
  const [ticked, setTicked] = useState(() => ids)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const go = () => {
    if (kind === 'image') { onImage(); return }
    setBusy(true)
    setFailed(false)
    // Ticked in the board's order.
    onNumbers(ids.filter((id) => ticked.includes(id))).then(
      () => setBusy(false),
      () => { setBusy(false); setFailed(true) },
    )
  }

  return (
    <DialogContent
      hideClose
      aria-describedby={undefined}
      data-download-dialog
      style={{ width: 'min(520px, calc(100vw - 32px))', maxWidth: 'none', maxHeight: 'calc(100dvh - 96px)', borderRadius: 'var(--radius-2xl)', padding: 0, background: 'var(--dashboard-card-bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
    >
      <div className="relative flex shrink-0 items-center px-5 pb-3 pt-5">
        <DialogTitle className="min-w-0 truncate pr-8 text-[length:var(--font-size-body-lg)] font-semibold leading-6 text-[var(--dashboard-figure)]">Download “{board.label}”</DialogTitle>
        <DialogClose asChild>
          <IconButton variant="ghost" size="sm" iconSize={14} aria-label="Close" className="absolute right-3.5 top-4 size-7 rounded-md" icon={<X strokeWidth={1.5} absoluteStrokeWidth />} />
        </DialogClose>
      </div>

      <div className="kaya-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5">
        <div role="radiogroup" aria-label="What to download" className="grid grid-cols-2 gap-2">
          {([
            ['image', 'Image', 'The board as it looks, as a PNG', ImageIcon],
            ['numbers', 'Numbers', 'A spreadsheet, one row per day', FileSpreadsheet],
          ] as const).map(([k, label, line, Icon]) => (
            // eslint-disable-next-line no-restricted-syntax -- ds-allow: a download kind tile (Figma 174:57768)
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              data-kind={k}
              onClick={() => { setKind(k); setFailed(false) }}
              className={cn(
                'flex cursor-pointer flex-col items-start gap-0.5 rounded-xl border border-solid bg-[var(--dashboard-card-bg)] px-3 py-2.5 text-left',
                kind === k ? 'border-[var(--dashboard-figure)]' : 'border-[var(--neutral-200)] hover:border-[var(--dashboard-way-border)]',
                FOCUS,
              )}
            >
              <span className="flex items-center gap-1.5 text-[length:var(--font-size-body)] font-medium leading-5 text-[var(--dashboard-figure)]"><Icon aria-hidden size={15} strokeWidth={1.5} absoluteStrokeWidth />{label}</span>
              <span className="pl-[var(--dashboard-download-note-indent)] text-[length:var(--font-size-small)] leading-4 text-[var(--dashboard-label)]">{line}</span>
            </button>
          ))}
        </div>

        {kind === 'numbers' && (
          <>
            <p className="m-0 text-[length:var(--font-size-small)] font-medium leading-4 text-[var(--dashboard-label)]">Cards</p>
            <ul data-download-cards className="m-0 grid list-none grid-cols-2 gap-x-4 gap-y-1 p-0">
              {ids.map((id) => {
                const m = metrics.get(id)
                const on = ticked.includes(id)
                return (
                  <li key={id}>
                    <label data-card-option={id} className="flex h-7 cursor-pointer items-center gap-2 text-[length:var(--font-size-body-sm)] leading-5 text-[var(--dashboard-figure)]">
                      {/* eslint-disable-next-line no-restricted-syntax -- ds-allow: a native checkbox in the card list */}
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => setTicked((t) => (on ? t.filter((x) => x !== id) : [...t, id]))}
                        className="size-4 accent-[var(--neutral-900)]"
                      />
                      <span className="min-w-0 truncate">{m?.label ?? id}</span>
                    </label>
                  </li>
                )
              })}
            </ul>
            <p className="m-0 text-[length:var(--font-size-small)] leading-4 text-[var(--dashboard-label)]">
              One sheet for {datesLabel(period, compare)}: a row per day, each card’s figure{compare === 'none' ? '' : ' with its comparison beside it'}.
            </p>
            {failed && (
              <p role="alert" data-download-failed className="m-0 flex items-center gap-1.5 text-[length:var(--font-size-small)] leading-4 text-[var(--dashboard-error)]">
                <TriangleAlert aria-hidden size={12} strokeWidth={1.5} absoluteStrokeWidth />Couldn’t download the numbers. Try again.
              </p>
            )}
          </>
        )}
      </div>

      <div className="mt-4 flex shrink-0 items-center justify-end gap-2 px-5 pb-5">
        <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" data-download-go loading={busy} disabled={kind === 'numbers' && !ticked.length} onClick={go}>
          {busy ? 'Preparing…' : 'Download'}
        </Button>
      </div>
    </DialogContent>
  )
}
