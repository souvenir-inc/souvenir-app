import { describe, it, expect, vi, beforeEach } from "vitest";

// getChatRunState answers "running" or "idle" only when the backend actually said so.
const apiFetch = vi.fn();
vi.mock("./client", async (orig) => ({
  ...(await orig<typeof import("./client")>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

import { getChatRunState } from "./chat";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => apiFetch.mockReset());

describe("getChatRunState", () => {
  it("is running when the chat has a stream, idle when it has none", async () => {
    apiFetch.mockResolvedValueOnce(json({ streamId: "s-1" }));
    await expect(getChatRunState("c1")).resolves.toBe("running");
    apiFetch.mockResolvedValueOnce(json({ streamId: null }));
    await expect(getChatRunState("c1")).resolves.toBe("idle");
  });

  it("throws, rather than answering idle, when it can't tell", async () => {
    apiFetch.mockResolvedValueOnce(json({ detail: "unavailable" }, 503));
    await expect(getChatRunState("c1")).rejects.toThrow(/503/);
    apiFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(getChatRunState("c1")).rejects.toThrow("Failed to fetch");
  });
});
