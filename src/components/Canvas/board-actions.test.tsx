// The board's actions (6D, D43) and its header tabs, rendered statically: the + at rest, the edit bar in edit mode,
// what the + holds for you and for a viewer, and the tab row without its own + (New board lives on the board's +).

import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { BoardActions, dialActions, type BoardActionsProps } from './BoardActions'
import { BoardTabs } from './BoardTabs'
import { HeaderSlotProvider, InHeader } from './HeaderSlot'
import type { Board } from './board'

const noop = () => {}
const actions = (patch: Partial<BoardActionsProps>) => createElement(BoardActions, {
  editing: false, onAddMetrics: noop, onNewBoard: noop, onEdit: noop, onShare: noop, onCopyLink: noop, menu: () => null,
  onUndo: noop, onRedo: noop, canUndo: false, canRedo: false, onCancel: noop, onSave: noop, ...patch,
})

describe('the board actions', () => {
  it('rest as one + that names itself and opens nothing yet', () => {
    const html = renderToStaticMarkup(actions({}))
    expect(html).toContain('aria-label="Board actions"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('Add metrics')
  })

  it('hold Add metrics, New board, Edit board, Share and More on your own board', () => {
    expect(dialActions(false).map(a => a.label)).toEqual(['Add metrics', 'New board', 'Edit board', 'Share', 'More'])
  })

  it('hold New board, Copy link and More on a board you can only view: nothing that changes it, no Share', () => {
    expect(dialActions(true).map(a => a.label)).toEqual(['New board', 'Copy link', 'More'])
  })

  it('give way to a bar in edit mode: Undo, Redo, Add metrics, New board, Cancel, Save', () => {
    const html = renderToStaticMarkup(actions({ editing: true }))
    expect(html).toContain('role="toolbar"')
    const order = ['aria-label="Undo"', 'aria-label="Redo"', 'Add metrics', 'New board', 'Cancel', 'Save']
    order.slice(1).forEach((word, i) => expect(html.indexOf(order[i])).toBeLessThan(html.indexOf(word)))
    expect(html).not.toContain('aria-label="Board actions"')
  })

  it('turn Undo and Redo off when there is nothing to undo or redo', () => {
    const off = renderToStaticMarkup(actions({ editing: true }))
    expect(off).toMatch(/aria-label="Undo" disabled/)
    const on = renderToStaticMarkup(actions({ editing: true, canUndo: true, canRedo: true }))
    expect(on).not.toMatch(/aria-label="Undo" disabled/)
  })
})

describe('the header tabs', () => {
  const board = (id: string, name: string): Board => ({ id, name, cards: [] })
  const tabs = createElement(BoardTabs, {
    tabs: [board('a', 'Store overview'), board('b', 'Growth')], activeId: 'a', renamingId: null, onRenamingChange: noop,
    onSelect: noop, onRename: noop, onReorder: noop, onDuplicate: noop, onCopyLink: noop, onHide: noop, onDelete: noop,
    onLeave: noop, onManage: noop, canDelete: true,
  })

  it('carry no + of their own', () => {
    const html = renderToStaticMarkup(tabs)
    expect(html).toContain('Store overview')
    expect(html).not.toContain('aria-label="New board"')
  })

  it('render nowhere until the header gives them a place', () => {
    expect(renderToStaticMarkup(createElement(HeaderSlotProvider, null, createElement(InHeader, null, tabs)))).toBe('')
  })
})
