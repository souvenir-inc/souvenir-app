'use client'

import { Button } from '@/components/ui/button'
import { listNames } from '@/components/Dashboard/format'
import { TEMPLATES, templateInputs, templatesFor, type TemplateOption } from '@/lib/metrics/templates'
import { useTotals, type Library, type WindowRange } from './use-library'

function note(option: TemplateOption, labelOf: (name: string) => string | undefined): string | null {
  const { status } = option
  switch (status.state) {
    case 'ready': return null
    case 'exists': return 'Already in your library'
    case 'blocked': return status.reason
    case 'missing': return `Needs ${listNames(status.inputs.map(name => labelOf(name) ?? name))}, which this workspace doesn’t have`
    case 'no-data': return `This store can’t measure ${labelOf(status.input) ?? status.input} yet`
  }
}

/**
 * Common metrics to start from, judged against this workspace: ready ones first. One measurement of every
 * template's inputs says which the store can't measure yet, so a chip says so instead of offering an empty number.
 */
export function TemplateChips({ library, range, onPick }: { library: Library; range: WindowRange; onPick: (option: TemplateOption) => void }) {
  const inputs = [...new Set(TEMPLATES.flatMap(templateInputs))]
  const totals = useTotals(library, inputs, range)
  const options = templatesFor(library.entries, new Set(totals.unavailable.keys()))
  const sorted = [...options].sort((a, b) => Number(a.status.state !== 'ready') - Number(b.status.state !== 'ready'))
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-small text-[var(--neutral-500)]">Start from a common one</p>
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {sorted.map(option => {
          const why = note(option, library.labelOf)
          return (
            <li key={option.template.id}>
              <Button
                variant="outline"
                size="sm"
                disabled={option.status.state !== 'ready'}
                title={why ?? `${option.template.label}: ${option.template.formula}`}
                aria-description={why ?? undefined}
                onClick={() => onPick(option)}
              >
                {option.template.short}
              </Button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
