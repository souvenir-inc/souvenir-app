'use client'

import { useId, useState } from 'react'
import { z } from 'zod'
import { ConfirmModal } from '@/components/ConfirmModal'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Textarea } from '@/components/ui/textarea'
import { useGuardedRouter } from '@/context/nav-guard-context'
import { useZodForm } from '@/hooks/use-zod-form'
import type { MetricEntry } from '@/lib/api/warehouse'
import { originOf } from '@/lib/metrics/catalog'
import { metricNameOf, printFormula } from '@/lib/metrics/formula'
import { checkPieces, piecesFromValue, type Piece } from '@/lib/metrics/tokens'
import { isAggregate } from '@/lib/metrics/tree'
import { DASHBOARD_METRIC_ROUTE } from '@/lib/routes'
import { ComparePreview } from './ComparePreview'
import { FormulaField } from './FormulaField'
import type { Library, WindowId, WindowRange } from './use-library'
import { useMetricActions } from './use-metric-actions'

const LABEL_MAX = 120
const DESCRIPTION_MAX = 500
const schema = z.object({
  label: z.string().trim().min(1, 'Give it a name.').max(LABEL_MAX, `A name can be at most ${LABEL_MAX} characters.`),
  description: z.string().trim().max(DESCRIPTION_MAX, `A description can be at most ${DESCRIPTION_MAX} characters.`),
})

type SaveAs = 'replace' | 'new'

export interface FormulaEditorDialogProps {
  library: Library
  entry: MetricEntry
  windowId: WindowId
  range: WindowRange
  onClose: () => void
}

/**
 * A formula in pills, checked as you type, with the number now beside the number it would give. A custom metric
 * is changed in place. A library metric can be replaced for this workspace (the warehouse keeps it as the
 * workspace's own definition) or added beside it as a new metric. Either way it is saved unconfirmed.
 */
export function FormulaEditorDialog({ library, entry, windowId, range, onClose }: FormulaEditorDialogProps) {
  const custom = originOf(entry) === 'custom'
  const actions = useMetricActions(library)
  const { push } = useGuardedRouter()
  const formulaLabel = useId()
  const formulaHint = useId()
  const start = isAggregate(entry.value) ? [] : piecesFromValue(entry.value)
  const [pieces, setPieces] = useState<Piece[]>(start)
  const [pending, setPending] = useState<Piece | null>(null)
  const [saveAs, setSaveAs] = useState<SaveAs>('replace')
  const [discarding, setDiscarding] = useState(false)
  const form = useZodForm(schema, { label: entry.label, description: entry.description })

  const name = saveAs === 'new' ? metricNameOf(form.values.label) : entry.name
  const check = checkPieces(pending ? [...pieces, pending] : pieces, library.entries.map(e => e.name), name || undefined)
  const value = check.result?.ok ? check.result.value : null
  const unchanged = value !== null && !isAggregate(entry.value) && printFormula(value) === printFormula(entry.value)
  const existing = saveAs === 'new' && name !== '' ? library.byName.get(name) : undefined
  const clash = existing !== undefined && originOf(existing) !== 'custom'
  const canSave = value !== null && !unchanged && !clash && name !== '' && form.isValid && !actions.saving
  const dirty = form.isDirty || check.text !== printFormula(entry.value)

  const close = () => { if (actions.saving) return; if (dirty) setDiscarding(true); else onClose() }

  const save = form.handleSubmit(async data => {
    if (!canSave || value === null) return
    const label = saveAs === 'new' ? data.label : custom ? data.label : entry.label
    const description = data.description || printFormula(value, { pretty: true, labelOf: library.labelOf })
    const done = custom ? `${label} updated` : saveAs === 'replace' ? `${label} now uses your formula in this workspace` : `${label} added to the library`
    const saved = await actions.save({ name, label, unit: entry.unit, description, value, verified: false }, done)
    if (!saved) return
    onClose()
    if (saveAs === 'new') push(DASHBOARD_METRIC_ROUTE(name))
  })

  return (
    <Dialog open onOpenChange={next => { if (!next) close() }}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{custom ? `Edit ${entry.label}` : `Your own ${entry.label}`}</DialogTitle>
          <DialogDescription>
            {custom
              ? 'Change the formula and see the number now beside the number it would give, before anything is saved.'
              : `Write how you work it out. You’ll see Souvenir’s ${entry.label} beside yours before anything is saved.`}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-4">
          {!custom && (
            <SegmentedControl
              aria-label="How to save it"
              value={saveAs}
              onValueChange={next => {
                setSaveAs(next)
                // A new metric needs a name of its own; start from the library one's.
                if (next === 'new' && form.values.label === entry.label) form.setField('label', `${entry.label} (ours)`)
              }}
              options={[{ value: 'replace', label: `Replace ${entry.label} in this workspace` }, { value: 'new', label: 'Add as a new metric' }]}
            />
          )}
          {(custom || saveAs === 'new') && (
            <Input
              label="Name"
              fluid
              maxLength={LABEL_MAX}
              value={form.values.label}
              onChange={label => form.setField('label', label)}
              error={form.errors.label !== undefined}
              subtitle={form.errors.label}
            />
          )}
          <div className="flex flex-col gap-1.5">
            <span id={formulaLabel} className="text-body-sm font-medium text-[var(--neutral-800)]">Formula</span>
            <FormulaField
              pieces={pieces}
              onChange={setPieces}
              onPending={setPending}
              entries={library.entries}
              self={name || undefined}
              errorAt={check.errorAt}
              invalid={check.result !== null && !check.result.ok && !check.incomplete}
              labelledBy={formulaLabel}
              describedBy={formulaHint}
              autoFocus
            />
            <span id={formulaHint} className={check.result && !check.result.ok && !check.incomplete ? 'text-small text-[var(--red-600)]' : 'text-small text-[var(--neutral-500)]'} role={check.result && !check.result.ok && !check.incomplete ? 'alert' : undefined}>
              {check.result && !check.result.ok
                ? (check.incomplete ? 'Add a metric or a number to finish it.' : check.result.error.message)
                : 'Type a metric’s name and pick it, then + − × ÷ or brackets. Numbers work too, like × 0.9.'}
            </span>
          </div>
          {custom && (
            <Textarea
              aria-label="What it means"
              placeholder="What it means"
              maxLength={DESCRIPTION_MAX}
              autoResize
              minRows={2}
              maxRows={5}
              value={form.values.description}
              onChange={event => form.setField('description', event.target.value)}
            />
          )}
          {value && !unchanged && <ComparePreview library={library} name={name || entry.name} label={form.values.label.trim() || 'Yours'} baseName={entry.name} value={value} windowId={windowId} range={range} />}
          {unchanged && <p className="m-0 text-small text-[var(--neutral-500)]">Change the formula to see the new number beside today’s.</p>}
          {clash && existing && <p className="m-0 text-small text-[var(--red-600)]" role="status">There’s already a library metric called {existing.label}. Give yours another name.</p>}
          {existing && !clash && <p className="m-0 text-small text-[var(--neutral-600)]" role="status">Saving replaces your custom metric {existing.label}.</p>}
        </DialogBody>

        <DialogFooter>
          <span className="mr-auto text-small text-[var(--neutral-500)]">Saving changes it for everyone in your workspace. It shows as proposed until someone confirms it.</span>
          <Button variant="secondary" disabled={actions.saving} onClick={close}>Cancel</Button>
          <Button disabled={!canSave} loading={actions.saving} onClick={save}>{custom || saveAs === 'replace' ? 'Save formula' : 'Add to library'}</Button>
        </DialogFooter>
      </DialogContent>
      {discarding && (
        <ConfirmModal
          title="Discard your changes?"
          description="The formula you wrote isn’t saved yet."
          confirmLabel="Discard"
          onConfirm={async () => { onClose() }}
          onClose={() => setDiscarding(false)}
        />
      )}
    </Dialog>
  )
}
