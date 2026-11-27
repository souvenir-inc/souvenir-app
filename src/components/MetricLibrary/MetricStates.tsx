'use client'

import { BarChart3, Lock, RotateCw, Store } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/Skeleton'
import { TextLink } from '@/components/ui/link'
import { isNotFound, isPermissionDenied, isRetryable, metricErrorMessage, type MetricAction } from '@/lib/metrics/errors'
import { ORG_CONNECTORS_ROUTE } from '@/lib/routes'

// The states every metric screen shares (CORE-E-11, API-Q-15): loading rows, a load failure with Try again only
// when trying again can help (API-ER-10), no access (403: the warehouse isn't turned on), and no store yet.

export function LoadingRows({ rows = 8, label = 'Loading metrics' }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-2 py-2">
      {Array.from({ length: rows }, (_, index) => <Skeleton key={index} height="36px" radius="8px" />)}
    </div>
  )
}

export function NoAccess() {
  return (
    <EmptyState
      role="alert"
      icon={<Lock size={18} aria-hidden />}
      title="Metrics aren’t turned on for this workspace"
      description="Ask a workspace admin about access."
    />
  )
}

export function NoStore() {
  return (
    <EmptyState
      icon={<Store size={18} aria-hidden />}
      title="Connect your store to see its metrics"
      description="Metrics are worked out from your store’s data. The first sync takes a few minutes."
      action={<TextLink href={ORG_CONNECTORS_ROUTE} variant="standalone">Connect an app</TextLink>}
    />
  )
}

/** A failed load: no access, no store, or a problem with Try again when it can help. */
export function LoadFailed({ error, action = 'load', onRetry }: { error: unknown; action?: MetricAction; onRetry: () => void }) {
  if (isPermissionDenied(error)) return <NoAccess />
  if (action === 'load' && isNotFound(error)) return <NoStore />
  return (
    <EmptyState
      role="alert"
      icon={<BarChart3 size={18} aria-hidden />}
      title={metricErrorMessage(error, action)}
      action={isRetryable(error)
        ? <Button variant="secondary" size="sm" leftIcon={<RotateCw size={14} aria-hidden />} onClick={onRetry}>Try again</Button>
        : undefined}
    />
  )
}
