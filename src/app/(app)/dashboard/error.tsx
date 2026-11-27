'use client'

import { RouteError } from '@/components/RouteError'
import { Frame } from '@/components/Dashboard/DashboardStates'

// A render error anywhere on the board lands here, inside the dashboard frame: the shared route
// fallback (logs through the logger, spots a lost session, Try again and Go home) (SD-EH-02).
export default function DashboardError({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return <Frame><RouteError error={error} onRetry={unstable_retry} /></Frame>
}
