import { describe, it, expect, vi } from "vitest";

// A turn the person stopped mid-<think> is saved with an unclosed block. It says "Generation
// stopped"; the "ended before the answer was written" failure notice (with its retry) must not
// show beside it. A turn that ended that way without a Stop still gets the notice.
const run = (status: string) => ({ id: "r", status, segments: 1, startedAt: "2026-11-18T00:00:00Z" });
vi.mock("./client", async (orig) => ({
  ...(await orig<typeof import("./client")>()),
  apiFetch: vi.fn(async () => new Response(JSON.stringify({ results: [
    { id: "s1", sender: "assistant", content: "<think>still going", created_at: "2026-11-18T00:00:01Z", run: run("stopped") },
    { id: "s2", sender: "assistant", content: "<think>still going", created_at: "2026-11-18T00:00:02Z", run: run("completed") },
    { id: "p1", input: "hi", output: "<think>still going", created_at: "2026-11-18T00:00:03Z", run: run("stopped") },
    { id: "p2", input: "hi", output: "<think>still going", created_at: "2026-11-18T00:00:04Z", run: run("completed") },
  ] }), { status: 200 })),
}));

import { getChatMessages } from "./chat";
import { INCOMPLETE_ANSWER_MESSAGE } from "@/lib/turn-outcome";

describe("getChatMessages, an unfinished answer", () => {
  it("shows no failure notice on a stopped turn, in either format", async () => {
    const { messages } = await getChatMessages("c1");
    const notice = (id: string) => messages.find((m) => m.id === id)?.errorNotice;
    // The stopped replies are there (a dropped row would pass the checks below too).
    for (const id of ["s1", "p1"]) {
      expect(messages.find((m) => m.id === id)).toMatchObject({ role: "assistant", run: { status: "stopped" } });
    }
    expect(notice("s1")).toBeUndefined();
    expect(notice("p1")).toBeUndefined();
    expect(notice("s2")).toBe(INCOMPLETE_ANSWER_MESSAGE);
    expect(notice("p2")).toBe(INCOMPLETE_ANSWER_MESSAGE);
  });
});
