import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/client'
import { BoardsGoneError } from '../live/board-store'
import { PendingBoards, draftCarry, rebase, serverView, type BoardsSnapshot } from '../tabs/board-layer'
import type { Board, DashboardState } from '../tabs/board-state'
import { loadFailure, saveFailure } from './errors'
import { boardIdParam, hasBoard } from './use-board-url'

const board = (id: string, label: string, over: Partial<Board> = {}): Board => ({
  id, label, cards: [], initialCards: [], period: '7d', compare: 'previous', access: 'owner', ownerId: 'me', general: 'none', grants: [], ...over,
})
const state = (boards: Board[]): DashboardState => ({
  boards: Object.fromEntries(boards.map((b) => [b.id, b])), tabs: boards.map((b) => b.id), hidden: [], deleted: [], openId: boards[0]?.id ?? '',
})
const snap = (s: DashboardState, seq = 0): BoardsSnapshot => ({ state: s, seq, carry: [] })

describe('the ?board= param (SD-NV-04, JS-1)', () => {
  it('takes a board id', () => {
    expect(boardIdParam('aaaaaaaa-1111-4111-8111-111111111111')).toBe('aaaaaaaa-1111-4111-8111-111111111111')
  })

  it('ignores anything that isn’t a board id, prototype keys included', () => {
    expect(boardIdParam('constructor')).toBeNull()
    expect(boardIdParam('__proto__')).toBeNull()
    expect(boardIdParam('')).toBeNull()
    expect(boardIdParam(null)).toBeNull()
    expect(boardIdParam('aaaaaaaa-1111-4111-8111-111111111111x')).toBeNull()
  })

  it('counts only the viewer’s own boards, never a key the object inherits', () => {
    const s = state([board('a', 'A')])
    expect(hasBoard(s, 'a')).toBe(true)
    expect(hasBoard(s, 'constructor')).toBe(false)
    expect(hasBoard(s, 'toString')).toBe(false)
  })
})

describe('board-layer', () => {
  it('replays the viewer’s unsaved changes on the latest server boards', () => {
    const pending = new PendingBoards()
    pending.push({ type: 'rename', id: 'a', label: 'Mine' })
    const server = state([board('a', 'A'), board('b', 'Theirs now')])
    const out = rebase(snap(server), pending.getSnapshot().entries, 'a')
    expect(out.boards.a.label).toBe('Mine')
    expect(out.boards.b.label).toBe('Theirs now')
  })

  it('leaves out changes the snapshot already has', () => {
    const pending = new PendingBoards()
    pending.push({ type: 'add-cards', id: 'a', cards: [{ metricId: 'revenue', size: 'sm' }] })
    const saved = rebase(snap(state([board('a', 'A')])), pending.getSnapshot().entries, 'a')
    // The server has the card (seq 1): replaying again would add a second one.
    const out = rebase(snap(saved, 1), pending.getSnapshot().entries, 'a')
    expect(out.boards.a.cards).toHaveLength(1)
  })

  it('opens the first tab when the open board is gone from the server', () => {
    const out = rebase(snap(state([board('a', 'A')])), [], 'gone')
    expect(out.openId).toBe('a')
  })

  it('never writes drafts: the server view drops them and the carry puts them back', () => {
    const s = state([board('a', 'A'), board('d', 'Draft', { draft: true })])
    expect(serverView(s).tabs).toEqual(['a'])
    const back = rebase({ state: serverView(s), seq: 0, carry: draftCarry(s) }, [], 'a')
    expect(back.tabs).toEqual(['a', 'd'])
  })

  it('knows what is waiting: unsent until a save starts, unsaved until it lands', () => {
    const pending = new PendingBoards()
    pending.push({ type: 'rename', id: 'a', label: 'X' })
    expect(pending.unsent).toBe(true)
    pending.markAttempted(pending.latest)
    expect(pending.unsent).toBe(false)
    expect(pending.unsaved).toBe(true)
    pending.drop(pending.latest)
    expect(pending.unsaved).toBe(false)
  })
})

describe('reading failures (API-ER-02)', () => {
  it('a 403 is "not turned on" unless the org says the warehouse is on', () => {
    const refused = new ApiError(403, 'forbidden', 'Forbidden')
    expect(loadFailure(refused, null)).toEqual({ kind: 'not-enabled' })
    expect(loadFailure(refused, true)).toEqual({ kind: 'no-access' })
  })

  it('offers Try again only for failures worth trying again', () => {
    expect(loadFailure(new ApiError(503, 'unavailable', 'Unavailable'), true)).toEqual({ kind: 'failed', retryable: true })
    expect(loadFailure(new ApiError(400, 'bad_request', 'Bad'), true)).toEqual({ kind: 'failed', retryable: false })
    expect(loadFailure(new TypeError('Failed to fetch'), true)).toEqual({ kind: 'failed', retryable: true })
  })

  it('tells the two 409s apart by what was saved, not by the message', () => {
    const conflict = new ApiError(409, 'conflict', 'This is the default board')
    expect(saveFailure(conflict, false)).toEqual({ kind: 'conflict' })
    expect(saveFailure(conflict, true)).toEqual({ kind: 'default-board' })
  })

  it('reads the other save failures', () => {
    expect(saveFailure(new BoardsGoneError(['a', 'b']), false)).toEqual({ kind: 'gone', many: true })
    expect(saveFailure(new ApiError(500, 'server_error', 'x'), false)).toEqual({ kind: 'retry' })
    expect(saveFailure(new ApiError(403, 'forbidden', 'x'), false)).toEqual({ kind: 'forbidden' })
    expect(saveFailure(new ApiError(422, 'invalid', 'x'), false)).toEqual({ kind: 'refused' })
  })
})
