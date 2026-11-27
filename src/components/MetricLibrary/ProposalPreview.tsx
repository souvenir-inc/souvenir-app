'use client'

import { Badge } from '@/components/Badge'
import type { CustomMetric } from '@/lib/api/warehouse'
import { DISPLAY_NAMES, describeSource } from '@/lib/metrics/display'
import { printFormula } from '@/lib/metrics/formula'
import { buildTree, isAggregate, isMetricValue } from '@/lib/metrics/tree'
import { MetricCalculation } from './MetricCalculation'
import { withProposal, windowLabel, type Library, type WindowRange } from './use-library'

/**
 * A proposed metric before it's saved: its name, what it means, its unit and formula, and how it's calculated with
 * live numbers for its inputs. Everything it would save is on screen before "Add to library" (AO-1); its inputs
 * are measured for real and the arithmetic is done here, so nothing is written to preview it.
 */
export function ProposalPreview({ library, proposal, range }: { library: Library; proposal: CustomMetric; range: WindowRange }) {
  if (!isMetricValue(proposal.value)) {
    return <p className="m-0 text-body-sm text-[var(--red-600)]" role="alert">This formula is too big or too deep to use. Ask for a simpler one.</p>
  }
  const preview = withProposal(library, proposal)
  const tree = buildTree(proposal.name, preview.lookup)
  return (
    <section className="flex flex-col gap-3 rounded-xl p-4 shadow-[inset_0_0_0_1px_var(--neutral-200)]" aria-label={`Preview of ${proposal.label}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="m-0 text-body font-medium text-[var(--neutral-900)]">{proposal.label}</h3>
          {proposal.description && <p className="m-0 text-body-sm text-[var(--neutral-600)]">{proposal.description}</p>}
        </div>
        <Badge label={DISPLAY_NAMES.get(proposal.unit)} color="Neutral" />
      </div>
      <p className="m-0 text-small text-[var(--neutral-500)]">
        {isAggregate(proposal.value)
          ? `${describeSource(proposal.value).sentence}.`
          : `${printFormula(proposal.value, { pretty: true, labelOf: preview.labelOf })} · numbers for ${windowLabel('30d').toLowerCase()}`}
      </p>
      <MetricCalculation library={preview} name={proposal.name} range={range} tree={tree} />
    </section>
  )
}
