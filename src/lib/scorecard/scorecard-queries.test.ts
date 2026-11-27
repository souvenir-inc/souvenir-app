import { MutationObserver, QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/client'
import type { Scorecard, ScorecardRequest, Warehouse } from '@/lib/api/warehouse'
import { queryKeys } from '@/lib/query-keys'
import { saveTargetOptions, type SaveTargetVars } from './scorecard-queries'
import type { ScorecardRow } from './status'

const ORG = 'org-1'
const row = (metric: string, target = 100): ScorecardRow => ({ metric, target, direction: 'up', tolerance: 0.1, owner: null, note: '' })
const card = (rows: ScorecardRow[], id = 'targets-id'): Scorecard => ({ id, name: 'Targets', rows, createdBy: 'auth0|maker', updatedAt: '2026-11-20T10:00:00Z' })

/** The warehouse at the network boundary: what GET answers, and what PUT does. */
function setup(server: Scorecard[], put: (id: string, request: ScorecardRequest) => Promise<Scorecard>) {
  const warehouse = { id: 'wh-1', scorecards: vi.fn(async () => server), putScorecard: vi.fn(put) } as unknown as Warehouse
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const key = queryKeys.warehouse.scorecards(ORG, 'wh-1')
  const observer = new MutationObserver(qc, saveTargetOptions(qc, ORG, warehouse, () => new Date('2026-11-27T09:00:00Z')))
  return { warehouse, qc, key, run: (vars: SaveTargetVars) => observer.mutate(vars) }
}

describe('saveTargetOptions', () => {
  it('shows a new target at once, then puts the server copy in', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => { release = resolve })
    const { qc, key, run, warehouse } = setup([card([row('aov')])], async (id, request) => { await gate; return { ...card(request.rows, id), updatedAt: 'later' } })
    qc.setQueryData(key, [card([row('aov')])])

    const done = run({ metric: 'revenue', row: row('revenue', 55_000), newId: 'unused' })
    await vi.waitFor(() => expect(qc.getQueryData<Scorecard[]>(key)?.[0].rows).toEqual([row('aov'), row('revenue', 55_000)]))
    release()
    await done

    expect(warehouse.putScorecard).toHaveBeenCalledWith('targets-id', { name: 'Targets', rows: [row('aov'), row('revenue', 55_000)] })
    expect(qc.getQueryData<Scorecard[]>(key)?.[0].updatedAt).toBe('later')
  })

  it('plans the PUT from a fresh read, so a row someone else added is kept', async () => {
    const { qc, key, run, warehouse } = setup([card([row('aov'), row('orders')])], async (id, request) => card(request.rows, id))
    qc.setQueryData(key, [card([row('aov')])])
    await run({ metric: 'revenue', row: row('revenue'), newId: 'unused' })
    expect(warehouse.putScorecard).toHaveBeenCalledWith('targets-id', { name: 'Targets', rows: [row('aov'), row('orders'), row('revenue')] })
  })

  it('rolls back only the touched scorecard when the server returns 500', async () => {
    const other: Scorecard = { ...card([row('orders')], 'weekly-id'), name: 'Weekly' }
    const before = [other, card([row('aov', 7)])]
    const { qc, key, run } = setup(before, async () => { throw new ApiError(500, 'server', 'Server error') })
    qc.setQueryData(key, before)
    await expect(run({ metric: 'aov', row: row('aov', 9), newId: 'unused' })).rejects.toBeInstanceOf(ApiError)
    expect(qc.getQueryData(key)).toEqual(before)
  })

  it('removes a stand-in Targets scorecard it created when the save fails', async () => {
    const { qc, key, run } = setup([], async () => { throw new ApiError(503, 'unavailable', 'Unavailable') })
    qc.setQueryData(key, [])
    await expect(run({ metric: 'revenue', row: row('revenue'), newId: 'new-id' })).rejects.toBeInstanceOf(ApiError)
    expect(qc.getQueryData(key)).toEqual([])
  })

  it('creates Targets under the chosen id on the first save', async () => {
    const { qc, key, run, warehouse } = setup([], async (id, request) => card(request.rows, id))
    qc.setQueryData(key, [])
    await run({ metric: 'revenue', row: row('revenue'), newId: 'new-id' })
    expect(warehouse.putScorecard).toHaveBeenCalledWith('new-id', { name: 'Targets', rows: [row('revenue')] })
    expect(qc.getQueryData<Scorecard[]>(key)).toEqual([card([row('revenue')], 'new-id')])
  })

  it('waits for the server before removing a target (a delete of shared data)', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => { release = resolve })
    const { qc, key, run, warehouse } = setup([card([row('revenue'), row('aov')])], async (id, request) => { await gate; return card(request.rows, id) })
    qc.setQueryData(key, [card([row('revenue'), row('aov')])])

    const done = run({ metric: 'revenue', row: null, newId: 'unused' })
    await vi.waitFor(() => expect(warehouse.putScorecard).toHaveBeenCalled())
    expect(qc.getQueryData<Scorecard[]>(key)?.[0].rows).toEqual([row('revenue'), row('aov')])
    release()
    await done
    expect(qc.getQueryData<Scorecard[]>(key)?.[0].rows).toEqual([row('aov')])
  })

  it('does nothing on the server when removing a target that is already gone', async () => {
    const { run, warehouse } = setup([card([row('aov')])], async (id, request) => card(request.rows, id))
    await expect(run({ metric: 'revenue', row: null, newId: 'unused' })).resolves.toBeNull()
    expect(warehouse.putScorecard).not.toHaveBeenCalled()
  })
})
