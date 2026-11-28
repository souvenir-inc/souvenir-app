import { beforeEach, describe, expect, it, vi } from 'vitest'

let org: { orgId: string | null; orgIdReady: boolean } = { orgId: null, orgIdReady: true }
let info: { data?: { warehouseEnabled: boolean }; isError: boolean } = { isError: false }

vi.mock('@/context/org-context', () => ({ useOrg: () => org }))
vi.mock('@tanstack/react-query', () => ({ useQuery: () => info }))
vi.mock('@/lib/org/org-queries', () => ({ orgInfoQuery: () => ({}) }))

const { useWarehouseAccess } = await import('./warehouse-access')

describe('useWarehouseAccess', () => {
  beforeEach(() => {
    org = { orgId: 'org-1', orgIdReady: true }
    info = { isError: false }
  })

  it('reads on and off from the org record', () => {
    info = { data: { warehouseEnabled: true }, isError: false }
    expect(useWarehouseAccess()).toBe('on')
    info = { data: { warehouseEnabled: false }, isError: false }
    expect(useWarehouseAccess()).toBe('off')
  })

  it('is loading until the org id and record are in', () => {
    org = { orgId: null, orgIdReady: false }
    expect(useWarehouseAccess()).toBe('loading')
    org = { orgId: 'org-1', orgIdReady: true }
    expect(useWarehouseAccess()).toBe('loading')
  })

  // A 502 from /organizations leaves no org id; that must not read as "not turned on".
  it('is unknown, not off, when the org id or record could not be read', () => {
    org = { orgId: null, orgIdReady: true }
    expect(useWarehouseAccess()).toBe('unknown')
    org = { orgId: 'org-1', orgIdReady: true }
    info = { isError: true }
    expect(useWarehouseAccess()).toBe('unknown')
  })
})
