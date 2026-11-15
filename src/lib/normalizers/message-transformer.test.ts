import { describe, expect, it } from "vitest"

import { parseSteps } from "@/lib/chat/steps"
import { toUIMessage } from "@/lib/normalizers/message-transformer"
import { messageParts } from "@/lib/reasoning"
import { INCOMPLETE_ANSWER_MESSAGE } from "@/lib/turn-outcome"
import type { Message } from "@/types/chat"

const base: Message = {
  id: "m1",
  role: "assistant",
  content: "Here is what I found.",
  created_at: "2026-10-04T00:00:00Z",
  chat_id: "c1",
}

describe("toUIMessage", () => {
  it("rebuilds the turn from its saved steps, in order", () => {
    const ui = toUIMessage({
      ...base,
      content: "Looking it up.\n\nHere is what I found.",
      thinking: "Check the population.",
      steps: parseSteps([
        { kind: "reasoning", text: "Check the population.", at: 1_000, endAt: 1_500 },
        { kind: "text", text: "Looking it up.", at: 1_600, endAt: 1_900 },
        {
          kind: "tool", id: "call-a", tool: "search_web", args: { query: "paris population" }, at: 2_000, endAt: 3_200, failed: false,
          results: [{ title: "Paris", url: "https://en.wikipedia.org/wiki/Paris", snippet: "Capital of France" }],
        },
        { kind: "tool", id: "call-b", tool: "read_url", args: { url: "https://insee.fr" }, at: 3_300, endAt: 3_700, failed: true, results: [] },
        { kind: "tool", id: "call-c", tool: "csv_execute", args: null, at: 3_800, endAt: null, failed: false, results: [] },
        { kind: "text", text: "\n\nHere is what I found.", at: 4_000, endAt: 4_400 },
      ]),
    })
    expect(ui.activities).toEqual([
      {
        id: "call-a", type: "web-search", toolName: "search_web", detail: "paris population", status: "done", durationS: 1.2,
        results: [{ title: "Paris", url: "https://en.wikipedia.org/wiki/Paris", domain: "en.wikipedia.org" }],
      },
      { id: "call-b", type: "tool-call", toolName: "read_url", detail: "https://insee.fr", status: "error", durationS: 0.4 },
      { id: "call-c", type: "csv-execute", toolName: "csv_execute", detail: undefined, status: "stopped" },
    ])
    expect(ui.reasoningTimeline).toEqual([
      { kind: "reasoning", id: "reasoning-0", content: "Check the population.", at: 1_000, endAt: 1_500 },
      { kind: "text", id: "text-1", start: 0 },
      { kind: "activity", id: "activity-2", activityId: "call-a", at: 2_000, endAt: 3_200 },
      { kind: "activity", id: "activity-3", activityId: "call-b", at: 3_300, endAt: 3_700 },
      { kind: "activity", id: "activity-4", activityId: "call-c", at: 3_800 },
      { kind: "text", id: "text-5", start: 16 },
    ])
    expect(messageParts(ui.reasoningTimeline!, ui.content).map((part) => part.kind === "text" ? part.content : part.items.length))
      .toEqual([1, "Looking it up.", 3, "Here is what I found."])
    // The raw steps are not kept in UI state.
    expect("steps" in ui).toBe(false)
  })

  it("reads a turn saved without steps as its text alone", () => {
    const ui = toUIMessage({ ...base, thinking: "plan" })
    expect(ui.activities).toBeUndefined()
    expect(ui.reasoningTimeline).toBeUndefined()
    expect(messageParts([], ui.content)).toEqual([{ kind: "text", id: "text", content: "Here is what I found." }])
  })

  it("drops steps that do not match the schema", () => {
    expect(parseSteps([{ kind: "tool", tool: "search_web" }])).toEqual([])
    expect(parseSteps(null)).toEqual([])
  })

  it("shows an incomplete answer with nothing else as the full error", () => {
    const ui = toUIMessage({ ...base, content: "", thinking: "plan", errorNotice: INCOMPLETE_ANSWER_MESSAGE })
    expect(ui).toMatchObject({ content: INCOMPLETE_ANSWER_MESSAGE, isError: true, errorNotice: undefined, thinking: "plan" })
  })

  it("keeps the notice inline when something else is shown", () => {
    const ui = toUIMessage({ ...base, content: "", errorNotice: INCOMPLETE_ANSWER_MESSAGE, image_links: ["https://img/x.png"] })
    expect(ui).toMatchObject({ content: "", isError: false, errorNotice: INCOMPLETE_ANSWER_MESSAGE })
  })
  it("gives a generated file its Library id only while the Library copy can be opened", () => {
    const ui = toUIMessage({
      ...base,
      file_attachments: [
        { file_link: "https://s3/a.docx", file_name: "a.docx", origin: "generated", document_id: "d1", libraryState: "open" },
        { file_link: "https://s3/b.pdf", file_name: "b.pdf", origin: "generated", document_id: "d2", libraryState: "deleted" },
        { file_link: "https://s3/c.csv", file_name: "c.csv", origin: "generated" },
      ],
    } as Message)
    expect(ui.generatedFiles).toEqual([
      { url: "https://s3/a.docx", filename: "a.docx", mimeType: undefined, documentId: "d1" },
      { url: "https://s3/b.pdf", filename: "b.pdf", mimeType: undefined },
      { url: "https://s3/c.csv", filename: "c.csv", mimeType: undefined },
    ])
  })

  it("keeps a file the backend did not label as the user's own, rather than dropping it", () => {
    // A row without `origin` (or with one nobody anticipated) used to match
    // neither branch and vanish from the bubble entirely.
    const ui = toUIMessage({
      ...base,
      role: "user",
      content: "see this",
      file_attachments: [
        { file_link: "https://s3/no-origin.png", file_name: "no-origin.png", mime_type: "image/png" },
        { file_link: "https://s3/odd.png", file_name: "odd.png", mime_type: "image/png", origin: "file" },
      ],
    } as Message)
    expect(ui.attachments?.map((a) => a.file_name)).toEqual(["no-origin.png", "odd.png"])
    expect(ui.generatedFiles).toBeUndefined()
  })
})
