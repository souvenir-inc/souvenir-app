// The period menu's calendar as dates: months, typed days, keyboard moves and how each day reads (states board
// 456:61003). Today is 16 Nov 2026.

import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { dayLook, fieldText, monthTitle, monthWeeks, moveFocus, parseTyped, shiftMonth, shownMonths, type CalendarMarks } from './calendar'
import { PeriodFilter } from './PeriodFilter'

const TODAY = '2026-11-16'
const marks = (patch: Partial<CalendarMarks>): CalendarMarks => ({
  today: TODAY, picked: null, pickingFrom: null, pointer: null, preview: null, dataFrom: null, ...patch,
})

describe('months', () => {
  it('lays a month out Monday first', () => {
    const november = monthWeeks('2026-11')
    expect(november[0]).toEqual([null, null, null, null, null, null, '2026-11-01'])
    expect(november.at(-1)).toEqual(['2026-11-30', null, null, null, null, null, null])
    expect(monthTitle('2026-11')).toBe('November 2026')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
  })

  it('shows two months ending on the picked days, never after this month', () => {
    expect(shownMonths('2026-11-16', TODAY, 2)).toEqual(['2026-10', '2026-11'])
    expect(shownMonths('2026-10-07', TODAY, 2)).toEqual(['2026-09', '2026-10'])
    expect(shownMonths('2026-10-07', TODAY, 1)).toEqual(['2026-10'])
  })
})

describe('typing a day', () => {
  it('reads the usual ways of writing a date', () => {
    expect(parseTyped('18 Oct 2026', TODAY)).toBe('2026-10-18')
    expect(parseTyped('18 october', TODAY)).toBe('2026-10-18')
    expect(parseTyped('Oct 18, 2026', TODAY)).toBe('2026-10-18')
    expect(parseTyped('18/10/2026', TODAY)).toBe('2026-10-18')
    expect(parseTyped('2026-10-18', TODAY)).toBe('2026-10-18')
  })

  it('takes the latest such day up to today when there’s no year', () => {
    expect(parseTyped('20 Dec', TODAY)).toBe('2025-12-20')
    expect(parseTyped('20 Nov 2026', TODAY)).toBe('2026-11-20')
  })

  it('refuses what isn’t a date', () => {
    expect(parseTyped('31 Feb 2026', TODAY)).toBeNull()
    expect(parseTyped('yesterday', TODAY)).toBeNull()
    expect(parseTyped('', TODAY)).toBeNull()
  })

  it('writes days for the fields', () => {
    expect(fieldText('2026-10-18')).toBe('18 Oct 2026')
  })
})

describe('keys', () => {
  it('moves a day, a week, a month, or to the week’s ends', () => {
    expect(moveFocus('2026-11-16', 'ArrowLeft')).toBe('2026-11-15')
    expect(moveFocus('2026-11-16', 'ArrowUp')).toBe('2026-11-09')
    expect(moveFocus('2026-10-31', 'PageDown')).toBe('2026-11-30')
    expect(moveFocus('2026-03-31', 'PageUp')).toBe('2026-02-28')
    expect(moveFocus('2026-11-18', 'Home')).toBe('2026-11-16')
    expect(moveFocus('2026-11-18', 'End')).toBe('2026-11-22')
    expect(moveFocus('2026-11-18', 'a')).toBeNull()
  })
})

describe('how a day reads', () => {
  const range = { start: '2026-11-10', end: '2026-11-16' }

  it('shows picked days as solid ends with a band between', () => {
    expect(dayLook('2026-11-10', marks({ picked: range }))).toMatchObject({ end: true, band: false })
    expect(dayLook('2026-11-12', marks({ picked: range }))).toMatchObject({ end: false, band: true })
  })

  it('previews a preset with a ringed first day, the picked days still solid inside', () => {
    const preview = { start: '2026-10-18', end: '2026-11-16' }
    expect(dayLook('2026-10-18', marks({ picked: range, preview }))).toMatchObject({ preview: true, previewStart: true })
    expect(dayLook('2026-11-10', marks({ picked: range, preview }))).toMatchObject({ preview: true, end: true, previewStart: false })
  })

  it('rings the pointer while picking the last day, with no band yet', () => {
    const picking = marks({ pickingFrom: '2026-10-10', pointer: '2026-10-13' })
    expect(dayLook('2026-10-10', picking)).toMatchObject({ end: true })
    expect(dayLook('2026-10-13', picking)).toMatchObject({ pickingTo: true, band: false })
  })

  it('marks today, days after it, and days before the data', () => {
    expect(dayLook(TODAY, marks({}))).toMatchObject({ today: true, future: false })
    expect(dayLook('2026-11-17', marks({}))).toMatchObject({ future: true })
    const data = marks({ dataFrom: '2026-10-05' })
    expect(dayLook('2026-10-04', data)).toMatchObject({ beforeData: true, firstData: false })
    expect(dayLook('2026-10-05', data)).toMatchObject({ beforeData: false, firstData: true })
  })
})

describe('the two buttons', () => {
  it('captions each and starts on Today, compared with yesterday', () => {
    const html = renderToStaticMarkup(createElement(PeriodFilter, { today: TODAY, until: null, dataFrom: null, withComparison: true }))
    expect(html).toContain('aria-label="Period: Today"')
    expect(html).toContain('aria-label="Comparison: Yesterday"')
    expect(html).toContain('>Period<')
  })

  it('shows the period alone on pages that don’t compare', () => {
    const html = renderToStaticMarkup(createElement(PeriodFilter, { today: TODAY, until: null, dataFrom: null, withComparison: false }))
    expect(html).not.toContain('Comparison')
  })
})
