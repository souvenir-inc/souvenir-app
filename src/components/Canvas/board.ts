// The board model: an ordered list of metric cards on a 12-column snapped grid. Order is the layout; the
// grid flows cards left to right, top to bottom, and each card's size says how much room it takes.
// Every function here is pure and returns a new board, so React state and the store stay simple.
//
// Sizes work like iOS home-screen widgets: a card stretches between six snapped sizes (3, 6 or 12 columns wide;
// 1 or 2 rows tall), and what it shows follows its size. Short and narrow, just the number; wider, a sparkline
// beside it; taller, a chart.

import type { ComparisonId, WindowId } from './windows'

/** A card's window: one of its own, or `period`, which follows the dashboard's period picker in the header. */
export type CardWindowChoice = WindowId | 'period'

export type CardKind = 'number' | 'trend' | 'weekly' | 'target'
/** Columns (of 12) × rows. */
export type CardSize = '3x1' | '3x2' | '6x1' | '6x2' | '12x1' | '12x2'

export interface BoardCard {
  id: string
  /** The catalog metric's `name` (its permanent key). */
  metric: string
  kind: CardKind
  size: CardSize
  /** `period` (the default) follows the dashboard's period; a window of its own pins the card to it. */
  window: CardWindowChoice
  comparison: ComparisonId
  /** For "Against target" cards: the number to beat. Kept on this device until targets have an API. */
  target?: number | null
}

export interface Board {
  id: string
  name: string
  cards: BoardCard[]
  /**
   * The owner's name, on a board someone else shared with you; absent on your own boards. Only the owner renames or
   * deletes a shared board; you can hide it or leave it. A copy is yours, so `copyBoard` drops it.
   */
  sharedBy?: string
}

export const GRID_COLUMNS = 12

/** How much of the grid each size takes: columns of 12, rows of the base row height. */
export const SIZE_SPAN: Record<CardSize, { cols: number; rows: number }> = {
  '3x1': { cols: 3, rows: 1 },
  '3x2': { cols: 3, rows: 2 },
  '6x1': { cols: 6, rows: 1 },
  '6x2': { cols: 6, rows: 2 },
  '12x1': { cols: 12, rows: 1 },
  '12x2': { cols: 12, rows: 2 },
}

/** Smallest to largest, for the card menu. */
export const SIZE_ORDER: ReadonlyArray<CardSize> = ['3x1', '3x2', '6x1', '6x2', '12x1', '12x2']

export const SIZE_LABEL: Record<CardSize, string> = {
  '3x1': 'Small',
  '3x2': 'Small, tall',
  '6x1': 'Wide',
  '6x2': 'Medium',
  '12x1': 'Full width',
  '12x2': 'Large',
}

/** Sizes saved before the six-size grid. */
export const LEGACY_SIZES: Readonly<Record<string, CardSize>> = { S: '3x1', M: '6x2', L: '12x2' }

const SNAP_COLS = [3, 6, 12] as const
const SNAP_ROWS = [1, 2] as const

function nearest(value: number, options: readonly number[]): number {
  return options.reduce((best, option) => (Math.abs(option - value) < Math.abs(best - value) ? option : best))
}

/** The size a stretched card snaps to: the nearest allowed width and height, from any span in grid units. */
export function snapSize(cols: number, rows: number): CardSize {
  return `${nearest(cols, SNAP_COLS)}x${nearest(rows, SNAP_ROWS)}` as CardSize
}

/** One step wider, narrower, taller or shorter, for resizing from the keyboard. Stays put at the edges. */
export function stepSize(size: CardSize, axis: 'cols' | 'rows', step: -1 | 1): CardSize {
  const { cols, rows } = SIZE_SPAN[size]
  if (axis === 'rows') return snapSize(cols, Math.min(2, Math.max(1, rows + step)))
  const at = SNAP_COLS.indexOf(cols as (typeof SNAP_COLS)[number])
  return snapSize(SNAP_COLS[Math.min(SNAP_COLS.length - 1, Math.max(0, at + step))], rows)
}

/**
 * What a metric card shows at a size: just the figure; the figure with a sparkline beside it (one row, wide) or
 * below it (two rows, narrow); or the figure with a full chart (two rows, wide).
 */
export type CardLayout = 'figure' | 'figure-side' | 'figure-below' | 'figure-chart'

export function layoutOf(size: CardSize): CardLayout {
  const { cols, rows } = SIZE_SPAN[size]
  if (rows === 1) return cols === 3 ? 'figure' : 'figure-side'
  return cols === 3 ? 'figure-below' : 'figure-chart'
}

/** "Number" and "Trend" are one adaptive metric card now; the kind stays for boards saved before. */
export const KIND_LABEL: Record<CardKind, string> = {
  number: 'Metric',
  trend: 'Metric',
  weekly: 'Weekly bars',
  target: 'Against target',
}

/** The kinds the menus offer. Targets belong to the metric now, so "Against target" is no longer one of them. */
export const KIND_CHOICES: ReadonlyArray<CardKind> = ['number', 'weekly']

/** The chart a card can be switched to, by what suits its metric: weekly bars add up, so only sums and counts get them. */
export function chartsFor(unit: 'money' | 'count' | 'ratio' | undefined): ReadonlyArray<CardKind> {
  return unit === 'money' || unit === 'count' ? ['number', 'weekly'] : ['number']
}

export const CHART_LABEL: Record<CardKind, string> = {
  number: 'Number and trend',
  trend: 'Number and trend',
  weekly: 'Weekly bars',
  target: 'Number and trend',
}

/**
 * The size a new metric card starts at, by what suits it: a sum or a count gets room for its trend beside the number
 * (6×1); a rate or a multiple reads as one number (3×1).
 */
export function sizeForMetric(unit: 'money' | 'count' | 'ratio' | undefined): CardSize {
  return unit === 'money' || unit === 'count' ? '6x1' : '3x1'
}

/** The size a new card of each kind starts at. */
export const DEFAULT_SIZE: Record<CardKind, CardSize> = { number: '3x1', trend: '6x2', weekly: '6x2', target: '3x1' }

/** The windows each kind offers. Weekly bars need a few weeks to say anything. */
export const WINDOWS_FOR_KIND: Record<CardKind, ReadonlyArray<WindowId>> = {
  number: ['today', '7d', '30d', '90d', 'mtd'],
  trend: ['today', '7d', '30d', '90d', 'mtd'],
  weekly: ['30d', '90d'],
  target: ['today', '7d', '30d', '90d', 'mtd'],
}

export const DEFAULT_WINDOW: WindowId = '30d'

function allows(kind: CardKind, window: CardWindowChoice): boolean {
  return window === 'period' || WINDOWS_FOR_KIND[kind].includes(window)
}

/** Windows too short for a kind to say anything, when it follows the dashboard: weekly bars need weeks. */
const TOO_SHORT: Partial<Record<CardKind, ReadonlyArray<WindowId>>> = { weekly: ['today', '7d'] }

/**
 * The window a card reads: the dashboard's period from the header, for every card (Dev: one period for the whole
 * board, so no card shows Today beside another on 30 days). A window a card saved for itself before is ignored. A
 * period too short for the card's kind (weekly bars over Today or 7 days) reads 30 days instead.
 */
export function effectiveWindow(card: Pick<BoardCard, 'kind' | 'window'>, period: WindowId): WindowId {
  return TOO_SHORT[card.kind]?.includes(period) ? DEFAULT_WINDOW : period
}

export function newCardId(): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10)
  return `card-${random}`
}

export function createCard(
  metric: string, kind: CardKind,
  options: Partial<Pick<BoardCard, 'id' | 'size' | 'window' | 'comparison' | 'target'>> = {},
): BoardCard {
  const window: CardWindowChoice = options.window && allows(kind, options.window) ? options.window : 'period'
  const card: BoardCard = {
    id: options.id ?? newCardId(),
    metric, kind,
    size: options.size ?? DEFAULT_SIZE[kind],
    window,
    comparison: options.comparison ?? 'previous',
  }
  if (kind === 'target') card.target = options.target ?? null
  return card
}

/** Adds a card at `index` (the end by default). */
export function addCard(board: Board, card: BoardCard, index = board.cards.length): Board {
  const cards = [...board.cards]
  cards.splice(Math.max(0, Math.min(index, cards.length)), 0, card)
  return { ...board, cards }
}

/** A copy of a card, right after the original, with the same metric, chart and size. */
export function duplicateCard(board: Board, id: string, newId: string = newCardId()): Board {
  const at = board.cards.findIndex(c => c.id === id)
  if (at === -1) return board
  return addCard(board, { ...board.cards[at], id: newId }, at + 1)
}

/**
 * Swaps a card's metric, keeping its size and place. A chart the new metric doesn't suit (weekly bars for a rate)
 * goes back to the number and trend.
 */
export function swapMetric(board: Board, id: string, metric: string, unit: 'money' | 'count' | 'ratio' | undefined): Board {
  return {
    ...board,
    cards: board.cards.map(card => {
      if (card.id !== id) return card
      const kind = chartsFor(unit).includes(card.kind) ? card.kind : 'number'
      const next: BoardCard = { ...card, metric, kind }
      delete next.target
      return next
    }),
  }
}

/** A copy of a whole board under a new id and name, every card with a new id. Boards have no dates of their own. */
export function copyBoard(board: Board, id: string, name: string, cardId: () => string = newCardId): Board {
  return { id, name, cards: board.cards.map(card => ({ ...card, id: cardId() })) }
}

export function removeCard(board: Board, id: string): Board {
  return { ...board, cards: board.cards.filter(c => c.id !== id) }
}

/** Moves a card to a position in the order, clamped to the ends. Unknown ids leave the board as it was. */
export function moveCard(board: Board, id: string, toIndex: number): Board {
  const from = board.cards.findIndex(c => c.id === id)
  if (from === -1) return board
  const to = Math.max(0, Math.min(toIndex, board.cards.length - 1))
  if (from === to) return board
  const cards = [...board.cards]
  const [card] = cards.splice(from, 1)
  cards.splice(to, 0, card)
  return { ...board, cards }
}

/** Moves a card one step earlier or later, for the keyboard and the card menu. */
export function nudgeCard(board: Board, id: string, step: -1 | 1): Board {
  const from = board.cards.findIndex(c => c.id === id)
  return from === -1 ? board : moveCard(board, id, from + step)
}

/** Applies an order from a drag (a list of ids). Ids it doesn't mention keep their place at the end. */
export function reorderCards(board: Board, ids: ReadonlyArray<string>): Board {
  const byId = new Map(board.cards.map(c => [c.id, c]))
  const ordered = ids.map(id => byId.get(id)).filter((c): c is BoardCard => c !== undefined)
  const seen = new Set(ordered.map(c => c.id))
  return { ...board, cards: [...ordered, ...board.cards.filter(c => !seen.has(c.id))] }
}

export function resizeCard(board: Board, id: string, size: CardSize): Board {
  return updateCard(board, id, { size })
}

/** Changes a card's settings. A window the card's kind doesn't offer is ignored. */
export function updateCard(board: Board, id: string, patch: Partial<Omit<BoardCard, 'id'>>): Board {
  return {
    ...board,
    cards: board.cards.map(card => {
      if (card.id !== id) return card
      const next = { ...card, ...patch }
      if (!allows(next.kind, next.window)) next.window = allows(next.kind, card.window) ? card.window : 'period'
      return next
    }),
  }
}

/** Puts a metric's cards first (in their existing order), the rest after; used for `?focus=<metric>`. */
export function focusFirst(cards: ReadonlyArray<BoardCard>, metric: string | null | undefined): BoardCard[] {
  if (!metric) return [...cards]
  return [...cards.filter(c => c.metric === metric), ...cards.filter(c => c.metric !== metric)]
}

/**
 * The board for a focused visit: the metric's cards lead. If the board has none, a trend card for it leads
 * (unsaved until the person changes something, so a quick look doesn't rearrange their board).
 */
export function focusBoard(board: Board, metric: string | null | undefined): { board: Board; added: BoardCard | null } {
  if (!metric) return { board, added: null }
  if (board.cards.some(c => c.metric === metric)) return { board: { ...board, cards: focusFirst(board.cards, metric) }, added: null }
  const added = createCard(metric, 'trend', { id: `focus-${metric}`, size: '12x2' })
  return { board: addCard(board, added, 0), added }
}
