'use client'

import React, { useEffect, useRef, useState } from 'react'
import { CopyOneIcon, TickTwoIcon } from '@strange-huge/icons'
import { IconButton } from '@/components/ui/button'
import { Skeleton } from '@/components/Skeleton'
import { Tooltip } from '@/components/Tooltip'

// Self-contained copy-to-clipboard icon button — owns its own "copied" flash
// state so table rows don't need per-row state tracking in the parent.
export function CopyUrlButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    try { void navigator.clipboard?.writeText(url) } catch { /* ignore */ }
    setCopied(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Tooltip content={copied ? 'Copied!' : 'Copy link URL'} side="top">
      <IconButton
        aria-label={copied ? 'Link copied' : 'Copy link URL'}
        size="xs"
        variant="ghost"
        onClick={handleCopy}
        icon={copied ? <TickTwoIcon size={14} /> : <CopyOneIcon size={14} />}
      />
    </Tooltip>
  )
}

// ── /org/plans visual system — mirrored here so the Super Links tab reads as
// one system with the rest of the org settings shell (SectionCard/StatTile,
// same shadow constants, non-uppercase section titles) instead of the
// generic StatCard/var(--shadow-surface-card) chrome used elsewhere. ────────

export const SHADOW_CARD = '0px 2px 2.8px 0px rgba(82,75,71,0.12)'                                    // bordered section card
export const SHADOW_TILE = '0px 2px 2.8px 0px rgba(82,75,71,0.12), 0px 0px 0px 1px var(--neutral-100)' // white inner tile

/** White stat tile — label / value / sub. Ditto /org/plans' StatTile. */
export function StatTile({
  label,
  value,
  sub,
  loading = false,
}: {
  label:  string
  value?: string | number
  sub?:   string
  /** Renders skeleton placeholders instead of `value`/`sub` — the real
   *  numbers default to 0 while the underlying fetch is in flight, which
   *  reads as "confirmed empty" rather than "still loading" if shown as-is. */
  loading?: boolean
}) {
  return (
    <div style={{
      background:    'var(--card-bg)',
      borderRadius:  'var(--radius-md)',
      padding:       'var(--space-3)',
      boxShadow:     SHADOW_TILE,
      display:       'flex',
      flexDirection: 'column',
      gap:           'var(--space-1-5)',
      flex:          '1 1 200px',
      minWidth:      160,
    }}>
      <p style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-medium)', fontSize: 'var(--font-size-body)', lineHeight: 'var(--line-height-body)', color: 'var(--neutral-900)', margin: 0 }}>
        {label}
      </p>
      {loading ? (
        <Skeleton width={72} height={24} radius={5} />
      ) : value !== undefined && (
        <p style={{ fontFamily: 'var(--font-title)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-heading)', lineHeight: 'var(--line-height-heading)', color: 'var(--neutral-900)', margin: 0 }}>
          {value}
        </p>
      )}
      {loading ? (
        <Skeleton width={96} height={14} radius={4} />
      ) : sub && (
        <p style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-body)', lineHeight: 'var(--line-height-body)', color: 'var(--neutral-500)', margin: 0 }}>
          {sub}
        </p>
      )}
    </div>
  )
}

/** Bordered section card with a header row (title / subtitle / action). Ditto /org/plans' SectionCard. */
export function SectionCard({
  title,
  subtitle,
  action,
  children,
  bodyPadding = '12px 24px',
  bodyGap,
}: {
  title:        string
  subtitle?:    string
  action?:      React.ReactNode
  children:     React.ReactNode
  bodyPadding?: string
  bodyGap?:     number
}) {
  return (
    <div style={{
      border:        '1px solid var(--border-default)',
      borderRadius:  'var(--radius-2xl)',
      boxShadow:     SHADOW_CARD,
      backgroundColor: 'var(--card-bg)',
      display:       'flex',
      flexDirection: 'column',
      gap:           'var(--space-3)',
      paddingTop:    'var(--space-3)',
      paddingBottom: 'var(--space-3)',
      overflow:      'hidden',
      width:         '100%',
    }}>
      {/* Header padding-top is 12 (not 0) specifically to offset the outer
          card's own paddingTop:12 above — so the total gap from the card's
          top edge to the title (12+12=24) matches the gap from the title's
          bottom edge to the divider (24), making the title/action row
          actually centered in the header's visual space, not just centered
          relative to whichever sibling (e.g. the Tabs) happens to be taller. */}
      <div style={{
        borderBottom: '1px solid var(--neutral-100)',
        padding:      'var(--space-3) var(--space-6) var(--space-6)',
        display:      'flex',
        alignItems:   'center',
        gap:          'var(--space-3)',
      }}>
        <div style={{ flex: '1 0 0', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-1-5)' }}>
          <p style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-medium)', fontSize: 'var(--font-size-body-lg)', lineHeight: 'var(--line-height-body)', color: 'var(--neutral-900)', margin: 0 }}>
            {title}
          </p>
          {subtitle && (
            <p style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-body)', lineHeight: 'var(--line-height-body)', color: 'var(--neutral-500)', margin: 0 }}>
              {subtitle}
            </p>
          )}
        </div>
        {action}
      </div>
      <div style={{ padding: bodyPadding, display: 'flex', flexDirection: 'column', gap: bodyGap }}>
        {children}
      </div>
    </div>
  )
}

