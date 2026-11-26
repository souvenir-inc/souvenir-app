import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/warehouse/queries', () => ({}))
vi.mock('@/components/MetricLibrary', () => ({ MetricCalculation: () => null }))
vi.mock('@/components/MetricLibrary/FormulaEditorDialog', () => ({ FormulaEditorDialog: () => null }))
vi.mock('@/components/charts', () => ({ alignComparison: () => [], TrendChart: () => null }))
vi.mock('@/components/ContextPanel/identity', () => ({ useConnectorIdentities: () => new Map() }))

const { appRows, changeTone, chartSpan, comparisonLabel, meets } = await import('./MetricModal')

describe('what the header compares with', () => {
  it('names the span before', () => {
    expect(comparisonLabel('today', { previousStart: '2026-11-11', previousEnd: '2026-11-11' })).toBe('yesterday')
    expect(comparisonLabel('7d', { previousStart: '2026-10-29', previousEnd: '2026-11-04' })).toBe('the 7 days before')
    expect(comparisonLabel('custom', { previousStart: '2026-11-04', previousEnd: '2026-11-04' })).toBe('the day before')
  })
})

describe('the chart span', () => {
  it('draws the last two weeks when the period is shorter than a week, so Today is never one dot', () => {
    expect(chartSpan({ start: '2026-11-12', end: '2026-11-12' })).toEqual({
      start: '2026-10-30', end: '2026-11-12', previousStart: '2026-10-16', previousEnd: '2026-10-29', widened: true,
    })
  })

  it('ends at the last day with data, so Today before its sync shows the two weeks up to it', () => {
    expect(chartSpan({ start: '2026-11-13', end: '2026-11-13' }, '2026-11-04')).toEqual({
      start: '2026-10-22', end: '2026-11-04', previousStart: '2026-10-08', previousEnd: '2026-10-21', widened: true,
    })
    // A week whose last days have no data yet is cut at the data, and widened back to two weeks of real days.
    expect(chartSpan({ start: '2026-11-01', end: '2026-11-07' }, '2026-11-04')).toMatchObject({ start: '2026-10-22', end: '2026-11-04', widened: true })
  })

  it('keeps a week or longer as it is', () => {
    expect(chartSpan({ start: '2026-11-06', end: '2026-11-12' })).toMatchObject({ start: '2026-11-06', previousEnd: '2026-11-05', previousStart: '2026-10-30', widened: false })
  })
})

describe('meeting a target', () => {
  it('reads the direction', () => {
    expect(meets(120, { kind: 'value', value: 100 }, 'higher')).toBe(true)
    expect(meets(120, { kind: 'value', value: 100 }, 'lower')).toBe(false)
    expect(meets(5, { kind: 'range', low: 4, high: 6 }, 'range')).toBe(true)
    expect(meets(7, { kind: 'range', low: 4, high: 6 }, 'range')).toBe(false)
  })
})

describe('the apps behind a number', () => {
  const store = { category: 'store', label: 'Store', state: 'ready', lastSyncedAt: '2026-11-04T19:30:00Z' }
  const ads = { category: 'ads', label: 'Ads', state: 'ready', lastSyncedAt: '2026-11-04T19:15:00Z' }

  it('names the connected app, one row per app', () => {
    expect(appRows([store], ['shopify', 'klaviyo'])).toEqual([
      { slug: 'shopify', name: 'Shopify', areas: ['Store'], lastSyncedAt: '2026-11-04T19:30:00Z', failed: false },
    ])
  })

  it('keeps the area’s name when no known app feeds it', () => {
    expect(appRows([ads], ['shopify'])).toEqual([{ slug: null, name: 'Ads', areas: ['Ads'], lastSyncedAt: '2026-11-04T19:15:00Z', failed: false }])
  })

  it('merges an app that feeds two areas, keeping the older sync and any failure', () => {
    const late = { ...ads, category: 'ads', label: 'Paid', lastSyncedAt: '2026-11-03T10:00:00Z', state: 'failed' }
    const rows = appRows([ads, late], ['meta_ads'])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ name: 'Meta Ads', areas: ['Ads', 'Paid'], lastSyncedAt: '2026-11-03T10:00:00Z', failed: true })
  })
})

describe('colouring a change', () => {
  it('green when it moves the good way, red the bad way, grey for a range or no change', () => {
    expect(changeTone(0.1, 'higher')).toBe('good')
    expect(changeTone(-0.214, 'lower')).toBe('good')
    expect(changeTone(0.05, 'lower')).toBe('bad')
    expect(changeTone(-0.05, 'higher')).toBe('bad')
    expect(changeTone(0.05, 'range')).toBe('neutral')
    expect(changeTone(null, 'higher')).toBe('neutral')
  })
})

