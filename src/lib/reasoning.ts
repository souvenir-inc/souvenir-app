export type ReasoningSection = {
  heading: string
  body: string
}

// `at` and `endAt` are the server's clock (epoch ms): the stream events'
// timestamps while live, the saved step's on reload.
export type ReasoningTimelineItem =
  | {
      kind: 'reasoning'
      id: string
      content: string
      roundIndex?: number
      at?: number
      endAt?: number
    }
  | {
      kind: 'activity'
      id: string
      activityId: string
      roundIndex?: number
      at?: number
      endAt?: number
    }
  | {
      // A stretch of the answer, from `start` in the message's content up to
      // the next text item's start (or the end of the content).
      kind: 'text'
      id: string
      start: number
    }
  | {
      // Where the model stopped to ask the user something (a question card);
      // everything after it in the timeline happened once they answered.
      kind: 'prompt'
      id: string
      promptId: string
      title: string
      roundIndex?: number
    }

export type ReasoningEventType =
  | 'reasoning_heading'
  | 'reasoning_body'

/** Append a reasoning delta to the current ordered stream segment. A tool
 * activity, a question marker or a changed backend round starts a new
 * segment, preventing words and Markdown delimiters from separate model
 * messages from being glued together. */
export function appendReasoningTimeline(
  timeline: ReasoningTimelineItem[],
  incoming: string,
  newId: string,
  roundIndex?: number,
  at?: number,
): ReasoningTimelineItem[] {
  if (!incoming) return timeline
  const last = timeline[timeline.length - 1]
  if (last?.kind === 'reasoning' && (roundIndex === undefined || last.roundIndex === undefined || last.roundIndex === roundIndex)) {
    return [...timeline.slice(0, -1), { ...last, content: last.content + incoming, endAt: at }]
  }
  return [...timeline, { kind: 'reasoning', id: newId, content: incoming, roundIndex, at, endAt: at }]
}

export function appendActivityTimeline(
  timeline: ReasoningTimelineItem[],
  activityId: string,
  newId: string,
  roundIndex?: number,
  at?: number,
): ReasoningTimelineItem[] {
  if (timeline.some((item) => item.kind === 'activity' && item.activityId === activityId)) return timeline
  return [...timeline, { kind: 'activity', id: newId, activityId, roundIndex, at }]
}

/** Mark the point where the model asked the user something. Reasoning that
 * arrives afterwards starts a new segment, so the run before the question and
 * the run after the answer never read as one. */
export function appendPromptMarker(
  timeline: ReasoningTimelineItem[],
  marker: { promptId: string; title: string },
): ReasoningTimelineItem[] {
  const last = timeline[timeline.length - 1]
  if (last?.kind === 'prompt' && last.promptId === marker.promptId) return timeline
  // Positional suffix: the id doubles as a React key, and the same prompt id
  // can recur further down the timeline.
  const id = `prompt-${marker.promptId}-${timeline.length}`
  return [...timeline, { kind: 'prompt', id, promptId: marker.promptId, title: marker.title }]
}

export function replaceTimelineActivityId(
  timeline: ReasoningTimelineItem[],
  previousId: string,
  nextId: string,
): ReasoningTimelineItem[] {
  if (previousId === nextId) return timeline
  return timeline.map((item) =>
    item.kind === 'activity' && item.activityId === previousId
      ? { ...item, activityId: nextId }
      : item,
  )
}

export function reasoningEventText(data: Record<string, unknown>): string {
  return typeof data.content === 'string' ? data.content : ''
}

export function cleanReasoningHeading(heading: string): string {
  return heading
    .trim()
    .replace(/^#+\s*/, '')
    .replace(/…$/, '')
    .trim()
    .replace(/^\*\*([\s\S]*?)\*\*$/, '$1')
    .trim()
}

// Parse Markdown title lines when rendering persisted reasoning text.
export function reasoningSectionTitle(line: string): string | null {
  const s = line.trim()
  if (s.startsWith('#')) {
    const hashes = s.length - s.replace(/^#+/, '').length
    const rest = s.slice(hashes)
    if (hashes <= 4 && rest.startsWith(' ')) return rest.trim() || null
    return null
  }
  if (s.startsWith('**') && s.endsWith('**') && s.length > 4 && !s.slice(2, -2).includes('**')) {
    return s.slice(2, -2).trim() || null
  }
  return null
}

// Reasoning models (e.g. gpt-5.5) frequently glue a section title to the end of
// the previous paragraph — `…from there.**Creating a CSV file**\n\n…` — with no
// newline before the `**`. The backend's line-based split_reasoning only detects
// titles that occupy a whole line, so every glued title stays buried in the body
// (a single giant section). Break a bold span onto its own line when it is glued
// to preceding non-space text and immediately followed by a newline or end of
// text, so the line-based classifier below can pick it up. Inline emphasis like
// `I need **one** thing` is untouched — it is not followed by a newline.
// Capture the preceding non-space char (group 1) rather than using a lookbehind,
// which older Safari (<16.4) rejects at parse time.
const INLINE_TITLE_RE = /(\S)(\*\*[^*\n]+\*\*)(?=[ \t]*(?:\n|$))/g

function separateInlineTitles(text: string): string {
  return text.replace(INLINE_TITLE_RE, '$1\n$2')
}

export function splitReasoningText(text: string): ReasoningSection[] {
  if (!text || !text.trim()) return []

  const sections: ReasoningSection[] = []
  let heading = ''
  let body: string[] = []

  const flush = () => {
    const joined = body.join('\n').trim()
    if (heading || joined) sections.push({ heading, body: joined })
    heading = ''
    body = []
  }

  for (const line of separateInlineTitles(text).split('\n')) {
    const title = reasoningSectionTitle(line)
    if (title === null) body.push(line)
    else {
      flush()
      heading = title
    }
  }
  flush()
  return sections
}

// Reconstruct the source reasoning text from persisted/streamed sections so it can
// be re-split. Strips any `**` already on the heading before re-wrapping.
function sectionsToText(sections: ReasoningSection[]): string {
  return sections
    .map((s) => {
      const h = cleanReasoningHeading(s.heading)
      return h ? `**${h}**\n\n${s.body}` : s.body
    })
    .join('\n\n')
}

// Turn whatever reasoning we have into clean collapsible sections. Always re-split
// so the backend's under-split output (one section with glued titles in its body)
// gets corrected — prefer the raw text when present (most complete), else rebuild
// it from the sections. Falls back to the original sections / [] when no genuine
// heading is found, so plain unstructured reasoning still renders as raw text.
export function deriveReasoningSections(
  sections: ReasoningSection[],
  text: string,
): ReasoningSection[] {
  const source = text.trim() ? text : sectionsToText(sections)
  const split = splitReasoningText(source)
  const hasHeading = split.some((s) => cleanReasoningHeading(s.heading).length > 2)
  if (hasHeading) return split
  return sections.length > 0 ? sections : []
}

export function normalizeReasoningSections(value: unknown): ReasoningSection[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const section = entry as Record<string, unknown>
    const heading = typeof section.heading === 'string' ? section.heading : ''
    const body = typeof section.body === 'string' ? section.body : ''
    return cleanReasoningHeading(heading) ? [{ heading, body }] : []
  })
}

// The step row shows a bold verb followed by muted detail. The backend sends a
// single heading phrase ("Clarifying user intent"), so the split is
// presentational: leading word bold, remainder muted.
export function splitHeading(heading: string): { verb: string; rest: string } {
  const clean = cleanReasoningHeading(heading)
  const boundary = clean.indexOf(' ')
  if (boundary < 0) return { verb: clean, rest: '' }
  return { verb: clean.slice(0, boundary), rest: clean.slice(boundary + 1) }
}

// Label for a finished Thinking panel: "Thought for 12s", "Thought for 1m 5s".
// Whole seconds with a 1s floor, so a sub-second run never reads as 0s. No
// duration (e.g. a message reloaded from history) reads as plain "Thought".
export function thoughtLabel(durationMs?: number): string {
  if (durationMs === undefined || !Number.isFinite(durationMs)) return 'Thought'
  const total = Math.max(1, Math.round(durationMs / 1000))
  if (total < 60) return `Thought for ${total}s`
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `Thought for ${minutes}m${seconds ? ` ${seconds}s` : ''}`
}

/** What a turn did between two stretches of its answer. */
export type WorkItem = Exclude<ReasoningTimelineItem, { kind: 'text' }>

/** A message in the order it happened: work, answer text, more work, more text. */
export type MessagePart =
  | { kind: 'work'; id: string; items: WorkItem[]; durationMs?: number }
  | { kind: 'text'; id: string; content: string }

// From the first thing a stretch of work did to the last thing it finished.
// Unknown while a step is still open, or for a trace saved without times.
function workDuration(items: WorkItem[]): number | undefined {
  const timed = items.filter((item) => item.kind !== 'prompt')
  if (timed.length === 0) return undefined
  let start = Infinity
  let end = -Infinity
  for (const item of timed) {
    if (item.at === undefined || item.endAt === undefined) return undefined
    start = Math.min(start, item.at)
    end = Math.max(end, item.endAt)
  }
  return end - start
}

/** Splits a message's timeline and content into the parts it renders as. A
 * timeline with no text items (a chat saved before steps were kept) reads as
 * all of its work, then all of its text. */
export function messageParts(timeline: ReasoningTimelineItem[], content: string): MessagePart[] {
  const parts: MessagePart[] = []
  const starts = timeline.flatMap((item) => (item.kind === 'text' ? [item.start] : []))
  let textIndex = 0
  for (const item of timeline) {
    if (item.kind === 'text') {
      const start = textIndex === 0 ? 0 : item.start
      const text = content.slice(start, starts[textIndex + 1] ?? content.length).trim()
      textIndex += 1
      if (text) parts.push({ kind: 'text', id: item.id, content: text })
      continue
    }
    const last = parts[parts.length - 1]
    if (last?.kind === 'work') last.items.push(item)
    else parts.push({ kind: 'work', id: item.id, items: [item] })
  }
  if (starts.length === 0 && content) parts.push({ kind: 'text', id: 'text', content })
  return parts.map((part) => (part.kind === 'work' ? { ...part, durationMs: workDuration(part.items) } : part))
}

export type ReasoningTimelineGroup =
  | { kind: 'reasoning'; id: string; contents: string[] }
  | { kind: 'activities'; id: string; activityIds: string[] }
  | { kind: 'prompt'; id: string; promptId: string; title: string }

// Collapse each run of same-kind timeline items into one group: a tool batch
// becomes a single "Ran N actions" row, and adjacent reasoning segments become
// one step list so the connector line runs unbroken between them. A question
// marker is always its own group, so it breaks whatever run it lands in.
export function groupReasoningTimeline(
  timeline: WorkItem[],
): ReasoningTimelineGroup[] {
  const groups: ReasoningTimelineGroup[] = []
  for (const item of timeline) {
    const last = groups[groups.length - 1]
    if (item.kind === 'prompt') {
      groups.push({ kind: 'prompt', id: item.id, promptId: item.promptId, title: item.title })
      continue
    }
    if (item.kind === 'reasoning') {
      if (last?.kind === 'reasoning') last.contents.push(item.content)
      else groups.push({ kind: 'reasoning', id: item.id, contents: [item.content] })
      continue
    }
    if (last?.kind === 'activities') last.activityIds.push(item.activityId)
    else groups.push({ kind: 'activities', id: item.id, activityIds: [item.activityId] })
  }
  return groups
}

// ── Shared stream accumulator ─────────────────────────────────────────────────
// The single place reasoning SSE events turn into renderable state. Transport
// agnostic on purpose: chat drives it from `useStreamingChat`'s XHR loop, persona
// chat from its own stream consumer, and both hand the same snapshot to
// `ReasoningContent`. Anything added here shows up on both surfaces at once.

export type ReasoningSnapshot = {
  text: string
  sections: ReasoningSection[]
  timeline: ReasoningTimelineItem[]
}

export type ReasoningAccumulator = {
  text(): string
  sections(): ReasoningSection[]
  timeline(): ReasoningTimelineItem[]
  snapshot(): ReasoningSnapshot
  isEmpty(): boolean
  event(type: ReasoningEventType, content: string, roundIndex?: number, at?: number): void
  step(section: ReasoningSection, index?: number): void
  activity(activityId: string, roundIndex?: number, at?: number): void
  /** The activity's step ended at `at`. Returns how long it ran, in seconds, when both ends are known. */
  finishActivity(activityId: string, at?: number): number | undefined
  /** Answer text is arriving; `start` is where it begins in the message's content. */
  answer(start: number): void
  /** `content` closed this round's reasoning but was the answer after all (`reasoning_to_answer`): take it back out. */
  retract(content: string, roundIndex?: number): void
  renameActivity(previousId: string, nextId: string): void
  prompt(marker: { promptId: string; title: string }): void
}

export function eventRoundIndex(data: Record<string, unknown>): number | undefined {
  return typeof data.round_index === 'number' ? data.round_index : undefined
}

/** `seed` is the trace earlier stretches of the same run left on the message; this stretch's goes after it. */
export function createReasoningAccumulator(seed: ReasoningTimelineItem[] = []): ReasoningAccumulator {
  let timeline: ReasoningTimelineItem[] = seed
  const reasoningText = () => timeline
    .flatMap((item) => item.kind === 'reasoning' ? [item.content] : [])
    .join('\n\n')
  let text = reasoningText()
  // Seeded ids keep the numbers they were minted with, which skip where reasoning
  // events merged into one item; counting from seed.length could mint one again.
  let sequence = seed.reduce((next, item) => {
    const n = Number(/-(d+)$/.exec(item.id)?.[1])
    return Number.isInteger(n) ? Math.max(next, n + 1) : next
  }, seed.length)
  const committed: ReasoningSection[] = []
  const previewSteps = new Map<number, ReasoningSection>()
  let heading = ''
  let body = ''

  // Both caches exist for referential stability, not speed: consumers feed these
  // arrays straight into React state and `useMemo` deps, so rebuilding them on
  // every token would re-run the (O(n) over the whole transcript) section
  // derivation on each frame. A plain `reasoning` delta leaves the sections
  // untouched, so only the snapshot is invalidated there.
  let cachedSections: ReasoningSection[] | null = null
  let cachedSnapshot: ReasoningSnapshot | null = null

  const nextId = (kind: ReasoningTimelineItem['kind']) => {
    const id = `${kind}-${sequence}`
    sequence += 1
    return id
  }

  const appendDelta = (incoming: string, roundIndex?: number, at?: number) => {
    timeline = appendReasoningTimeline(timeline, incoming, nextId('reasoning'), roundIndex, at)
    text = reasoningText()
    cachedSnapshot = null
  }

  const invalidateSections = () => {
    cachedSections = null
    cachedSnapshot = null
  }

  const sections = (): ReasoningSection[] => {
    if (cachedSections) return cachedSections
    if (previewSteps.size > 0) {
      cachedSections = [...previewSteps.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, section]) => section)
      return cachedSections
    }
    const out = [...committed]
    if (heading) out.push({ heading, body })
    cachedSections = out
    return out
  }

  return {
    text: () => text,
    sections,
    timeline: () => timeline,
    snapshot: () => {
      if (!cachedSnapshot) cachedSnapshot = { text, sections: sections(), timeline }
      return cachedSnapshot
    },
    isEmpty: () => !text,

    event(type, content, roundIndex, at) {
      if (!content) return

      if (type === 'reasoning_heading') {
        // Every heading event opens a new section, even one titled like the
        // last, so consecutive same-titled sections stay separate.
        if (heading) committed.push({ heading, body })
        heading = content
        body = ''
        invalidateSections()
        // Mirrored into the timeline as a markdown title so the segment-level
        // re-split in TimelineReasoningStep recognises it as a step heading
        // rather than burying it in the body as plain text.
        appendDelta(`**${cleanReasoningHeading(content)}**\n\n`, roundIndex, at)
        return
      }

      body += content
      invalidateSections()
      appendDelta(content, roundIndex, at)
    },

    step(section, index) {
      previewSteps.set(index ?? previewSteps.size, section)
      invalidateSections()
    },

    activity(activityId, roundIndex, at) {
      timeline = appendActivityTimeline(timeline, activityId, nextId('activity'), roundIndex, at)
      cachedSnapshot = null
    },

    finishActivity(activityId, at) {
      const item = timeline.find((entry) => entry.kind === 'activity' && entry.activityId === activityId)
      if (item?.kind !== 'activity') return undefined
      timeline = timeline.map((entry) => (entry === item ? { ...item, endAt: at } : entry))
      cachedSnapshot = null
      return item.at === undefined || at === undefined ? undefined : (at - item.at) / 1000
    },

    answer(start) {
      if (timeline[timeline.length - 1]?.kind === 'text') return
      timeline = [...timeline, { kind: 'text', id: nextId('text'), start }]
      cachedSnapshot = null
    },

    retract(content, roundIndex) {
      if (!content) return
      const index = timeline.findLastIndex((item) => item.kind === 'reasoning')
      const item = timeline[index]
      if (item?.kind !== 'reasoning' || !item.content.endsWith(content)) return
      if (roundIndex !== undefined && item.roundIndex !== undefined && item.roundIndex !== roundIndex) return
      const rest = item.content.slice(0, -content.length)
      timeline = rest
        ? timeline.map((entry, at) => (at === index ? { ...item, content: rest } : entry))
        : timeline.filter((_, at) => at !== index)
      if (body.endsWith(content)) body = body.slice(0, -content.length)
      text = reasoningText()
      invalidateSections()
    },

    renameActivity(previousId, replacementId) {
      timeline = replaceTimelineActivityId(timeline, previousId, replacementId)
      cachedSnapshot = null
    },

    prompt(marker) {
      timeline = appendPromptMarker(timeline, marker)
      cachedSnapshot = null
    },
  }
}
