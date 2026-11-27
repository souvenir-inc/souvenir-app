'use client'

import { useQuery } from '@tanstack/react-query'
import { useOrg } from '@/context/org-context'
import { orgInfoQuery } from '@/lib/org/org-queries'

/**
 * Whether the dashboard is available: the organization's warehouse is turned on (`warehouseEnabled`
 * on the org record). `loading` until the org record is in; `unknown` when it couldn't be read, which
 * doesn't hide the dashboard: the warehouse still decides, and its 403 shows the not-turned-on state.
 */
export type WarehouseAccess = 'loading' | 'on' | 'off' | 'unknown'

export function useWarehouseAccess(): WarehouseAccess {
  const { orgId, orgIdReady } = useOrg()
  const info = useQuery(orgInfoQuery(orgId))
  if (!orgIdReady) return 'loading'
  // No org id: either not in an organization or the membership lookup failed (a 502 from
  // /organizations reads the same). Don't call that "turned off": the warehouse decides, and its
  // 404 ("join an organization") or 403 (not turned on) picks the state (board/errors.ts).
  if (!orgId) return 'unknown'
  if (info.data) return info.data.warehouseEnabled ? 'on' : 'off'
  return info.isError ? 'unknown' : 'loading'
}
