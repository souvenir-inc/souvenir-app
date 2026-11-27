'use client'

import { useEffect, useRef, useState } from 'react'
import type { BoardAction } from './board-state'

// Undo and redo for the board screen (TAB-14). Every change the rules give an Undo records the
// actions that make it and the actions that reverse it; ⌘Z and a toast's Undo take the same step,
// ⌘⇧Z / Ctrl+Y (and the edit bar's Redo) take it again. A new change clears what could be redone.

/** Steps kept; the oldest goes first. */
export const HISTORY_LIMIT = 50

interface Step {
  key: number
  forward: BoardAction[]
  reverse: BoardAction[]
}

const typing = (target: EventTarget | null) => {
  const t = target as HTMLElement | null
  return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
}

/** `run` applies actions to the boards; the history only decides which. */
export function useBoardHistory(run: (actions: BoardAction[]) => void) {
  const past = useRef<Step[]>([])
  const future = useRef<Step[]>([])
  const keySeq = useRef(0)
  const [sizes, setSizes] = useState({ undo: 0, redo: 0 })
  const sync = () => setSizes({ undo: past.current.length, redo: future.current.length })

  /** A change made: one undo step. Returns its key, for a toast's Undo. */
  const record = (forward: BoardAction[], reverse: BoardAction[]) => {
    const key = ++keySeq.current
    past.current = [...past.current, { key, forward, reverse }].slice(-HISTORY_LIMIT)
    future.current = []
    sync()
    return key
  }

  /** Undo one step: the given one (a toast's Undo) or the latest (⌘Z). */
  const undo = (key?: number) => {
    const i = key == null ? past.current.length - 1 : past.current.findIndex((s) => s.key === key)
    if (i < 0) return
    const step = past.current[i]
    past.current = past.current.filter((_, j) => j !== i)
    future.current = [...future.current, step].slice(-HISTORY_LIMIT)
    run(step.reverse)
    sync()
  }

  /** Redo the step undone last. */
  const redo = () => {
    const step = future.current.at(-1)
    if (!step) return
    future.current = future.current.slice(0, -1)
    past.current = [...past.current, step].slice(-HISTORY_LIMIT)
    run(step.forward)
    sync()
  }

  // ⌘Z / Ctrl+Z undoes; ⌘⇧Z, Ctrl+⇧Z and Ctrl+Y redo; never while typing (TAB-14).
  const keys = useRef({ undo, redo })
  useEffect(() => { keys.current = { undo, redo } })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || typing(e.target)) return
      const key = e.key.toLowerCase()
      const isRedo = (key === 'z' && e.shiftKey) || (key === 'y' && e.ctrlKey && !e.metaKey && !e.shiftKey)
      const isUndo = key === 'z' && !e.shiftKey
      if (!isUndo && !isRedo) return
      e.preventDefault()
      if (isRedo) keys.current.redo()
      else keys.current.undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return { record, undo, redo, canUndo: sizes.undo > 0, canRedo: sizes.redo > 0 }
}
