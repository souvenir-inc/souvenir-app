// A small preference kept in this browser's localStorage (30-state.md SD-ST-05, -06, -13, -16, -17,
// -21): components read it through useSyncExternalStore(subscribe, get, () => fallback) (a server
// snapshot); no React here, so the server layout can import the sign-out sweep. Also: every storage access in
// try/catch, the stored value checked on every read (a bad one is dropped), other tabs followed
// through the `storage` event, and a reset() the sign-out sweep calls. Values are short strings,
// so the snapshot is stable by value.

export interface StoredPreference<T extends string> {
  readonly key: string
  /** What applies with nothing (or nothing valid) stored, and on the server. */
  readonly fallback: T
  get(): T
  set(value: T): void
  subscribe(listener: () => void): () => void
  /** Forgets the stored value and tells every reader (sign-out). */
  reset(): void
}

const registry = new Set<StoredPreference<string>>()

/**
 * `parse` turns the raw stored string into a value, or null when it isn't one; a stored value that
 * doesn't parse is removed (SD-ST-13).
 */
export function storedPreference<T extends string>(key: string, parse: (raw: string) => T | null, fallback: T): StoredPreference<T> {
  // The pick when storage can't keep it (blocked, private mode): it still applies in this tab.
  let memory: T | null = null
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((listener) => listener())

  const get = (): T => {
    if (memory !== null) return memory
    if (typeof window === 'undefined') return fallback
    let raw: string | null
    try {
      raw = window.localStorage.getItem(key)
    } catch {
      return fallback
    }
    if (raw === null) return fallback
    const value = parse(raw)
    if (value !== null) return value
    try { window.localStorage.removeItem(key) } catch { /* blocked: the fallback applies either way */ }
    return fallback
  }

  const pref: StoredPreference<T> = {
    key,
    fallback,
    get,
    set(value) {
      memory = value
      try {
        window.localStorage.setItem(key, value)
        memory = null
      } catch { /* kept in memory for this tab only */ }
      notify()
    },
    subscribe(listener) {
      listeners.add(listener)
      const onStorage = (event: StorageEvent) => {
        // null: another tab cleared all storage.
        if (event.key !== key && event.key !== null) return
        memory = null
        listener()
      }
      window.addEventListener('storage', onStorage)
      return () => {
        listeners.delete(listener)
        window.removeEventListener('storage', onStorage)
      }
    },
    reset() {
      memory = null
      try { window.localStorage.removeItem(key) } catch { /* blocked: nothing was stored */ }
      notify()
    },
  }
  registry.add(pref)
  return pref
}

/** Resets every preference this page has loaded (the sign-out sweep, with the keys it removes itself). */
export function resetStoredPreferences(): void {
  if (typeof window === 'undefined') return
  registry.forEach((pref) => pref.reset())
}
