'use client'

import type { ReactNode } from 'react'
import type { Warehouse } from '@/lib/api/warehouse'
import { useWarehouses } from '@/components/Dashboard/live/dashboard-data'
import { LoadFailed, LoadingRows, NoStore } from './MetricStates'

/**
 * The workspace's warehouse (the first, as the dashboard shows), or the state that stands in for it: loading,
 * no access, no store yet, or a failure with Try again. Children only render with a warehouse in hand, so the
 * hooks below never run without one.
 */
export function WarehouseGate({ children, loading }: { children: (warehouse: Warehouse) => ReactNode; loading?: ReactNode }) {
  const warehouses = useWarehouses()
  if (warehouses.isError) return <LoadFailed error={warehouses.error} onRetry={() => { void warehouses.refetch() }} />
  if (warehouses.data === undefined) return loading ?? <LoadingRows />
  const warehouse = warehouses.data[0]
  if (!warehouse) return <NoStore />
  return children(warehouse)
}
