"use client"

import { useEffect, useRef, useState } from "react"
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
  stillWanted?: () => boolean,
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
  // The caller's followStream as it is now, not as it was when the effect last ran.
  const followLatest = useLatestCallback(followStream)
  const tallyRef = useRef<{ key: string; refused: number }>({ key: "", refused: 0 })
  // Only the given chat's budget: the tally belongs to whichever chat it was counting. The
  // follow effect then runs again, so a spent budget (only polling for the end) goes back to
  // following the reply, which may be running again under the same id.
  const [resetCount, setResetCount] = useState(0)
  const reset = (forChatId: string) => {
    if (!tallyRef.current.key.startsWith(`${forChatId}:`)) return
    tallyRef.current = { key: "", refused: 0 }
    setResetCount((n) => n + 1)
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
    if (!chatId || !enabled || !runningMessageId) return
    // A stream already going for the chat (a send made as the history loaded) owns it for
    // now: nothing is scheduled, but it is listened to below, so that if it ends without a
    // finished turn the earlier reply is followed after all.
    const activeAtLoad = isStreamActive(chatId)
    const key = `${chatId}:${runningMessageId}`
    const tally = tallyRef.current
    if (tally.key !== key) { tally.key = key; tally.refused = 0 }
    // Out of attempts, the reply may still end on the backend with nothing here to see it.
    // Ask until it has (a lookup that fails is "can't tell": keep waiting), then reload.
    // The asking goes on until a reload shows no running reply (this effect then ends):
    // a reload that fails is tried again at the next check. Not while a stream for the chat
    // is going (a send just made): a reload then would drop its turn from the list.
    // One timer for the whole effect, owned by its cleanup; it only asks once polling is on.
    let stopped = false
    let polling = false
    const poll = setInterval(() => {
      if (!polling) return
      void getChatRunState(chatId).then((state) => {
        if (stopped || state !== "idle" || isStreamActive(chatId)) return
        runEnded()
      }, () => {})
    }, RUN_ENDED_POLL_MS)
    const pollForRunEnd = () => { polling = true }
    if (tally.refused >= FOLLOW_REFUSED_ATTEMPTS && !activeAtLoad) {
      pollForRunEnd()
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
      // stillWanted: if this follow has to wait its turn, it goes ahead only while this effect
      // (this chat, this running reply) is still the current one.
      void followLatest(chatId, runningMessageId, currentReply(runningMessageId), () => {
        if (tally.key === key) tally.refused += 1
      }, () => !stopped)
    }
    // Nothing is scheduled while a stream from before the load owns the chat, or with the
    // budget spent; the timer is still made (and cleared by the cleanup) either way.
    const scheduled = !activeAtLoad && tally.refused < FOLLOW_REFUSED_ATTEMPTS
    const timer = setTimeout(() => {
      // Checked again when the wait ends: a stream may have started for this chat in
      // the meantime (a message sent during the back-off), and that one owns the reply.
      if (!scheduled || isStreamActive(chatId)) return
      follow()
    }, wait)
    // A stream that starts for this chat before the wait ends (a send) is a newer run, and
    // owns the chat from here: this follow, scheduled for the earlier reply, is dropped, even
    // if that newer stream has already ended again by the time the wait would have run out.
    // Unless it ended without a finished turn (a send that failed or was stopped, possibly
    // before its run started): then nothing newer owns the chat, and the earlier reply is
    // followed after all (one already over comes back as gone, and the history reloads).
    let superseded = activeAtLoad
    let deferredFollow: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = subscribeStreams((event) => {
      if (event.chatId !== chatId) return
      if (followed) return
      if (event.type === "start") {
        clearTimeout(timer)
        clearTimeout(deferredFollow) // a newer stream owns the chat; if it fails, its end schedules again
        superseded = true
      } else if (event.type === "end" && superseded && event.outcome === "done" && activeAtLoad) {
        // A stream from before the load (a background send) finished the reply this view
        // loaded as running: nothing here read it, so the view reloads to show it whole. A send
        // made from this view after the load updates its own reply, and is left alone.
        superseded = false
        runEnded()
      } else if (event.type === "end" && superseded && (event.outcome !== "done" || event.inconclusive)) {
        // Failed, stopped, or inconclusive (a reader refused before it attached): nothing newer
        // has the chat, so recovery goes on, within the budget.
        superseded = false
        // Within the budget: follow now. With it spent: back to asking whether the run ended.
        // Not from inside this notification: it may be Stop's, which still has its own reply
        // to settle, and a follow started now would take the hook (and that reply's ref) first.
        clearTimeout(deferredFollow) // one deferred follow at most: a second end replaces the first
        deferredFollow = setTimeout(() => {
          if (isStreamActive(chatId)) return
          if (tally.refused >= FOLLOW_REFUSED_ATTEMPTS) pollForRunEnd()
          else follow()
        }, 0)
      }
    })
    return () => { stopped = true; clearInterval(poll); clearTimeout(timer); clearTimeout(deferredFollow); unsubscribe() }
  // Runs once per history load that finds a running turn. `enabled` too: turning it off
  // cancels a waiting follow, and turning it on looks again. The three callbacks are stable
  // (useLatestCallback), so listing them reruns nothing; they read the latest props.
  }, [chatId, enabled, runningMessageId, historyLoadId, resetCount, currentReply, followLatest, runEnded])

  return reset
}
