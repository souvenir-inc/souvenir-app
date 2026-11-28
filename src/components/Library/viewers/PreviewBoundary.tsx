'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import { captureError } from '@/lib/library/observability'

type Props = {
  /** The file id, for the report (never the name). Changing it resets the boundary. */
  fileId: string
  /** Offered when the viewer cannot show the file. */
  onDownload?: () => void
  children: React.ReactNode
}

type State = { failed: boolean; fileId: string }

/**
 * One viewer failing (a corrupt PDF, a chunk that did not load, a blocked URL) must not take the page
 * down. The fallback explains it in one line and offers Download, which always works.
 */
export class PreviewBoundary extends React.Component<Props, State> {
  state: State = { failed: false, fileId: this.props.fileId }

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true }
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    // A different file gets a fresh start.
    return props.fileId !== state.fileId ? { failed: false, fileId: props.fileId } : null
  }

  componentDidCatch(error: Error): void {
    captureError(error, { boundary: 'file-preview', fileId: this.props.fileId })
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div role="alert" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2-5)', padding: 'var(--space-9) var(--space-6)', textAlign: 'center' }}>
        <p style={{ margin: 0, fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-medium)', fontSize: 'var(--font-size-body-lg)', lineHeight: 'var(--line-height-heading-sm)', color: 'var(--neutral-900)' }}>This preview isn&apos;t available</p>
        <p style={{ margin: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--font-size-body)', lineHeight: 'var(--line-height-body)', color: 'var(--neutral-500)' }}>You can still download the file.</p>
        <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-1-5)' }}>
          <Button variant="secondary" onClick={() => this.setState({ failed: false })}>Try again</Button>
          {this.props.onDownload && <Button onClick={this.props.onDownload}>Download</Button>}
        </div>
      </div>
    )
  }
}
