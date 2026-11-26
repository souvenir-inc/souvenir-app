// The Canvas PRD's flows, as logic: links that carry a view, tabs, deleting and restoring, versions, templates, cards'
// own settings, and the spreadsheet export. Made-up numbers only.

import { describe, expect, it } from 'vitest'
import {
  chartsFor, copyBoard, createCard, duplicateCard, sizeForMetric, swapMetric, type Board,
} from './board'
import { cardChange, comparedValue, planMeasurements } from './batching'
import { searchForView, viewFromSearch } from './dates'
import {
  addBoard, daysLeft, deleteBoard, duplicateBoard, freeName, homeOf, orderTabs, purgeDeleted, restoreBoard, tabsOf,
  withoutTab, withTab,
} from './doc'
import { cardCsv, exactFigure, exportName } from './export'
import { parseBoardsDoc, withStarters, type BoardsDoc } from './store'
import { TEMPLATES, templateBoard } from './templates'
import { recordVersion, VERSIONS_KEPT, type VersionLog } from './versions'
import { windowFor } from './windows'

const board = (id: string, ...metrics: string[]): Board => ({
  id, name: id.toUpperCase(), cards: metrics.map((m, i) => createCard(m, 'number', { id: `${id}-c${i}` })),
})

const doc = (...boards: Board[]): BoardsDoc => ({ version: 1, activeId: boards[0].id, boards })

describe('cards: their own settings', () => {
  it('offers weekly bars only for sums and counts', () => {
    expect(chartsFor('money')).toEqual(['number', 'weekly'])
    expect(chartsFor('count')).toEqual(['number', 'weekly'])
    expect(chartsFor('ratio')).toEqual(['number'])
  })

  it('sizes a new card to suit its metric', () => {
    expect(sizeForMetric('money')).toBe('6x1')
    expect(sizeForMetric('ratio')).toBe('3x1')
  })

  it('lands a duplicate right after the original', () => {
    const b = board('b', 'revenue', 'orders')
    const next = duplicateCard(b, 'b-c0', 'copy')
    expect(next.cards.map(c => c.id)).toEqual(['b-c0', 'copy', 'b-c1'])
    expect(next.cards[1]).toMatchObject({ metric: 'revenue', size: b.cards[0].size })
  })

  it('swaps a metric keeping size and place, and drops a chart the new metric does not suit', () => {
    const b: Board = { id: 'b', name: 'B', cards: [createCard('revenue', 'weekly', { id: 'w', size: '6x2' })] }
    const toRate = swapMetric(b, 'w', 'refund_rate', 'ratio')
    expect(toRate.cards[0]).toMatchObject({ id: 'w', metric: 'refund_rate', kind: 'number', size: '6x2' })
    const toCount = swapMetric(b, 'w', 'orders', 'count')
    expect(toCount.cards[0].kind).toBe('weekly')
  })

  it('copies a board with new card ids', () => {
    let n = 0
    const copy = copyBoard(board('b', 'revenue'), 'b2', 'B copy', () => `new-${n++}`)
    expect(copy).toEqual({ id: 'b2', name: 'B copy', cards: [expect.objectContaining({ id: 'new-0', metric: 'revenue' })] })
  })
})

describe('links carry the sender’s view (D105)', () => {
  it('carries a view in a link and reads it back', () => {
    const quick = { period: '60d' as const, custom: null, comparison: 'year' as const, compareCustom: null }
    expect(searchForView('b-1', quick)).toBe('?board=b-1&period=60d&compare=year')
    expect(viewFromSearch(searchForView('b-1', quick))).toEqual({ boardId: 'b-1', view: quick })
    const range = { period: 'custom' as const, custom: { start: '2026-10-01', end: '2026-10-31' }, comparison: 'previous' as const, compareCustom: null }
    expect(searchForView('b-1', range)).toBe('?board=b-1&from=2026-10-01&to=2026-10-31')
    expect(viewFromSearch(searchForView('b-1', range))).toEqual({ boardId: 'b-1', view: range })
    const own = { period: '7d' as const, custom: null, comparison: 'custom' as const, compareCustom: { start: '2026-10-01', end: '2026-10-07' } }
    expect(searchForView('b-1', own)).toBe('?board=b-1&period=7d&compare=custom&cfrom=2026-10-01&cto=2026-10-07')
    expect(viewFromSearch(searchForView('b-1', own))).toEqual({ boardId: 'b-1', view: own })
  })

  it('links another board plainly, so it opens on the reader’s default', () => {
    expect(searchForView('b-2', null)).toBe('?board=b-2')
    expect(viewFromSearch('?board=b-2')).toEqual({ boardId: 'b-2', view: null })
  })

  it('ignores a link’s dates it can’t read, and comparisons the period doesn’t offer', () => {
    expect(viewFromSearch('?board=b&period=1y')).toEqual({ boardId: 'b', view: null })
    expect(viewFromSearch('?from=2026-13&to=x').view).toBeNull()
    expect(viewFromSearch('').boardId).toBeNull()
    expect(viewFromSearch('?period=30d&compare=average').view?.comparison).toBe('previous')
    expect(viewFromSearch('?period=7d&compare=custom').view?.comparison).toBe('previous')
  })

  it('compares every card with last year, 52 weeks back, when the header says so', () => {
    const cards = [createCard('revenue', 'number', { id: 'r' })]
    const plan = planMeasurements(cards, '2026-11-15', () => null, '7d', null, 'year')
    expect(plan.byCard.r.window.comparison).toEqual({ start: '2025-11-10', end: '2025-11-16' })
    expect(plan.byCard.r.window.comparisonLabel).toBe('Last year')
  })
})

describe('comparisons of another length compare per-day averages (D99)', () => {
  const data = { value: 700, previous: 4900, unavailable: null, series: null, comparisonSeries: null, weeks: null }

  it('compares Today so far with the 7 days before as a per-day average, for totals', () => {
    const w = windowFor('today', 'average', '2026-11-16')
    expect(w.comparison).toEqual({ start: '2026-11-09', end: '2026-11-15' })
    expect(w).toMatchObject({ perDay: true, comparisonLabel: '7-day average', seriesComparison: null })
    expect(comparedValue(data, w, true)).toBe(700)
    expect(cardChange(data, w, true)).toBe(0)
  })

  it('compares rates and averages as they are', () => {
    const w = windowFor('today', 'average', '2026-11-16')
    expect(cardChange({ ...data, value: 80, previous: 100 }, w, false)).toBeCloseTo(-20)
  })

  it('keeps comparisons of the same length as totals, and a custom one of another length per day', () => {
    expect(windowFor('7d', 'previous', '2026-11-16').perDay).toBe(false)
    const own = windowFor('7d', 'custom', '2026-11-16', null, null, { start: '2026-10-01', end: '2026-10-14' })
    expect(own).toMatchObject({ perDay: true, comparisonLabel: '1 – 14 Oct', seriesComparison: null })
    expect(cardChange({ ...data, value: 700, previous: 2800 }, own, true)).toBeCloseTo(-50)
  })
})

describe('tabs', () => {
  const base = doc(board('a'), board('b'), board('c'))

  it('reads every board as a tab until tabs are picked; the first is home', () => {
    expect(tabsOf(base)).toEqual(['a', 'b', 'c'])
    expect(homeOf({ ...base, tabs: ['c', 'a'] })).toBe('c')
  })

  it('takes a board out of the tabs without deleting it, but never the last tab', () => {
    const hidden = withoutTab(base, 'b')
    expect(tabsOf(hidden)).toEqual(['a', 'c'])
    expect(hidden.boards).toHaveLength(3)
    const one = { ...base, tabs: ['a'] }
    expect(withoutTab(one, 'a')).toBe(one)
  })

  it('puts a board back in the tabs, after one or at the end', () => {
    const hidden = withoutTab(base, 'b')
    expect(tabsOf(withTab(hidden, 'b'))).toEqual(['a', 'c', 'b'])
    expect(tabsOf(withTab(hidden, 'b', 'a'))).toEqual(['a', 'b', 'c'])
  })

  it('reorders tabs, keeping any it was not told about at the end', () => {
    expect(tabsOf(orderTabs(base, ['c', 'a']))).toEqual(['c', 'a', 'b'])
  })

  it('adds a new board to the tabs', () => {
    expect(tabsOf(addBoard({ ...base, tabs: ['a', 'c'] }, board('d')))).toEqual(['a', 'c', 'd'])
  })

  it('duplicates a board right after it, with a free name', () => {
    const next = duplicateBoard(base, 'a', 'a2', () => 'x')
    expect(next.boards.map(b => b.id)).toEqual(['a', 'a2', 'b', 'c'])
    expect(tabsOf(next)).toEqual(['a', 'a2', 'b', 'c'])
    expect(next.boards[1].name).toBe('A copy')
    expect(freeName(next, 'A copy')).toBe('A copy 2')
  })

  it('appends a new starter tab to saved tabs too', () => {
    const saved: BoardsDoc = { ...doc(board('mine')), tabs: ['mine'], seeds: [] }
    const grown = withStarters(saved, [board('starter-new')])
    expect(tabsOf(grown)).toEqual(['mine', 'starter-new'])
  })
})

describe('deleting and restoring boards', () => {
  const base = doc(board('a'), board('b'))
  const deletedAt = '2026-11-01T10:00:00.000Z'

  it('keeps a deleted board for 30 days and never offers a deleted starter again', () => {
    const next = deleteBoard(base, 'b', deletedAt)
    expect(next.boards.map(b => b.id)).toEqual(['a'])
    expect(tabsOf(next)).toEqual(['a'])
    expect(next.deleted?.[0]).toMatchObject({ board: { id: 'b' }, deletedAt })
    expect(next.seeds).toContain('b')
    expect(withStarters(next, [board('b')]).boards.map(b => b.id)).toEqual(['a'])
  })

  it('never deletes the last board', () => {
    const one = doc(board('a'))
    expect(deleteBoard(one, 'a', deletedAt)).toBe(one)
  })

  it('restores a board into the boards and the tabs', () => {
    const back = restoreBoard(deleteBoard(base, 'b', deletedAt), 'b')
    expect(back.boards.map(b => b.id)).toEqual(['a', 'b'])
    expect(tabsOf(back)).toEqual(['a', 'b'])
    expect(back.deleted).toBeUndefined()
  })

  it('forgets boards deleted more than 30 days ago, and counts the days left', () => {
    const deleted = deleteBoard(base, 'b', deletedAt)
    expect(purgeDeleted(deleted, '2026-11-20T10:00:00.000Z')).toBe(deleted)
    expect(purgeDeleted(deleted, '2026-12-02T10:00:00.000Z').deleted).toBeUndefined()
    expect(daysLeft(deletedAt, '2026-11-01T10:00:00.000Z')).toBe(30)
    expect(daysLeft(deletedAt, '2026-11-30T12:00:00.000Z')).toBe(1)
    // A clock read just before the delete still says 30, not 31.
    expect(daysLeft(deletedAt, '2026-11-01T09:59:00.000Z')).toBe(30)
  })
})

describe('saved boards: the new parts', () => {
  it('reads tabs and deleted boards, drops what it can’t read, and drops dates boards no longer have', () => {
    const parsed = parseBoardsDoc({
      version: 1, activeId: 'a', tabs: ['b', 'gone', 'a', 'b'],
      boards: [
        { id: 'a', name: 'A', cards: [], dates: { period: '7d', custom: null, comparison: 'year' } },
        { id: 'b', name: 'B', cards: [], dates: { period: 'custom', custom: null, comparison: 'previous' } },
      ],
      deleted: [{ board: { id: 'c', name: 'C', cards: [] }, deletedAt: '2026-11-01T10:00:00.000Z' }, { board: 'junk', deletedAt: 'x' }],
    })
    expect(parsed?.tabs).toEqual(['b', 'a'])
    expect(parsed?.boards.map(b => Object.keys(b).sort())).toEqual([['cards', 'id', 'name'], ['cards', 'id', 'name']])
    expect(parsed?.deleted?.map(d => d.board.id)).toEqual(['c'])
  })

  it('reads an old "Against target" card as a metric card (targets belong to the metric)', () => {
    const parsed = parseBoardsDoc({ version: 1, activeId: 'a', boards: [{ id: 'a', name: 'A', cards: [
      { id: 't', metric: 'refund_rate', kind: 'target', size: '3x1', window: 'period', comparison: 'previous', target: 0.05 },
    ] }] })
    expect(parsed?.boards[0].cards[0]).toEqual({ id: 't', metric: 'refund_rate', kind: 'number', size: '3x1', window: 'period', comparison: 'previous' })
  })
})

describe('versions', () => {
  const t = (minutes: number) => new Date(Date.UTC(2026, 10, 16, 10, minutes)).toISOString()

  it('keeps where a board started, then folds one person’s burst of changes into one version', () => {
    let log: VersionLog = {}
    log = recordVersion(log, board('b', 'revenue'), t(0), 'Sam')
    log = recordVersion(log, board('b', 'revenue', 'orders'), t(0), 'Sam')
    log = recordVersion(log, board('b', 'revenue', 'orders', 'aov'), t(1), 'Sam')
    expect(log.b.map(v => v.board.cards.length)).toEqual([3, 1])
    log = recordVersion(log, board('b', 'revenue'), t(10), 'Sam')
    expect(log.b.map(v => v.board.cards.length)).toEqual([1, 3, 1])
    log = recordVersion(log, board('b', 'orders'), t(11), 'Alex')
    expect(log.b[0]).toMatchObject({ by: 'Alex' })
    expect(log.b).toHaveLength(4)
  })

  it('adds nothing when the board did not change, and keeps a bounded number', () => {
    const one = recordVersion({}, board('b', 'revenue'), t(0), 'Sam')
    expect(recordVersion(one, board('b', 'revenue'), t(30), 'Sam')).toBe(one)
    let log: VersionLog = {}
    for (let i = 0; i < VERSIONS_KEPT + 5; i += 1) log = recordVersion(log, { ...board('b'), name: `v${i}` }, t(i * 5), 'Sam')
    expect(log.b).toHaveLength(VERSIONS_KEPT)
    expect(log.b[0].board.name).toBe(`v${VERSIONS_KEPT + 4}`)
  })
})

describe('templates', () => {
  const catalog = new Map([
    ['revenue', { category: 'store' }], ['orders', { category: 'store' }], ['aov', { category: 'store' }],
    ['new_customers', { category: 'store' }], ['mer', { category: 'blended' }],
    ['ad_spend', { category: 'ads' }], ['platform_roas', { category: 'ads' }], ['ctr', { category: 'ads' }], ['cpm', { category: 'ads' }],
  ])

  it('puts the headline first, with no dates of its own', () => {
    const founder = TEMPLATES.find(t => t.id === 'founder')!
    const { board: made, missingApps } = templateBoard(founder, catalog, new Set(['store', 'ads']), undefined, 'f')
    expect('dates' in made).toBe(false)
    expect(made.cards.map(c => c.metric)).toEqual(['revenue', 'mer', 'new_customers', 'aov'])
    expect(made.cards.map(c => c.size)).toEqual(['12x1', '3x1', '3x1', '3x1'])
    expect(missingApps).toEqual([])
  })

  it('leaves out cards whose app isn’t connected, and says which', () => {
    const agency = TEMPLATES.find(t => t.id === 'agency')!
    const { board: made, missingApps } = templateBoard(agency, catalog, new Set(['store']), undefined, 'g')
    expect(made.cards).toEqual([])
    expect(missingApps).toEqual(['ads'])
  })

  it('leaves out quietly what the store can’t measure or the catalog doesn’t have', () => {
    const store = TEMPLATES.find(t => t.id === 'store')!
    const { board: made, missingApps } = templateBoard(store, catalog, new Set(['store']), { aov: 'no orders table' }, 's')
    expect(made.cards.map(c => c.metric)).toEqual(['revenue', 'orders'])
    expect(missingApps).toEqual([])
  })
})

describe('spreadsheet export', () => {
  it('holds exact figures, a rate as a percentage', () => {
    expect(exactFigure(1234.5678, 'money')).toBe(1234.5678)
    expect(exactFigure(0.034, 'ratio')).toBe(3.4)
    expect(exactFigure(0.1 + 0.2, 'count')).toBe(0.3)
    expect(exactFigure(null, 'money')).toBeNull()
  })

  it('writes one row per day with the comparison beside it, stamped with who and when', () => {
    const csv = cardCsv({
      label: 'Revenue', format: 'money', datesLabel: 'Last 2 days', comparisonLabel: 'Previous 2 days',
      series: [{ date: '2026-11-14', value: 1200.5 }, { date: '2026-11-15', value: null }],
      comparison: [{ date: '2026-11-12', value: 1000 }, { date: '2026-11-13', value: 900 }],
      by: 'Sam Lee', on: '2026-11-16',
    })
    const lines = csv.trim().split('\r\n')
    expect(lines[0]).toBe('Revenue · Last 2 days · vs previous 2 days')
    expect(lines[1]).toMatch(/^Exported by Sam Lee on /)
    expect(lines[3]).toBe('Date,Revenue,Previous 2 days date,"Revenue, previous 2 days"')
    expect(lines[4]).toBe('2026-11-14,1200.5,2026-11-12,1000')
    expect(lines[5]).toBe('2026-11-15,,2026-11-13,900')
  })

  it('names files with ids and dates only', () => {
    expect(exportName('Store overview', '2026-10-17', '2026-11-15', 'png')).toBe('store-overview-2026-10-17-to-2026-11-15.png')
  })
})
