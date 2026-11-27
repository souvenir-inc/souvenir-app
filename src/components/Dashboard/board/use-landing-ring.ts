'use client'

import { useEffect, useState } from 'react'

// New cards (06 AC-17): ringed and scrolled into view, then the ring fades after 2 s.

const RING_MS = 2000

export function useLandingRing(
  landed: { ids: string[]; n: number } | null | undefined,
  gridRef: React.RefObject<HTMLUListElement | null>,
  reduceMotion: boolean | null,
) {
  // Adjusted while rendering when a new landing arrives, React's pattern for state that follows a prop.
  const [ring, setRing] = useState<{ ids: string[]; on: boolean; n: number } | null>(null)
  if (landed && landed.n !== ring?.n) setRing({ ids: landed.ids, on: true, n: landed.n })
  useEffect(() => {
    if (!ring?.on) return
    // Just enough scrolling to show them all when they fit, the first one first, clear of the toast.
    const els = ring.ids.map((id) => gridRef.current?.querySelector(`[data-card-id="${CSS.escape(id)}"]`)).filter((e): e is Element => !!e)
    const scroller = gridRef.current?.closest<HTMLElement>('.kaya-scrollbar')
    if (els.length && scroller) {
      const view = scroller.getBoundingClientRect()
      const top = Math.min(...els.map((e) => e.getBoundingClientRect().top))
      const bottom = Math.max(...els.map((e) => e.getBoundingClientRect().bottom))
      const margin = 24
      const down = Math.min(bottom + margin + 72 - view.bottom, top - margin - view.top) // 72: room for the toast
      const up = top - margin - view.top
      const by = up < 0 ? up : down > 0 ? down : 0
      if (by) scroller.scrollBy({ top: by, behavior: reduceMotion ? 'auto' : 'smooth' })
    }
    const t = window.setTimeout(() => setRing((r) => (r ? { ...r, on: false } : r)), RING_MS)
    return () => window.clearTimeout(t)
  }, [ring?.on, ring?.n, ring?.ids, reduceMotion, gridRef])
  return ring
}
