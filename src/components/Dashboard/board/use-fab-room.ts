'use client'

import { useLayoutEffect, useRef, useState } from 'react'

/** Space under the cards (pb-4). */
const BASE_PAD = 16

/**
 * Room under the cards for the + button, only when it's needed: the board is taller than the panel,
 * or a card would sit under the button. Otherwise the panel doesn't scroll at all (a fixed gap made
 * it scroll on any window under ~840px tall). Decided from where the cards are, which the bottom
 * padding doesn't move, so adding the room can't flip the answer back.
 */
export function useFabRoom() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const columnRef = useRef<HTMLDivElement>(null)
  const [fabRoom, setFabRoom] = useState(false)
  useLayoutEffect(() => {
    const sc = scrollRef.current
    const col = columnRef.current
    if (!sc || !col) return
    const check = () => {
      const pad = parseFloat(getComputedStyle(col).paddingBottom) || 0
      const tooTall = col.offsetHeight - pad + BASE_PAD > sc.clientHeight + 0.5
      // Where each card sits with the panel scrolled to the top, against the button.
      const box = sc.getBoundingClientRect()
      const fab = sc.parentElement?.querySelector('[data-dashboard-fab]')?.getBoundingClientRect()
      const underFab = !!fab && [...col.querySelectorAll('[data-card-id]')].some((el) => {
        const r = el.getBoundingClientRect()
        const top = r.top - box.top + sc.scrollTop
        const bottom = top + r.height
        return r.right > fab.left && r.left < fab.right && bottom > fab.top - box.top && top < fab.bottom - box.top
      })
      setFabRoom(tooTall || underFab)
    }
    const ro = new ResizeObserver(check)
    ro.observe(sc)
    ro.observe(col)
    check()
    return () => ro.disconnect()
  }, [])
  return { scrollRef, columnRef, fabRoom }
}
