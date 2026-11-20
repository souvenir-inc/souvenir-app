"use client"

import { useEffect, useRef } from "react"
import { isStreamActive, subscribeStreams } from "@/lib/stream-registry"
import type { StreamOutcome } from "@/lib/stream-registry"
import type { UIMessage } from "@/types/chat"

// A follow that is refused outright (rather than dropping once attached) leaves the
// reply where it was, and the refresh it triggers bumps historyLoadId, which runs the
// follow effect again — unbounded and at network speed without these. The retries
// inside useStreamingChat cover only an attached connection that later drops.
/** Follow attempts a running reply gets before this view stops trying (each refused one). */
export const FOLLOW_REFUSED_ATTEMPTS = 3
/** Back-off per refusal so far, before the next attempt. */
export const FOLLOW_REFUSED_BACKOFF_MS = 2000

type FollowStream = (
  chatId: string,
  loadingMessageId: string,
  prior?: UIMessage,
  onRefused?: () => void,
) => Promise<StreamOutcome>

/**
 * A chat opened while its reply is still being generated (a reload, another tab, coming
 * back from another chat) reads the reply from the turn's stream, into the turn's own
 * message. Only the regular chat endpoint has one, so `enabled` is false for the others.
 *
 * Refusals are counted here, outside the effect, so the count survives the history
 * reloads (historyLoadId) a refusal causes; a different reply is a fresh budget. Only
 * refusals count (the follow reports them before that reload): one that attaches spends
 * nothing. Returns a reset, for when the reply is known to have moved on (a prompt answered).
 */
export function useFollowRunningReply({
  chatId,
  enabled,
  runningMessageId,
  historyLoadId,
  messages,
  followStream,
}: {
  chatId: string | null | undefined
  enabled: boolean
  runningMessageId: string | null
  historyLoadId: number
  messages: UIMessage[]
  followStream: FollowStream
}): () => void {
  const tallyRef = useRef<{ key: string; refused: number }>({ key: "", refused: 0 })
  const reset = () => { tallyRef.current = { key: "", refused: 0 } }

  // Leaving the chat ends that visit's budget, even for a chat with no running reply:
  // reopening it later starts afresh. (Declared first, so it runs before the follow below.)
  useEffect(() => {
    if (!tallyRef.current.key.startsWith(`${chatId}:`)) tallyRef.current = { key: "", refused: 0 }
  }, [chatId])

  const seenHistoryLoadRef = useRef(historyLoadId)
  useEffect(() => {
    // A finished history load that shows no running reply ends any budget: if that reply
    // runs again later (a prompt answered in another tab), it is followed afresh. Only a
    // finished load counts (historyLoadId moved), not the gap while a load is under way.
    const freshLoad = seenHistoryLoadRef.current !== historyLoadId
    seenHistoryLoadRef.current = historyLoadId
    if (freshLoad && !runningMessageId) tallyRef.current = { key: "", refused: 0 }
    if (!chatId || !enabled || !runningMessageId || isStreamActive(chatId)) return
    const key = `${chatId}:${runningMessageId}`
    const tally = tallyRef.current
    if (tally.key !== key) { tally.key = key; tally.refused = 0 }
    if (tally.refused >= FOLLOW_REFUSED_ATTEMPTS) return
    // The first go is immediate; a repeat only happens because the last was refused,
    // so it backs off rather than returning at round-trip speed.
    const wait = FOLLOW_REFUSED_BACKOFF_MS * tally.refused
    const timer = setTimeout(() => {
      // Checked again when the wait ends: a stream may have started for this chat in
      // the meantime (a message sent during the back-off), and that one owns the reply.
      if (isStreamActive(chatId)) return
      void followStream(chatId, runningMessageId, messages.find((message) => message.id === runningMessageId), () => {
        if (tally.key === key) tally.refused += 1
      })
    }, wait)
    // A stream that starts for this chat before the wait ends (a send) is a newer run, and
    // owns the chat from here: this follow, scheduled for the earlier reply, is dropped, even
    // if that newer stream has already ended again by the time the wait would have run out.
    const unsubscribe = subscribeStreams((event) => {
      if (event.type === "start" && event.chatId === chatId) clearTimeout(timer)
    })
    return () => { clearTimeout(timer); unsubscribe() }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per history load that finds a running turn; followStream is fresh each render
  }, [chatId, runningMessageId, historyLoadId])

  return reset
}
