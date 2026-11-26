import { describe, expect, it } from 'vitest'
import type { Workspace } from '@/lib/api/warehouse'
import { dataUntil, earliestDate, formatStoreDate, formatSyncedAt, isPastData, overallState, rollingWindow, sourcesOf, storeDate } from './freshness'

const workspace = (categories: Workspace['categories']): Workspace => ({
  id: 'w1', name: 'Store', slug: 'store', timezone: 'America/New_York', connectors: ['shopify_app', 'metaads'], categories,
})

describe('sourcesOf', () => {
  it('keeps synced sources and drops categories with nothing behind them', () => {
    const sources = sourcesOf(workspace([
      { category: 'ads', status: 'ready', lastSyncedAt: '2026-11-12T09:45:00Z' },
      { category: 'ab_testing', status: 'failed', lastSyncedAt: null },
      { category: 'store', status: 'failed', lastSyncedAt: '2026-11-10T02:30:00Z' },
      { category: 'reviews', status: 'not_applicable', lastSyncedAt: null },
    ]))
    expect(sources.map(s => [s.label, s.state])).toEqual([['Ads', 'ready'], ['Store', 'failed']])
  })

  it('treats queued and building as syncing', () => {
    const sources = sourcesOf(workspace([
      { category: 'store', status: 'building', lastSyncedAt: null },
      { category: 'ads', status: 'queued', lastSyncedAt: null },
    ]))
    expect(sources.map(s => s.state)).toEqual(['syncing', 'syncing'])
    expect(overallState(sources)).toBe('syncing')
  })
})

describe('overallState', () => {
  it('lets a failure win', () => {
    expect(overallState([
      { category: 'store', label: 'Store', lastSyncedAt: null, state: 'failed' },
      { category: 'ads', label: 'Ads', lastSyncedAt: null, state: 'syncing' },
    ])).toBe('failed')
  })
})

describe('formatSyncedAt', () => {
  it('writes the time in the store timezone', () => {
    expect(formatSyncedAt('2026-11-10T02:30:00Z', 'America/New_York')).toBe('9 Nov, 9:30 pm')
  })
})

describe('data until', () => {
  const ws = workspace([
    { category: 'ads', status: 'ready', lastSyncedAt: '2026-11-12T09:45:00Z' },
    { category: 'store', status: 'failed', lastSyncedAt: '2026-11-10T02:30:00Z' },
    { category: 'ab_testing', status: 'failed', lastSyncedAt: null },
  ])

  it('is the day of the last sync in the store timezone', () => {
    expect(storeDate('2026-11-10T02:30:00Z', 'America/New_York')).toBe('2026-11-09')
    expect(dataUntil(ws, 'store')).toBe('2026-11-09')
    expect(dataUntil(ws, 'ads')).toBe('2026-11-12')
  })

  it('is null when a category never synced or is missing', () => {
    expect(dataUntil(ws, 'ab_testing')).toBeNull()
    expect(dataUntil(ws, 'reviews')).toBeNull()
  })

  it('takes the earliest source for a metric built from several', () => {
    expect(earliestDate([dataUntil(ws, 'store'), dataUntil(ws, 'ads'), null])).toBe('2026-11-09')
    expect(earliestDate([null, null])).toBeNull()
  })

  it('marks periods after the data as past it', () => {
    expect(isPastData('2026-11-10', '2026-11-09')).toBe(true)
    expect(isPastData('2026-11-09', '2026-11-09')).toBe(false)
    expect(isPastData('2026-11-10', null)).toBe(false)
  })

  it('formats the date for a "Data until" line', () => {
    expect(formatStoreDate('2026-11-09')).toBe('9 Nov')
  })
})

describe('rollingWindow', () => {
  it('ends today when the data is current', () => {
    expect(rollingWindow(30, '2026-11-12', '2026-11-12')).toEqual({
      start: '2026-10-14', end: '2026-11-12', previousStart: '2026-09-14', previousEnd: '2026-10-13', endsAtData: false,
    })
    expect(rollingWindow(7, '2026-11-12', null).end).toBe('2026-11-12')
  })

  it('pulls the window back to the last day with data and keeps it whole', () => {
    const w = rollingWindow(30, '2026-11-12', '2026-11-09')
    expect(w).toEqual({ start: '2026-10-11', end: '2026-11-09', previousStart: '2026-09-11', previousEnd: '2026-10-10', endsAtData: true })
  })

  it('handles month and year edges', () => {
    expect(rollingWindow(7, '2026-03-02', '2026-03-02').start).toBe('2026-02-24')
    expect(rollingWindow(90, '2026-01-05', '2026-01-05').start).toBe('2025-10-08')
  })
})
