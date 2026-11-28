import { useSyncExternalStore } from 'react'
import { DASHBOARD_DEFAULT_PERIOD_KEY } from '@/lib/storage-keys'
import { storedPreference } from '@/lib/stored-preference'
import { PERIODS } from './period'

// The period a NEW board starts on (Settings → Data preferences). A board saves its own dates once
// made (11-dates-tabs-reference-rules.md), so this never changes a saved board; templates keep the
// dates they open on (08 NB-8). Kept in this browser only and cleared on sign-out.

/** Without a preference, a new board starts on the last 7 days, as before. */
export const FALLBACK_NEW_BOARD_PERIOD = '7d'

/** The presets a new board can start on; a custom range is a board's own choice, not a default. */
export const DEFAULT_PERIOD_OPTIONS = PERIODS

/** A stored value that is one of the presets, else null. */
export const parseDefaultPeriod = (raw: string): string | null => (PERIODS.some((p) => p.id === raw) ? raw : null)

export const defaultPeriodPreference = storedPreference<string>(DASHBOARD_DEFAULT_PERIOD_KEY, parseDefaultPeriod, FALLBACK_NEW_BOARD_PERIOD)

/** The period a new board starts on, outside React (when a board is made). */
export const newBoardPeriod = () => defaultPeriodPreference.get()

const serverPeriod = () => defaultPeriodPreference.fallback

/** The default period in a component (the fallback on the server and the first paint), and its setter. */
export function useDefaultPeriod(): [string, (period: string) => void] {
  const period = useSyncExternalStore(defaultPeriodPreference.subscribe, defaultPeriodPreference.get, serverPeriod)
  return [period, defaultPeriodPreference.set]
}
