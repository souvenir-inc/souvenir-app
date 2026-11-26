'use client'

import { useSyncExternalStore } from 'react'

function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => { window.removeEventListener('online', onChange); window.removeEventListener('offline', onChange) }
}

/** "Is the browser online?", following the window's online and offline events. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true)
}

/*
 * The time of the oldest data the open page shows, for the offline bar ("Showing data from 10:24 am"). The bar
 * is app-wide and sits above every page, so a page with synced data (the dashboard) sets it while it's open;
 * other pages leave it empty and the bar says only "You’re offline.".
 */
let shownFrom: string | null = null
const listeners = new Set<() => void>()

export function setShownDataFrom(at: string | null): void {
  if (at === shownFrom) return
  shownFrom = at
  listeners.forEach(listener => listener())
}

export function subscribeShownDataFrom(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function getShownDataFrom(): string | null {
  return shownFrom
}

export function useShownDataFrom(): string | null {
  return useSyncExternalStore(subscribeShownDataFrom, getShownDataFrom, () => null)
}
