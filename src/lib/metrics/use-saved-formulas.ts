'use client'

import { useMemo, useSyncExternalStore } from 'react'
import { parseRegistry, readRaw, REGISTRY_EVENT, registryKey, type FormulaRegistry } from './registry'

function subscribe(onChange: () => void): () => void {
  const onStorage = () => onChange()
  window.addEventListener(REGISTRY_EVENT, onStorage)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(REGISTRY_EVENT, onStorage)
    window.removeEventListener('storage', onStorage)
  }
}

/**
 * The custom-metric formulas this browser kept for a workspace, live across tabs. The snapshot is the stored
 * text, which compares equal while nothing changes, so React re-renders only on a real change.
 */
export function useSavedFormulas(workspaceId: string | undefined): FormulaRegistry {
  const id = workspaceId ?? ''
  const raw = useSyncExternalStore(subscribe, () => readRaw(id), () => null)
  return useMemo(() => parseRegistry(raw), [raw])
}

export { registryKey }
