/**
 * Whether a message from the composer waits in the queue rather than going out now: a reply is
 * still going (streaming here, or named running by the history before anything here reads it),
 * a send is already starting, the save question is open, or messages are already waiting. Each
 * of those would otherwise put the new turn into, or ahead of, another one.
 */
export function composerMustQueue(state: {
  replyInFlight: boolean
  runningMessageId: string | null | undefined
  sending: boolean
  askingSave: boolean
  hasQueue: boolean
}): boolean {
  return state.replyInFlight || !!state.runningMessageId || state.sending || state.askingSave || state.hasQueue
}

/**
 * The running reply sends wait on: the history's, unless the chat has its own endpoint. Such a
 * chat's reply is neither followed nor watched for its run's end (the run-state lookup covers
 * the regular chat endpoint only), so nothing would ever clear it and every send would wait.
 */
export function runningReplyToWaitOn(historyRunningId: string | null, endpoint: string | undefined): string | null {
  return endpoint ? null : historyRunningId
}
