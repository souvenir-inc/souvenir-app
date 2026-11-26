import { describe, expect, it } from 'vitest'
import type { Measurement } from '@/lib/api/warehouse'
import {
  addCard, createCard, effectiveWindow, focusBoard, focusFirst, layoutOf, moveCard, nudgeCard, removeCard, reorderCards, resizeCard,
  snapSize, stepSize, updateCard, type Board,
} from './board'
import { changeOf, planMeasurements, readCard, rangeKey, withExtraMetrics } from './batching'
import { diagnoseBoard, inputsFor, pickAvailable } from './diagnose'
import {
  CM_BOARD_ID, connectedSources, contributionMarginBoard, polarityOf, repairStarter, sourceCategories, sourcesFor, STARTER_METRICS, starterBoard,
  starterBoards,
  starterFor, toneOfChange, valueFormatOf,
} from './metrics'
import { browserBoardStore, parseBoardsDoc, storageKey, withStarters, type BoardsDoc, type StorageLike } from './store'
import { addDays, daysBetween, eachDay, shiftYears, todayIn, weekStartOf, windowFor } from './windows'

const TODAY = '2026-11-12' // a Thursday

function board(...metrics: string[]): Board {
  return { id: 'b', name: 'Test', cards: metrics.map(m => createCard(m, 'number', { id: m })) }
}

const ids = (b: Board) => b.cards.map(c => c.id)

describe('board layout', () => {
  it('creates cards at their kind’s default size and window', () => {
    expect(createCard('revenue', 'number')).toMatchObject({ kind: 'number', size: '3x1', window: 'period', comparison: 'previous' })
    expect(createCard('revenue', 'trend').size).toBe('6x2')
    expect(createCard('orders', 'weekly', { window: '7d' }).window).toBe('period')
    expect(createCard('orders', 'weekly', { window: '90d' }).window).toBe('90d')
    expect(createCard('refund_rate', 'target').target).toBeNull()
  })

  it('adds, removes and moves cards', () => {
    const b = board('a', 'b', 'c')
    expect(ids(addCard(b, createCard('d', 'number', { id: 'd' }), 1))).toEqual(['a', 'd', 'b', 'c'])
    expect(ids(addCard(b, createCard('d', 'number', { id: 'd' })))).toEqual(['a', 'b', 'c', 'd'])
    expect(ids(removeCard(b, 'b'))).toEqual(['a', 'c'])
    expect(ids(moveCard(b, 'a', 2))).toEqual(['b', 'c', 'a'])
    expect(ids(moveCard(b, 'c', -5))).toEqual(['c', 'a', 'b'])
    expect(moveCard(b, 'missing', 0)).toBe(b)
  })

  it('nudges a card one place either way, stopping at the ends', () => {
    const b = board('a', 'b', 'c')
    expect(ids(nudgeCard(b, 'b', -1))).toEqual(['b', 'a', 'c'])
    expect(ids(nudgeCard(b, 'b', 1))).toEqual(['a', 'c', 'b'])
    expect(ids(nudgeCard(b, 'a', -1))).toEqual(['a', 'b', 'c'])
  })

  it('applies a dragged order and keeps cards the drag missed', () => {
    expect(ids(reorderCards(board('a', 'b', 'c'), ['c', 'a']))).toEqual(['c', 'a', 'b'])
  })

  it('resizes and updates, refusing a window the kind doesn’t offer', () => {
    const b = board('a')
    expect(resizeCard(b, 'a', '12x2').cards[0].size).toBe('12x2')
    expect(updateCard(b, 'a', { window: '90d', comparison: 'year' }).cards[0]).toMatchObject({ window: '90d', comparison: 'year' })
    const weekly = updateCard(updateCard(b, 'a', { window: '7d' }), 'a', { kind: 'weekly' })
    expect(weekly.cards[0]).toMatchObject({ kind: 'weekly', window: 'period' })
  })

  it('reads the dashboard period on every card, whatever it saved, falling back where a kind can’t follow', () => {
    expect(effectiveWindow({ kind: 'number', window: 'period' }, '90d')).toBe('90d')
    expect(effectiveWindow({ kind: 'number', window: '7d' }, '90d')).toBe('90d')
    expect(effectiveWindow({ kind: 'weekly', window: 'period' }, '7d')).toBe('30d')
    expect(effectiveWindow({ kind: 'weekly', window: 'period' }, 'today')).toBe('30d')
    expect(effectiveWindow({ kind: 'weekly', window: 'period' }, '60d')).toBe('60d')
    expect(effectiveWindow({ kind: 'weekly', window: 'period' }, 'custom')).toBe('custom')
    const pinned = updateCard(board('a'), 'a', { window: '90d' })
    expect(updateCard(pinned, 'a', { window: 'period' }).cards[0].window).toBe('period')
  })

  it('snaps a stretched card to the nearest of six sizes, like an iOS widget', () => {
    expect(snapSize(3, 1)).toBe('3x1')
    expect(snapSize(4.4, 1.2)).toBe('3x1')
    expect(snapSize(5, 1.6)).toBe('6x2')
    expect(snapSize(9.2, 0.7)).toBe('12x1')
    expect(snapSize(30, 9)).toBe('12x2')
    expect(snapSize(0.5, 0.2)).toBe('3x1')
    expect(stepSize('3x1', 'cols', 1)).toBe('6x1')
    expect(stepSize('6x1', 'cols', 1)).toBe('12x1')
    expect(stepSize('12x1', 'cols', 1)).toBe('12x1')
    expect(stepSize('6x1', 'rows', 1)).toBe('6x2')
    expect(stepSize('6x2', 'rows', 1)).toBe('6x2')
    expect(stepSize('3x2', 'cols', -1)).toBe('3x2')
  })

  it('shows more as a card grows: number, then a sparkline beside or below it, then the chart', () => {
    expect(layoutOf('3x1')).toBe('figure')
    expect(layoutOf('6x1')).toBe('figure-side')
    expect(layoutOf('12x1')).toBe('figure-side')
    expect(layoutOf('3x2')).toBe('figure-below')
    expect(layoutOf('6x2')).toBe('figure-chart')
    expect(layoutOf('12x2')).toBe('figure-chart')
  })

  it('puts a focused metric’s cards first, or leads with a new trend card for it', () => {
    const b = board('orders', 'revenue', 'aov')
    expect(focusFirst(b.cards, 'revenue').map(c => c.id)).toEqual(['revenue', 'orders', 'aov'])
    expect(focusFirst(b.cards, null).map(c => c.id)).toEqual(['orders', 'revenue', 'aov'])
    const { board: focused, added } = focusBoard(b, 'refund_rate')
    expect(added).toMatchObject({ metric: 'refund_rate', kind: 'trend', size: '12x2' })
    expect(focused.cards[0]).toBe(added)
    expect(focusBoard(b, 'aov').added).toBeNull()
  })
})

describe('calendar helpers', () => {
  it('counts and shifts days across month and year ends', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(daysBetween('2026-11-01', '2026-11-12')).toBe(12)
    expect(eachDay({ start: '2026-10-30', end: '2026-11-02' })).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'])
    expect(shiftYears('2028-02-29', -1)).toBe('2027-02-28')
    expect(weekStartOf('2026-11-12')).toBe('2026-11-09')
    expect(weekStartOf('2026-11-09')).toBe('2026-11-09')
    expect(weekStartOf('2026-11-15')).toBe('2026-11-09')
  })

  it('reads today in the store’s timezone, not the browser’s', () => {
    const lateEvening = new Date('2026-11-13T03:30:00Z') // still the 12th in New York
    expect(todayIn('America/New_York', lateEvening)).toBe('2026-11-12')
    expect(todayIn('Asia/Kolkata', lateEvening)).toBe('2026-11-13')
    expect(todayIn('Not/AZone', lateEvening)).toBe('2026-11-13')
  })
})

describe('time windows', () => {
  it('runs rolling windows to today, whole, against the same number of days just before', () => {
    const w = windowFor('7d', 'previous', TODAY)
    expect(w.current).toEqual({ start: '2026-11-06', end: TODAY })
    expect(w.comparison).toEqual({ start: '2026-10-30', end: '2026-11-05' })
    expect(w.comparisonLabel).toBe('Previous 7 days')
    expect(w.label).toBe('Last 7 days')
    expect(w.note).toBeNull()
    expect(w.grain).toBe('day')
    expect(w.days).toBe(7)
    expect(windowFor('90d', 'previous', TODAY).current).toEqual({ start: '2026-08-15', end: TODAY })
  })

  it('compares today with yesterday and draws two weeks for context', () => {
    const w = windowFor('today', 'previous', TODAY)
    expect(w.current).toEqual({ start: TODAY, end: TODAY })
    expect(w.comparison).toEqual({ start: '2026-11-11', end: '2026-11-11' })
    expect(w.series).toEqual({ start: '2026-10-30', end: TODAY })
    expect(w.seriesComparison).toBeNull()
  })

  it('runs month to date against the same days last month, cut at its end', () => {
    expect(windowFor('mtd', 'previous', TODAY).comparison).toEqual({ start: '2026-10-01', end: '2026-10-12' })
    expect(windowFor('mtd', 'previous', '2026-03-31').comparison).toEqual({ start: '2026-02-01', end: '2026-02-28' })
    expect(windowFor('mtd', 'previous', '2026-01-15').comparison).toEqual({ start: '2025-12-01', end: '2025-12-15' })
  })

  it('compares with last year 52 weeks back, so weekdays match, or with nothing', () => {
    const w = windowFor('30d', 'year', TODAY)
    expect(w.comparison).toEqual({ start: '2025-10-15', end: '2025-11-13' })
    expect(w.comparisonLabel).toBe('Last year')
    expect(w.seriesComparison).toEqual(w.comparison)
    const none = windowFor('30d', 'none', TODAY)
    expect(none.comparison).toBeNull()
    expect(none.comparisonLabel).toBeNull()
  })
})

describe('a source that stopped syncing', () => {
  const UNTIL = '2026-11-09' // the store last synced on the 9th; today is the 12th

  it('pulls a rolling window back to the last day of data and keeps it whole (team rule)', () => {
    const w = windowFor('7d', 'previous', TODAY, UNTIL)
    expect(w.current).toEqual({ start: '2026-11-03', end: UNTIL })
    expect(w.comparison).toEqual({ start: '2026-10-27', end: '2026-11-02' })
    expect(w.label).toBe('7 days to 9 Nov')
    expect(w.note).toBe('7 days to 9 Nov')
    expect(w.cut).toBeNull()
    expect(w.measured).toEqual(w.current)
    expect(w.measuredComparison).toEqual(w.comparison)
    expect(windowFor('30d', 'year', TODAY, UNTIL).comparison).toEqual({ start: '2025-10-12', end: '2025-11-10' })
  })

  it('leaves a rolling window alone when its data is current', () => {
    const w = windowFor('7d', 'previous', TODAY, TODAY)
    expect(w.note).toBeNull()
    expect(w.label).toBe('Last 7 days')
    expect(w.current.end).toBe(TODAY)
  })

  it('keeps a calendar window’s dates, measuring up to the cut against the same number of days', () => {
    const w = windowFor('mtd', 'previous', TODAY, UNTIL)
    expect(w.current).toEqual({ start: '2026-11-01', end: TODAY })
    expect(w.cut).toBe(UNTIL)
    expect(w.note).toBe('Data until 9 Nov')
    expect(w.measured).toEqual({ start: '2026-11-01', end: UNTIL })
    expect(w.measuredComparison).toEqual({ start: '2026-10-01', end: '2026-10-09' })
  })

  it('has nothing to measure when a calendar window is entirely after the cut', () => {
    const w = windowFor('today', 'previous', TODAY, UNTIL)
    expect(w.empty).toBe(true)
    expect(w.measured).toBeNull()
    expect(w.measuredComparison).toBeNull()
    expect(w.seriesMeasured).toEqual({ start: '2026-10-30', end: UNTIL }) // the context chart still has days
    const card = createCard('revenue', 'number', { id: 'n' })
    const needs = planMeasurements([card], TODAY, () => UNTIL, 'today').byCard.n
    expect(needs.total).toBeNull()
    expect(readCard(card, needs, {})).toMatchObject({ value: null, previous: null })
  })

  it('plans per source and draws nothing after the cut', () => {
    const cards = [createCard('revenue', 'trend', { id: 's' }), createCard('ad_spend', 'number', { id: 'a' })]
    const plan = planMeasurements(cards, TODAY, metric => (metric === 'revenue' ? UNTIL : TODAY), 'mtd')
    const store = plan.byCard.s
    expect(store.total).toBe(rangeKey({ start: '2026-11-01', end: UNTIL }, 'total'))
    expect(plan.byCard.a.total).toBe(rangeKey({ start: '2026-11-01', end: TODAY }, 'total'))
    const data = readCard(cards[0], store, {
      [store.total!]: measurement('total', [['2026-11-01', { revenue: 500 }]]),
      [store.series!]: measurement('day', [['2026-11-01', { revenue: 100 }], ['2026-11-09', { revenue: 80 }], ['2026-11-10', { revenue: 0 }]]),
      [store.comparisonSeries!]: measurement('day', [['2026-10-01', { revenue: 90 }], ['2026-10-09', { revenue: 70 }]]),
    })
    expect(data?.series).toHaveLength(12)
    expect(data?.series?.map(p => p.value)).toEqual([100, null, null, null, null, null, null, null, 80, null, null, null])
    expect(data?.comparisonSeries?.map(p => p.value).slice(0, 10)).toEqual([90, null, null, null, null, null, null, null, 70, null])
  })

  it('ends weekly bars on the last day of data, that week still filling in', () => {
    const card = createCard('orders', 'weekly', { id: 'w' })
    const needs = planMeasurements([card], TODAY, () => UNTIL).byCard.w
    expect(needs.weeksRange).toEqual({ start: '2026-10-05', end: UNTIL })
    const data = readCard(card, needs, {
      [needs.total!]: measurement('total', [['2026-10-11', { orders: 40 }]]),
      [needs.weeks!]: measurement('week', [['2026-11-02', { orders: 10 }], ['2026-11-09', { orders: 3 }]]),
    })
    // The 9th is a Monday: its week has one day of data so far.
    expect(data?.weeks).toEqual([
      { start: '2026-11-02', value: 10, partial: false },
      { start: '2026-11-09', value: 3, partial: true },
    ])
  })
})

describe('request batching', () => {
  it('asks once per range and grain, with every metric that needs it', () => {
    const cards = [
      createCard('revenue', 'number', { id: '1' }),
      createCard('orders', 'number', { id: '2' }),
      createCard('aov', 'trend', { id: '3' }),
    ]
    const plan = planMeasurements(cards, TODAY)
    // current total, previous total, current daily series, previous daily series
    expect(plan.requests).toHaveLength(4)
    const total = plan.requests.find(r => r.key === rangeKey({ start: '2026-10-14', end: TODAY }, 'total'))
    expect(total?.request).toEqual({ metrics: ['aov', 'orders', 'revenue'], start: '2026-10-14', end: TODAY, grain: 'total' })
    const prevDaily = plan.requests.find(r => r.key === rangeKey({ start: '2026-09-14', end: '2026-10-13' }, 'day'))
    expect(prevDaily?.request.metrics).toEqual(['aov', 'orders', 'revenue'])
  })

  it('compares every card with the period before, whatever comparison it saved', () => {
    const plan = planMeasurements([
      createCard('revenue', 'number', { id: '1', comparison: 'previous' }),
      createCard('revenue', 'number', { id: '2', comparison: 'year' }),
      createCard('orders', 'number', { id: '3', comparison: 'none' }),
    ], TODAY)
    // one board, one period, one comparison: the current total and series, and the period before's
    expect(plan.requests.map(r => r.request.grain).sort()).toEqual(['day', 'day', 'total', 'total'])
    expect(plan.byCard['1'].total).toBe(plan.byCard['3'].total)
    expect(plan.byCard['3'].comparisonTotal).toBe(plan.byCard['2'].comparisonTotal)
  })

  it('reads weekly bars at week grain from the Monday before the window', () => {
    const plan = planMeasurements([createCard('orders', 'weekly', { id: 'w' })], TODAY)
    const weeks = plan.requests.find(r => r.request.grain === 'week')
    expect(weeks?.request).toMatchObject({ start: '2026-10-12', end: TODAY })
  })

  it('follows the dashboard to 60 days and to a custom range, compared with the days just before', () => {
    const cards = [createCard('revenue', 'trend', { id: 'f' })]
    const sixty = planMeasurements(cards, TODAY, () => null, '60d').byCard.f.window
    expect(sixty).toMatchObject({ id: '60d', short: '60D', current: { start: '2026-09-14', end: TODAY } })
    const range = { start: '2026-10-01', end: '2026-10-10' }
    const custom = planMeasurements(cards, TODAY, () => null, 'custom', range).byCard.f.window
    expect(custom).toMatchObject({ id: 'custom', short: 'Custom', label: '1 Oct – 10 Oct', current: range })
    expect(custom.comparison).toEqual({ start: '2026-09-21', end: '2026-09-30' })
    // A custom range isn't pulled back: past the last day of data it reads as no data, like a calendar window.
    const cut = planMeasurements(cards, TODAY, () => '2026-10-05', 'custom', range).byCard.f.window
    expect(cut).toMatchObject({ current: range, measured: { start: '2026-10-01', end: '2026-10-05' }, note: 'Data until 5 Oct' })
    expect(cut.measuredComparison).toEqual({ start: '2026-09-21', end: '2026-09-25' })
  })

  it('plans cards that follow the dashboard at its period', () => {
    const cards = [createCard('revenue', 'number', { id: 'f' }), createCard('orders', 'number', { id: 'p', window: '7d' })]
    const plan = planMeasurements(cards, TODAY, () => null, '90d')
    expect(plan.byCard.f.window.current).toEqual({ start: '2026-08-15', end: TODAY })
    expect(plan.byCard.p.window.current).toEqual({ start: '2026-08-15', end: TODAY }) // its own 7 days is ignored
  })

  it('is stable: the same board plans the same requests in the same order', () => {
    const cards = [createCard('b', 'trend', { id: '1' }), createCard('a', 'number', { id: '2', window: '7d' })]
    expect(planMeasurements(cards, TODAY).requests).toEqual(planMeasurements([...cards].reverse(), TODAY).requests)
  })
})

function measurement(grain: Measurement['grain'], periods: Array<[string, Record<string, number | null>]>, unavailable: Record<string, string> = {}): Measurement {
  return {
    grain, start: periods[0]?.[0] ?? TODAY, end: TODAY, timezone: 'America/New_York',
    periods: periods.map(([start, values]) => ({ start, values })), unavailable,
  }
}

describe('reading a card from batched results', () => {
  it('waits for the total, then fills every day of the series', () => {
    const card = createCard('revenue', 'trend', { id: 't' })
    const plan = planMeasurements([card], TODAY, () => null, '7d')
    const needs = plan.byCard.t
    expect(readCard(card, needs, {})).toBeNull()
    const data = readCard(card, needs, {
      [needs.total!]: measurement('total', [['2026-11-06', { revenue: 700 }]]),
      [needs.comparisonTotal!]: measurement('total', [['2026-10-30', { revenue: 500 }]]),
      [needs.series!]: measurement('day', [['2026-11-06', { revenue: 100 }], ['2026-11-08', { revenue: null }]]),
    })
    expect(data).toMatchObject({ value: 700, previous: 500, unavailable: null })
    expect(data?.series).toHaveLength(7)
    expect(data?.series?.[0]).toEqual({ date: '2026-11-06', value: 100 })
    expect(data?.series?.[1]).toEqual({ date: '2026-11-07', value: null })
    expect(data?.comparisonSeries).toBeNull() // not arrived yet
  })

  it('carries the reason a store can’t measure a metric', () => {
    const card = createCard('ctr', 'number', { id: 'n', comparison: 'none' })
    const needs = planMeasurements([card], TODAY).byCard.n
    const data = readCard(card, needs, { [needs.total!]: measurement('total', [['2026-10-14', {}]], { ctr: 'no connection fills ads' }) })
    expect(data).toMatchObject({ value: null, previous: null, unavailable: 'no connection fills ads' })
  })

  it('marks the unfinished week', () => {
    const card = createCard('orders', 'weekly', { id: 'w' })
    const needs = planMeasurements([card], TODAY).byCard.w
    const data = readCard(card, needs, {
      [needs.total!]: measurement('total', [['2026-10-14', { orders: 40 }]]),
      [needs.weeks!]: measurement('week', [['2026-10-12', { orders: 10 }], ['2026-11-09', { orders: 3 }]]),
    })
    expect(data?.weeks).toEqual([
      { start: '2026-10-12', value: 10, partial: false },
      { start: '2026-11-09', value: 3, partial: true },
    ])
  })

  it('gives no change against zero or missing data', () => {
    expect(changeOf(110, 100)).toBeCloseTo(10)
    expect(changeOf(110, 0)).toBeNull()
    expect(changeOf(null, 100)).toBeNull()
  })
})

describe('metric presentation', () => {
  it('reads returns on spend as multiples and keeps catalog units otherwise', () => {
    expect(valueFormatOf({ name: 'platform_roas', unit: 'ratio' })).toBe('multiple')
    expect(valueFormatOf({ name: 'refund_rate', unit: 'ratio' })).toBe('ratio')
    expect(valueFormatOf({ name: 'revenue', unit: 'money' })).toBe('money')
  })

  it('finds a blended metric’s sources through its formula, so it’s cut with them', () => {
    const catalog = new Map<string, { category: string; value?: unknown }>([
      ['revenue', { category: 'store' }],
      ['ad_spend', { category: 'ads' }],
      ['mer', { category: 'blended', value: { op: 'ratio', numerator: 'revenue', denominator: 'ad_spend' } }],
      ['mystery', { category: 'blended' }],
      ['my_share', { category: 'custom' }],
    ]) as Parameters<typeof sourceCategories>[1]
    const synced = new Set(['store', 'ads'])
    expect(sourceCategories('revenue', catalog, synced)).toEqual(['store'])
    expect(sourceCategories('mer', catalog, synced)).toEqual(['store', 'ads'])
    expect(sourceCategories('mystery', catalog, synced)).toEqual([])
    expect(sourceCategories('my_share', catalog, synced, name => (name === 'my_share' ? { op: 'ratio', numerator: 'ad_spend', denominator: 'revenue' } : null)))
      .toEqual(['ads', 'store'])
    expect(sourceCategories('nope', catalog, synced)).toEqual([])
  })

  it('names the connected apps a card reads, one per app', () => {
    expect(sourcesFor(['store'], ['shopify_app', 'metaads'])).toEqual([{ slug: 'shopify_app', name: 'Shopify' }])
    expect(sourcesFor(['ads'], ['shopify_app', 'metaads'])).toEqual([{ slug: 'metaads', name: 'Meta Ads' }])
    expect(sourcesFor(['store', 'ads'], ['shopify', 'shopify_app', 'metaads'])).toEqual([
      { slug: 'shopify', name: 'Shopify' }, { slug: 'metaads', name: 'Meta Ads' },
    ])
    expect(sourcesFor(['reviews'], ['shopify_app'])).toEqual([])
  })

  it('colours a change by which way is good', () => {
    expect(polarityOf('refund_rate')).toBe('lower')
    expect(polarityOf('revenue')).toBe('higher')
    expect(polarityOf('ad_spend')).toBe('neutral')
    expect(toneOfChange(5, 'higher')).toBe('good')
    expect(toneOfChange(5, 'lower')).toBe('bad')
    expect(toneOfChange(-5, 'lower')).toBe('good')
    expect(toneOfChange(5, 'neutral')).toBe('flat')
    expect(toneOfChange(null, 'higher')).toBe('flat')
  })
})

describe('starter boards (one tab per use case)', () => {
  const catalog = ['revenue', 'orders', 'aov', 'new_customers', 'revenue_per_customer', 'refund_rate', 'ad_spend', 'platform_roas', 'platform_cpa', 'ctr', 'open_rate']
    .map(name => ({ name }))
  const workspace = { categories: [
    { category: 'ads', status: 'ready', lastSyncedAt: null },
    { category: 'store', status: 'failed', lastSyncedAt: null },
    { category: 'email_sms', status: 'not_applicable', lastSyncedAt: null },
  ] }

  it('offers Store overview, Growth and Ads when their sources are connected', () => {
    expect(connectedSources(workspace)).toEqual(['ads', 'store'])
    const tabs = starterBoards(catalog, workspace)
    expect(tabs.map(b => b.name)).toEqual(['Store overview', 'Growth', 'Ads', 'Contribution margin'])
    expect(tabs[0].cards.map(c => `${c.metric}:${c.kind}:${c.size}`)).toEqual([
      'revenue:number:3x1', 'orders:number:3x1', 'aov:number:3x1', 'new_customers:number:3x1', 'revenue:number:6x2', 'orders:weekly:6x2',
    ])
    expect(tabs[2].cards.map(c => c.metric)).toEqual(['ad_spend', 'platform_roas', 'platform_cpa', 'ctr', 'ad_spend', 'platform_roas'])
    const ids = tabs.flatMap(b => b.cards.map(c => c.id))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('leaves out a tab whose source isn’t connected, and skips metrics the catalog doesn’t have', () => {
    const tabs = starterBoards([{ name: 'revenue' }], { categories: [] })
    expect(tabs.map(b => b.name)).toEqual(['Store overview'])
    expect(tabs[0].cards.map(c => c.id)).toEqual(['starter-revenue-number-3x1', 'starter-revenue-number-6x2'])
    expect(starterBoard([{ name: 'revenue' }], { categories: [] }).id).toBe('starter')
  })

  it('fills each row with metrics the store can measure, never "Not measured" ones', () => {
    const wide = [...catalog, { name: 'net_sales' }, { name: 'gross_sales' }, { name: 'discount_rate' }]
    const unavailable = { new_customers: 'no connection fills customers', revenue_per_customer: 'no connection fills customers' }
    const [overview, growth] = starterBoards(wide, workspace, unavailable)
    expect(overview.cards.map(c => `${c.metric}:${c.size}`)).toEqual([
      'revenue:3x1', 'orders:3x1', 'aov:3x1', 'net_sales:3x1', 'revenue:6x2', 'orders:6x2',
    ])
    expect(growth.cards.map(c => `${c.metric}:${c.size}`)).toEqual([
      'net_sales:3x1', 'discount_rate:3x1', 'refund_rate:3x1', 'aov:3x1', 'net_sales:6x2', 'aov:6x2',
    ])
    expect(growth.cards.some(c => c.metric in unavailable)).toBe(false)
    expect(STARTER_METRICS).toContain('net_sales')
  })

  it('swaps a saved starter’s unmeasurable cards in place, keeping sizes and the person’s own cards', () => {
    const wide = [...catalog, { name: 'net_sales' }]
    const unavailable = { new_customers: 'no connection fills customers' }
    const saved: Board = { id: 'starter', name: 'Store overview', cards: [
      createCard('revenue', 'number', { id: 'starter-revenue-number-3x1', size: '3x1' }),
      createCard('new_customers', 'number', { id: 'starter-new_customers-number-3x1', size: '6x1' }),
      createCard('new_customers', 'number', { id: 'card-mine' }),
    ] }
    const repaired = repairStarter(saved, wide, unavailable)
    expect(repaired.cards.map(c => `${c.id}:${c.metric}:${c.size}`)).toEqual([
      'starter-revenue-number-3x1:revenue:3x1',
      'starter-orders-number-6x1:orders:6x1',
      'card-mine:new_customers:3x1',
    ])
    expect(repairStarter(repaired, wide, unavailable)).toBe(repaired)
    expect(repairStarter({ ...saved, id: 'board-1' }, wide, unavailable).cards).toBe(saved.cards)
  })

  it('lays out the contribution margin ladder, keeping costs the store can’t measure yet, with nothing made up', () => {
    const cmCatalog = ['net_revenue', 'discounts', 'refunds', 'shipping_cost', 'processing_fees', 'return_label_cost', 'ad_spend', 'mer', 'revenue']
      .map(name => ({ name }))
    const board = contributionMarginBoard(cmCatalog)
    expect(board?.name).toBe('Contribution margin')
    expect(board?.cards.map(c => `${c.metric}:${c.size}`)).toEqual([
      'net_revenue:6x1', 'discounts:3x1', 'refunds:3x1',
      'shipping_cost:6x1', 'processing_fees:3x1', 'return_label_cost:3x1',
      'ad_spend:6x1', 'mer:6x1',
    ])
    // Unmeasurable costs stay on this board (they read "No data"); the other starters would swap them out.
    const unavailable = { processing_fees: 'no connection fills fees', return_label_cost: 'no connection fills labels' }
    expect(starterBoards(cmCatalog, { categories: [] }, unavailable).at(-1)?.cards).toHaveLength(8)
    expect(repairStarter(board!, cmCatalog, unavailable)).toBe(board)
    expect(starterFor(CM_BOARD_ID, cmCatalog)?.cards).toHaveLength(8)
    expect(contributionMarginBoard([{ name: 'cogs' }])).toBeNull()
  })

  it('rebuilds a starter for "Start over", and only a starter', () => {
    expect(starterFor('starter-ads', catalog)?.cards[0].metric).toBe('ad_spend')
    expect(starterFor('board-1234', catalog)).toBeNull()
  })

  it('adds a new starter tab to boards saved before it, but never brings back a deleted one', () => {
    const starters = starterBoards(catalog, workspace)
    const fresh = withStarters(null, starters)
    expect(fresh.boards.map(b => b.id)).toEqual(['starter', 'starter-growth', 'starter-ads', CM_BOARD_ID])
    expect(fresh.activeId).toBe('starter')

    const old: BoardsDoc = { version: 1, activeId: 'starter', boards: [board('revenue')].map(b => ({ ...b, id: 'starter' })) }
    const grown = withStarters(old, starters)
    expect(grown.boards.map(b => b.id)).toEqual(['starter', 'starter-growth', 'starter-ads', CM_BOARD_ID])
    expect(grown.boards[0]).toBe(old.boards[0])
    expect(grown.seeds).toEqual(['starter', 'starter-growth', 'starter-ads', CM_BOARD_ID])

    const deleted: BoardsDoc = { ...grown, boards: grown.boards.filter(b => b.id !== 'starter-growth' && b.id !== CM_BOARD_ID) }
    expect(withStarters(deleted, starters).boards.map(b => b.id)).toEqual(['starter', 'starter-ads'])
  })
})

class MemoryStorage implements StorageLike {
  items = new Map<string, string>()
  getItem(key: string) { return this.items.get(key) ?? null }
  setItem(key: string, value: string) { this.items.set(key, value) }
}

describe('board store', () => {
  const doc: BoardsDoc = { version: 1, activeId: 'b', boards: [board('revenue', 'orders')] }

  it('saves and loads per workspace', async () => {
    const storage = new MemoryStorage()
    const store = browserBoardStore(() => storage)
    expect(store.where).toBe('device')
    expect(await store.load('ws-1')).toBeNull()
    expect(await store.save('ws-1', doc)).toBe(true)
    expect(storage.items.has(storageKey('ws-1'))).toBe(true)
    expect(await store.load('ws-1')).toEqual(doc)
    expect(await store.load('ws-2')).toBeNull()
  })

  it('never throws: blocked or full storage reads as nothing saved', async () => {
    const blocked = browserBoardStore(() => { throw new Error('SecurityError') })
    expect(await blocked.load('ws')).toBeNull()
    expect(await blocked.save('ws', doc)).toBe(false)
    const full = browserBoardStore(() => ({ getItem: () => '{not json', setItem: () => { throw new Error('QuotaExceeded') } }))
    expect(await full.load('ws')).toBeNull()
    expect(await full.save('ws', doc)).toBe(false)
    expect(await browserBoardStore(() => null).save('ws', doc)).toBe(false)
  })

  it('reads sizes saved before the six-size grid as the sizes they looked like', () => {
    const parsed = parseBoardsDoc({ version: 1, activeId: 'b', boards: [{ id: 'b', name: 'Old', cards: [
      { id: 's', metric: 'revenue', kind: 'number', size: 'S', window: '30d', comparison: 'previous' },
      { id: 'm', metric: 'revenue', kind: 'trend', size: 'M', window: '30d', comparison: 'previous' },
      { id: 'l', metric: 'revenue', kind: 'trend', size: 'L', window: '30d', comparison: 'previous' },
    ] }] })
    expect(parsed?.boards[0].cards.map(c => c.size)).toEqual(['3x1', '6x2', '12x2'])
  })

  it('gives a repeated card id a new one, so React keys stay unique', () => {
    const parsed = parseBoardsDoc({ version: 1, activeId: 'b', boards: [{ id: 'b', name: 'Old', cards: [
      { id: 'starter-revenue-number', metric: 'revenue', kind: 'number', size: '3x1', window: 'period', comparison: 'previous' },
      { id: 'starter-revenue-number', metric: 'revenue', kind: 'number', size: '6x2', window: 'period', comparison: 'previous' },
    ] }] })
    expect(parsed?.boards[0].cards.map(c => c.id)).toEqual(['starter-revenue-number', 'starter-revenue-number-2'])
  })

  it('keeps the starter tabs already offered', () => {
    const parsed = parseBoardsDoc({ version: 1, activeId: 'b', seeds: ['starter', 'starter-ads'], boards: [{ id: 'b', name: 'Mine', cards: [] }] })
    expect(parsed?.seeds).toEqual(['starter', 'starter-ads'])
  })

  it('repairs what it can from an older or damaged save', () => {
    const parsed = parseBoardsDoc({
      version: 1, activeId: 'gone',
      boards: [{ id: 'b', name: 'Mine', cards: [
        { id: 'x', metric: 'revenue', kind: 'sparkle', size: 'XL', window: '1y', comparison: 'previous' },
        { id: '', metric: 'orders' },
        'junk',
      ] }],
    })
    expect(parsed?.activeId).toBe('b')
    expect(parsed?.boards[0].cards).toEqual([
      { id: 'x', metric: 'revenue', kind: 'number', size: '3x1', window: 'period', comparison: 'previous' },
    ])
    expect(parseBoardsDoc({ version: 2, boards: [] })).toBeNull()
    expect(parseBoardsDoc(null)).toBeNull()
  })
})

describe('diagnose board', () => {
  const catalog = new Map([
    ['revenue', { name: 'revenue', category: 'store' }],
    ['orders', { name: 'orders', category: 'store' }],
    ['aov', { name: 'aov', category: 'store' }],
    ['new_customers', { name: 'new_customers', category: 'store' }],
    ['discounts', { name: 'discounts', category: 'store' }],
    ['ad_spend', { name: 'ad_spend', category: 'ads' }],
    ['mer', { name: 'mer', category: 'custom' }],
  ])

  it('lists what a built-in metric is made of, only what this store can measure', () => {
    expect(inputsFor('revenue', { catalog, sources: new Set(['store']) })).toEqual(['orders', 'aov', 'new_customers', 'discounts'])
    expect(inputsFor('aov', { catalog, sources: new Set(['store']) })).toEqual(['revenue', 'orders', 'discounts'])
    expect(inputsFor('mer', { catalog, sources: new Set(['store']) })).toEqual(['revenue', 'orders', 'aov'])
    expect(inputsFor('unknown_metric', { catalog, sources: new Set(['store']) })).toEqual([])
  })

  it('keeps spares, and swaps out what the store can’t measure', () => {
    const candidates = inputsFor('revenue', { catalog, sources: new Set(['store']), max: 8 })
    expect(candidates).toEqual(['orders', 'aov', 'new_customers', 'discounts'])
    const wider = ['orders', 'aov', 'new_customers', 'discounts', 'refunds']
    expect(pickAvailable(wider, undefined)).toEqual(['orders', 'aov', 'new_customers', 'discounts'])
    expect(pickAvailable(wider, { new_customers: 'no connection fills customers' })).toEqual(['orders', 'aov', 'discounts', 'refunds'])
  })

  it('folds the spares into the totals request the cards already make', () => {
    const cards = diagnoseBoard('revenue', ['orders', 'aov'], 'Revenue').cards
    const plan = planMeasurements(cards, TODAY)
    const key = plan.byCard['diagnose-revenue'].total!
    const extended = withExtraMetrics(plan, key, ['revenue', 'orders', 'aov', 'refunds'])
    expect(extended.requests.find(r => r.key === key)?.request.metrics).toEqual(['aov', 'orders', 'refunds', 'revenue'])
    expect(extended.requests).toHaveLength(plan.requests.length)
    expect(extended.byCard).toBe(plan.byCard)
  })

  it('takes a custom metric’s own formula first', () => {
    expect(inputsFor('mer', { catalog, sources: new Set(['store', 'ads']), formulaInputs: ['revenue', 'ad_spend'] }))
      .toEqual(['revenue', 'ad_spend', 'orders', 'aov'])
  })

  it('leads with the trend, sizes inputs to fill rows, and follows the dashboard period', () => {
    const four = diagnoseBoard('revenue', ['orders', 'aov', 'new_customers', 'discounts'], 'Revenue')
    expect(four.cards.map(c => `${c.metric}:${c.kind}:${c.size}`)).toEqual([
      'revenue:trend:12x2', 'orders:number:3x2', 'aov:number:3x2', 'new_customers:number:3x2', 'discounts:number:3x2',
    ])
    expect(four.cards.every(c => c.window === 'period' && c.comparison === 'previous')).toBe(true)
    expect(diagnoseBoard('aov', ['revenue', 'orders'], 'AOV').cards.map(c => c.size)).toEqual(['12x2', '6x2', '6x2'])
    // Three can't fill a row of small cards: the two most telling, as medium cards.
    expect(diagnoseBoard('aov', ['revenue', 'orders', 'discounts'], 'AOV').cards.map(c => `${c.metric}:${c.size}`))
      .toEqual(['aov:12x2', 'revenue:6x2', 'orders:6x2'])
  })
})
