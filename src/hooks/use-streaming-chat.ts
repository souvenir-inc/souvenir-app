"use client"

import { useRef } from "react"
import { flushSync } from "react-dom"
import { clearStreamFields, publishStreamFields } from "@/lib/chat/stream-store"
import { stopActiveActivities } from "@/lib/activity"
import { apiFetch } from "@/lib/api/client"
import { CHAT_STOP_ENDPOINT } from "@/lib/config"
import { notifyLibraryFilesChanged } from "@/lib/library/files-changed"
import { libraryFileIdFor } from "@/lib/library/upload/composer-uploads"
import { ensureFreshToken } from "@/lib/jwt-utils"
import { logger } from "@/lib/logger"
import { friendlyModelError } from "@/lib/model-error"
import { AguiSSEDecoder } from "@/lib/sse-decoder"
import type { UIMessage } from "@/types/chat"
import { registerStream, completeStream, type StreamOutcome } from "@/lib/stream-registry"
import { updateMessage } from "@/lib/chat/stream/message-patches"
import {
  AuthExpiredError,
  ConnectionDroppedError,
  FriendlyStreamError,
  SESSION_EXPIRED_MESSAGE,
  dispatchSessionExpired,
  isAuthErrorText,
} from "@/lib/chat/stream/stream-errors"
import { processStreamEvents } from "@/lib/chat/stream/stream-events"
import { buildStreamFormData, resolveStreamTarget, type StreamRequestOptions } from "@/lib/chat/stream/stream-request"
import { createStreamTurn, finishTurn, type StreamEventContext } from "@/lib/chat/stream/stream-turn"
import { sendStreamRequest } from "@/lib/chat/stream/xhr-transport"

// The stream's layers live in lib/chat/stream: the request (stream-request),
// the XHR transport (xhr-transport), and the event handlers that turn decoded
// events into message updates (stream-events, tool-events, message-patches).
// This hook owns the refs, the batching of streamed text, and the turn's
// start and end.

export type { TurnResume } from "@/lib/chat/stream/stream-request"

/** How many times one turn re-attaches to its stream, and the pause before each. */
const FOLLOW_ATTEMPTS = 5
const FOLLOW_RETRY_MS = 1000

/** A 409 that says the same send already reached the backend (the Idempotency-Key guard),
 *  as opposed to a 409 refusal (an unpublished, paused or disabled agent). */
function isAlreadySent(status: number, body: string): boolean {
  return status === 409 && body.includes("already_sent")
}

/** How a follow of a running turn went: it reached the stream, the chat has no
 *  running turn any more (it ended while nobody was reading), or it could not connect. */
type FollowResult = "attached" | "gone" | "failed"

// ── Types ─────────────────────────────────────────────────────────────────────

export type StreamState = "idle" | "waiting" | "streaming" | "done" | "aborted" | "error"

export interface UseStreamingChatParams {
  setMessages: React.Dispatch<React.SetStateAction<UIMessage[]>>
  /** Called with the real chat ID once the backend creates a new chat. */
  onChatCreated?: (chatId: string) => void
  /** Called when the backend sends a chat title update. */
  onTitleUpdate?: (chatId: string, title: string) => void
  /** Called when the stream finishes so the sidebar can re-order the chat. */
  onChatMoveToTop?: (chatId: string) => void
  /** Optional - lets the caller render a loading indicator from stream state. */
  setStreamState?: React.Dispatch<React.SetStateAction<StreamState>>
  /** The turn ended while this view was not reading it: the saved reply is in the chat history. */
  onStreamLost?: (chatId: string) => void
  /** Called after a stream completes successfully (for refreshing usage data). */
  onStreamDone?: () => void
  /** Override the proxy endpoint (defaults to "/api/chat"). Use for persona chat, etc. */
  endpoint?: string
  /** Absolute backend endpoints for proxy-less streaming on deployed origins.
   *  Defaults to the regular chat endpoints; persona chat passes its own.
   *  Callers with a bespoke proxy and no direct equivalent omit this AND pass
   *  `endpoint`, keeping their proxy on all origins. */
  directEndpoints?: { create: string; stream: (chatId: string) => string }
  /** Custom stop handler. When provided, called instead of the default CHAT_STOP_ENDPOINT call.
   *  Receives the resolved chatId. Use for persona chat stop endpoints. */
  onStopBackend?: (chatId: string) => void
  /** Ref to the chatId currently displayed in the UI. When provided, setStreamState calls are
   *  suppressed for background streams whose chatId no longer matches what is displayed. */
  currentChatIdRef?: React.RefObject<string | undefined>
  /** Keep the streaming message's in-flight fields (text, reasoning) in
   *  lib/chat/stream-store instead of React state, committing them into
   *  `messages` only at milestones (tool events, end, stop, error). The caller
   *  must render rows through useLiveMessage or tokens won't show until then. */
  liveOverlay?: boolean
}

// ── Batch-flush interval ──────────────────────────────────────────────────────

const FLUSH_INTERVAL_MS = 50

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useStreamingChat({
  setMessages,
  onChatCreated,
  onTitleUpdate,
  onChatMoveToTop,
  setStreamState,
  onStreamDone,
  onStreamLost,
  endpoint = "/api/chat",
  directEndpoints,
  onStopBackend,
  currentChatIdRef,
  liveOverlay = false,
}: UseStreamingChatParams) {
  const xhrRef = useRef<XMLHttpRequest | null>(null)
  const stopRequestedRef = useRef(false)
  // Set by a follow of a running turn, read by whoever started it.
  const followResultRef = useRef<FollowResult>("attached")

  // Whether a call's stream state belongs to the chat on screen. With no chat on screen
  // (a new, unsaved chat) only a send made from that composer is its own: not a follow,
  // and not a send from a saved chat the user has since left. No ref at all: one view only.
  const showsChat = (streamChatId: string | null, sentFromNewChat: boolean) => {
    if (!currentChatIdRef) return true
    const shown = currentChatIdRef.current
    if (!shown) return sentFromNewChat
    return streamChatId === null || streamChatId === shown
  }

  // Pending message field updates - flushed to React every FLUSH_INTERVAL_MS
  const pendingFieldsRef = useRef<Partial<UIMessage> | null>(null)
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const rafScheduledRef = useRef(false)
  // liveOverlay: the message id whose uncommitted fields sit in the stream store.
  const publishedKeyRef = useRef<string | null>(null)

  // The temp ID of the loading placeholder being updated during a stream
  const loadingMessageIdRef = useRef<string | null>(null)
  // Tracks the optimistic user message ID so message_saved can update its attachment URLs
  const userMessageIdRef = useRef<string | null>(null)
  // Resolved chat ID (may start as null/temp and update once backend confirms)
  const resolvedChatIdRef = useRef<string | null>(null)
  // Stops the current call's stream, and only that one — registered with the
  // stream registry so the stream can be stopped from wherever its chat is shown.
  const activeStopRef = useRef<(() => void) | null>(null)
  // The call that currently owns this hook. loadingMessageIdRef, resolvedChatIdRef,
  // the transport refs and the flush buffer are one set shared by every call, so
  // two overlapping streams — chat A's recovery still reading while chat B's starts —
  // would have the first finish onto the second's reply. A new call therefore takes
  // the hook over: it drops the old one through the stream registry (the connection
  // closes, the entry goes, and the old chat follows its turn afresh when shown) —
  // but never a send the backend has not yet accepted, which it waits for instead,
  // the same rule detachStream keeps: a turn whose run has not started is not dropped.
  const activeCallRef = useRef<{
    /** True once dropping it loses nothing: a follow, or a send whose run started. */
    droppable: () => boolean
    /** Settles when it becomes droppable, hands the hook to its own retry, or ends. */
    settled: Promise<void>
    settle: () => void
    drop: () => void
  } | null>(null)

  // ── Flush helpers ───────────────────────────────────────────────────────────

  const applyUpdate = (fields: Partial<UIMessage>) => {
    const msgId = loadingMessageIdRef.current
    if (!msgId) return
    setMessages((prev) =>
      prev.map((msg) => (msg.id === msgId ? { ...msg, ...fields } : msg)),
    )
  }

  // Commits the pending fields into messages. In liveOverlay mode this is the
  // only path to React state for streamed text: the commit renders
  // synchronously, then the store entry is dropped, so the row never shows a
  // frame with neither (no flash back to older text).
  const flushPending = () => {
    const fields = pendingFieldsRef.current
    const key = publishedKeyRef.current
    pendingFieldsRef.current = null
    publishedKeyRef.current = null
    if (fields) {
      if (key) flushSync(() => applyUpdate(fields))
      else applyUpdate(fields)
    }
    if (key) clearStreamFields(key)
  }

  const queueUpdate = (fields: Partial<UIMessage>, immediate = false) => {
    pendingFieldsRef.current = pendingFieldsRef.current
      ? { ...pendingFieldsRef.current, ...fields }
      : fields
    if (immediate) {
      flushPending()
      return
    }
    if (liveOverlay) {
      // Stays out of React state until the next commit; the store batches
      // notifications to one per animation frame.
      const msgId = loadingMessageIdRef.current
      if (!msgId) return
      if (publishedKeyRef.current && publishedKeyRef.current !== msgId) clearStreamFields(publishedKeyRef.current)
      publishedKeyRef.current = msgId
      publishStreamFields(msgId, pendingFieldsRef.current)
      return
    }
    // Schedule a microtask flush as backup (in case setInterval is delayed)
    if (!rafScheduledRef.current) {
      rafScheduledRef.current = true
      Promise.resolve().then(() => {
        rafScheduledRef.current = false
        flushPending()
      })
    }
  }

  const startFlushInterval = () => {
    if (liveOverlay || flushTimerRef.current) return
    flushTimerRef.current = setInterval(flushPending, FLUSH_INTERVAL_MS)
  }

  const stopFlushInterval = () => {
    if (!flushTimerRef.current) return
    clearInterval(flushTimerRef.current)
    flushTimerRef.current = null
  }

  // ── handleStopGeneration ────────────────────────────────────────────────────

  const handleStopGeneration = () => {
    stopRequestedRef.current = true
    xhrRef.current?.abort()
    stopFlushInterval()
    flushPending()
    completeStream(resolvedChatIdRef.current, "aborted")
    setStreamState?.("aborted")

    const msgId = loadingMessageIdRef.current
    if (msgId) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === msgId && msg.isLoading
            ? {
                ...msg,
                isLoading: false,
                isThinkingInProgress: false,
                stoppedByUser: true,
                // The "Generation stopped" line under the bubble says it; no second copy as text.
                content: msg.content,
                activities: stopActiveActivities(msg.activities),
              }
            : msg,
        ),
      )
    }

    // Signal the backend to stop generation.
    const chatId = resolvedChatIdRef.current
    if (chatId && !chatId.startsWith("temp-")) {
      if (onStopBackend) {
        onStopBackend(chatId)
      } else {
        void apiFetch(CHAT_STOP_ENDPOINT(chatId), { method: "POST" }).catch(() => {})
      }
    }
  }

  // ── fetchAiResponse ─────────────────────────────────────────────────────────

  /**
   * Opens an SSE stream to the /api/chat proxy route and applies incoming
   * events to the loading placeholder message identified by `loadingMessageId`.
   *
   * The function is NOT memoised - re-creating it every render ensures it
   * always closes over the freshest callbacks without ref gymnastics.
   * It is only ever called from event handlers, so identity changes are safe.
   *
   * Resolves with how the turn ended — the message queue holds a queued
   * message back after a reply that failed or was stopped.
   */
  const fetchAiResponse = async (
    input: string,
    chatId: string | null,
    loadingMessageId: string,
    modelId?: string | number | null,
    options?: StreamRequestOptions,
  ): Promise<StreamOutcome> => {
    // Before any shared ref is written, take the hook over from whoever holds it.
    // A retry of the same follow (followAttempt > 0) is that call continuing, not a
    // rival for the refs, so it leaves its own parent alone.
    // A send made from a new, unsaved chat's composer: that view's own, until the new
    // chat id reaches it. Read now, before any wait: it is where the user sent from.
    const sentFromNewChat = options?.follow !== true && !!currentChatIdRef && !currentChatIdRef.current
    if (!options?.followAttempt) {
      let holder = activeCallRef.current
      let waited = false
      // A send the backend has not accepted yet is never dropped: wait until its run
      // starts (or it ends), then look again — another call may have taken over meanwhile.
      while (holder && !holder.droppable()) {
        waited = true
        await holder.settled
        holder = activeCallRef.current
      }
      // A follow that had to wait: the user may have left its chat meanwhile, even gone
      // back to the chat it waited on. It stands down rather than cut that chat's stream.
      if (waited && options?.follow && currentChatIdRef && currentChatIdRef.current !== chatId) {
        options.onLeftBeforeStart?.()
        return "done"
      }
      if (holder) {
        // The buffer is shared too: commit what the old call had streamed into its own
        // reply while the refs still point there (as Stop does). Left behind, it would be
        // merged into the next call's first update and committed as that call's reply.
        stopFlushInterval()
        flushPending()
        holder.drop()
      }
    }
    stopRequestedRef.current = false
    xhrRef.current = null
    // A follow owns the reply only once its stream answers; until then the reply is left as it is.
    const follow = options?.follow === true
    let attached = !follow
    let failedStatus = 0
    let failedBody = ""
    followResultRef.current = "attached"
    loadingMessageIdRef.current = loadingMessageId
    userMessageIdRef.current = options?.userMessageId ?? null
    resolvedChatIdRef.current = chatId
    // The refs above belong to whichever call ran last, so stopping through
    // the registry is a no-op once a newer call has taken over this hook.
    const stopThisCall = () => {
      if (activeStopRef.current === stopThisCall) handleStopGeneration()
    }
    activeStopRef.current = stopThisCall
    // Set when the chat was reopened and follows this turn afresh: this call's
    // connection is dropped and it leaves the reply and the registry alone.
    let detached = false
    let callXhr: XMLHttpRequest | null = null
    const detachThisCall = () => {
      detached = true
      callXhr?.abort()
    }
    // A follow only reads a run that is already going, so it can be dropped from the
    // start; a send registers its detach once its run has started (onRunStarted).
    registerStream(chatId, stopThisCall, follow ? detachThisCall : undefined)
    let runStarted = false
    let markSettled = () => {}
    const thisCall = {
      droppable: () => follow || runStarted,
      settled: new Promise<void>((resolve) => { markSettled = resolve }),
      settle: () => markSettled(),
      // Closes the connection but keeps the registry entry: the chat's run is still going
      // on the backend, so the chat must keep looking busy, or its message queue would send
      // the next message into that run. Reopening the chat clears the entry
      // (use-chat-state's detachStream) and follows the run afresh.
      drop: () => detachThisCall(),
    }
    // A retry of a dropped call is that call's recovery follow taking the hook over: the
    // call it replaces has handed off, so anyone waiting on it can stop waiting now
    // rather than for the whole recovery to finish. (The follow itself can be dropped.)
    const handedFrom = options?.followAttempt ? activeCallRef.current : null
    activeCallRef.current = thisCall
    handedFrom?.settle()
    // Only the call still holding the hook may clear the slot; a dropped one has
    // already been replaced by the call that dropped it.
    const releaseThisCall = () => {
      if (activeCallRef.current === thisCall) activeCallRef.current = null
      markSettled()
    }

    // Returns true if this stream's chat is still the one the user is viewing.
    // Used to suppress setStreamState calls for background (unfocused) streams.
    const isActiveStream = () => showsChat(resolvedChatIdRef.current, sentFromNewChat)

    // Like every other state change here: only for the chat being shown. A call that
    // waited for another to hand over may belong to a chat the user has since left.
    if (isActiveStream()) setStreamState?.("waiting")

    const turn = createStreamTurn(options?.prior)
    // The event handlers' view of this call: its refs, batching and callbacks.
    const ctx: StreamEventContext = {
      setMessages,
      queueUpdate,
      flushPending,
      messageId: () => loadingMessageIdRef.current,
      setMessageId: (id) => { loadingMessageIdRef.current = id },
      userMessageId: () => userMessageIdRef.current,
      chatId: () => resolvedChatIdRef.current,
      adoptChatId: (id) => adoptChatId(id),
      onRunStarted: () => {
        // The backend has the turn: dropping this connection now loses nothing.
        runStarted = true
        markSettled()
        registerStream(resolvedChatIdRef.current, stopThisCall, detachThisCall)
        if (isActiveStream()) setStreamState?.("streaming")
      },
      onTitleUpdate,
      onChatMoveToTop,
      saveToLibrary: undefined,
    }

    // try/catch inside runCall, release after it: React Compiler cannot compile a
    // `finally`, and bails out of the whole hook when it meets one. The release still
    // runs on every path — after a return, and before an exception is passed on.
    const runCall = async (): Promise<StreamOutcome> => {
      try {
        const target = resolveStreamTarget(chatId, endpoint, directEndpoints, options)
        const directToken = target.useDirectBackend ? await ensureFreshToken() : null
        const { fd, fileRefs } = buildStreamFormData(input, chatId, modelId, options, target)
        ctx.saveToLibrary = fileRefs.saveToLibrary
        // The sent message remembers its Library files, for the chat's Sources panel.
        if (fileRefs.libraryFileIds.length > 0 && options?.userMessageId) {
          const sentIds = fileRefs.libraryFileIds
          // Each attachment that went as a Library file is marked, so Sources lists it once (as that file).
          const sentFiles = options.files ?? []
          setMessages(updateMessage(options.userMessageId, (msg) => ({
            ...msg,
            libraryFileIds: sentIds,
            attachments: msg.attachments?.map((att, index) => {
              const libraryFileId = sentFiles[index] ? libraryFileIdFor(sentFiles[index]) : undefined
              return libraryFileId && !att.libraryFileId ? { ...att, libraryFileId } : att
            }),
          })))
        }

        // Dropped while getting ready (the token wait above): the request never goes out.
        // The transport sends synchronously, so a later abort would be too late.
        if (detached) return "done"
        // Stopped while getting ready: Stop has already settled the reply and the registry.
        if (stopRequestedRef.current) return "aborted"
        const sseDecoder = new AguiSSEDecoder()
        await sendStreamRequest({
          target,
          directToken,
          fd,
          chatId,
          hasFiles: Boolean(options?.files?.length),
          onUploadProgress: options?.onUploadProgress,
          setXhr: (xhr) => {
            callXhr = xhr
            // Dropped before its connection existed (a takeover can land while this call
            // was still getting a token): close the connection as soon as it is sent,
            // rather than leave it open reading a stream nobody listens to. The transport
            // hands the XHR over before open() and send(), which follow in the same task,
            // and abort() before send() does nothing, hence the microtask.
            if (detached) {
              if (xhr) queueMicrotask(() => xhr.abort())
              return
            }
            // Once detached, xhrRef is the replacing call's: clearing it would leave
            // that call's Stop with nothing to abort.
            xhrRef.current = xhr
          },
          onUploadEnd: () => {
            if (detached) return
            if (isActiveStream()) setStreamState?.("streaming")
            startFlushInterval()
          },
          // Safety-net: start flush interval if upload.loadend didn't fire yet
          // (e.g. when there are no files to upload).
          onProgress: () => { if (!detached && !flushTimerRef.current) startFlushInterval() },
          // Each new slice of the response stream, decoded and applied in order.
          // A detached call reads nothing more: the reply and chat refs the events
          // would write through now belong to the call that replaced it.
          onText: (text, flush = false) => {
            if (detached) return
            const decodedEvents = sseDecoder.push(text)
            if (flush) decodedEvents.push(...sseDecoder.flush())
            processStreamEvents(ctx, turn, decodedEvents)
          },
          // Adopted like the stream's own chat-id events, so the new chat's
          // stream is registered too — the message queue must not treat a
          // chat whose first reply is still running as idle.
          onHeaderChatId: (headerChatId) => {
            if (detached) return
            if (!chatId || chatId.startsWith("temp-")) adoptChatId(headerChatId)
          },
          isStopRequested: () => stopRequestedRef.current || detached,
          onFollowAttached: () => {
            if (detached) return
            // The stream replays the stretch being worked on from its start, so the reply goes back
            // to what it held before that stretch: nothing, or what earlier stretches of the run wrote.
            attached = true
            const replyId = loadingMessageIdRef.current
            const prior = options?.prior
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === replyId
                  ? prior
                    ? { ...prior, isLoading: true }
                    : { id: msg.id, reactKey: msg.reactKey, role: msg.role, created_at: msg.created_at, chat_id: msg.chat_id, content: "", isLoading: true }
                  : msg,
              ),
            )
          },
          onFollowFailed: (status, body) => { failedStatus = status; failedBody = body },
        })

        // Checked first: the flush timer and buffer are shared, and now hold the
        // replacing call's tokens. Stopping or flushing them here would freeze that
        // call's stream and write its pending text from this call's unwinding.
        if (detached) return "done"
        stopFlushInterval()
        flushPending()

        // Stream ended without a done or error event - treat what was shown as
        // the complete response. A user Stop already finalised the message.
        if (!turn.streamFinished && !stopRequestedRef.current) finishTurn(ctx, turn, "ended")

        const outcome: StreamOutcome = stopRequestedRef.current ? "aborted" : turn.turnFailed ? "error" : "done"
        completeStream(resolvedChatIdRef.current, outcome)
        // The backend saves the files this turn carried to Library; refresh what Library shows.
        if (options?.files?.length) notifyLibraryFilesChanged()
        if (isActiveStream()) setStreamState?.("done")
        onStreamDone?.()
        return outcome
      } catch (error) {
        if (detached) return "done"
        stopFlushInterval()
        flushPending()
        // The backend answered the send with a refusal (4xx) before any run: it never took
        // the message. A 409 "already_sent" is the opposite (other 409s, such as a paused
        // agent, are refusals). Anything else (a dropped
        // connection, a 5xx) can't rule out that it did, so it is not reported.
        if (!follow && !runStarted && failedStatus >= 400 && failedStatus < 500 && !isAlreadySent(failedStatus, failedBody)) {
          options?.onSendRefused?.()
        }
        completeStream(resolvedChatIdRef.current, stopRequestedRef.current ? "aborted" : "error")
        // A turn that failed or was stopped part-way may still have saved its files.
        if (options?.files?.length) notifyLibraryFilesChanged()

        // User-initiated stop - not an error
        if (stopRequestedRef.current) {
          if (isActiveStream()) setStreamState?.("aborted")
          return "aborted"
        }

        // A follow that never reached the stream leaves the reply to whoever started it.
        if (!attached) {
          followResultRef.current = failedStatus === 404 ? "gone" : "failed"
          return "error"
        }

        // The connection dropped but the backend is still running the turn: read
        // it again from its stream. A regular chat only; other endpoints have none.
        const liveChatId = resolvedChatIdRef.current
        const attempt = options?.followAttempt ?? 0
        if (
          error instanceof ConnectionDroppedError &&
          endpoint === "/api/chat" && !directEndpoints &&
          liveChatId && !liveChatId.startsWith("temp-") &&
          !stopRequestedRef.current &&
          attempt < FOLLOW_ATTEMPTS
        ) {
          // Read while this call still holds the refs: during the wait another chat's
          // call can take them, and its reply id must not become this retry's.
          const retryReplyId = loadingMessageIdRef.current ?? loadingMessageId
          const retryUserMessageId = userMessageIdRef.current ?? undefined
          await new Promise((resolve) => setTimeout(resolve, FOLLOW_RETRY_MS))
          // Taken over during the wait: the newer call reset stopRequestedRef, so that
          // alone would let this one start a second follow into the newer call's reply.
          if (detached) return "done"
          // Stopped during the wait: Stop has already settled the reply as stopped, and this
          // turn ends that way too, not as the error that led to the wait.
          if (stopRequestedRef.current) return "aborted"
          const outcome = await fetchAiResponse("", liveChatId, retryReplyId, null, {
            follow: true,
            followAttempt: attempt + 1,
            userMessageId: retryUserMessageId,
            prior: options?.prior,
          })
          const result = followResultRef.current
          followResultRef.current = "attached"
          if (result === "attached") return outcome
          if (result === "gone") {
            completeStream(liveChatId, "done")
            if (showsChat(liveChatId, false)) setStreamState?.("done")
            onStreamLost?.(liveChatId)
            onStreamDone?.()
            return "done"
          }
        }

        // A FriendlyStreamError was already logged where it was raised (status, endpoint,
        // body); logging it again here only doubles the dev overlay's issue count.
        if (!(error instanceof FriendlyStreamError)) logger.error("[useStreamingChat] Error", error)

        if (error instanceof AuthExpiredError) {
          if (isActiveStream()) setStreamState?.("error")
          // Settle the reply (no cursor or busy state) while the sign-out runs.
          if (!turn.streamFinished) finishTurn(ctx, turn, "error", SESSION_EXPIRED_MESSAGE)
          dispatchSessionExpired()
          return "error"
        }

        const rawMsg =
          error instanceof Error ? error.message : "Failed to connect to AI service"
        const lower = rawMsg.toLowerCase()

        // Fallback for errors that never passed through the XHR reject paths
        // (e.g. a synchronous throw earlier in this function), so weren't
        // already classified as AuthExpiredError there.
        if (isAuthErrorText(lower) || lower.includes("401")) {
          if (isActiveStream()) setStreamState?.("error")
          if (!turn.streamFinished) finishTurn(ctx, turn, "error", SESSION_EXPIRED_MESSAGE)
          dispatchSessionExpired()
          return "error"
        }

        if (isActiveStream()) setStreamState?.("error")
        // A turn already finished by its done/error event keeps that outcome.
        if (!turn.streamFinished) {
          // Errors from the XHR paths are already translated by
          // friendlyModelError at the point of failure, when the real status
          // code / raw backend text was still available. Re-running the
          // translator on that already-friendly text would match no known
          // pattern and flatten it into the generic fallback — so only
          // translate genuinely-raw messages here.
          finishTurn(ctx, turn, "error", error instanceof FriendlyStreamError ? rawMsg : friendlyModelError(rawMsg))
        }
        return "error"
      }
    }
    const outcome = await runCall().catch((error: unknown) => {
      releaseThisCall()
      throw error
    })
    releaseThisCall()
    return outcome
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const adoptChatId = (chatId: string) => {
    if (resolvedChatIdRef.current === chatId) return
    if (resolvedChatIdRef.current && !resolvedChatIdRef.current.startsWith("temp-")) return
    resolvedChatIdRef.current = chatId
    registerStream(chatId, activeStopRef.current ?? undefined)
    onChatCreated?.(chatId)
  }

  /**
   * Reads a chat's running turn into the loading reply `loadingMessageId`, from
   * the turn's first event — for a chat opened while its reply is still being
   * generated. A turn that has ended by then is in the chat's history instead.
   */
  /** `onRefused` runs when the follow never reached the turn's stream (not when it
   *  attached and later ended), before the history reload that onStreamLost starts. */
  const followStream = async (chatId: string, loadingMessageId: string, prior?: UIMessage, onRefused?: () => void): Promise<StreamOutcome> => {
    let leftBeforeStart = false
    const outcome = await fetchAiResponse("", chatId, loadingMessageId, null, {
      follow: true, prior, onLeftBeforeStart: () => { leftBeforeStart = true },
    })
    // Never started (the user left the chat while it waited): nothing to settle, and the
    // shared result belongs to whichever call ran last. Reopening the chat follows afresh.
    if (leftBeforeStart) return "done"
    const result = followResultRef.current
    followResultRef.current = "attached"
    if (result === "attached") return outcome
    completeStream(chatId, "done")
    if (showsChat(chatId, false)) setStreamState?.("done")
    onRefused?.()
    onStreamLost?.(chatId)
    return "done"
  }

  return { fetchAiResponse, followStream, handleStopGeneration }
}
