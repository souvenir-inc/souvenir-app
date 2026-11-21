import { describe, it, expect, vi } from "vitest";

// History in the single-role format (one row per message, sender/content): an assistant row
// keeps its run, as the paired format does, so a turn the person stopped still says so.
vi.mock("./client", async (orig) => ({
  ...(await orig<typeof import("./client")>()),
  apiFetch: vi.fn(async () => new Response(JSON.stringify({ results: [
    { id: "u1", sender: "user", content: "hello", created_at: "2026-11-18T00:00:00Z" },
    { id: "a1", sender: "assistant", content: "partial", created_at: "2026-11-18T00:00:01Z",
      run: { id: "r1", status: "stopped", segments: 1, startedAt: "2026-11-18T00:00:00Z" } },
  ] }), { status: 200 })),
}));

import { getChatMessages } from "./chat";

describe("getChatMessages, single-role rows", () => {
  it("keeps the run on an assistant row", async () => {
    const { messages } = await getChatMessages("c1");
    expect(messages.find((m) => m.id === "a1")?.run).toMatchObject({ status: "stopped" });
    expect(messages.find((m) => m.id === "u1")?.run).toBeUndefined();
  });
});
