'use client'

import React from 'react'
import Image from 'next/image'
import { Slot } from '@radix-ui/react-slot'
import { Badge } from '@/components/Badge'
import type { BadgeColor } from '@/components/Badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ── Shadows ───────────────────────────────────────────────────────────────────

const SHADOW_CARD   = 'var(--shadow-tile)'
const SHADOW_AVATAR = 'var(--version-card-shadow-avatar)'

const EMPTY_VERSION_CHANGES: VersionCardChange[] = []

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * "default" = the currently-active version (white bg, "Current" button, Blue badges).
 * "restore" = a past version (neutral-50 + dashed border, "Restore" button, Neutral badges).
 */
export type VersionCardVariant = 'default' | 'restore'

export interface VersionCardChange {
  label: string
}

export interface VersionCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: VersionCardVariant
  /** URL for the persona avatar image. Falls back to a neutral placeholder. */
  avatarUrl?: string
  /** Alt text for the avatar. Defaults to `"${personaName} avatar"`. */
  avatarAlt?: string
  /** Persona name — displayed at body-lg size. */
  personaName?: string
  /** Timestamp string — e.g. "May 12 · 2:34 PM". Shown in code font, right-aligned. */
  timestamp?: string
  /** Version slug — e.g. "@legal-advisor·v002". Shown in code font below the name. */
  versionSlug?: string
  /** Change labels shown as Badge chips under the "Changes" heading. */
  changes?: readonly VersionCardChange[]
  /** Fires when "Restore" is clicked. Only relevant for `variant="restore"`. */
  onRestore?: () => void
  /** Disables all interaction. */
  disabled?: boolean
  asChild?: boolean
}

// ── Component ─────────────────────────────────────────────────────────────────

export function VersionCard({
      ref,
      variant      = 'default',
      avatarUrl,
      avatarAlt,
      personaName  = '',
      timestamp    = '',
      versionSlug  = '',
      changes      = EMPTY_VERSION_CHANGES,
      onRestore,
      disabled     = false,
      asChild      = false,
      className,
      style,
      ...props
    }: VersionCardProps & { ref?: React.Ref<HTMLDivElement> }) {
    const Comp      = (asChild ? Slot : 'div') as React.ElementType
    const isCurrent = variant === 'default'
    const badgeColor: BadgeColor = isCurrent ? 'Blue' : 'Neutral'
    const resolvedAlt = avatarAlt ?? (personaName ? `${personaName} avatar` : 'Agent avatar')

    return (
      <Comp
        ref={ref}
        aria-current={isCurrent ? 'true' : undefined}
        className={cn(className)}
        style={{
          display:         'flex',
          flexDirection:   'column',
          gap:             'var(--space-2)',
          padding:         'var(--space-3)',
          borderRadius:    'var(--radius-2xl)',
          width:           '100%',
          boxSizing:       'border-box' as const,
          backgroundColor: isCurrent ? 'var(--neutral-white)' : 'var(--neutral-50)',
          boxShadow:       SHADOW_CARD,
          ...(isCurrent ? {} : { border: '1px dashed var(--neutral-300)' }),
          opacity:         disabled ? 0.5 : 1,
          pointerEvents:   disabled ? 'none' : undefined,
          ...style,
        }}
        {...props}
      >

        {/* ── Header: avatar + text ──────────────────────────────────────────── */}
        <div
          style={{
            display:    'flex',
            gap:        'var(--space-3)',
            alignItems: 'flex-start',
            width:      '100%',
          }}
        >
          {/* Persona avatar */}
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt={resolvedAlt}
              width={37}
              height={37}
              unoptimized
              style={{
                borderRadius: 'var(--radius-md)',
                objectFit:    'cover',
                flexShrink:   0,
                boxShadow:    SHADOW_AVATAR,
                display:      'block',
              }}
            />
          ) : (
            <div
              aria-hidden
              style={{
                width:           37,
                height:          37,
                borderRadius:    'var(--radius-md)',
                flexShrink:      0,
                backgroundColor: 'var(--neutral-100)',
                boxShadow:       SHADOW_AVATAR,
              }}
            />
          )}

          {/* Text column */}
          <div
            style={{
              display:       'flex',
              flexDirection: 'column',
              flex:          '1 0 0',
              gap:           'var(--space-2)',
              alignItems:    'flex-start',
              minWidth:      0,
            }}
          >
            {/* Name (left) + timestamp (right) */}
            <div
              style={{
                display:        'flex',
                alignItems:     'flex-start',
                justifyContent: 'space-between',
                width:          '100%',
                gap:            'var(--space-2)',
              }}
            >
              <span
                style={{
                  fontFamily:   'var(--font-body)',
                  fontSize:     'var(--font-size-body-lg)',
                  fontWeight:   'var(--font-weight-regular)',
                  lineHeight:   'var(--line-height-body-lg)',
                  color:        'var(--neutral-900)',
                  overflow:     'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace:   'nowrap',
                  flex:         '1 1 0',
                  minWidth:     0,
                }}
              >
                {personaName}
              </span>
              {timestamp && (
                <span
                  style={{
                    fontFamily: 'var(--font-code)',
                    fontSize:   'var(--font-size-code)',
                    fontWeight: 'var(--font-weight-regular)',
                    lineHeight: 'var(--line-height-code)',
                    color:      'var(--neutral-500)',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  {timestamp}
                </span>
              )}
            </div>

            {/* Version slug */}
            {versionSlug && (
              <span
                style={{
                  fontFamily:   'var(--font-code)',
                  fontSize:     'var(--font-size-code)',
                  fontWeight:   'var(--font-weight-regular)',
                  lineHeight:   'var(--line-height-code)',
                  color:        'var(--neutral-500)',
                  whiteSpace:   'nowrap',
                  overflow:     'hidden',
                  textOverflow: 'ellipsis',
                  width:        '100%',
                }}
              >
                {versionSlug}
              </span>
            )}
          </div>
        </div>

        {/* ── Footer: changes (column) + CTA aligned to badge row bottom ────── */}
        <div
          style={{
            display:    'flex',
            alignItems: 'flex-end',
            gap:        'var(--space-2)',
            width:      '100%',
          }}
        >
          {/* Changes: "Changes" label above, badges below with right-edge fade.
              flex: 1 1 0 constrains it so the button never gets pushed out. */}
          <div
            style={{
              display:       'flex',
              flexDirection: 'column',
              flex:          '1 1 0',
              minWidth:      0,
              gap:           'var(--space-1-5)',
              alignItems:    'flex-start',
            }}
          >
            {changes.length > 0 && (
              <>
                <span
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize:   'var(--font-size-caption)',
                    fontWeight: 'var(--font-weight-regular)',
                    lineHeight: 'var(--line-height-caption)',
                    color:      'var(--neutral-400)',
                  }}
                >
                  Changes
                </span>
                {/* Badge row — 2px padding lets the 1px shadow ring breathe before the
                    overflow boundary; mask fades trailing badges without hard-clipping */}
                <div
                  style={{
                    width:              '100%',
                    padding:            'var(--space-0-5)',
                    boxSizing:          'border-box' as const,
                    overflow:           'hidden',
                    WebkitMaskImage:    'linear-gradient(to right, black calc(100% - 40px), transparent 100%)',
                    maskImage:          'linear-gradient(to right, black calc(100% - 40px), transparent 100%)',
                  }}
                >
                  <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                    {changes.map((change) => (
                      <Badge key={change.label} label={change.label} color={badgeColor} />
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* CTA — wrapped in div so layout props don't clobber Button's internal bgStyle */}
          {isCurrent ? (
            <div style={{ flexShrink: 0 }}>
              <Button variant="default" size="sm" tabIndex={-1}>Current</Button>
            </div>
          ) : (
            <div style={{ flexShrink: 0 }}>
              <Button
                variant="outline"
                size="sm"
                onClick={onRestore}
                aria-label={`Restore version ${versionSlug || personaName}`}
              >
                Restore
              </Button>
            </div>
          )}
        </div>

      </Comp>
    )
}

VersionCard.displayName = 'VersionCard'
export default VersionCard
