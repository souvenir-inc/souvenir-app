'use client'

import { useSyncExternalStore } from 'react'

// The first visit (08-new-board-rules.md NB-31, NB-32): while Canvas checks what the store can
// measure, the screen shows a placeholder capsule and card skeletons and the dial waits. A tiny
// store, so the screen reads it through useSyncExternalStore (React Compiler, no setState in effects).

const CHECK_MS = 1_500

let checking = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

/** Stand-in: checks for 1.5 s, then `onDone` puts the starter boards in. */
export function startFirstVisit(onDone: () => void) {
  if (checking) return
  checking = true
  emit()
  window.setTimeout(() => {
    onDone()
    checking = false
    emit()
  }, CHECK_MS)
}

export function useFirstVisitChecking(): boolean {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l) } },
    () => checking,
    () => false,
  )
}
