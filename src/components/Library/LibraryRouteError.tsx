'use client'

import React, { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { captureError } from '@/lib/library/observability'
import { LinkButton } from './LinkButton'
import { LIBRARY_ROUTE } from '@/lib/routes'

/**
 * Fallback for a render crash inside a Library route. It never shows the error text (it could hold
 * a file name), only a reference id for support, and it reports through the Library reporter.
 */
export function LibraryRouteError({
  error,
  onRetry,
  boundary = 'library-route',
  showBackLink = true,
  title = 'Something went wrong',
}: {
  error: Error & { digest?: string }
  onRetry: () => void
  boundary?: string
  showBackLink?: boolean
  /** Names what failed, when the route knows ("Couldn't load Trash"). */
  title?: string
}) {
  useEffect(() => {
    captureError(error, { boundary })
  }, [error, boundary])

  return (
    <div
      role="alert"
      style={{ flex: '1 0 0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-3)', padding: 'var(--space-7)', textAlign: 'center', minHeight: 0 }}
    >
      <h2 style={{ margin: 0, fontFamily: 'var(--font-title)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-heading)', lineHeight: 'var(--line-height-heading)', color: 'var(--neutral-900)' }}>{title}</h2>
      <p style={{ margin: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--font-size-body)', lineHeight: 'var(--line-height-body)', color: 'var(--neutral-600)' }}>
        This page hit an unexpected error. Your files are not affected.
      </p>
      {error.digest && (
        <p style={{ margin: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--font-size-small)', lineHeight: 'var(--line-height-small)', color: 'var(--neutral-500)' }}>Reference: {error.digest}</p>
      )}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
        <Button variant="default" onClick={onRetry}>Try again</Button>
        {showBackLink && (
          <LinkButton href={LIBRARY_ROUTE}>Back to Library</LinkButton>
        )}
      </div>
    </div>
  )
}
