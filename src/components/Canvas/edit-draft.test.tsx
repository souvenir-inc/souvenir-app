// @vitest-environment jsdom
// Edit mode holds its changes until Save (Dev, 19 Nov): Save keeps them as one change, Cancel throws them away, and
// one drag or resize is one undo step.

import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it } from 'vitest'
import type { MetricEntry, Workspace } from '@/lib/api/warehouse'
import type { Board } from './board'
import { STARTER_IDS } from './metrics'
import { storageKey, type BoardsDoc } from './store'
import { useBoards, type BoardsState } from './useBoards'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const workspace = { id: 'ws-edit', categories: [], connectors: [], timezone: 'UTC' } as unknown as Workspace
const catalog: MetricEntry[] = []
const card = (id: string, size: '3x1' | '6x1' = '3x1') =>
  ({ id, metric: `m-${id}`, kind: 'number', size, window: 'period', comparison: 'previous' }) as Board['cards'][number]
const store: Board = { id: 'store', name: 'Store overview', cards: [card('a'), card('b'), card('c')] }

function seed() {
  const doc: BoardsDoc = { version: 1, boards: [store], tabs: ['store'], activeId: 'store', seeds: [...STARTER_IDS] }
  window.localStorage.setItem(storageKey(workspace.id), JSON.stringify(doc))
}
const saved = () => (JSON.parse(window.localStorage.getItem(storageKey(workspace.id)) ?? 'null') as BoardsDoc).boards[0].cards.map(c => c.id)

async function mount() {
  const result: { current: BoardsState | null } = { current: null }
  function Probe() {
    result.current = useBoards(workspace, catalog, { unavailable: undefined, settled: true }, { by: 'Dev Shah' })
    return null
  }
  const root = createRoot(document.createElement('div'))
  await act(async () => { root.render(<Probe />) })
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
  return result as { current: BoardsState }
}

const order = (boards: { current: BoardsState }) => boards.current.board?.cards.map(c => c.id)

describe('edit mode holds its changes until Save', () => {
  beforeEach(() => {
    window.localStorage.clear()
    seed()
  })

  it('shows changes on screen but saves nothing until Save, then saves them as one change', async () => {
    const boards = await mount()
    expect(order(boards)).toEqual(['a', 'b', 'c'])
    act(() => boards.current.beginEdit())
    act(() => boards.current.update(b => ({ ...b, cards: [b.cards[2], b.cards[0], b.cards[1]] }), 'Move card'))
    expect(order(boards)).toEqual(['c', 'a', 'b'])
    expect(boards.current.dirty).toBe(true)
    expect(saved()).toEqual(['a', 'b', 'c'])
    await act(async () => { expect(await boards.current.saveEdit()).toBe(true) })
    expect(boards.current.editing).toBe(false)
    expect(saved()).toEqual(['c', 'a', 'b'])
    // One Save, one undo step outside edit mode (saved in the background, so the test waits for it).
    await act(async () => { boards.current.undo(); await new Promise(resolve => setTimeout(resolve, 0)) })
    expect(order(boards)).toEqual(['a', 'b', 'c'])
  })

  it('throws the changes away on Cancel', async () => {
    const boards = await mount()
    act(() => boards.current.beginEdit())
    act(() => boards.current.update(b => ({ ...b, cards: b.cards.slice(1) }), 'Remove card'))
    expect(order(boards)).toEqual(['b', 'c'])
    act(() => boards.current.discardEdit())
    expect(boards.current.editing).toBe(false)
    expect(order(boards)).toEqual(['a', 'b', 'c'])
    expect(saved()).toEqual(['a', 'b', 'c'])
  })

  it('makes one undo step of a whole resize, and none of one put back with Esc', async () => {
    const boards = await mount()
    act(() => boards.current.beginEdit())
    const resize = (size: '3x1' | '6x1') => act(() => boards.current.update(
      b => ({ ...b, cards: b.cards.map(c => (c.id === 'a' ? { ...c, size } : c)) }), 'Resize card', 'resize-a-1'))
    resize('6x1')
    expect(boards.current.canUndo).toBe(true)
    resize('3x1')
    expect(boards.current.canUndo).toBe(false)
    resize('6x1')
    act(() => { boards.current.undo() })
    expect(boards.current.board?.cards[0].size).toBe('3x1')
    expect(boards.current.canRedo).toBe(true)
    act(() => { boards.current.redo() })
    expect(boards.current.board?.cards[0].size).toBe('6x1')
  })
})
