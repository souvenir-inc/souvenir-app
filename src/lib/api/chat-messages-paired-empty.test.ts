import { describe, it, expect, vi } from "vitest";

// A file-only turn saves `input: ""` and `output: ""`: it is still a pair (the person's upload,
// then the reply), and its run and cards come back with it. A reply saved on its own row (the
// single-role format) keeps its cards too.
const run = (status: string) => ({ id: "r1", status, segments: 1, startedAt: "2026-11-25T00:00:00Z" });
const question = {
  event: "question_prompt", prompt_id: "q1", respond_url: "/chats/c1/questions/q1",
  questions: [{ id: "which", question: "Which store?", type: "text" }],
};

vi.mock("./client", async (orig) => ({
  ...(await orig<typeof import("./client")>()),
  apiFetch: vi.fn(async () => new Response(JSON.stringify({ results: [
    { id: "f1", input: "", output: "", created_at: "2026-11-25T00:00:00Z", run: run("running"), prompts: [question],
      file_attachments: [{ id: "file-1", file_name: "sales.csv", file_type: "text/csv", file_size: 10, origin: "uploaded" }] },
    { id: "s1", sender: "assistant", content: "Working", created_at: "2026-11-25T00:01:00Z", run: run("waiting"), prompts: [question, null] },
  ] }), { status: 200 })),
}));

import { getChatMessages } from "./chat";

describe("getChatMessages, turns with no text", () => {
  it("reads a file-only turn as the person's upload and a reply that is still running", async () => {
    const { messages } = await getChatMessages("c1");
    const user = messages.find((m) => m.id === "f1-prompt");
    const reply = messages.find((m) => m.id === "f1");
    expect(user?.file_attachments?.[0]).toMatchObject({ file_name: "sales.csv" });
    expect(reply).toMatchObject({ role: "assistant", run: { status: "running" }, errorNotice: undefined });
    expect(reply?.prompts).toHaveLength(1);
  });

  it("keeps the cards on a single-role reply, skipping a malformed entry", async () => {
    const { messages } = await getChatMessages("c1");
    const reply = messages.find((m) => m.id === "s1");
    expect(reply?.run).toMatchObject({ status: "waiting" });
    expect(reply?.prompts).toHaveLength(1);
  });
});
