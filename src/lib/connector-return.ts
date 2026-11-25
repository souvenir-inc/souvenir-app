// Where to go back to after an app's sign-in, when it was started from somewhere else (the
// dashboard's Reconnect, say). The server always lands a finished sign-in on
// `/?connector=<slug>&link=<result>` (it takes no return address yet: souvenir-server#629 S-2),
// so the page that sent the person remembers itself here, for that app, for a short while.

const KEY = 'souvenir.connector-return'
/** A sign-in that takes longer than this isn't taken back anywhere: the person has moved on. */
const MAX_AGE_MS = 30 * 60_000

interface Pending {
  slug: string
  to: string
  at: number
}

/** A path on this site ("/dashboard?board=…"), or null: never another origin or a protocol-relative URL. */
export function safeReturnPath(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 2000) return null
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return null
  try {
    const url = new URL(raw, 'https://app.invalid')
    if (url.origin !== 'https://app.invalid') return null
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return null
  }
}

/** Remember to come back to `to` once this app's sign-in ends. */
export function rememberReturn(slug: string, to: string): void {
  const path = safeReturnPath(to)
  if (!path) return
  try { sessionStorage.setItem(KEY, JSON.stringify({ slug, to: path, at: Date.now() } satisfies Pending)) } catch { /* storage off: no return */ }
}

export function forgetReturn(): void {
  try { sessionStorage.removeItem(KEY) } catch { /* nothing to forget */ }
}

/** Where to go back to after this app's sign-in, once (it is forgotten as it is read), or null. */
export function takeReturn(slug: string, now = Date.now()): string | null {
  let pending: Partial<Pending> | null = null
  try {
    const raw = sessionStorage.getItem(KEY)
    if (raw) pending = JSON.parse(raw) as Partial<Pending>
  } catch { /* unreadable: nothing to take */ }
  if (!pending) return null
  if (pending.slug !== slug) return null
  forgetReturn()
  if (typeof pending.at !== 'number' || now - pending.at > MAX_AGE_MS) return null
  return safeReturnPath(pending.to)
}
