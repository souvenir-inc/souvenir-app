'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { MetricDefinition } from '@/lib/api/warehouse'
import { mentionedMetrics } from '@/lib/metrics/catalog'
import { metricErrorMessage } from '@/lib/metrics/errors'
import { metricFromTemplate, type TemplateOption } from '@/lib/metrics/templates'
import { draftMetricOptions } from '@/lib/metrics/metric-mutations'
import { cn } from '@/lib/utils'
import { TemplateChips } from './TemplateChips'
import type { Library, WindowRange } from './use-library'

/** Longest message sent, and longest reply shown (cap first, RG-1). */
const MESSAGE_MAX = 2000
const REPLY_MAX = 4000

interface Turn { id: number; role: 'user' | 'assistant'; content: string }

/** The "describe it" conversation: each turn goes to POST /metrics/draft with the whole conversation so far. */
export function useMetricChat(library: Library, initialPrompt = '') {
  const draft = useMutation(draftMetricOptions(library.org, library.warehouse))
  const [messages, setMessages] = useState<Turn[]>([])
  const [text, setText] = useState(initialPrompt.slice(0, MESSAGE_MAX))
  const [proposal, setProposal] = useState<MetricDefinition | null>(null)
  const nextId = useRef(0)
  const turn = (role: Turn['role'], content: string): Turn => ({ id: nextId.current++, role, content })

  const send = () => {
    const content = text.trim().slice(0, MESSAGE_MAX)
    if (content === '' || draft.isPending) return
    const before = messages
    const next = [...messages, turn('user', content)]
    setMessages(next)
    setText('')
    draft.mutate({ messages: next.map(({ role, content: c }) => ({ role, content: c })) }, {
      onSuccess: answer => {
        setMessages(current => [...current, turn('assistant', answer.reply.slice(0, REPLY_MAX) || 'Here’s a metric for that.')])
        if (answer.metric) setProposal(answer.metric)
      },
      onError: error => {
        setMessages(before)
        setText(content)
        toast.error(metricErrorMessage(error, 'draft'))
      },
    })
  }

  const pickTemplate = (option: TemplateOption) => {
    const metric = metricFromTemplate(option.template)
    if (!metric) return
    setProposal(metric)
    setMessages(current => [...current, turn('assistant', `Here’s ${option.template.short}: ${option.template.formula}. ${option.template.description}`)])
  }

  const startOver = () => { setMessages([]); setProposal(null); setText('') }

  return { messages, text, setText, proposal, send, pickTemplate, startOver, thinking: draft.isPending }
}

export type MetricChat = ReturnType<typeof useMetricChat>

export function AskForMetric({ library, chat, range, onOpen }: { library: Library; chat: MetricChat; range: WindowRange; onOpen: (name: string) => void }) {
  const end = useRef<HTMLDivElement>(null)
  const { messages, proposal, thinking } = chat
  // Keep the newest turn in view as the conversation grows (a DOM sync, so an effect).
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [messages.length, thinking])

  return (
    <div className="flex flex-col gap-3">
      {messages.length === 0 && proposal === null && <TemplateChips library={library} range={range} onPick={chat.pickTemplate} />}
      {messages.length > 0 && (
        <div className="flex max-h-72 flex-col gap-2 overflow-y-auto" role="log" aria-live="polite" aria-label="Conversation">
          {messages.map(message => {
            // "This is already available as MER": offer the metric itself rather than a dead end.
            const existing = message.role === 'assistant' ? mentionedMetrics(message.content, library.entries) : []
            return (
              <div key={message.id} className={cn('flex flex-col gap-1.5', message.role === 'user' ? 'items-end' : 'items-start')}>
                <p className={cn(
                  'm-0 max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-body-sm',
                  message.role === 'user' ? 'bg-[var(--neutral-900)] text-[var(--neutral-white)]' : 'bg-[var(--neutral-100)] text-[var(--neutral-900)]',
                )}>
                  <span className="sr-only">{message.role === 'user' ? 'You: ' : 'Souvenir: '}</span>
                  {message.content}
                </p>
                {existing.map(entry => (
                  <Button key={entry.name} variant="outline" size="xs" rightIcon={<ArrowRight size={12} aria-hidden />} onClick={() => onOpen(entry.name)}>
                    Open {entry.label}
                  </Button>
                ))}
              </div>
            )
          })}
          {thinking && <p className="m-0 text-body-sm text-[var(--neutral-500)]" role="status">Souvenir is thinking…</p>}
          <div ref={end} />
        </div>
      )}
      {(messages.length > 0 || proposal !== null) && !thinking && (
        <Button variant="ghost" size="sm" className="self-start" onClick={chat.startOver}>Start over</Button>
      )}
      <div className="flex items-end gap-2">
        <Textarea
          aria-label="Describe the metric"
          placeholder={messages.length === 0 ? 'Revenue for every dollar we spend on ads' : 'Reply, or ask for a change'}
          value={chat.text}
          maxLength={MESSAGE_MAX}
          autoResize
          minRows={1}
          maxRows={5}
          autoFocus
          disabled={thinking}
          onChange={event => chat.setText(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); chat.send() } }}
        />
        <Button variant="secondary" loading={thinking} disabled={chat.text.trim() === '' || thinking} onClick={chat.send}>Send</Button>
      </div>
    </div>
  )
}
