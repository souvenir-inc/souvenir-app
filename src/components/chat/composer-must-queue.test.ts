import { describe, expect, it } from "vitest"
import { composerMustQueue } from "./composer-must-queue"

const idle = { replyInFlight: false, runningMessageId: null, sending: false, askingSave: false, hasQueue: false }

describe("composerMustQueue", () => {
  it("sends at once when nothing is going", () => {
    expect(composerMustQueue(idle)).toBe(false)
  })

  it("queues while the history names a reply still running, as the queued path waits for it", () => {
    expect(composerMustQueue({ ...idle, runningMessageId: "turn-A" })).toBe(true)
  })

  it("queues behind a streaming reply, a send starting, the save question, or waiting messages", () => {
    for (const key of ["replyInFlight", "sending", "askingSave", "hasQueue"] as const) {
      expect(composerMustQueue({ ...idle, [key]: true })).toBe(true)
    }
  })
})
