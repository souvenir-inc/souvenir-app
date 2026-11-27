// @vitest-environment jsdom
//
// The dashboard's states as the viewer meets them: not turned on, refused, failed (with Try again
// only when it can help) and no boards. Found by role and accessible name.

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/client'

let access: 'loading' | 'on' | 'off' | 'unknown' = 'on'
let warehouses: { data?: unknown; isError: boolean; error: unknown; refetch: () => void } = { isError: false, error: null, refetch: vi.fn() }
vi.mock('./warehouse-access', () => ({ useWarehouseAccess: () => access }))
vi.mock('../live/dashboard-data', () => ({ useWarehouses: () => warehouses, useCatalog: vi.fn(), useLiveDashboard: vi.fn(), useBoardStatus: vi.fn(), DashboardDataProvider: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('@/context/auth-context', () => ({ useAuth: () => ({ user: { auth0Id: 'auth0|me' }, isHydrated: true, refreshUser: vi.fn() }), userFullName: () => 'Me' }))
vi.mock('@/context/org-context', () => ({ useOrg: () => ({ orgId: 'org-1' }), useOrgMembers: () => ({ members: [], membersLoading: false }) }))
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }))

import { DashboardScreen } from '../DashboardScreen'
import { EmptyBoardList, LoadProblem } from '../DashboardStates'
import { LOAD_COPY } from './copy'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let container: HTMLElement
const render = (node: React.ReactNode) => act(() => root.render(node))

/** Elements with this role (explicit, or a button / link by tag) whose accessible name matches. */
function byRole(role: string, name?: string | RegExp): HTMLElement[] {
  const tags: Record<string, string> = { button: 'button', link: 'a[href]' }
  const found = [...container.querySelectorAll<HTMLElement>(`[role="${role}"]${tags[role] ? `, ${tags[role]}` : ''}`)]
  const nameOf = (el: HTMLElement) => (el.getAttribute('aria-label') ?? el.textContent ?? '').trim()
  return name === undefined ? found : found.filter((el) => (typeof name === 'string' ? nameOf(el) === name : name.test(nameOf(el))))
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  access = 'on'
  warehouses = { isError: false, error: null, refetch: vi.fn() }
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('DashboardScreen gates', () => {
  it('says the dashboard isn’t turned on when the organization’s warehouse is off, and reads nothing', async () => {
    access = 'off'
    await render(<DashboardScreen />)
    expect(byRole('status')[0]?.textContent).toContain(LOAD_COPY.notEnabled.title)
    expect(byRole('link', 'Go home')).toHaveLength(1)
    expect(byRole('button', 'Try again')).toHaveLength(0)
  })

  it('a 403 from the warehouse when the org record couldn’t be read is the not-turned-on state', async () => {
    access = 'unknown'
    warehouses = { isError: true, error: new ApiError(403, 'forbidden', 'Forbidden'), refetch: vi.fn() }
    await render(<DashboardScreen />)
    expect(byRole('status')[0]?.textContent).toContain(LOAD_COPY.notEnabled.title)
  })

  it('a 403 when the warehouse is on says the viewer has no access, without Try again', async () => {
    warehouses = { isError: true, error: new ApiError(403, 'forbidden', 'Forbidden'), refetch: vi.fn() }
    await render(<DashboardScreen />)
    expect(byRole('status')[0]?.textContent).toContain(LOAD_COPY.noAccess.title)
    expect(byRole('button', 'Try again')).toHaveLength(0)
  })

  it('a failure worth trying again offers Try again, which reads again', async () => {
    const refetch = vi.fn()
    warehouses = { isError: true, error: new ApiError(503, 'unavailable', 'Unavailable'), refetch }
    await render(<DashboardScreen />)
    expect(byRole('alert')[0]?.textContent).toContain(LOAD_COPY.dashboard)
    await act(() => byRole('button', 'Try again')[0].click())
    expect(refetch).toHaveBeenCalledTimes(1)
  })
})

describe('board state screens', () => {
  it('a failure trying again won’t fix offers a way home instead', async () => {
    await render(<LoadProblem failure={{ kind: 'failed', retryable: false }} text={LOAD_COPY.boards} onRetry={vi.fn()} />)
    expect(byRole('alert')[0]?.textContent).toContain(LOAD_COPY.boards)
    expect(byRole('button', 'Try again')).toHaveLength(0)
    expect(byRole('link', 'Go home')).toHaveLength(1)
  })

  it('no boards offers New board (SD-EH-07)', async () => {
    const onNewBoard = vi.fn()
    await render(<EmptyBoardList onNewBoard={onNewBoard} />)
    expect(container.textContent).toContain(LOAD_COPY.noBoards.title)
    await act(() => byRole('button', 'New board')[0].click())
    expect(onNewBoard).toHaveBeenCalledTimes(1)
  })
})
