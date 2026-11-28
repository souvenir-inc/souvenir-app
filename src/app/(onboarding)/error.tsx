'use client'

import { RouteError } from '@/components/RouteError'

// A crash on this page (a plan picker, checkout) stays on a page with Try again, not the bare global error.
export default function GroupError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  return <RouteError error={error} onRetry={unstable_retry} />
}
