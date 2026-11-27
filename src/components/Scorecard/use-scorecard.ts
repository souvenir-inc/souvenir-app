'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useOrgIdentity } from '@/context/org-context'
import type { Warehouse } from '@/lib/api/warehouse'
import { orgScope } from '@/lib/query-keys'
import { saveTargetOptions, scorecardQueries } from '@/lib/scorecard/scorecard-queries'
import { findTarget } from '@/lib/scorecard/targets'

/** The workspace's scorecards (the same cache entry the dashboard's health reads). */
export function useScorecards(warehouse: Warehouse) {
  const { orgId } = useOrgIdentity()
  return useQuery(scorecardQueries.list(orgScope(orgId), warehouse))
}

/** One metric's target row and where it lives, or null when it has none. */
export function useTarget(warehouse: Warehouse, metric: string) {
  const query = useScorecards(warehouse)
  return { query, found: query.data ? findTarget(query.data, metric) : null }
}

/** Sets (row) or removes (null) a metric's target; callers show their own error (API-ER-16). */
export function useSaveTarget(warehouse: Warehouse) {
  const qc = useQueryClient()
  const { orgId } = useOrgIdentity()
  return useMutation(saveTargetOptions(qc, orgScope(orgId), warehouse))
}
