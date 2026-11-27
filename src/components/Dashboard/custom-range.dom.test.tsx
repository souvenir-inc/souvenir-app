// @vitest-environment jsdom
//
// The custom range's months are one date grid (A11Y-KB-03, keyboard.md): rows of gridcells, one day
// a Tab stop, arrows a day or a week, Home / End the week's ends, Page Up / Down a month, and the
// focus moves with the keys, across into the other month and back a month when needed.

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RangeCalendar, nextDay } from './CustomRange'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day)
const iso = (x: Date | null) => x && `${x.getFullYear()}-${x.getMonth() + 1}-${x.getDate()}`

describe('nextDay', () => {
  const min = d(2024, 11, 1)
  const max = d(2025, 11, 14)
  const at = d(2025, 11, 12) // a Wednesday
  it('arrows move a day or a week', () => {
    expect(iso(nextDay(at, { key: 'ArrowLeft' }, min, max))).toBe('2025-11-11')
    expect(iso(nextDay(at, { key: 'ArrowRight' }, min, max))).toBe('2025-11-13')
    expect(iso(nextDay(at, { key: 'ArrowUp' }, min, max))).toBe('2025-11-5')
  })
  it('Home and End go to Monday and Sunday', () => {
    expect(iso(nextDay(at, { key: 'Home' }, min, max))).toBe('2025-11-10')
    expect(iso(nextDay(at, { key: 'End' }, min, max))).toBe('2025-11-14') // Sunday is past today: stops at today
  })
  it('Page Up / Down move a month, Shift a year, kept inside the month and the range', () => {
    expect(iso(nextDay(d(2025, 3, 31), { key: 'PageUp' }, min, max))).toBe('2025-2-28')
    expect(iso(nextDay(at, { key: 'PageDown' }, min, max))).toBe('2025-11-14')
    expect(iso(nextDay(at, { key: 'PageUp', shiftKey: true }, min, max))).toBe('2024-11-12')
    expect(iso(nextDay(d(2024, 11, 3), { key: 'ArrowUp' }, min, max))).toBe('2024-11-1')
  })
  it('other keys do nothing', () => {
    expect(nextDay(at, { key: 'a' }, min, max)).toBeNull()
  })
})

describe('RangeCalendar', () => {
  let container: HTMLDivElement
  let root: Root
  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })
  afterEach(() => { act(() => root.unmount()); container.remove() })

  const render = (onApply = vi.fn()) => {
    act(() => root.render(<RangeCalendar today={d(2025, 11, 14)} initialFrom={null} initialTo={null} compare="previous" onCancel={vi.fn()} onApply={onApply} />))
    return onApply
  }
  const tabStops = () => [...container.querySelectorAll<HTMLElement>('[data-day]')].filter((b) => b.tabIndex === 0)
  const press = (key: string, shiftKey = false) => act(() => {
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true }))
  })

  it('is two grids of rows and gridcells, with one day as the Tab stop', () => {
    render()
    const grids = container.querySelectorAll('[role="grid"]')
    expect(grids).toHaveLength(2)
    expect(grids[1].getAttribute('aria-labelledby')).toBeTruthy()
    expect(grids[1].querySelectorAll('[role="row"]').length).toBeGreaterThan(4)
    expect(grids[1].querySelectorAll('[role="columnheader"]')).toHaveLength(7)
    expect(tabStops().map((b) => b.dataset.dayIso)).toEqual(['2025-11-14'])
  })

  it('arrows move the focus and the Tab stop with it, across into the left month', () => {
    render()
    act(() => tabStops()[0].focus())
    press('ArrowLeft')
    expect(document.activeElement?.getAttribute('data-day-iso')).toBe('2025-11-13')
    press('ArrowUp'); press('ArrowUp')
    expect(document.activeElement?.getAttribute('data-day-iso')).toBe('2025-10-30')
    expect(tabStops().map((b) => b.dataset.dayIso)).toEqual(['2025-10-30'])
  })

  it('Page Up past the left month brings the earlier months on screen', () => {
    render()
    act(() => tabStops()[0].focus())
    press('PageUp'); press('PageUp')
    expect(document.activeElement?.getAttribute('data-day-iso')).toBe('2025-09-14')
    expect([...container.querySelectorAll('[data-month]')].map((m) => m.getAttribute('data-month'))).toEqual(['9', '10'])
  })

  it('days after today can’t be focused or picked', () => {
    render()
    const future = container.querySelector<HTMLButtonElement>('[data-day-iso="2025-11-20"]')!
    expect(future.disabled).toBe(true)
  })

  it('Enter picks the first day, then the last, and Apply sends the range', () => {
    const onApply = render()
    act(() => tabStops()[0].focus())
    press('ArrowLeft'); press('ArrowLeft')
    act(() => (document.activeElement as HTMLElement).click())
    press('ArrowRight')
    act(() => (document.activeElement as HTMLElement).click())
    expect(container.querySelector('[data-range-summary]')?.textContent).toMatch(/^12 Nov – 13 Nov · 2 days, compared with the 2 days before$/)
    act(() => container.querySelector<HTMLElement>('[data-range-apply]')!.click())
    expect(onApply).toHaveBeenCalledWith(d(2025, 11, 12), d(2025, 11, 13))
    const selected = [...container.querySelectorAll('[role="gridcell"][aria-selected="true"]')]
    expect(selected).toHaveLength(2)
  })
})
