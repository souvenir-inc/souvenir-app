'use client'

import { useEffect, useEffectEvent, useState } from 'react'
import type { Warehouse } from '@/lib/api/warehouse'
import { logger } from '@/lib/logger'
import type { Draft } from '../Drafts'
import { newBoardPeriod } from '../default-period'
import { toBoardCards } from '../templates'
import { namesInUse, uniqueName, type BoardAction } from '../tabs/board-state'
import type { DashboardApi } from '../tabs/use-dashboard'

// Ask the AI (08 NB-20 – NB-30): one draft at a time, its board drafted turn by turn.

type Undoable = (message: string, undo: () => void) => void

export function useBoardDraft(warehouse: Warehouse, api: DashboardApi, undoable: Undoable, onDiscarded: (boardId: string) => void) {
  const { state } = api
  const [draft, setDraft] = useState<Draft | null>(null)
  // Dropped if its board goes (a ⌘Z past it, say). Adjusted while rendering.
  if (draft && !Object.hasOwn(state.boards, draft.boardId)) setDraft(null)

  // Each try asks the drafter with the conversation so far; a late answer to an old try is dropped
  // (NB-21 – NB-23, NB-28, NB-29). One request per try: `run` changes on every try.
  const drafting = draft?.phase === 'drafting' ? draft : null
  const ask = useEffectEvent((d: Draft) => {
    const { boardId, messages, run } = d
    const stop = new AbortController()
    const settle = (patch: Partial<Draft>, board: BoardAction[]) => {
      if (stop.signal.aborted) return
      api.apply(board)
      setDraft((cur) => (cur && cur.run === run ? { ...cur, ...patch } : cur))
    }
    const empty: BoardAction[] = [{ type: 'update-board', id: boardId, patch: { label: 'Draft', cards: [], initialCards: [] } }]
    warehouse.draftBoard(messages, stop.signal).then(
      (answer) => {
        const said = [...messages, { role: 'assistant' as const, content: answer.reply }]
        if (!answer.board) { settle({ phase: 'empty', reply: answer.reply, messages: said }, empty); return }
        const cards = toBoardCards(answer.board.cards.map((c) => ({ metricId: c.metric, size: c.size })))
        const label = uniqueName(answer.board.name, namesInUse(api.current(), boardId))
        settle({ phase: 'ready', reply: answer.reply, messages: said }, [{ type: 'update-board', id: boardId, patch: { label, cards, initialCards: cards, period: answer.board.period, compare: answer.board.compare } }])
      },
      (error: unknown) => {
        if (stop.signal.aborted) return
        logger.error('[dashboard] drafting a board failed', { name: error instanceof Error ? error.name : typeof error })
        settle({ phase: 'failed' }, empty)
      },
    )
    return () => stop.abort()
  })
  const run = drafting?.run
  useEffect(() => {
    if (!drafting) return
    return ask(drafting)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one request per try: only a new `run` starts one; `drafting` is read through the effect event
  }, [run])

  // Leaving or reloading drops a draft: the browser asks first (NB-30).
  const hasDraft = !!draft
  useEffect(() => {
    if (!hasDraft) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [hasDraft])

  /** A new request: replaces the draft in its own tab, or starts one as the last tab (NB-20, NB-24). */
  const send = (request: string) => {
    if (draft) {
      const b = state.boards[draft.boardId]
      api.apply([{ type: 'update-board', id: draft.boardId, patch: { label: draft.phase === 'ready' && b ? b.label : 'Drafting…' } }, { type: 'open', id: draft.boardId }])
      setDraft({ ...draft, phase: 'drafting', reply: undefined, messages: [...draft.messages, { role: 'user', content: request }], run: draft.run + 1 })
      return
    }
    const r = api.addBoard({ label: 'Drafting…', cards: [], period: newBoardPeriod(), compare: 'previous', draft: true }, false)
    setDraft({ boardId: r.id, request, phase: 'drafting', openBefore: state.openId, messages: [{ role: 'user', content: request }], run: 1 })
  }

  /** Try again after a failed or empty answer (NB-28). */
  const retry = () => {
    if (!draft) return
    api.apply([{ type: 'update-board', id: draft.boardId, patch: { label: 'Drafting…' } }])
    setDraft({ ...draft, phase: 'drafting', run: draft.run + 1 })
  }

  /** Discard, and Stop while drafting (NB-27): no confirm, not in Recently deleted, Undo brings it back. */
  const discard = () => {
    if (!draft) return
    const before = draft
    const openAfter = Object.hasOwn(state.boards, before.openBefore) ? before.openBefore : state.tabs.find((id) => id !== before.boardId) ?? state.tabs[0]
    const undoIt = api.discardDraft(before.boardId, openAfter)
    setDraft(null)
    onDiscarded(before.boardId)
    if (undoIt) undoable('Draft discarded', () => { undoIt(); setDraft(before.phase === 'drafting' ? { ...before, run: before.run + 1 } : before) })
  }

  /** Keep board (NB-26): a private board you own; Undo turns it back into the draft. */
  const keep = () => {
    if (!draft) return
    const before = draft
    const label = state.boards[before.boardId]?.label ?? 'Board'
    const undoIt = api.change([{ type: 'update-board', id: before.boardId, patch: { draft: false } }], [{ type: 'update-board', id: before.boardId, patch: { draft: true } }])
    setDraft(null)
    undoable(`${label} saved`, () => { undoIt(); setDraft(before) })
  }

  return { draft, send, retry, discard, keep }
}
