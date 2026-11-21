// A connect card's answers, kept outside the card (module-level): they outlive a card that
// leaves the virtual list and remounts. Not in the component file, so Fast Refresh can keep
// that file's component state.

export type ConnectDecision = 'connected' | 'cancel'

// Answers on their way to the backend, by the prompt's respond URL (unique to that prompt; a
// request id can repeat across messages): the decision sent and how it ends (null, or
// the failure). Module-level: it outlives a card that leaves the virtual list and remounts,
// which must neither send the answer again nor lose its outcome (a failure, with Try again).
export const answersInFlight = new Map<string, { decision: ConnectDecision; outcome: Promise<Error | null> }>()
// Answers that did not reach the backend, by respond URL, until one does: a card that unmounted
// meanwhile would otherwise lose its answer, and the card that mounts next must offer that
// answer's retry, not answer afresh (a "Not now" must never turn into "connected").
export const failedAnswers = new Map<string, { decision: ConnectDecision; message: string }>()
/** For tests: forget every answer in flight or failed. */
export function resetConnectPromptAnswers(): void {
  answersInFlight.clear()
  failedAnswers.clear()
}
