'use client'

import { useId, useRef, type FormEvent, type RefObject } from 'react'
import { toast } from 'sonner'
import { usePeople } from '@/components/Dashboard/share/use-people'
import { InputField } from '@/components/InputField'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { RadioGroup, RadioItem } from '@/components/ui/radio-group'
import { Select, type SelectOption } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useZodForm } from '@/hooks/use-zod-form'
import type { Unit, Warehouse } from '@/lib/api/warehouse'
import { targetErrorMessage } from '@/lib/scorecard/errors'
import type { ScorecardRow } from '@/lib/scorecard/status'
import { formValuesOf, NO_OWNER, NOTE_MAX, NUMBER_MAX, rowOf, targetFormSchema, type TargetFormOutput, type TargetFormValues } from '@/lib/scorecard/target-form'
import { useSaveTarget } from './use-scorecard'

// Set or change a metric's target (CORE-B-13: "Set a target" used to say it wasn't ready). One target
// per metric for the whole workspace, saved in its scorecards: the number, which way is good, how far
// short still counts as on track, and optionally who answers for it and a note. A target applies to
// whatever dates the board shows; there is no per-week or per-month target on the server.

export interface TargetMetric {
  id: string
  label: string
  unit: Unit
  /** A rise is good news: the direction a new target starts on. */
  upIsGood: boolean
}

interface TargetEditorProps {
  open: boolean
  onClose: () => void
  warehouse: Warehouse
  metric: TargetMetric
  /** The target in force, or null to set a new one. */
  row: ScorecardRow | null
}

export function TargetEditor({ open, onClose, ...rest }: TargetEditorProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      {open && <EditorForm onClose={onClose} {...rest} />}
    </Dialog>
  )
}

const HINT: Record<Unit, string> = {
  money: 'In dollars. 55k and 1.2M work too.',
  count: 'A number, like 1,200 or 1.2k.',
  percent: 'As a percentage, like 4.5.',
  ratio: 'A ratio, like 3.1.',
}

// Fields in the order they're shown, for moving focus to the first one that's wrong.
const FIELD_ORDER = ['target', 'tolerance', 'note'] as const
type FocusField = (typeof FIELD_ORDER)[number]

// Menus portal outside the dialog: a click in one isn't a click outside it.
const isInDropdown = (t: EventTarget | null) => t instanceof Element && !!t.closest('[data-kds-dropdown-panel]')

function EditorForm({ onClose, warehouse, metric, row }: Omit<TargetEditorProps, 'open'>) {
  const directionLabel = useId()
  const targetInput = useRef<HTMLInputElement>(null)
  const toleranceInput = useRef<HTMLInputElement>(null)
  const noteInput = useRef<HTMLTextAreaElement>(null)
  const inputs: Record<FocusField, RefObject<HTMLInputElement | HTMLTextAreaElement | null>> = { target: targetInput, tolerance: toleranceInput, note: noteInput }
  const form = useZodForm<TargetFormValues, TargetFormOutput>(targetFormSchema, formValuesOf(row, metric.unit, metric.upIsGood))
  const { values, setField, errors, isDirty } = form
  const save = useSaveTarget(warehouse)
  const people = usePeople()

  const owners: SelectOption<string>[] = [
    { value: NO_OWNER, label: 'No owner' },
    ...people.list.map((p) => ({ value: p.id, label: p.id === people.viewer ? `${p.name} (you)` : p.name })),
  ]
  // Someone who has left still shows as the owner until it's changed.
  if (values.owner !== NO_OWNER && !people.get(values.owner)) owners.push({ value: values.owner, label: people.name(values.owner) })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (save.isPending) return
    const parsed = targetFormSchema.safeParse(values)
    form.handleSubmit((data) => {
      save.mutate(
        { metric: metric.id, row: rowOf(metric.id, data, metric.unit), newId: crypto.randomUUID() },
        {
          onSuccess: () => { toast.success(`Saved the target for ${metric.label}`); onClose() },
          onError: (error) => { toast.error(targetErrorMessage(error, 'save', metric.label)) },
        },
      )
    })()
    if (!parsed.success) {
      const first = FIELD_ORDER.find((field) => parsed.error.issues.some((issue) => issue.path[0] === field))
      if (first) inputs[first].current?.focus()
    }
  }

  const prefix = metric.unit === 'money' ? <span aria-hidden className="text-[var(--text-field-icon)]">$</span> : undefined
  const suffix = metric.unit === 'percent' ? <span aria-hidden className="text-[var(--text-field-icon)]">%</span> : undefined

  return (
    <DialogContent
      size="md"
      data-target-editor={metric.id}
      // Unsaved changes stay put on a stray click outside (SD-FM-06); Cancel and Escape still close.
      onInteractOutside={(e) => { if (isDirty || isInDropdown(e.target)) e.preventDefault() }}
    >
      <form noValidate onSubmit={submit} className="flex min-h-0 flex-col">
        <DialogHeader>
          <DialogTitle>{row ? `Edit the target for ${metric.label}` : `Set a target for ${metric.label}`}</DialogTitle>
          <DialogDescription>Everyone in this workspace sees it. It applies to whatever dates the board shows.</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-5">
          <InputField
            ref={targetInput}
            label="Target"
            labelSuffix={<span className="text-[var(--neutral-500)]">(required)</span>}
            required
            fluid
            inputMode="decimal"
            autoComplete="off"
            maxLength={NUMBER_MAX}
            leftIcon={prefix}
            rightIcon={suffix}
            value={values.target}
            onChange={(v) => setField('target', v)}
            error={!!errors.target}
            subtitle={errors.target ?? HINT[metric.unit]}
          />

          <div className="flex flex-col gap-2">
            <span id={directionLabel} className="text-body text-[var(--text-field-label)]">Which way is good</span>
            <RadioGroup<ScorecardRow['direction']>
              aria-labelledby={directionLabel}
              orientation="horizontal"
              value={values.direction}
              onValueChange={(v) => setField('direction', v)}
            >
              <RadioItem value="up" label="Higher is better" />
              <RadioItem value="down" label="Lower is better" />
            </RadioGroup>
          </div>

          <InputField
            ref={toleranceInput}
            label="Tolerance"
            fluid
            inputMode="decimal"
            autoComplete="off"
            maxLength={NUMBER_MAX}
            rightIcon={<span aria-hidden className="text-[var(--text-field-icon)]">%</span>}
            value={values.tolerance}
            onChange={(v) => setField('tolerance', v)}
            error={!!errors.tolerance}
            subtitle={errors.tolerance ?? 'How far short of the target still counts as on track. Within it, the metric shows as at risk; 0 means any miss is off track.'}
          />

          <div className="flex flex-col gap-1">
            <span aria-hidden className="text-body text-[var(--text-field-label)]">Owner (optional)</span>
            <Select
              aria-label="Owner"
              variant="outline"
              size="md"
              menuSize="lg"
              className="w-full justify-between"
              options={owners}
              value={values.owner}
              onValueChange={(v) => setField('owner', v)}
            />
          </div>

          <Field invalid={!!errors.note}>
            <FieldLabel>Note (optional)</FieldLabel>
            <Textarea
              ref={noteInput}
              autoResize
              minRows={2}
              maxRows={6}
              maxLength={NOTE_MAX}
              showCount
              value={values.note}
              onChange={(e) => setField('note', e.target.value)}
            />
            <FieldError>{errors.note}</FieldError>
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="sm" loading={save.isPending} disabled={!!row && !isDirty}>
            {save.isPending ? 'Saving…' : 'Save target'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
