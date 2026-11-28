// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest"
import type { SelectedPersonaInfo } from "@/lib/chat-personas"
import { CHAT_SETTINGS_LIMIT, clearChatSettings, forgetChatSettings, loadChatSettings, saveChatSettings } from "./chat-settings-storage"

const persona: SelectedPersonaInfo = {
  id: "p1", name: "Analyst", handle: "analyst", imageUrl: null, modelId: "m1", activeVersionId: "v1",
  systemPrompt: "Secret instructions", temperature: 0.4, visibility: "private", ownedByViewer: true,
  description: "", tags: [], paused: false, shared: false,
}

describe("chat settings on this device", () => {
  beforeEach(() => localStorage.clear())

  it("keeps web search and the agent, never the agent's instructions", () => {
    saveChatSettings("c1", { webSearch: true, persona })
    expect(localStorage.getItem("souvenir_chat_c1")).not.toContain("Secret instructions")
    expect(loadChatSettings("c1")).toEqual({ webSearch: true, persona: { ...persona, systemPrompt: null, temperature: null } })
  })

  it("reads an old entry that still has instructions without handing them back", () => {
    localStorage.setItem("souvenir_chat_old", JSON.stringify({ webSearch: false, persona }))
    expect(loadChatSettings("old")?.persona?.systemPrompt).toBeNull()
  })

  it("ignores an entry it can't read", () => {
    localStorage.setItem("souvenir_chat_bad", "{not json")
    expect(loadChatSettings("bad")).toBeNull()
    localStorage.setItem("souvenir_chat_odd", JSON.stringify({ persona: { name: "no id" } }))
    expect(loadChatSettings("odd")).toEqual({ webSearch: false, persona: null })
  })

  it("forgets the least recently used chats past the limit", () => {
    for (let i = 0; i <= CHAT_SETTINGS_LIMIT; i++) saveChatSettings(`c${i}`, { webSearch: false, persona: null })
    expect(loadChatSettings("c0")).toBeNull()
    expect(loadChatSettings(`c${CHAT_SETTINGS_LIMIT}`)).not.toBeNull()
  })

  it("a deleted chat's settings go, and signing out clears them all", () => {
    saveChatSettings("c1", { webSearch: true, persona: null })
    saveChatSettings("c2", { webSearch: true, persona: null })
    forgetChatSettings("c1")
    expect(loadChatSettings("c1")).toBeNull()
    localStorage.setItem("souvenir_chat_legacy", "{}")
    localStorage.setItem("unrelated", "1")
    clearChatSettings()
    expect(Object.keys(localStorage).filter((k) => k.startsWith("souvenir_chat_"))).toEqual([])
    expect(localStorage.getItem("unrelated")).toBe("1")
  })
})
