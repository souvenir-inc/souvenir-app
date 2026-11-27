'use client'

import { useId, useState } from 'react'
import { z } from 'zod'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useZodForm } from '@/hooks/use-zod-form'
import type { CustomMetric, Unit } from '@/lib/api/warehouse'
import { DISPLAY_NAMES } from '@/lib/metrics/display'
import { metricNameOf, printFormula } from '@/lib/metrics/formula'
import { checkPieces, type Piece } from '@/lib/metrics/tokens'
import { buildTreeFromValue } from '@/lib/metrics/tree'
import { displayOfNode, unitForDisplay } from '@/lib/metrics/units'
import { FormulaField } from './FormulaField'
import type { Library } from './use-library'

const LABEL_MAX = 120
const schema = z.object({ label: z.string().trim().min(1, 'Give it a name.').max(LABEL_MAX, `A name can be at most ${LABEL_MAX} characters.`) })
const UNITS: ReadonlyArray<{ value: Unit; label: string }> = (['money', 'count', 'percent', 'ratio'] as const).map(value => ({ value, label: DISPLAY_NAMES.get(value) ?? value }))

/** The "write a formula" way to a new metric: a name, a unit (suggested from the formula) and the formula. */
export function useFormulaDraft(library: Library) {
  const form = useZodForm(schema, { label: '' })
  const [pieces, setPieces] = useState<Piece[]>([])
  const [pending, setPending] = useState<Piece | null>(null)
  const [unitChoice, setUnitChoice] = useState<Unit | null>(null)

  const name = metricNameOf(form.values.label)
  const check = checkPieces(pending ? [...pieces, pending] : pieces, library.entries.map(entry => entry.name), name || undefined)
  const parsed = check.result?.ok ? check.result : null
  const body = parsed ? buildTreeFromValue(name || 'new_metric', parsed.value, library.lookup).body : null
  const suggested = body ? unitForDisplay(displayOfNode(body, library.unitOf, library.lookup)) : 'money'
  const unit = unitChoice ?? suggested
  const proposal: CustomMetric | null = parsed && name !== '' && form.isValid
    ? { name, label: form.values.label.trim(), unit, description: printFormula(parsed.value, { pretty: true, labelOf: library.labelOf }), value: parsed.value, verified: false }
    : null

  return { form, pieces, setPieces, setPending, check, name, unit, setUnitChoice, proposal, started: form.isDirty || pieces.length > 0 }
}

export type FormulaDraft = ReturnType<typeof useFormulaDraft>

export function WriteFormula({ library, draft }: { library: Library; draft: FormulaDraft }) {
  const formulaLabel = useId()
  const formulaHint = useId()
  const { form, check } = draft
  const failed = check.result !== null && !check.result.ok && !check.incomplete
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-3">
        <Input
          label="Name"
          placeholder="Marketing efficiency ratio"
          maxLength={LABEL_MAX}
          value={form.values.label}
          onChange={label => form.setField('label', label)}
          error={form.errors.label !== undefined}
          subtitle={form.errors.label}
          autoFocus
          className="min-w-[240px] flex-1"
          fluid
        />
        <div className="flex flex-col gap-1.5">
          <span className="text-body-sm font-medium text-[var(--neutral-800)]">Unit</span>
          <Select aria-label="Unit" options={UNITS} value={draft.unit} onValueChange={draft.setUnitChoice} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <span id={formulaLabel} className="text-body-sm font-medium text-[var(--neutral-800)]">Formula</span>
        <FormulaField
          pieces={draft.pieces}
          onChange={draft.setPieces}
          onPending={draft.setPending}
          entries={library.entries}
          self={draft.name || undefined}
          errorAt={check.errorAt}
          invalid={failed}
          labelledBy={formulaLabel}
          describedBy={formulaHint}
        />
        <span id={formulaHint} className={failed ? 'text-small text-[var(--red-600)]' : 'text-small text-[var(--neutral-500)]'} role={failed ? 'alert' : undefined}>
          {check.result && !check.result.ok
            ? (check.incomplete ? 'Add a metric or a number to finish it.' : check.result.error.message)
            : 'Type a metric’s name and pick it, then + − × ÷ or brackets. Numbers work too, like × 0.9.'}
        </span>
      </div>
    </div>
  )
}
