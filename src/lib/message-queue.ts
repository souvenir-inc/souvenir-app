"use client"

/**
 * The tab-level message queue: the messages a user has queued in each chat
 * while that chat's reply is still running. Each one is its own message and
 * goes out as its own turn, in order, one reply at a time.
 *
 * Like stream-registry it lives outside React, so queued messages survive
 * chat switches and remounts, and still go out as their chat's replies end:
 *  - while the chat is on screen, its ChatInterface sends the next one (with
 *    the usual streaming UI) once the reply before it has finished;
 *  - otherwise MessageQueueRunner sends it in the background.
 * A reply that fails or is stopped holds the chat's queue instead of sending
 * the next message; the composer takes them all back, to edit and send, the
 * next time the chat is shown.
 */

import type { PendingAttachment } from "@/hooks/use-file-upload"
import type { TurnSettings } from "@/lib/turn-options"
import { isStreamActive, subscribeStreams, type StreamOutcome } from "@/lib/stream-registry"

export interface QueuedTurnContext {
  /** The composer's settings, kept current while the chat is on screen. */
  settings:       TurnSettings
  modelId?:       string | number | null
  /** The chat's own proxy endpoint and stop handler, when it has them. */
  endpoint?:      string
  onStopBackend?: (chatId: string) => void
}

export interface QueuedMessagePart {
  content:       string
  attachments:   PendingAttachment[]
  mentionedPins: Array<{ id: string; label: string }>
}

export interface QueuedMessage extends QueuedMessagePart {
  id:      string
  context: QueuedTurnContext
}

/** One chat's queue, oldest first. */
export interface ChatQueue {
  messages: readonly QueuedMessage[]
  /** Set when the reply the queue waited on failed or was stopped — nothing more is sent. */
  heldBy?:  Exclude<StreamOutcome, "done">
  /** Which hold this is: each new hold gets its own, so a release meant for one can't lift another. */
  holdId?:  number
}

let nextHoldId = 0

// ── Keys ─────────────────────────────────────────────────────────────────────
// A chat's id, or — for a new chat whose first reply hasn't produced an id
// yet — a stand-in key that is moved to the id once it arrives.

const NEW_CHAT_PREFIX = "new-chat:"

export function newChatQueueKey(): string {
  return `${NEW_CHAT_PREFIX}${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

export function isNewChatQueueKey(key: string): boolean {
  return key.startsWith(NEW_CHAT_PREFIX)
}

// ── Merging (for putting queued messages back into the composer) ────────────

/** Two messages' text as one, earlier first, separated by a blank line. */
export function joinMessageText(first: string, second: string): string {
  const a = first.trim()
  const b = second.trim()
  return a && b ? `${a}\n\n${b}` : a || b
}

/** Both pin lists, earlier first, without repeats. */
export function mergeMentionedPins<T extends { id: string }>(first: T[], second: T[]): T[] {
  return [...first, ...second.filter((pin) => !first.some((p) => p.id === pin.id))]
}

/**
 * Both attachment lists, earlier first, skipping files already in `first`
 * (same name and size — the composer's own duplicate rule). `overflow` is
 * true when the result would carry more than `max` files.
 */
export function mergeAttachments(
  first: PendingAttachment[],
  second: PendingAttachment[],
  max: number,
): { attachments: PendingAttachment[]; overflow: boolean } {
  const fresh = second.filter(
    (a) => !first.some((b) => b.id === a.id || (b.file.name === a.file.name && b.file.size === a.file.size)),
  )
  const attachments = [...first, ...fresh]
  return { attachments, overflow: attachments.length > max }
}

/** Several queued messages as one composer draft, in order. */
export function combineQueuedMessages(messages: readonly QueuedMessagePart[]): QueuedMessagePart {
  return messages.reduce<QueuedMessagePart>(
    (acc, m) => ({
      content:       joinMessageText(acc.content, m.content),
      attachments:   mergeAttachments(acc.attachments, m.attachments, Infinity).attachments,
      mentionedPins: mergeMentionedPins(acc.mentionedPins, m.mentionedPins),
    }),
    { content: "", attachments: [], mentionedPins: [] },
  )
}

// ── Store ────────────────────────────────────────────────────────────────────

const queues = new Map<string, ChatQueue>()
// The chat each mounted chat view is showing (view token → queue key).
const foreground = new Map<symbol, string>()
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of [...listeners]) listener()
}

/** Replaces `key`'s queue; an empty one is dropped (a hold with nothing held means nothing). */
function setQueue(key: string, queue: ChatQueue): void {
  if (queue.messages.length === 0) queues.delete(key)
  else queues.set(key, queue)
}

/** Called on every change, and whenever a chat's stream starts or ends. */
export function subscribeQueue(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// A reply that failed or was stopped holds its chat's queue. Done here rather
// than by each listener so that, by the time anyone hears a stream ended, the
// hold is already in place.
subscribeStreams((event) => {
  if (event.type === "end" && event.outcome !== "done") {
    const queue = queues.get(event.chatId)
    if (queue && !queue.heldBy) queues.set(event.chatId, { ...queue, heldBy: event.outcome, holdId: ++nextHoldId })
  }
  notify()
})

export function getChatQueue(key: string | null | undefined): ChatQueue | undefined {
  return key ? queues.get(key) : undefined
}

export function hasQueuedMessages(): boolean {
  return queues.size > 0
}

/**
 * Adds a message to `key`'s queue — at the end, or at `index` (a message
 * taken out to edit goes back where it was).
 */
export function queueMessage(
  key: string,
  part: QueuedMessagePart,
  context: QueuedTurnContext,
  index?: number,
): QueuedMessage {
  const message: QueuedMessage = {
    ...part,
    content: part.content.trim(),
    id: `queued-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    context,
  }
  const messages = [...(queues.get(key)?.messages ?? [])]
  messages.splice(index === undefined ? messages.length : Math.min(Math.max(index, 0), messages.length), 0, message)
  // Queuing again is a fresh "send these next": it lifts an earlier hold.
  setQueue(key, { messages })
  notify()
  return message
}

/** Removes and returns the message due next — whoever takes it sends it. */
export function takeNextQueuedMessage(key: string): QueuedMessage | undefined {
  // Its front message is on its way back (a hand-over): nothing goes out ahead of it, from
  // the background or from the chat itself.
  if (handingOver.has(key)) return undefined
  const queue = queues.get(key)
  const next = queue?.messages[0]
  if (!queue || !next) return undefined
  setQueue(key, { ...queue, messages: queue.messages.slice(1) })
  notify()
  return next
}

/** Removes and returns one queued message (Edit, Remove), with where it stood. */
export function takeQueuedMessage(key: string, id: string): { message: QueuedMessage; index: number } | undefined {
  const queue = queues.get(key)
  const index = queue?.messages.findIndex((m) => m.id === id) ?? -1
  if (!queue || index === -1) return undefined
  const message = queue.messages[index]
  setQueue(key, { ...queue, messages: queue.messages.filter((m) => m.id !== id) })
  notify()
  return { message, index }
}

/** Removes and returns the whole queue — e.g. to put it back into the composer. */
export function takeAllQueuedMessages(key: string): ChatQueue | undefined {
  const queue = queues.get(key)
  if (!queue) return undefined
  queues.delete(key)
  notify()
  return queue
}

/** Puts a removed message back where it was (Undo). With `hold`, the queue is held in the
 *  same step (an existing hold stays), so no one hears of the message before the hold. */
export function restoreQueuedMessage(
  key: string,
  message: QueuedMessage,
  index: number,
  hold?: Exclude<StreamOutcome, "done">,
): void {
  const queue = queues.get(key)
  const messages = [...(queue?.messages ?? [])].filter((m) => m.id !== message.id)
  messages.splice(Math.min(index, messages.length), 0, message)
  const heldBy = queue?.heldBy ?? hold
  const holdId = queue?.heldBy ? queue.holdId : hold ? ++nextHoldId : undefined
  setQueue(key, { ...queue, messages, ...(heldBy ? { heldBy, holdId } : {}) })
  notify()
}

/** Holds `key`'s queue after a reply that failed or was stopped. */
export function holdQueue(key: string, reason: Exclude<StreamOutcome, "done">): void {
  const queue = queues.get(key)
  if (!queue || queue.heldBy) return
  queues.set(key, { ...queue, heldBy: reason, holdId: ++nextHoldId })
  notify()
}

/** The id of `key`'s current hold, if it is held. */
export function currentHoldId(key: string | null | undefined): number | undefined {
  const queue = key ? queues.get(key) : undefined
  return queue?.heldBy ? queue.holdId : undefined
}

/** Lifts `key`'s "error" hold: the failure that set it was recovered after all (a dropped
 *  connection whose reconnect read the turn to its end). Any other hold stays, and with
 *  `holdId` only that hold is lifted: one set since (a newer failure) is not. */
export function releaseErrorHold(key: string, holdId?: number): void {
  const queue = queues.get(key)
  if (!queue || queue.heldBy !== "error") return
  if (holdId !== undefined && queue.holdId !== holdId) return
  queues.set(key, { messages: queue.messages })
  notify()
}

/**
 * Keeps the settings a background send would use in step with the composer.
 * Updated in place: they aren't shown, so nothing needs to re-render.
 */
export function refreshQueuedContext(key: string, context: QueuedTurnContext): void {
  for (const message of queues.get(key)?.messages ?? []) message.context = context
}

/** A new chat got its id: its queued messages and its views move to it. */
export function rekeyQueue(from: string, to: string): void {
  if (from === to) return
  const moving = queues.get(from)
  if (moving) {
    queues.delete(from)
    const existing = queues.get(to)
    queues.set(to, existing
      ? { messages: [...existing.messages, ...moving.messages], heldBy: existing.heldBy ?? moving.heldBy, holdId: existing.heldBy ? existing.holdId : moving.holdId }
      : moving)
  }
  for (const [token, key] of foreground) {
    if (key === from) foreground.set(token, to)
  }
  notify()
}

/** Records which chat a mounted view shows (`null` once it unmounts). */
export function setQueueForeground(token: symbol, key: string | null): void {
  if ((foreground.get(token) ?? null) === key) return
  if (key === null) foreground.delete(token)
  else foreground.set(token, key)
  notify()
}

// Chats whose front message is on its way back to the queue (a background send handed it
// over to the chat as it opened): none of their messages goes out in the background until
// it is back, or the next one would overtake it.
const handingOver = new Set<string>()

/** `key`'s front message is being handed back: its queue waits for it. */
export function beginHandOver(key: string): void {
  handingOver.add(key)
}

/** The handed-back message is in place (restore it first): the queue goes on as usual. */
export function endHandOver(key: string): void {
  if (handingOver.delete(key)) notify()
}

export function isQueueForeground(key: string): boolean {
  for (const k of foreground.values()) if (k === key) return true
  return false
}

/**
 * Chats whose next queued message is due to go out in the background: not
 * held, not on screen (that view sends it), and with no reply still running.
 */
export function queuedChatsReadyForBackground(): string[] {
  const ready: string[] = []
  for (const [key, queue] of queues) {
    if (queue.heldBy || isNewChatQueueKey(key) || isQueueForeground(key) || isStreamActive(key) || handingOver.has(key)) continue
    ready.push(key)
  }
  return ready
}
