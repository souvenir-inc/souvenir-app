import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { EMPTY_BOOK, healthOf, targetOf, withTarget } from '@/lib/scorecard/targets'

const band = { healthy: { high: 0.1 }, redFlag: { above: 0.15 } }

vi.mock('@/lib/warehouse/queries', () => ({
  useWorkspace: () => ({ data: { id: 'ws-1', timezone: 'America/New_York' } }),
}))
vi.mock('@/lib/scorecard/hooks', () => ({
  useBenchmarkEdits: () => ({ edits: { discount_rate: { band, setAt: '2026-11-13T10:00:00Z' } }, setBand: async () => {} }),
  useTargets: () => ({
    book: EMPTY_BOOK, settings: EMPTY_BOOK.settings, isLoading: false, location: 'device', targetOf: () => null,
    setTarget: async () => EMPTY_BOOK, setDirection: async () => EMPTY_BOOK, setSettings: async () => EMPTY_BOOK, saveTarget: async () => EMPTY_BOOK,
  }),
}))

const { FlagPill, StatusPill, useMetricFlags } = await import('./Flag')

const clock = { date: '2026-11-12', secondsIntoDay: 12 * 3600 }
const week = { start: '2026-11-02', end: '2026-11-08' }

describe('FlagPill', () => {
  it('reads Red flag past the line, Above healthy outside the range, and nothing inside', () => {
    const red = renderToStaticMarkup(<FlagPill metric="discount_rate" unit="ratio" value={0.2} />)
    expect(red).toContain('Red flag')
    expect(red).toContain('data-status="red"')
    expect(red).toMatch(/title="Your healthy range: at most 10(\.0)?% · red flag above 15(\.0)?%"/)
    expect(renderToStaticMarkup(<FlagPill metric="discount_rate" unit="ratio" value={0.12} />)).toContain('Above healthy')
    expect(renderToStaticMarkup(<FlagPill metric="discount_rate" unit="ratio" value={0.05} />)).toBe('')
    expect(renderToStaticMarkup(<FlagPill metric="discount_rate" unit="ratio" value={null} />)).toBe('')
  })
})

describe('StatusPill: the target first, else the flag', () => {
  it('shows the target’s health when there is a target, even if the benchmark flags it', () => {
    const book = withTarget(EMPTY_BOOK, 'discount_rate', 'week', { kind: 'value', value: 0.25 }, new Date('2026-11-12T10:00:00Z'))
    const target = targetOf(book, 'discount_rate')
    const health = healthOf({ metric: 'discount_rate', unit: 'ratio', actual: 0.2, target: { ...target!, direction: 'lower' }, settings: book.settings, window: week, clock })
    const html = renderToStaticMarkup(<StatusPill health={health} metric="discount_rate" unit="ratio" value={0.2} />)
    expect(html).toContain('On track')
    expect(html).not.toContain('Red flag')
  })

  it('shows the flag when there is no target, and the Set a target button only when offered and nothing is flagged', () => {
    const none = healthOf({ metric: 'discount_rate', unit: 'ratio', actual: 0.2, target: null, settings: EMPTY_BOOK.settings, window: week, clock })
    expect(renderToStaticMarkup(<StatusPill health={none} metric="discount_rate" unit="ratio" value={0.2} />)).toContain('Red flag')
    expect(renderToStaticMarkup(<StatusPill health={none} metric="discount_rate" unit="ratio" value={0.05} />)).toBe('')
    expect(renderToStaticMarkup(<StatusPill health={none} metric="discount_rate" unit="ratio" value={0.05} onSetTarget={() => {}} />)).toContain('Set a target')
    expect(renderToStaticMarkup(<StatusPill health={null} metric="discount_rate" unit="ratio" value={0.2} />)).toContain('Red flag')
  })
})

describe('useMetricFlags', () => {
  it('flags by the benchmark when there is no target, and not without a value', () => {
    let flagFor: ReturnType<typeof useMetricFlags>['flagFor'] = () => null
    function Probe() { flagFor = useMetricFlags().flagFor; return null }
    renderToStaticMarkup(<Probe />)
    expect(flagFor('discount_rate', 'ratio', 0.2, week)).toBe('red')
    expect(flagFor('discount_rate', 'ratio', 0.12, week)).toBe('amber')
    expect(flagFor('discount_rate', 'ratio', 0.05, week)).toBeNull()
    expect(flagFor('discount_rate', 'ratio', null, week)).toBeNull()
  })
})

