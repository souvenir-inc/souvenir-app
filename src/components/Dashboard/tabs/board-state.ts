// Board tabs: the state and every rule that changes it, as pure functions.
// Rules: docs-v2/dashboard/01-tabs-rules.md (IDs in comments: TAB-…, MT-…).
//
// The state is the contract a backend will need: every board you can see, your tab order, the
// boards you've hidden, the boards you deleted (kept 30 days) and the open board.

import type { General, Grant } from '@/lib/api/warehouse'
import { dims, firstFit, fitAtEnd, flowCards, pack, resize, toItems, withItems } from '../grid-layout'
import type { BoardCard, CardSize } from '../types'

export type Access = 'owner' | 'edit' | 'view'

export interface Person {
  name: string
  initials: string
  /** Their avatar colour (a token). */
  color?: string
}

export interface Board {
  id: string
  label: string
  cards: BoardCard[]
  /** The cards the board started with; Start over puts these back (TAB-63). */
  initialCards: BoardCard[]
  /** Each board keeps its own dates (TAB-7). */
  period: string
  compare: string
  access: Access
  /** Set when someone else owns the board and shared it with you (TAB-50). */
  sharedBy?: Person
  /** The member who made it. */
  ownerId: string
  /** What everyone in the workspace may do with it; none leaves it to its owner and the people added. */
  general: General
  /** People added one by one. */
  grants: Grant[]
  /** An Ask the AI draft, not saved yet: a sparkle on its tab (08 NB-21). */
  draft?: boolean
}

export interface DeletedBoard {
  id: string
  /** ms since epoch. */
  deletedAt: number
}

export interface DashboardState {
  boards: Record<string, Board>
  /** Your tabs, in your order. The first is the home board (TAB-2). */
  tabs: string[]
  /** Out of your tabs, still yours (TAB-38). Newest last. */
  hidden: string[]
  /** Deleted by you, restorable for 30 days (TAB-43). */
  deleted: DeletedBoard[]
  openId: string
}

export const MAX_NAME = 40           // TAB-23
export const MAX_VISIBLE_TABS = 6    // TAB-15
export const RESTORE_DAYS = 30       // TAB-43
const DAY = 24 * 60 * 60 * 1000

// ── Names ──────────────────────────────────────────────────────────────────────

/** Trimmed and capped at 40 characters; '' when there's nothing but spaces (TAB-23, TAB-24). */
export function cleanName(raw: string): string {
  return raw.trim().slice(0, MAX_NAME).trim()
}

/** The names a new name must not repeat: every board you can see except `exceptId`. */
export function namesInUse(state: DashboardState, exceptId?: string): string[] {
  return [...state.tabs, ...state.hidden]
    .filter((id) => id !== exceptId)
    .map((id) => state.boards[id]?.label)
    .filter((l): l is string => !!l)
}

/**
 * The name a board is saved under: `name` if it's free, else the next free number
 * ("Growth" → "Growth 2", "Untitled board" → "Untitled board 2"). Case doesn't matter (TAB-26).
 */
export function uniqueName(name: string, taken: string[]): string {
  const used = new Set(taken.map((t) => t.toLocaleLowerCase()))
  if (!used.has(name.toLocaleLowerCase())) return name
  for (let n = 2; ; n++) {
    const suffix = ` ${n}`
    const candidate = `${name.slice(0, MAX_NAME - suffix.length).trimEnd()}${suffix}`
    if (!used.has(candidate.toLocaleLowerCase())) return candidate
  }
}

// ── Permissions ───────────────────────────────────────────────────────────────

export const canRename = (b: Board) => b.access === 'owner'              // TAB-52
export const canDelete = (b: Board) => b.access === 'owner'              // TAB-41
export const canLeave = (b: Board) => b.access !== 'owner'               // TAB-52
export const canEditCards = (b: Board) => b.access !== 'view'            // TAB-53
/** The last tab can't be hidden or deleted (TAB-45). */
export const isLastTab = (s: DashboardState) => s.tabs.length <= 1

// ── Overflow ("N more") ───────────────────────────────────────────────────────

export interface RowLayout {
  /** Tabs on show, left to right. Always includes the open board (TAB-17). */
  visible: string[]
  /** The rest, in your order, behind "N more" (TAB-18). */
  overflow: string[]
}

/**
 * Which tabs fit in the row (TAB-4, TAB-15 – TAB-17, TAB-22).
 * `pinned` must stay on show, in priority order: the open board, then a tab being renamed.
 * A pinned tab past the fitting places takes the last free place; the board that was there goes
 * into the list, and your saved order doesn't change. `widths[i]` is the width of `tabs[i]` (a
 * tab being renamed is measured at its field's width, so the tabs after it fold away instead of
 * pushing the row wider); `available` is the room for the tabs and the count.
 */
export function layoutRow(
  tabs: string[],
  pinned: string | string[],
  widths: number[],
  available: number,
  countWidth: number,
  gap = 0,
  max = MAX_VISIBLE_TABS,
): RowLayout {
  const total = tabs.length
  if (total === 0) return { visible: [], overflow: [] }
  const keep = [...new Set(typeof pinned === 'string' ? [pinned] : pinned)].filter((id) => tabs.includes(id))
  const width = (id: string) => widths[tabs.indexOf(id)] ?? 0

  const pick = (k: number) => {
    const shown = tabs.slice(0, k)
    for (const id of keep) {
      if (shown.includes(id)) continue
      // Replace the last place that isn't itself pinned.
      for (let i = shown.length - 1; i >= 0; i--) {
        if (!keep.includes(shown[i])) { shown[i] = id; break }
      }
    }
    return shown
  }
  const fits = (shown: string[]) => {
    let w = shown.reduce((sum, id) => sum + width(id), 0) + gap * Math.max(0, shown.length - 1)
    if (shown.length < total) w += gap + countWidth
    return w <= available
  }

  const least = Math.max(1, keep.length)
  let k = Math.max(least, Math.min(max, total))
  let shown = pick(k)
  while (k > least && !fits(shown)) shown = pick(--k)
  return { visible: shown, overflow: tabs.filter((id) => !shown.includes(id)) }
}

// ── Neighbours ────────────────────────────────────────────────────────────────

/** The board that opens when `id` leaves your tabs: the one to its left, or right when first (TAB-38, TAB-42). */
export function neighbourOf(tabs: string[], id: string): string | undefined {
  const i = tabs.indexOf(id)
  if (i < 0) return undefined
  return i > 0 ? tabs[i - 1] : tabs[i + 1]
}

export function daysLeft(deletedAt: number, now: number): number {
  return Math.max(0, RESTORE_DAYS - Math.floor((now - deletedAt) / DAY))
}

// ── Reducer ───────────────────────────────────────────────────────────────────

export type BoardAction =
  | { type: 'open'; id: string }
  | { type: 'rename'; id: string; label: string }
  | { type: 'move-tab'; id: string; to: number }
  | { type: 'add-board'; board: Board; index: number; open: boolean }
  /** Change a board's own fields (a template filling it, a draft landing or kept, 08). */
  | { type: 'update-board'; id: string; patch: Partial<Omit<Board, 'id'>> }
  /** The whole state at once (the first visit's starter boards, 08 NB-32). */
  | { type: 'replace'; state: DashboardState }
  | { type: 'remove-board'; id: string }
  | { type: 'hide'; id: string; openAfter?: string }
  | { type: 'show'; id: string; index?: number; open: boolean }
  | { type: 'delete'; id: string; at: number }
  | { type: 'restore'; id: string; index?: number; open: boolean }
  | { type: 'apply-manage'; tabs: string[]; hidden: string[]; labels: Record<string, string> }
  /** A whole layout: a drag's result, or the start put back on Esc (BS-26, BS-29). */
  | { type: 'set-cards'; id: string; cards: BoardCard[] }
  // Card changes read the board as it is now, never a copy an earlier render captured.
  | { type: 'move-card'; id: string; metricId: string; to: number }
  | { type: 'step-card'; id: string; metricId: string; by: -1 | 1 }
  | { type: 'resize-card'; id: string; metricId: string; size: CardSize }
  | { type: 'remove-card'; id: string; metricId: string }
  | { type: 'add-card'; id: string; metricId: string }
  /** Several cards at the end, in this order, each at its size (06 AC-16). A metric already on the board gets a second card ("revenue#2"). */
  | { type: 'add-cards'; id: string; cards: { metricId: string; size: CardSize }[] }
  | { type: 'set-dates'; id: string; period?: string; compare?: string }
  | { type: 'purge-expired'; now: number }

/**
 * A board's cards after one card change; the same array when nothing changes. Positions follow
 * grid-layout.ts: a resize keeps the card's corner and packs the rest; a removal packs the board;
 * a new card goes in the first free space; a reorder (keyboard, or a narrow window's drag) moves
 * the card in reading order and lays the board out again (BS-19, BS-20, BS-29, BS-31).
 */
export function cardsAfter(cards: BoardCard[], a: Extract<BoardAction, { type: 'move-card' | 'step-card' | 'resize-card' | 'remove-card' | 'add-card' }>): BoardCard[] {
  const at = (metricId: string) => cards.findIndex((c) => c.metricId === metricId)
  const reorder = (from: number, to: number) => {
    if (from < 0 || from === to || to < 0 || to >= cards.length) return cards
    const next = cards.slice()
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    const flowed = flowCards(next)
    return withItems(flowed, pack(toItems(flowed)))
  }
  switch (a.type) {
    case 'move-card': return reorder(at(a.metricId), a.to)
    case 'step-card': { const i = at(a.metricId); return reorder(i, i + a.by) }
    case 'resize-card': {
      const i = at(a.metricId)
      if (i < 0 || cards[i].size === a.size) return cards
      const sized = cards.map((c, j) => (j === i ? { ...c, size: a.size } : c))
      return withItems(sized, resize(toItems(cards), a.metricId, a.size))
    }
    case 'remove-card': {
      if (at(a.metricId) < 0) return cards
      const left = cards.filter((c) => c.metricId !== a.metricId)
      return withItems(left, pack(toItems(left)))
    }
    case 'add-card': {
      if (at(a.metricId) >= 0) return cards
      const next = [...cards, { metricId: a.metricId, size: 'sm' as CardSize, ...firstFit(toItems(cards), 1, 1) }]
      return withItems(next, toItems(next)) // kept in reading order
    }
  }
}

const without = (list: string[], id: string) => list.filter((x) => x !== id)
const insertAt = (list: string[], id: string, index: number) => {
  const next = without(list, id)
  next.splice(Math.max(0, Math.min(index, next.length)), 0, id)
  return next
}

/** Keeps `openId` pointing at a tab: if the open board left your tabs, its neighbour opens. */
function settleOpen(prevTabs: string[], s: DashboardState): DashboardState {
  if (s.tabs.includes(s.openId)) return s
  const i = prevTabs.indexOf(s.openId)
  // Nearest surviving tab to the left, else to the right.
  for (let j = i - 1; j >= 0; j--) if (s.tabs.includes(prevTabs[j])) return { ...s, openId: prevTabs[j] }
  for (let j = i + 1; j < prevTabs.length; j++) if (s.tabs.includes(prevTabs[j])) return { ...s, openId: prevTabs[j] }
  return { ...s, openId: s.tabs[0] ?? s.openId }
}

export function boardReducer(s: DashboardState, a: BoardAction): DashboardState {
  switch (a.type) {
    case 'open': {
      if (s.tabs.includes(a.id)) return s.openId === a.id ? s : { ...s, openId: a.id }
      // Opening a hidden board puts it back as the last tab (TAB-39).
      if (s.hidden.includes(a.id)) return { ...s, hidden: without(s.hidden, a.id), tabs: [...s.tabs, a.id], openId: a.id }
      return s
    }
    case 'rename': {
      const b = s.boards[a.id]
      if (!b || b.label === a.label) return s
      return { ...s, boards: { ...s.boards, [a.id]: { ...b, label: a.label } } }
    }
    case 'move-tab': {
      if (!s.tabs.includes(a.id)) return s
      const next = insertAt(s.tabs, a.id, a.to)
      return next.every((id, i) => id === s.tabs[i]) ? s : { ...s, tabs: next }
    }
    case 'add-board':
      return {
        ...s,
        boards: { ...s.boards, [a.board.id]: a.board },
        tabs: insertAt(s.tabs, a.board.id, a.index),
        hidden: without(s.hidden, a.board.id),
        openId: a.open ? a.board.id : s.openId,
      }
    case 'update-board': {
      const b = s.boards[a.id]
      return b ? { ...s, boards: { ...s.boards, [a.id]: { ...b, ...a.patch } } } : s
    }
    case 'replace':
      return a.state
    case 'remove-board': {
      // Undo of new / duplicate; leaving a shared board; a board deleted by someone else (TAB-55).
      if (!s.boards[a.id]) return s
      // Leaving your only tab would leave you with none (TAB-45). Only a board deleted elsewhere
      // can take the last tab, and then there's nothing to open: that needs the backend's
      // fallback board, so the tab stays until it arrives.
      if (s.tabs.length === 1 && s.tabs[0] === a.id) return s
      const { [a.id]: _gone, ...boards } = s.boards
      void _gone
      return settleOpen(s.tabs, { ...s, boards, tabs: without(s.tabs, a.id), hidden: without(s.hidden, a.id), deleted: s.deleted.filter((d) => d.id !== a.id) })
    }
    case 'hide': {
      if (!s.tabs.includes(a.id) || isLastTab(s)) return s
      const next = settleOpen(s.tabs, { ...s, tabs: without(s.tabs, a.id), hidden: [...without(s.hidden, a.id), a.id] })
      return a.openAfter && next.tabs.includes(a.openAfter) ? { ...next, openId: a.openAfter } : next
    }
    case 'show': {
      if (!s.hidden.includes(a.id)) return s
      return {
        ...s,
        hidden: without(s.hidden, a.id),
        tabs: insertAt(s.tabs, a.id, a.index ?? s.tabs.length),
        openId: a.open ? a.id : s.openId,
      }
    }
    case 'delete': {
      const b = s.boards[a.id]
      if (!b || !canDelete(b) || (s.tabs.includes(a.id) && isLastTab(s))) return s
      return settleOpen(s.tabs, {
        ...s,
        tabs: without(s.tabs, a.id),
        hidden: without(s.hidden, a.id),
        deleted: [{ id: a.id, deletedAt: a.at }, ...s.deleted.filter((d) => d.id !== a.id)],
      })
    }
    case 'restore': {
      if (!s.deleted.some((d) => d.id === a.id)) return s
      return {
        ...s,
        deleted: s.deleted.filter((d) => d.id !== a.id),
        tabs: insertAt(s.tabs, a.id, a.index ?? s.tabs.length),
        openId: a.open ? a.id : s.openId,
      }
    }
    case 'apply-manage': {
      // Never leave you with no tab (TAB-45, MT-13); a board lives in one list only.
      const tabs = a.tabs.filter((id) => s.boards[id])
      if (!tabs.length) return s
      const hidden = a.hidden.filter((id) => s.boards[id] && !tabs.includes(id))
      const boards = { ...s.boards }
      for (const [id, label] of Object.entries(a.labels)) if (boards[id]) boards[id] = { ...boards[id], label }
      return settleOpen(s.tabs, { ...s, boards, tabs, hidden })
    }
    case 'set-cards': {
      const b = s.boards[a.id]
      return b ? { ...s, boards: { ...s.boards, [a.id]: { ...b, cards: a.cards } } } : s
    }
    case 'add-cards': {
      const board = s.boards[a.id]
      if (!board || !a.cards.length) return s
      return { ...s, boards: { ...s.boards, [a.id]: { ...board, cards: addCardsAtEnd(board.cards, a.cards) } } }
    }
    case 'move-card':
    case 'step-card':
    case 'resize-card':
    case 'remove-card':
    case 'add-card': {
      const b = s.boards[a.id]
      if (!b) return s
      const cards = cardsAfter(b.cards, a)
      return cards === b.cards ? s : { ...s, boards: { ...s.boards, [a.id]: { ...b, cards } } }
    }
    case 'set-dates': {
      const b = s.boards[a.id]
      if (!b) return s
      return { ...s, boards: { ...s.boards, [a.id]: { ...b, period: a.period ?? b.period, compare: a.compare ?? b.compare } } }
    }
    case 'purge-expired': {
      const expired = s.deleted.filter((d) => daysLeft(d.deletedAt, a.now) <= 0).map((d) => d.id)
      if (!expired.length) return s
      const boards = { ...s.boards }
      for (const id of expired) delete boards[id]
      return { ...s, boards, deleted: s.deleted.filter((d) => !expired.includes(d.id)) }
    }
  }
}

/** The card ids `addCardsAtEnd` gives: a metric already there (or twice in the batch) gets "#2", "#3"… */
export function cardIdsFor(existing: string[], metricIds: string[]): string[] {
  const used = new Set(existing)
  return metricIds.map((id) => {
    let cardId = id
    for (let n = 2; used.has(cardId); n++) cardId = `${id}#${n}`
    used.add(cardId)
    return cardId
  })
}

/** Cards added at the end, in order (06 AC-16). */
export function addCardsAtEnd(cards: BoardCard[], add: { metricId: string; size: CardSize }[]): BoardCard[] {
  const ids = cardIdsFor(cards.map((c) => c.metricId), add.map((c) => c.metricId))
  let next = cards
  add.forEach((c, i) => {
    const d = dims(c.size)
    next = [...next, { metricId: ids[i], size: c.size, ...fitAtEnd(toItems(next), d.w, d.h) }]
  })
  return withItems(next, toItems(next))
}
