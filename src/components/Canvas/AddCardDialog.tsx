'use client'

import { useState } from 'react'
import { Check, Search } from 'lucide-react'
import type { MetricEntry } from '@/lib/api/warehouse'
import { categoryName, categoryOrder } from '@/lib/metrics/display'
import { Button } from '@/components/Button'
import { InputField } from '@/components/InputField'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import styles from './Canvas.module.css'

/**
 * Pick one or several metrics from the catalog; their cards land at the end of the board, each at a size that suits
 * it. How a card shows its metric is chosen on the card afterwards.
 */
export function AddCardDialog({ catalog, onBoard, onAdd, onClose }: {
  catalog: MetricEntry[]
  /** Metrics already on the board, marked in the list. */
  onBoard: ReadonlySet<string>
  onAdd: (metrics: string[]) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<string[]>([])

  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const matches = catalog.filter(m => {
    const text = `${m.label} ${m.name} ${m.description} ${categoryName(m.category)}`.toLowerCase()
    return words.every(w => text.includes(w))
  })
  const groups = categoryOrder(matches.map(m => m.category)).map(category => ({
    category,
    metrics: matches.filter(m => m.category === category),
  }))
  const toggle = (name: string) => setPicked(list => (list.includes(name) ? list.filter(n => n !== name) : [...list, name]))
  const labelOf = (name: string) => catalog.find(m => m.name === name)?.label ?? name

  const add = () => {
    if (picked.length === 0) return
    onAdd(picked)
    onClose()
  }

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent size="md" style={{ display: 'flex', flexDirection: 'column', maxHeight: 'min(86vh, 720px)' }}>
        <DialogHeader>
          <DialogTitle>Add metrics</DialogTitle>
          <DialogDescription>Pick one metric or several.</DialogDescription>
        </DialogHeader>
        <DialogBody style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 12 }}>
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
          <div className={styles.pickList} role="listbox" aria-label="Metrics" aria-multiselectable>
            {groups.length === 0 && <p className={styles.noMatch}>No metric matches “{query.trim()}”.</p>}
            {groups.map(group => (
              <section key={group.category} className={styles.pickGroup} aria-label={categoryName(group.category)}>
                <h4 className={styles.pickGroupTitle}>{categoryName(group.category)}</h4>
                {group.metrics.map(m => {
                  const on = picked.includes(m.name)
                  return (
                    <button
                      key={m.name}
                      type="button"
                      role="option"
                      aria-selected={on}
                      className={styles.pickRow}
                      onClick={() => toggle(m.name)}
                    >
                      <span className={styles.pickLabel}>{m.label}</span>
                      <span className={styles.pickTag}>
                        {on ? <Check size={16} strokeWidth={2} aria-hidden /> : onBoard.has(m.name) ? 'On board' : null}
                      </span>
                      {m.description && <span className={styles.pickDescription}>{m.description}</span>}
                    </button>
                  )
                })}
              </section>
            ))}
          </div>
        </DialogBody>
        <DialogFooter style={{ justifyContent: 'space-between', paddingTop: 0 }}>
          <span className={styles.pickCount} aria-live="polite">
            {picked.length === 0 ? '' : picked.length === 1 ? labelOf(picked[0]) : `${picked.length} metrics`}
          </span>
          <Button onClick={add} disabled={picked.length === 0}>
            {picked.length > 1 ? `Add ${picked.length} metrics` : 'Add metric'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
