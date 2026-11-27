import { useSyncExternalStore } from 'react'
import { z } from 'zod'
import { NUMBER_STYLE_KEY } from '@/lib/storage-keys'
import { storedPreference } from '@/lib/stored-preference'

// How numbers show on screen (Settings → Data preferences): rounded ($48.2k) or exact ($48,213.07).
// Cards read it and format through the dashboard's format.ts; exports always use exact figures.
// Kept in this browser only and cleared on sign-out (an account-level setting needs a backend field).

const numberStyleSchema = z.enum(['rounded', 'exact'])
export type NumberStyle = z.infer<typeof numberStyleSchema>

/** Parses a stored value; anything else is not a style. */
export function parseNumberStyle(raw: string): NumberStyle | null {
  const parsed = numberStyleSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

export const numberStylePreference = storedPreference<NumberStyle>(NUMBER_STYLE_KEY, parseNumberStyle, 'rounded')

const serverStyle = () => numberStylePreference.fallback

/** The style in a component (rounded on the server and the first paint), and its setter. */
export function useNumberStyle(): [NumberStyle, (style: NumberStyle) => void] {
  const style = useSyncExternalStore(numberStylePreference.subscribe, numberStylePreference.get, serverStyle)
  return [style, numberStylePreference.set]
}
