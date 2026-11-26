'use client'

import { useState } from 'react'
import { Check, Copy, Download, Image as ImageIcon, Search, Trash2 } from 'lucide-react'
import type { MetricEntry } from '@/lib/api/warehouse'
import { categoryName } from '@/lib/metrics/display'
import { Button } from '@/components/Button'
import { InputField } from '@/components/InputField'
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CHART_LABEL, chartsFor, type BoardCard, type CardKind } from './board'
import styles from './Canvas.module.css'

export interface CardSheetProps {
  card: BoardCard
  entry: MetricEntry | undefined
  catalog: MetricEntry[]
  /** Swaps the card's metric; it keeps its size and place. */
  onSwap: (metric: string) => void
  onChart: (kind: CardKind) => void
  onDuplicate: () => void
  onRemove: () => void
  /** The card's numbers for the board's dates, as a spreadsheet. */
  onDownloadNumbers: () => Promise<void>
  /** The card as an image. */
  onDownloadImage: () => Promise<void>
  onClose: () => void
}

/**
 * A card's own settings, from the card itself in edit mode: its metric and its chart. The board decides its dates and
 * comparison; the metric's target lives with the metric. Plus what you can do with the card.
 */
export function CardSheet({
  card, entry, catalog, onSwap, onChart, onDuplicate, onRemove, onDownloadNumbers, onDownloadImage, onClose,
}: CardSheetProps) {
  const [swapping, setSwapping] = useState(false)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<'numbers' | 'image' | null>(null)
  const [failed, setFailed] = useState<'numbers' | 'image' | null>(null)
  const label = entry?.label ?? card.metric
  const charts = chartsFor(entry?.unit)
  const shownKind: CardKind = card.kind === 'weekly' ? 'weekly' : 'number'

  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const matches = catalog.filter(m => {
    const text = `${m.label} ${m.name} ${categoryName(m.category)}`.toLowerCase()
    return words.every(w => text.includes(w))
  })

  const run = async (what: 'numbers' | 'image', task: () => Promise<void>) => {
    setBusy(what)
    setFailed(null)
    try {
      await task()
    } catch {
      setFailed(what)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent size="sm" style={{ display: 'flex', flexDirection: 'column', maxHeight: 'min(86vh, 640px)' }}>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
        </DialogHeader>
        <DialogBody style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingBottom: 16 }}>
          <section className={styles.sheetSection} aria-label="Metric">
            <div className={styles.sheetRow}>
              <span className={styles.sheetLabel}>Metric</span>
              <button type="button" className={styles.linkButton} onClick={() => setSwapping(!swapping)} aria-expanded={swapping}>
                {swapping ? 'Keep this metric' : 'Change'}
              </button>
            </div>
            {swapping && (
              <>
                <InputField
                  fluid
                  showLabel={false}
                  showSubtitle={false}
                  aria-label="Search metrics"
                  placeholder="Search metrics"
                  leftIcon={<Search size={16} strokeWidth={1.75} aria-hidden />}
                  value={query}
                  onChange={setQuery}
                  autoFocus
                />
                <div className={styles.sheetPick} role="listbox" aria-label="Metrics">
                  {matches.length === 0 && <p className={styles.noMatch}>No metric matches “{query.trim()}”.</p>}
                  {matches.map(m => (
                    <button key={m.name} type="button" role="option" aria-selected={m.name === card.metric} className={styles.pickRow}
                      onClick={() => { if (m.name !== card.metric) onSwap(m.name); setSwapping(false) }}>
                      <span className={styles.pickLabel}>{m.label}</span>
                      <span className={styles.pickTag}>
                        {m.name === card.metric ? <Check size={16} strokeWidth={2} aria-hidden /> : categoryName(m.category)}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </section>

          {charts.length > 1 && (
            <section className={styles.sheetSection} aria-label="Chart">
              <span className={styles.sheetLabel}>Chart</span>
              <div className={styles.kinds} role="radiogroup" aria-label="Chart">
                {charts.map(kind => (
                  <button key={kind} type="button" role="radio" aria-checked={kind === shownKind} className={styles.kind}
                    onClick={() => { if (kind !== shownKind) onChart(kind) }}>
                    {CHART_LABEL[kind]}
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className={styles.sheetActions} aria-label="Card">
            <Button variant="secondary" leftIcon={<Copy size={15} strokeWidth={1.75} aria-hidden />} onClick={() => { onDuplicate(); onClose() }}>
              Duplicate
            </Button>
            <Button variant="secondary" leftIcon={<Download size={15} strokeWidth={1.75} aria-hidden />}
              disabled={busy !== null} onClick={() => { void run('numbers', onDownloadNumbers) }}>
              {busy === 'numbers' ? 'Preparing…' : 'Download numbers'}
            </Button>
            <Button variant="secondary" leftIcon={<ImageIcon size={15} strokeWidth={1.75} aria-hidden />}
              disabled={busy !== null} onClick={() => { void run('image', onDownloadImage) }}>
              {busy === 'image' ? 'Preparing…' : 'Download image'}
            </Button>
            <Button variant="secondary" leftIcon={<Trash2 size={15} strokeWidth={1.75} aria-hidden />} onClick={() => { onRemove(); onClose() }}>
              Remove
            </Button>
          </section>
          {failed && (
            <p className={styles.sheetError} role="alert">
              Couldn’t download the {failed === 'numbers' ? 'numbers' : 'image'}. Try again.
            </p>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
