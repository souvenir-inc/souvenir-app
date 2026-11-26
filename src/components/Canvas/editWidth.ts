'use client'

import { useSyncExternalStore } from 'react'

/** Phones (under 640 px) don't get edit mode (Dev, 19 Nov: "Not offered"): one column, and a drag fights scrolling. */
export const EDIT_MIN_WIDTH = 640
const QUERY = `(max-width: ${EDIT_MIN_WIDTH - 1}px)`

function subscribe(onChange: () => void): () => void {
  const list = window.matchMedia(QUERY)
  list.addEventListener('change', onChange)
  return () => list.removeEventListener('change', onChange)
}

/** True on a phone-width window, where edit mode isn't offered. */
export function usePhoneWidth(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false)
}
