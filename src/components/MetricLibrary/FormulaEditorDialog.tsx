'use client'

import { useId, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/Button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useGuardedRouter } from '@/context/nav-guard-context'
import type { MetricEntry, MetricExpression } from '@/lib/api/warehouse'
import { metricNameOf, printFormula } from '@/lib/metrics/formula'
import { rememberFormula } from '@/lib/metrics/registry'
import { checkPieces, piecesFromValue, type Piece } from '@/lib/metrics/tokens'
import { dashboardMetricRoute } from '@/lib/routes'
import { usePutMetric } from '@/lib/warehouse/queries'
import { ComparePreview } from './ComparePreview'
import { FormulaField } from './FormulaField'
import { useLibrary } from './useLibrary'
import styles from './MetricLibrary.module.css'

export interface FormulaEditorDialogProps {
  entry: MetricEntry
  /**
   * `edit`: change a custom metric's formula; saving replaces it under the same name.
   * `try`: write your own version of a built-in; saving adds a new custom metric and leaves the built-in alone
   * (adjusting a built-in in place needs S4).
   */
  mode: 'edit' | 'try'
  /** The custom metric's current formula, for `edit`. */
  current?: MetricExpression
  onClose: () => void
}

/** A formula in pills, checked as you type, with the number now beside the number it would give. */
export function FormulaEditorDialog({ entry, mode, current, onClose }: FormulaEditorDialogProps) {
  const library = useLibrary()
  const { push } = useGuardedRouter()
  const put = usePutMetric()
  const formulaLabel = useId()
  const [pending, setPending] = useState<Piece | null>(null)
  const [pieces, setPieces] = useState<Piece[]>(() => (current ? piecesFromValue(current) : []))
  const [label, setLabel] = useState(mode === 'edit' ? entry.label : `${entry.label} (ours)`)
  const [description, setDescription] = useState(mode === 'edit' ? entry.description : '')

  const name = mode === 'edit' ? entry.name : metricNameOf(label)
  const names = useMemo(() => library.entries.map(e => e.name), [library.entries])
  const check = checkPieces(pending ? [...pieces, pending] : pieces, names, name || undefined)
  const value = check.result?.ok ? check.result.value : null
  const unchanged = mode === 'edit' && current !== undefined && check.text === printFormula(current)
  const existing = mode === 'try' && name !== '' ? library.byName.get(name) : undefined
  const clash = existing !== undefined && existing.category !== 'custom'
  const canSave = value !== null && !unchanged && !clash && name !== '' && label.trim() !== '' && !put.isPending
  const workspaceId = library.workspace.data?.id

  // Hold the preview's formula steady while a word is half-typed: it only changes when the pieces read.
  const previewKey = value ? JSON.stringify(value) : ''
  const previewValue = useMemo(() => (previewKey ? (JSON.parse(previewKey) as MetricExpression) : null), [previewKey])

  const save = async () => {
    if (!canSave || value === null) return
    const metric = { name, label: label.trim(), unit: entry.unit, description: description.trim() || printFormula(value, { pretty: true, labelOf: library.labelOf }), value }
    try {
      await put.mutateAsync(metric)
      if (workspaceId) rememberFormula(workspaceId, metric.name, metric.value)
      toast.success(mode === 'edit' ? `${metric.label} updated` : `${metric.label} added to the library`)
      onClose()
      if (mode === 'try') push(dashboardMetricRoute(metric.name))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Couldn’t save the metric.')
    }
  }

  return (
    <Dialog open onOpenChange={next => { if (!next && !put.isPending) onClose() }}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{mode === 'edit' ? `Edit ${entry.label}` : `Your own ${entry.label}`}</DialogTitle>
          <DialogDescription>
            {mode === 'edit'
              ? 'Change the formula and see the number now beside the number it would give, before anything is saved.'
              : `Write how you work it out. You'll see Souvenir's ${entry.label} beside yours. Saving adds yours as a custom metric; ${entry.label} stays as it is.`}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className={styles.createBody}>
          {mode === 'try' && (
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Name</span>
              <input className={styles.input} value={label} onChange={event => setLabel(event.target.value)} />
            </label>
          )}

          <div className={styles.field}>
            <span className={styles.fieldLabel} id={formulaLabel}>Formula</span>
            <FormulaField
              pieces={pieces}
              onChange={setPieces}
              onPending={setPending}
              entries={library.entries}
              self={name || undefined}
              errorAt={check.errorAt}
              invalid={check.result !== null && !check.result.ok && !check.incomplete}
              labelledBy={formulaLabel}
              autoFocus
            />
            {check.result && !check.result.ok
              ? <span className={check.incomplete ? styles.fieldHint : styles.fieldError} role={check.incomplete ? undefined : 'alert'}>{check.incomplete ? 'Add a metric or a number to finish it.' : check.result.error.message}</span>
              : <span className={styles.fieldHint}>Type a metric&apos;s name and pick it, then + − × ÷ or brackets. Numbers work too, like × 0.9.</span>}
            {check.text !== '' && (
              <details className={styles.details}>
                <summary>Technical details</summary>
                <code>{check.text}</code>
              </details>
            )}
          </div>

          {mode === 'edit' && (
            <label className={styles.field}>
              <span className={styles.fieldLabel}>What it means</span>
              <textarea className={styles.textarea} rows={2} value={description} onChange={event => setDescription(event.target.value)} />
            </label>
          )}

          {previewValue && !unchanged && <ComparePreview name={name || 'your_formula'} label={mode === 'try' ? label.trim() || undefined : undefined} baseName={entry.name} value={previewValue} />}
          {unchanged && <p className={styles.fieldHint}>Change the formula to see the new number beside today&apos;s.</p>}
          {clash && existing && (
            <p className={styles.warning} role="status">
              There&apos;s already a built-in metric called {existing.label}. Give yours another name.
            </p>
          )}
          {existing && !clash && <p className={styles.warning} role="status">Saving replaces your custom metric {existing.label}.</p>}
        </DialogBody>

        <DialogFooter>
          <span className={styles.dialogFooterNote}>
            {mode === 'edit' ? 'Saving changes it for everyone in your organization.' : 'Saving adds it for everyone in your organization.'}
          </span>
          <Button variant="secondary" disabled={put.isPending} onClick={onClose}>Cancel</Button>
          <Button disabled={!canSave} loading={put.isPending} onClick={() => { void save() }}>
            {mode === 'edit' ? 'Save changes' : 'Add to library'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
