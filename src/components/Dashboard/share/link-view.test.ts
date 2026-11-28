import { beforeEach, describe, expect, it } from 'vitest'
import { linkView, resetLinkView, seedLinkFromQuery } from './link-view'
import { boardReducer, type DashboardState } from '../tabs/board-state'

// A shared link's dates are whatever someone typed into the URL: only ones a board can read are taken.
describe('seedLinkFromQuery', () => {
  beforeEach(() => resetLinkView())
  const visible = () => true

  it('ignores a period the board can’t read', () => {
    expect(seedLinkFromQuery({ board: 'b1', period: 'custom:x:y', compare: 'previous' }, visible)).toBe('b1')
    expect(linkView().dates).toBeNull()
  })

  it('falls back to the previous period on a comparison it can’t read', () => {
    seedLinkFromQuery({ board: 'b1', period: '30d', compare: 'bogus' }, visible)
    expect(linkView().dates).toEqual({ boardId: 'b1', period: '30d', compare: 'previous' })
  })

  it('a board you can’t see opens No access; leaving the dashboard clears it', () => {
    expect(seedLinkFromQuery({ board: 'b9', period: null, compare: null }, () => false)).toBeNull()
    expect(linkView().noAccess).toEqual({ id: 'b9' })
    resetLinkView()
    expect(linkView()).toEqual({ noAccess: null, dates: null })
  })
})

describe('set-dates', () => {
  const state = { boards: { b1: { id: 'b1', label: 'B', cards: [], initialCards: [], period: '7d', compare: 'previous', access: 'owner', ownerId: 'u', general: 'none', grants: [] } }, tabs: ['b1'], hidden: [], deleted: [], openId: 'b1' } as unknown as DashboardState

  it('keeps the board’s dates when the new ones aren’t readable', () => {
    const next = boardReducer(state, { type: 'set-dates', id: 'b1', period: 'custom:x:y', compare: 'bogus' })
    expect(next).toBe(state)
  })

  it('takes readable ones', () => {
    const next = boardReducer(state, { type: 'set-dates', id: 'b1', period: '30d', compare: 'last-year' })
    expect(next.boards.b1).toMatchObject({ period: '30d', compare: 'last-year' })
  })
})
