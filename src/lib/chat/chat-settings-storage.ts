import { z } from "zod"
import type { SelectedPersonaInfo } from "@/lib/chat-personas"

// What each chat remembers on this device: web search on or off, and the agent attached to it, so
// going back to a chat finds it as it was. The agent's instructions and temperature are never
// kept (the chat reads them from the agent's current version), the entries are capped, and they
// go with the chat and with signing out: on a shared computer, the next person must not find them.

export const CHAT_SETTINGS_PREFIX = "souvenir_chat_"
const INDEX_KEY = "souvenir_chat_settings_index"
/** Chats remembered at most; the least recently used go first. */
export const CHAT_SETTINGS_LIMIT = 50

export interface ChatSettings {
  webSearch: boolean
  persona: SelectedPersonaInfo | null
}

const personaSchema = z.object({
  id: z.string(),
  name: z.string().catch(""),
  handle: z.string().catch(""),
  imageUrl: z.string().nullable().catch(null),
  modelId: z.string().nullable().catch(null),
  activeVersionId: z.string().nullable().catch(null),
  visibility: z.enum(["private", "team"]).catch("private"),
  ownedByViewer: z.boolean().catch(false),
  description: z.string().catch(""),
  tags: z.array(z.string()).catch([]),
  paused: z.boolean().catch(false),
  shared: z.boolean().catch(false),
})

const settingsSchema = z.object({
  webSearch: z.boolean().catch(false),
  persona: personaSchema.nullable().catch(null),
})

const keyOf = (chatId: string) => `${CHAT_SETTINGS_PREFIX}${chatId}`

function readIndex(): string[] {
  try {
    const parsed = z.array(z.string()).safeParse(JSON.parse(localStorage.getItem(INDEX_KEY) ?? "[]"))
    return parsed.success ? parsed.data : []
  } catch {
    return []
  }
}

function writeIndex(ids: string[]): void {
  try { localStorage.setItem(INDEX_KEY, JSON.stringify(ids)) } catch { /* storage off */ }
}

/** The chat's settings as saved here, or null (none, or not readable). */
export function loadChatSettings(chatId: string): ChatSettings | null {
  try {
    const raw = localStorage.getItem(keyOf(chatId))
    if (!raw) return null
    const parsed = settingsSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) return null
    const { persona } = parsed.data
    return { webSearch: parsed.data.webSearch, persona: persona ? { ...persona, systemPrompt: null, temperature: null } : null }
  } catch {
    return null
  }
}

/** Saves the chat's settings, without the agent's instructions, and forgets the oldest past the limit. */
export function saveChatSettings(chatId: string, settings: ChatSettings): void {
  const persona = settings.persona
  const stored = {
    webSearch: settings.webSearch,
    persona: persona ? { ...persona, systemPrompt: undefined, temperature: undefined } : null,
  }
  try {
    localStorage.setItem(keyOf(chatId), JSON.stringify(stored))
  } catch {
    return
  }
  const ids = [chatId, ...readIndex().filter((id) => id !== chatId)]
  for (const old of ids.slice(CHAT_SETTINGS_LIMIT)) {
    try { localStorage.removeItem(keyOf(old)) } catch { /* nothing to remove */ }
  }
  writeIndex(ids.slice(0, CHAT_SETTINGS_LIMIT))
}

/** A deleted chat's settings go with it. */
export function forgetChatSettings(chatId: string): void {
  try { localStorage.removeItem(keyOf(chatId)) } catch { /* nothing to remove */ }
  writeIndex(readIndex().filter((id) => id !== chatId))
}

/** Signing out: every chat's settings, including ones saved before the index existed. */
export function clearChatSettings(): void {
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(CHAT_SETTINGS_PREFIX)) keys.push(key)
    }
    for (const key of keys) localStorage.removeItem(key)
  } catch { /* storage off */ }
}
