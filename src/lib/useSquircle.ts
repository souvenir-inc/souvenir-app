'use client'

import { useLayoutEffect, useState, useCallback } from 'react'
import { getSvgPath } from 'figma-squircle'

// Module-level cache: most buttons share identical dimensions and radius, so
// getSvgPath (which does non-trivial math) is called once per unique shape.
const squirclePathCache = new Map<string, string>()

function getCachedPath(width: number, height: number, cornerRadius: number, smoothing: number): string {
  const key = `${width}x${height}r${cornerRadius}s${smoothing}`
  const cached = squirclePathCache.get(key)
  if (cached) return cached
  const d = getSvgPath({ width, height, cornerRadius, cornerSmoothing: smoothing })
  squirclePathCache.set(key, d)
  return d
}

/** `ref` is a callback ref: hand it to the element, or call it from a ref that
 *  merges several. It is deliberately not a ref object — a caller that merges
 *  refs would have to write to `.current`, and React Compiler (correctly) treats
 *  a hook's return value as something the caller may not mutate. Keeping the node
 *  in state also means the observer below re-attaches when the node changes,
 *  which a one-shot read of `ref.current` in the effect never did. */
export function useSquircle<T extends HTMLElement = HTMLButtonElement>(
  cornerRadius: number,
  smoothing = 0.6,
  strokeWidth = 0,
) {
  const [node, setNode] = useState<T | null>(null)
  const [clipPath, setClipPath] = useState('')
  const [strokeClipPath, setStrokeClipPath] = useState('')

  const compute = useCallback((el: T) => {
    // Use offsetWidth/offsetHeight (layout box) rather than getBoundingClientRect
    // which includes ancestor transforms and gives wrong sizes when mounted inside
    // animating parents (e.g. PinboardExpanded inside Pinboard's scale animation).
    const width  = el.offsetWidth
    const height = el.offsetHeight
    if (!width || !height) return

    const d = getCachedPath(width, height, cornerRadius, smoothing)
    setClipPath(`path("${d}")`)

    if (strokeWidth > 0) {
      const s = strokeWidth
      const sd = getCachedPath(width + s * 2, height + s * 2, cornerRadius + s, smoothing)
      setStrokeClipPath(`path("${sd}")`)
    }
  }, [cornerRadius, smoothing, strokeWidth])

  useLayoutEffect(() => {
    if (!node) return
    // observe() delivers one callback with the current size straight away, in the
    // same frame and before paint, so there is no separate first measurement.
    const ro = new ResizeObserver(() => compute(node))
    ro.observe(node)
    return () => ro.disconnect()
  }, [node, compute])

  return { ref: setNode, clipPath, strokeClipPath }
}
