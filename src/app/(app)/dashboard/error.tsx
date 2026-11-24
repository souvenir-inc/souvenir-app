'use client'

import { useEffect } from 'react'
import { Frame, Problem } from '@/components/Dashboard/DashboardStates'

const TEXT = 'Couldn’t show the dashboard.'

// A render error anywhere on the board lands here, inside the dashboard frame, with Try again.
export default function DashboardError({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  useEffect(() => { console.error('[dashboard] render error', error) }, [error])
  return <Frame><Problem text={TEXT} onRetry={unstable_retry} /></Frame>
}
