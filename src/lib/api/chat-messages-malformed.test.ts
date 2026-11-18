import { describe, it, expect, vi } from "vitest";

// History is boundary data. A malformed `prompts` field on one turn used to throw
// inside getChatMessages and reject the whole page, losing every message on it.
const question = {
  event: "question_prompt", prompt_id: "q1", respond_url: "/chats/c1/questions/q1",
  questions: [{ id: "which", question: "Which store?", type: "text" }],
};

vi.mock("./client", async (orig) => ({
  ...(await orig<typeof import("./client")>()),
  apiFetch: vi.fn(async () => new Response(JSON.stringify({ results: [
    { id: "t1", input: "first", output: "one", created_at: "2026-11-18T00:00:00Z", prompts: [null, question] },
    { id: "t2", input: "second", output: "two", created_at: "2026-11-18T00:01:00Z", prompts: { event: "question_prompt" } },
    { id: "t3", input: "third", output: "three", created_at: "2026-11-18T00:02:00Z", prompts: "question_prompt" },
    { id: "t4", input: "fourth", output: "four", created_at: "2026-11-18T00:03:00Z", prompts: [42, "x", { event: 7 }, { event: "not_a_prompt" }] },
  ] }), { status: 200 })),
}));

import { getChatMessages } from "./chat";

describe("getChatMessages with malformed prompts", () => {
  it("still returns every turn on the page", async () => {
    const { messages } = await getChatMessages("c1");
    expect(messages.filter((m) => m.role === "assistant").map((m) => m.id)).toEqual(["t1", "t2", "t3", "t4"]);
  });

  it("skips a null entry and keeps the valid card beside it", async () => {
    const { messages } = await getChatMessages("c1");
    const t1 = messages.find((m) => m.id === "t1");
    expect(t1?.prompts).toHaveLength(1);
    expect(t1?.prompts?.[0]).toMatchObject({ card: "chat", request_id: "q1" });
  });

  it("treats a prompts value that is not an array as no cards", async () => {
    const { messages } = await getChatMessages("c1");
    expect(messages.find((m) => m.id === "t2")?.prompts).toBeUndefined();
    expect(messages.find((m) => m.id === "t3")?.prompts).toBeUndefined();
  });

  it("skips entries that are not objects or carry no known event name", async () => {
    const { messages } = await getChatMessages("c1");
    expect(messages.find((m) => m.id === "t4")?.prompts).toBeUndefined();
  });
});
