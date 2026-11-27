'use client'

import { useEffect, useState } from 'react'
import type { Board } from '../tabs/board-state'

/**
 * Edit mode (BS-17 – BS-22), per board: switching boards leaves it; a new board opens in it (TAB-36,
 * BS-19, BS-21). Esc leaves it, like Done, when nothing else is open (BS-19).
 */
export function useEditMode(openId: string, openBoard: Board | undefined) {
  const [editingId, setEditingId] = useState<string | null>(null)
  // Remounts the edit bar, so its New board chooser starts closed.
  const [pickKey, setPickKey] = useState(0)
  // When the open board changes, edit mode ends unless it belongs to the board now open (a new
  // board). Adjusted while rendering, React's pattern for state that follows a prop.
  const [seenOpenId, setSeenOpenId] = useState(openId)
  if (seenOpenId !== openId) {
    setSeenOpenId(openId)
    if (editingId && editingId !== openId) setEditingId(null)
  }
  const editing = !!openBoard && editingId === openBoard.id && openBoard.access !== 'view' // BS-22

  useEffect(() => {
    if (!editing) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      const t = e.target as HTMLElement | null
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return
      if (document.querySelector('[role="menu"], [role="dialog"], [data-radix-popper-content-wrapper]')) return
      setEditingId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing])

  const startFor = (id: string) => {
    setEditingId(id)
    setPickKey((k) => k + 1)
  }
  return {
    editing,
    pickKey,
    start: () => startFor(openId),
    startFor,
    stop: () => setEditingId(null),
    /** Leaves edit mode if it's on for this board (a draft discarded). */
    stopIf: (id: string) => setEditingId((cur) => (cur === id ? null : cur)),
  }
}
