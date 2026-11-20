"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAuth } from "@/context/auth-context";
import { useChatHistoryContext } from "@/context/chat-history-context";
import { useOrgPlan } from "@/context/org-context";
import { useCreditStatus } from "@/hooks/use-credit-status";
import { useStreamingChat } from "@/hooks/use-streaming-chat";
import { trackBrowserEvent } from "@/lib/analytics/events";
import {
  beginHandOver,
  endHandOver,
  hasQueuedMessages,
  queuedChatsReadyForBackground,
  subscribeQueue,
  restoreQueuedMessage,
  takeNextQueuedMessage,
  type QueuedMessage,
} from "@/lib/message-queue";
import { completeStream, registerStream, setStreamDetach } from "@/lib/stream-registry";
import { getChatRunState } from "@/lib/api/chat";
import { buildTurnOptions } from "@/lib/turn-options";
import type { UIMessage } from "@/types/chat";

interface BackgroundSend {
  chatId:  string;
  message: QueuedMessage;
  /** One per reservation: a message handed back and taken again gets a fresh worker. */
  key:     number;
}
let nextSendKey = 0;

/**
 * Sends the next queued message of a chat that isn't on screen once the reply it
 * was waiting on has finished — by then the user may be in another chat, or
 * another tab. Mounted once for the app; see message-queue.ts. (A chat on
 * screen sends its own, with the usual streaming UI.)
 */
export function MessageQueueRunner() {
  const [sends, setSends] = useState<BackgroundSend[]>([]);
  const [hasQueued, setHasQueued] = useState(false);
  const creditStatus = useCreditStatus();
  const { plan } = useOrgPlan();
  // Out of credits, personally or as a workspace: messages stay queued; the chat's own view shows why.
  const blocked = creditStatus.blocked || plan?.poolStatus === "paused";

  useEffect(() => {
    // Taking a message notifies the queue, which calls straight back in here.
    // Passes never nest — a nested one would see the chat as idle before its
    // stream is reserved and send its next message alongside — they rerun.
    let reconciling = false;
    let again = false;
    const reconcile = () => {
      if (reconciling) {
        again = true;
        return;
      }
      reconciling = true;
      try {
        do {
          again = false;
          setHasQueued(hasQueuedMessages());
          if (blocked) break;
          for (const chatId of queuedChatsReadyForBackground()) {
            const message = takeNextQueuedMessage(chatId);
            if (!message) continue;
            // Reserved now, ahead of the request: the chat counts as busy (one
            // message per reply), and opening it meanwhile waits for this reply.
            registerStream(chatId);
            setSends((prev) => [...prev, { chatId, message, key: ++nextSendKey }]);
          }
        } while (again);
      } finally {
        reconciling = false;
      }
    };
    reconcile();
    return subscribeQueue(reconcile);
  }, [blocked]);

  // A reload would lose what's still queued or being sent from here.
  const busy = hasQueued || sends.length > 0;
  useEffect(() => {
    if (!busy) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [busy]);

  return (
    <>
      {sends.map((send) => (
        <BackgroundSendTurn
          key={send.key}
          send={send}
          onDone={() => setSends((prev) => prev.filter((s) => s !== send))}
        />
      ))}
    </>
  );
}

// Nothing on screen to update: the chat reloads from the API when opened.
const IGNORE_MESSAGES: React.Dispatch<React.SetStateAction<UIMessage[]>> = () => {};
// How often a queued send asks whether the chat's previous run has ended.
export const RUN_POLL_MS = 3000;
// Failed checks in a row before a queued send stops trying and holds its message.
export const RUN_CHECK_ATTEMPTS = 5;

/** One queued message going out, on its own streaming hook (one stream each). */
function BackgroundSendTurn({ send, onDone }: { send: BackgroundSend; onDone: () => void }) {
  const { refreshUser } = useAuth();
  const { moveToTop } = useChatHistoryContext();
  const { chatId, message } = send;
  const { settings, modelId, endpoint, onStopBackend } = message.context;

  const { fetchAiResponse } = useStreamingChat({
    setMessages: IGNORE_MESSAGES,
    onChatMoveToTop: moveToTop,
    onStreamDone: refreshUser,
    ...(endpoint ? { endpoint } : {}),
    ...(onStopBackend ? { onStopBackend } : {}),
  });

  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  // Out of credits now? Checked again just before sending: credits can run out while a
  // send waits for the chat's run to end.
  const creditStatus = useCreditStatus();
  const { plan } = useOrgPlan();
  const blocked = creditStatus.blocked || plan?.poolStatus === "paused";
  const blockedRef = useRef(blocked);
  // During commit, so a check that resolves right after a credit change already sees it.
  useLayoutEffect(() => {
    blockedRef.current = blocked;
  });

  // Whether this send is still mounted, and a signal that fires on a real unmount so a
  // wait in progress (a request or the pause between checks) stops at once. Strict Mode
  // mounts, cleans up and mounts again: the cleanup only marks it unmounted, and the
  // signal fires a microtask later if nothing has mounted it again by then.
  const mountedRef = useRef(true);
  const unmountRef = useRef<{ fired: boolean; listeners: Set<() => void> } | null>(null);
  // Created by whichever effect runs first (the send's effect reads it too), so it never depends on effect order.
  const unmountSignal = () => {
    unmountRef.current ??= { fired: false, listeners: new Set() };
    return unmountRef.current;
  };
  const fireUnmount = () => {
    const signal = unmountSignal();
    signal.fired = true;
    for (const listener of signal.listeners) listener();
    signal.listeners.clear();
  };
  // `step`, or "unmounted" as soon as the send unmounts. Each step's listener is removed
  // when the step settles, so a long wait doesn't pile them up.
  const untilUnmount = <T,>(step: Promise<T>): Promise<T | "unmounted"> => {
    const signal = unmountSignal();
    if (signal.fired) return Promise.resolve("unmounted");
    let listener = () => {};
    const unmounted = new Promise<"unmounted">((resolve) => {
      listener = () => resolve("unmounted");
      signal.listeners.add(listener);
    });
    const done = () => { signal.listeners.delete(listener); };
    return Promise.race([step, unmounted]).then(
      (value) => { done(); return value; },
      (error: unknown) => { done(); throw error; },
    );
  };
  useEffect(() => {
    mountedRef.current = true;
    unmountSignal();
    return () => {
      mountedRef.current = false;
      queueMicrotask(() => { if (!mountedRef.current) fireUnmount(); });
    };
  }, []);

  // Strict Mode runs effects twice; the message goes out once.
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const files = message.attachments.map((a) => a.file);
    const options = buildTurnOptions(settings, {
      files,
      mentionedPinIds: message.mentionedPins.map((p) => p.id),
    });

    // Analytics: same event and metadata as a send from the chat itself.
    trackBrowserEvent("chat_message_sent", {
      has_agent: !!settings.personaId,
      model_pick: "manual",
      model_id: modelId != null ? String(modelId) : undefined,
      web_search: settings.webSearch,
      reasoning: settings.reasoningEffort === undefined ? undefined : settings.reasoningEffort !== null,
      attachment_count: files.length,
      pin_count: options.pinIds?.length ?? 0,
      queued: true,
    });

    // The registry is what this tab knows; the backend is the source of truth. A chat
    // can look idle here while its run is still going (left mid-reply, or left again
    // while it was being reopened), and a message sent into a running turn is lost to
    // it. So the reservation is held and the backend asked until the run has ended.
    // "Can't tell" is not "idle": after RUN_CHECK_ATTEMPTS failed checks in a row the
    // message is held rather than sent.
    const waitForIdleRun = async (): Promise<"idle" | "unmounted" | "unknown"> => {
      // A turn for a chat's own endpoint (an agent chat, say) has no run state on the chat
      // API this asks: it would read another run, or none. For those the registry stays
      // the gate, as it was: the reply this message waited on has ended here.
      if (endpoint) return "idle";
      let failures = 0;
      for (;;) {
        if (!mountedRef.current) return "unmounted";
        try {
          // Raced with the unmount signal: a request still out when the app goes away
          // is not waited for.
          const state = await untilUnmount(getChatRunState(chatId));
          if (state === "unmounted") return "unmounted";
          if (state === "idle") return "idle";
          failures = 0;
        } catch {
          failures += 1;
          if (failures >= RUN_CHECK_ATTEMPTS) return "unknown";
        }
        const paused = await untilUnmount(
          new Promise<"waited">((resolve) => setTimeout(() => resolve("waited"), RUN_POLL_MS)),
        );
        if (paused === "unmounted") return "unmounted";
      }
    };

    // Opening the chat while this waits hands the message over to it: the wait stops, the
    // reservation goes at once (so the chat loads its history rather than waiting on it),
    // and the message returns to the front of the chat's queue for the chat itself to send.
    // It returns a tick later, once the opening chat has marked its queue as on screen, so
    // the background runner doesn't take it straight back. Removed just before sending:
    // a send under way is never handed over (it could then go out twice).
    let handedOff = false;
    registerStream(chatId, undefined, () => {
      handedOff = true;
      fireUnmount();
      // Until it is back, the queue's next message can't go out in the background ahead of it.
      beginHandOver(chatId);
      setTimeout(() => {
        restoreQueuedMessage(chatId, message, 0);
        endHandOver(chatId);
      }, 0);
    });

    waitForIdleRun()
      .then((state) => {
        if (handedOff) return;
        setStreamDetach(chatId, undefined);
        if (state === "idle" && mountedRef.current && blockedRef.current) {
          // Out of credits meanwhile: the message stays queued, unsent, and the
          // reservation ends as "done" (no hold), so the runner sends it once unblocked.
          restoreQueuedMessage(chatId, message, 0);
          completeStream(chatId, "done");
          return;
        }
        if (state === "idle" && mountedRef.current) {
          // The message left the queue to be sent. Only if the backend refused it outright
          // (it never took it) does it go back, to the front and held, so it waits for the
          // user rather than going straight out again. Any other failure may have reached
          // the backend: re-sending could repeat it, so it stays with the chat's failed turn.
          let refused = false;
          return fetchAiResponse(message.content, chatId, `queued-${message.id}`, modelId, {
            ...options,
            onSendRefused: () => { refused = true; },
          }).then(() => {
            if (refused) restoreQueuedMessage(chatId, message, 0, "error");
          });
        }
        // Not sent: the message goes back to the front of its queue, and the reservation
        // ends without "done", which holds that queue (message-queue.ts) until the user
        // sends again rather than letting the next pass try at once.
        restoreQueuedMessage(chatId, message, 0);
        completeStream(chatId, state === "unknown" ? "error" : "aborted");
      })
      // fetchAiResponse settles every stream itself; this only frees the
      // reservation if it threw before getting that far.
      .catch(() => { if (!handedOff) completeStream(chatId, "error"); })
      .finally(() => onDoneRef.current());
  // eslint-disable-next-line react-hooks/exhaustive-deps -- sends once, on mount
  }, []);

  return null;
}
