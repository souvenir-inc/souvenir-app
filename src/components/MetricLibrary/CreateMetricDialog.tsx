'use client'

import { useState } from 'react'
import { ConfirmModal } from '@/components/ConfirmModal'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { useGuardedRouter } from '@/context/nav-guard-context'
import { originOf } from '@/lib/metrics/catalog'
import { DASHBOARD_METRIC_ROUTE } from '@/lib/routes'
import { AskForMetric, useMetricChat } from './AskForMetric'
import { useFormulaDraft, WriteFormula } from './WriteFormula'
import { ProposalPreview } from './ProposalPreview'
import { windowRange, type Library } from './use-library'
import { useMetricActions } from './use-metric-actions'

type Mode = 'ask' | 'formula'

export interface CreateMetricDialogProps {
  library: Library
  onClose: () => void
  /** Words to start the conversation with, like a search that found nothing. */
  initialPrompt?: string
}

/**
 * Making a metric, three ways into one result: ask for it in words (POST /metrics/draft), start from a common
 * one, or write the formula. Every way ends in the same preview with live numbers, and nothing is saved until
 * "Add to library" (PUT /metrics, unconfirmed until someone confirms it).
 */
export function CreateMetricDialog({ library, onClose, initialPrompt }: CreateMetricDialogProps) {
  const { push } = useGuardedRouter()
  const actions = useMetricActions(library)
  const chat = useMetricChat(library, initialPrompt)
  const [mode, setMode] = useState<Mode>('ask')
  const formula = useFormulaDraft(library)
  const [discarding, setDiscarding] = useState(false)
  const range = windowRange('30d', library.warehouse.timezone)

  const proposal = mode === 'ask' ? chat.proposal : formula.proposal
  const existing = proposal ? library.byName.get(proposal.name) : undefined
  // Saving under a library metric's name would replace it for the whole workspace: that's "Your own formula" on
  // its page, never a side effect of making a new metric.
  const clash = existing !== undefined && originOf(existing) !== 'custom'
  const busy = actions.saving || chat.thinking
  const started = chat.messages.length > 0 || chat.proposal !== null || formula.started

  const close = () => { if (actions.saving) return; if (started) setDiscarding(true); else onClose() }

  const add = async () => {
    if (proposal === null || clash || busy) return
    const saved = await actions.save({ ...proposal, verified: false }, `${proposal.label} added to the library`)
    if (!saved) return
    onClose()
    push(DASHBOARD_METRIC_ROUTE(proposal.name))
  }

  return (
    <Dialog open onOpenChange={next => { if (!next) close() }}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>New metric</DialogTitle>
          <DialogDescription>Ask for it in your own words, start from a common one, or write the formula. You’ll see its number before adding it.</DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-4">
          <SegmentedControl
            aria-label="How to make it"
            value={mode}
            onValueChange={setMode}
            options={[{ value: 'ask', label: 'Ask' }, { value: 'formula', label: 'Write a formula' }]}
            className="self-start"
          />
          {mode === 'ask'
            ? <AskForMetric library={library} chat={chat} range={range} onOpen={name => { onClose(); push(DASHBOARD_METRIC_ROUTE(name)) }} />
            : <WriteFormula library={library} draft={formula} />}

          {proposal && <ProposalPreview library={library} proposal={proposal} range={range} />}
          {proposal && existing && (
            <p className={clash ? 'm-0 text-small text-[var(--red-600)]' : 'm-0 text-small text-[var(--neutral-600)]'} role="status">
              {clash
                ? <>There’s already a library metric called {existing.label}. Give this one another name, or open {existing.label} and use your own formula there.</>
                : <>Adding replaces your custom metric {existing.label}.</>}
            </p>
          )}
        </DialogBody>

        <DialogFooter>
          <span className="mr-auto text-small text-[var(--neutral-500)]">Everyone in your workspace will see it, as proposed until someone confirms it.</span>
          <Button variant="secondary" disabled={actions.saving} onClick={close}>Cancel</Button>
          <Button disabled={proposal === null || clash || busy} loading={actions.saving} onClick={() => { void add() }}>Add to library</Button>
        </DialogFooter>
      </DialogContent>
      {discarding && (
        <ConfirmModal
          title="Discard this metric?"
          description="Nothing is saved until you add it to the library."
          confirmLabel="Discard"
          onConfirm={async () => { onClose() }}
          onClose={() => setDiscarding(false)}
        />
      )}
    </Dialog>
  )
}
