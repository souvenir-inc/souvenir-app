'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/Button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useGuardedRouter } from '@/context/nav-guard-context'
import type { CustomMetric, MetricChatMessage, MetricUnit } from '@/lib/api/warehouse'
import { metricNameOf, printFormula } from '@/lib/metrics/formula'
import { checkPieces, type Piece } from '@/lib/metrics/tokens'
import { mentionedMetrics } from '@/lib/metrics/library'
import { rememberFormula } from '@/lib/metrics/registry'
import { metricFromTemplate, TEMPLATES, templateInputs as templateInputsOf, templatesFor, type TemplateOption } from '@/lib/metrics/templates'
import { usePeriod } from '@/lib/warehouse/period'
import { displayOfNode, buildTreeFromValue, type DisplayUnit } from '@/lib/metrics/tree'
import { dashboardMetricRoute } from '@/lib/routes'
import { useDraftMetric, usePutMetric } from '@/lib/warehouse/queries'
import { FormulaField } from './FormulaField'
import { ProposalPreview } from './ProposalPreview'
import { useLibrary, useWindowTotals } from './useLibrary'
import styles from './MetricLibrary.module.css'

type Mode = 'ask' | 'formula'

const UNIT_OPTIONS: ReadonlyArray<{ value: MetricUnit; label: string }> = [
  { value: 'money', label: 'Money' },
  { value: 'count', label: 'Count' },
  { value: 'ratio', label: 'Ratio' },
]

function unitFor(display: DisplayUnit): MetricUnit {
  if (display === 'money') return 'money'
  if (display === 'count') return 'count'
  return 'ratio'
}

export interface CreateMetricDialogProps {
  onClose: () => void
  /** Words to start the conversation with, like a search that found nothing. */
  initialPrompt?: string
}

/**
 * Making a metric, three ways into one result: ask for it in words, start from a template, or write the formula.
 * Every way ends in the same preview with live numbers. Nothing is saved until "Add to library".
 */
export function CreateMetricDialog({ onClose, initialPrompt }: CreateMetricDialogProps) {
  const library = useLibrary()
  const { push } = useGuardedRouter()
  const [mode, setMode] = useState<Mode>('ask')
  const [messages, setMessages] = useState<MetricChatMessage[]>([])
  const [text, setText] = useState(initialPrompt ?? '')
  const [chatProposal, setChatProposal] = useState<CustomMetric | null>(null)
  const [label, setLabel] = useState('')
  const [pending, setPending] = useState<Piece | null>(null)
  const [pieces, setPieces] = useState<Piece[]>([])
  const [unitChoice, setUnitChoice] = useState<MetricUnit | null>(null)
  const draft = useDraftMetric()
  const put = usePutMetric()
  const logEnd = useRef<HTMLDivElement>(null)
  const formulaLabel = useId()
  const busy = draft.isPending || put.isPending
  const workspaceId = library.workspace.data?.id

  // Judge the template chips against what this store can measure, so a template whose input has no data (nCAC
  // without new-customer data, say) says so instead of offering an empty number. One request for every input.
  const period = usePeriod()
  const templateInputs = useMemo(() => [...new Set(TEMPLATES.flatMap(templateInputsOf))].filter(name => library.known.has(name)), [library.known])
  const inputTotals = useWindowTotals(templateInputs, period, library.workspace.data?.timezone)
  // An input the store can't measure, or one with no number at all for the period (new customers when the
  // customer data isn't there), leaves the template with nothing to show: say so on the chip.
  const inputData = inputTotals.current.data
  const noData = useMemo(() => {
    if (inputData === undefined) return {}
    const values = inputData.periods[0]?.values ?? {}
    const empty = Object.entries(values).filter(([, value]) => value === null).map(([name]) => [name, 'no data for this period'] as const)
    return { ...Object.fromEntries(empty), ...inputData.unavailable }
  }, [inputData])
  const templates = useMemo(() => templatesFor(library.entries, noData), [library.entries, noData])
  const names = useMemo(() => library.entries.map(entry => entry.name), [library.entries])

  // The formula way: parse as you type, propose once it reads.
  const name = metricNameOf(label)
  const check = checkPieces(pending ? [...pieces, pending] : pieces, names, name || undefined)
  const parsed = check.result
  const parsedBody = parsed?.ok ? buildTreeFromValue(name || 'new_metric', parsed.value, library.lookup).body : null
  const suggestedUnit = parsedBody ? unitFor(displayOfNode(parsedBody, library.unitOf, library.lookup)) : 'money'
  const unit = unitChoice ?? suggestedUnit
  const formulaProposal: CustomMetric | null = parsed?.ok && name !== ''
    ? { name, label: label.trim(), unit, description: printFormula(parsed.value, { pretty: true, labelOf: library.labelOf }), value: parsed.value }
    : null

  const proposal = mode === 'ask' ? chatProposal : formulaProposal
  const existing = proposal ? library.byName.get(proposal.name) : undefined
  const clash = existing !== undefined && existing.category !== 'custom'

  useEffect(() => { logEnd.current?.scrollIntoView({ block: 'end' }) }, [messages, chatProposal])

  const send = async () => {
    const content = text.trim()
    if (content === '' || busy) return
    const next = [...messages, { role: 'user' as const, content }]
    setMessages(next)
    setText('')
    try {
      const answer = await draft.mutateAsync(next)
      setMessages([...next, { role: 'assistant', content: answer.reply }])
      if (answer.metric) setChatProposal(answer.metric)
    } catch (error) {
      setMessages(messages)
      setText(content)
      toast.error(error instanceof Error ? error.message : 'Souvenir didn’t answer. Try again.')
    }
  }

  const pickTemplate = (option: TemplateOption) => {
    const metric = metricFromTemplate(option.template)
    setMode('ask')
    setChatProposal(metric)
    setMessages(previous => [...previous, { role: 'assistant', content: `Here's ${option.template.short}: ${option.template.formula}. ${option.template.description}` }])
  }

  const add = async () => {
    if (proposal === null || clash || busy) return
    try {
      await put.mutateAsync(proposal)
      // The catalog doesn't return formulas yet (S3), so keep this one to draw its tree.
      if (workspaceId) rememberFormula(workspaceId, proposal.name, proposal.value)
      toast.success(`${proposal.label} added to the library`)
      onClose()
      push(dashboardMetricRoute(proposal.name))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Couldn’t save the metric.')
    }
  }

  return (
    <Dialog open onOpenChange={next => { if (!next && !busy) onClose() }}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>New metric</DialogTitle>
          <DialogDescription>Ask for it in your own words, start from a common one, or write the formula. You&apos;ll see its number before adding it.</DialogDescription>
        </DialogHeader>

        <DialogBody className={styles.createBody}>
          <div className={styles.modes} role="tablist" aria-label="How to make it">
            <button type="button" role="tab" aria-selected={mode === 'ask'} className={styles.modeTab} onClick={() => setMode('ask')}>Ask</button>
            <button type="button" role="tab" aria-selected={mode === 'formula'} className={styles.modeTab} onClick={() => setMode('formula')}>Write a formula</button>
          </div>

          {mode === 'ask' && (
            <>
              {messages.length === 0 && chatProposal === null && <TemplateChips options={templates} onPick={pickTemplate} />}
              {messages.length > 0 && (
                <div className={styles.chat} role="log" aria-live="polite">
                  {messages.map((message, index) => {
                    // "This is already available as MER": offer the metric itself rather than a dead end.
                    const existing = message.role === 'assistant' ? mentionedMetrics(message.content, library.entries) : []
                    return (
                      <div key={index} className={styles.turnGroup} data-role={message.role}>
                        <div className={styles.turn} data-role={message.role}>{message.content}</div>
                        {existing.length > 0 && (
                          <div className={styles.turnLinks}>
                            {existing.map(entry => (
                              <button key={entry.name} type="button" className={styles.chip} onClick={() => { onClose(); push(dashboardMetricRoute(entry.name)) }}>
                                Open {entry.label}
                                <ArrowRight size={13} strokeWidth={1.75} aria-hidden />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {draft.isPending && <div className={styles.turn} data-role="assistant" aria-label="Souvenir is thinking">…</div>}
                  <div ref={logEnd} />
                </div>
              )}
              {(messages.length > 0 || chatProposal !== null) && !busy && (
                <button type="button" className={styles.startOver} onClick={() => { setMessages([]); setChatProposal(null); setText('') }}>
                  Start over
                </button>
              )}
              <div className={styles.composer}>
                <textarea
                  className={styles.textarea}
                  value={text}
                  rows={1}
                  autoFocus
                  placeholder={messages.length === 0 ? 'Revenue for every dollar we spend on ads' : 'Reply, or ask for a change'}
                  aria-label="Describe the metric"
                  disabled={busy}
                  onChange={event => setText(event.target.value)}
                  onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send() } }}
                />
                <Button variant="secondary" loading={draft.isPending} disabled={text.trim() === '' || busy} onClick={() => { void send() }}>Send</Button>
              </div>
            </>
          )}

          {mode === 'formula' && (
            <>
              <div className={styles.fieldRow}>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Name</span>
                  <input className={styles.input} value={label} placeholder="Marketing efficiency ratio" onChange={event => setLabel(event.target.value)} autoFocus />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Unit</span>
                  <select className={styles.select} value={unit} onChange={event => setUnitChoice(event.target.value as MetricUnit)}>
                    {UNIT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
              </div>
              <div className={styles.field}>
                <span className={styles.fieldLabel} id={formulaLabel}>Formula</span>
                <FormulaField
                  pieces={pieces}
                  onChange={setPieces}
                  onPending={setPending}
                  entries={library.entries}
                  self={name || undefined}
                  errorAt={check.errorAt}
                  invalid={parsed !== null && !parsed.ok && !check.incomplete}
                  labelledBy={formulaLabel}
                />
                {parsed && !parsed.ok
                  ? <span className={check.incomplete ? styles.fieldHint : styles.fieldError} role={check.incomplete ? undefined : 'alert'}>{check.incomplete ? 'Add a metric or a number to finish it.' : parsed.error.message}</span>
                  : <span className={styles.fieldHint}>Type a metric&apos;s name and pick it, then + − × ÷ or brackets. Numbers work too, like × 0.9.</span>}
              </div>
            </>
          )}

          {proposal && <ProposalPreview proposal={proposal} />}
          {proposal && existing && (
            <p className={styles.warning} role="status">
              {clash
                ? <>There&apos;s already a built-in metric called {existing.label}. Give this one another name.</>
                : <>Adding replaces your custom metric {existing.label}.</>}
            </p>
          )}
        </DialogBody>

        <DialogFooter>
          <span className={styles.dialogFooterNote}>Everyone in your organization will see it.</span>
          <Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button disabled={proposal === null || clash || busy} loading={put.isPending} onClick={() => { void add() }}>Add to library</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TemplateChips({ options, onPick }: { options: TemplateOption[]; onPick: (option: TemplateOption) => void }) {
  return (
    <div>
      <p className={styles.chipsLabel}>Start from a common one</p>
      <ul className={styles.chips}>
        {/* Ready ones first: the chips a presenter can click lead, the ones waiting on data follow. */}
        {[...options].sort((a, b) => Number(a.status.state !== 'ready') - Number(b.status.state !== 'ready')).map(option => {
          const { template, status } = option
          const note = status.state === 'ready' ? null
            : status.state === 'exists' ? 'added'
              : status.state === 'blocked' ? 'needs cost data'
                : status.state === 'missing' ? `needs ${status.inputs.join(', ')}`
                  : 'no data here'
          const title = status.state === 'blocked' || status.state === 'no-data' ? status.reason
            : status.state === 'exists' ? 'Already in your library'
              : `${template.label}: ${template.formula}`
          return (
            <li key={template.id}>
              <button type="button" className={styles.chip} disabled={status.state !== 'ready'} title={title} onClick={() => onPick(option)}>
                {template.short}
                {note && <small>{note}</small>}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
