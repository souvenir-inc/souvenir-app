"use client"

import { useEffect, useRef } from "react"
import { isStreamActive, subscribeStreams } from "@/lib/stream-registry"
import { getChatRunState } from "@/lib/api/chat"
import { useLatestCallback } from "@/hooks/use-latest-callback"
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
/** Once the attempts are spent: how often the backend is asked whether the run has ended. */
export const RUN_ENDED_POLL_MS = 5000

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
 * nothing. Returns a reset of one chat's budget, for when its reply is known to have moved on
 * (a prompt answered).
 */
export function useFollowRunningReply({
  chatId,
  enabled,
  runningMessageId,
  historyLoadId,
  messages,
  followStream,
  onRunEnded,
}: {
  chatId: string | null | undefined
  enabled: boolean
  runningMessageId: string | null
  historyLoadId: number
  messages: UIMessage[]
  followStream: FollowStream
  /** The run the history showed as running has ended with no stream here to say so (the
   *  follow attempts were spent): reload, so the chat (and its queue) stop waiting on it. */
  onRunEnded?: () => void
}): (chatId: string) => void {
  // The reply as it is when a follow starts, not when it was scheduled: a prompt answered
  // during the back-off is part of it, and would be lost if an older copy were followed into.
  const currentReply = useLatestCallback((id: string) => messages.find((message) => message.id === id))
  const runEnded = useLatestCallback(() => onRunEnded?.())
  const tallyRef = useRef<{ key: string; refused: number }>({ key: "", refused: 0 })
  // Only the given chat's budget: the tally belongs to whichever chat it was counting.
  const reset = (forChatId: string) => {
    if (tallyRef.current.key.startsWith(`${forChatId}:`)) tallyRef.current = { key: "", refused: 0 }
  }

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
    if (tally.refused >= FOLLOW_REFUSED_ATTEMPTS) {
      // Out of attempts, the reply may still end on the backend with nothing here to see it.
      // Ask until it has (a lookup that fails is "can't tell": keep waiting), then reload.
      let stopped = false
      const poll = setInterval(() => {
        void getChatRunState(chatId).then((state) => {
          if (stopped || state !== "idle") return
          stopped = true
          clearInterval(poll)
          runEnded()
        }, () => {})
      }, RUN_ENDED_POLL_MS)
      return () => { stopped = true; clearInterval(poll) }
    }
    // The first go is immediate; a repeat only happens because the last was refused,
    // so it backs off rather than returning at round-trip speed.
    const wait = FOLLOW_REFUSED_BACKOFF_MS * tally.refused
    // Once this effect's follow is under way, a start for the chat is that follow's own
    // stream, not a newer run: it neither cancels anything nor earns a restart.
    let followed = false
    const follow = () => {
      followed = true
      void followStream(chatId, runningMessageId, currentReply(runningMessageId), () => {
        if (tally.key === key) tally.refused += 1
      })
    }
    const timer = setTimeout(() => {
      // Checked again when the wait ends: a stream may have started for this chat in
      // the meantime (a message sent during the back-off), and that one owns the reply.
      if (isStreamActive(chatId)) return
      follow()
    }, wait)
    // A stream that starts for this chat before the wait ends (a send) is a newer run, and
    // owns the chat from here: this follow, scheduled for the earlier reply, is dropped, even
    // if that newer stream has already ended again by the time the wait would have run out.
    // Unless it ended without a finished turn (a send that failed or was stopped, possibly
    // before its run started): then nothing newer owns the chat, and the earlier reply is
    // followed after all (one already over comes back as gone, and the history reloads).
    let superseded = false
    const unsubscribe = subscribeStreams((event) => {
      if (event.chatId !== chatId) return
      if (followed) return
      if (event.type === "start") {
        clearTimeout(timer)
        superseded = true
      } else if (event.type === "end" && superseded && event.outcome !== "done") {
        superseded = false
        if (!isStreamActive(chatId)) follow()
      }
    })
    return () => { clearTimeout(timer); unsubscribe() }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per history load that finds a running turn; followStream is fresh each render
  // `enabled` too: turning it off cancels a waiting follow, and turning it on looks again.
  }, [chatId, enabled, runningMessageId, historyLoadId])

  return reset
}
