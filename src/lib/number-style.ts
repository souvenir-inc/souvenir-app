import { useCallback, useSyncExternalStore } from 'react'

/**
 * How numbers show on screen: rounded ($48.2k) or exact ($48,213.07). Settings → Data → Preferences sets it; every
 * money figure that would round goes through formatCurrencyCompact, which reads it. Exports and Souvenir AI always use
 * exact figures. Kept in this browser until the account can hold it (one swap: read/write here).
 */
export type NumberStyle = 'rounded' | 'exact'

const KEY = 'souvenir:number-style'
const DEFAULT: NumberStyle = 'rounded'

let memory: NumberStyle | null = null
const listeners = new Set<() => void>()

function isStyle(value: unknown): value is NumberStyle {
  return value === 'rounded' || value === 'exact'
}

/** The saved style, readable outside React (formatters). The server and first paint use the default. */
export function readNumberStyle(): NumberStyle {
  if (memory !== null) return memory
  if (typeof window === 'undefined') return DEFAULT
  try {
    const saved = window.localStorage.getItem(KEY)
    memory = isStyle(saved) ? saved : DEFAULT
  } catch {
    memory = DEFAULT
  }
  return memory
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key !== KEY) return
    memory = isStyle(event.newValue) ? event.newValue : DEFAULT
    listener()
  }
  window.addEventListener('storage', onStorage)
  return () => { listeners.delete(listener); window.removeEventListener('storage', onStorage) }
}

export function useNumberStyle(): { numberStyle: NumberStyle; setNumberStyle: (style: NumberStyle) => void } {
  const numberStyle = useSyncExternalStore(subscribe, readNumberStyle, () => DEFAULT)
  const setNumberStyle = useCallback((style: NumberStyle) => {
    memory = style
    try { window.localStorage.setItem(KEY, style) } catch { /* in-memory only */ }
    listeners.forEach(listener => listener())
  }, [])
  return { numberStyle, setNumberStyle }
}
