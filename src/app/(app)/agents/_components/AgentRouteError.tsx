'use client'

import React, { useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { logger } from '@/lib/logger'
import { AGENTS_ROUTE } from '@/lib/routes'

/**
 * Fallback UI shared by the agent routes' `error.tsx` files. Keeps a render
 * crash inside the agents area from taking down the whole app shell.
 */
export function AgentRouteError({
  error,
  onRetry,
  title = 'Something went wrong',
}: {
  error: Error & { digest?: string }
  onRetry: () => void
  title?: string
}) {
  useEffect(() => {
    logger.error('[agents] route error', error.digest ?? '', error)
  }, [error])

  return (
    <div
      role="alert"
      style={{
        flex: '1 0 0', display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 'var(--space-3)', padding: 'var(--space-7)', textAlign: 'center', minHeight: 0,
      }}
    >
      <h2
        style={{
          margin: 0, fontFamily: 'var(--font-title)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-heading)',
          lineHeight: 'var(--line-height-heading)', color: 'var(--neutral-900)',
        }}
      >
        {title}
      </h2>
      <p style={{ margin: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--font-size-body)', lineHeight: 'var(--line-height-body)', color: 'var(--neutral-600)' }}>
        This page hit an unexpected error. Your saved agents are not affected.
      </p>
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
        <Button variant="default" onClick={onRetry}>Try again</Button>
        <Button variant="secondary" asChild>
          <Link href={AGENTS_ROUTE}>Back to agents</Link>
        </Button>
      </div>
    </div>
  )
}
