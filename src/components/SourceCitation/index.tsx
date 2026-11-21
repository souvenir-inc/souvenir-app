'use client'

import React, { useState, useEffect } from 'react'
import { HoverCard, HoverCardContent, HoverCardPortal, HoverCardTrigger } from '@/components/ui/hover-card'
import { motion, AnimatePresence } from 'framer-motion'
import { springs } from '@/lib/springs'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SourceItem {
  /** Unique ID — used as React key */
  id:          string | number
  /** Page or document title */
  title:       string
  /** Full URL — omit if source has no public link */
  url?:        string
  /** ConnectorIcon id: 'notion' | 'gmail' | 'linear' | 'figma' | 'slack' | etc. */
  connector?:  string
  /** Verbatim passage the AI relied on to generate this sentence */
  quote?:      string
  /** Secondary metadata line: "Page 14", "Sent by Kai · 2 days ago", etc. */
  meta?:       string
}

export interface SourceCitationProps {
  /** 1-based citation number shown in the inline chip */
  index:   number
  /** Source this citation references */
  source:  SourceItem
  /** Called when the user clicks "Open" in the card */
  onOpen?: (source: SourceItem) => void
  className?: string
}

export interface SourceListProps {
  /** Ordered list of sources — index derived from position (1-based) */
  sources:  SourceItem[]
  className?: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function getDomain(url: string): string {
  try { return new URL(url).hostname.replace('www.', '') }
  catch { return url }
}

// ── ConnectorLogoBox ───────────────────────────────────────────────────────────
// 24×24 box: favicon from URL via Google S2, falls back to first-letter.

function ConnectorLogoBox({ connector: _connector, title, url }: { connector?: string; title: string; url?: string }) {
  const [imgError, setImgError] = useState(false)

  const domain = url ? getDomain(url) : null
  const faviconSrc = domain && !imgError
    ? `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
    : null

  const boxStyle: React.CSSProperties = {
    width:           24,
    height:          24,
    borderRadius:    'var(--radius-xs)',
    flexShrink:      0,
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    overflow:        'hidden',
    backgroundColor: 'var(--neutral-100)',
    border:          '1px solid var(--border-default)',
  }

  if (faviconSrc) {
    return (
      <div style={boxStyle}>
        <img
          src={faviconSrc}
          alt=""
          width={16}
          height={16}
          style={{ display: 'block', objectFit: 'contain' }}
          onError={() => setImgError(true)}
        />
      </div>
    )
  }

  return (
    <div style={boxStyle}>
      <span style={{
        fontFamily:    'var(--font-body)',
        fontSize:      'var(--font-size-caption)',
        lineHeight:    'var(--leading-none)',
        fontWeight:    'var(--font-weight-medium)' as React.CSSProperties['fontWeight'],
        color:         'var(--neutral-500)',
        textTransform: 'uppercase',
      }}>
        {title.charAt(0)}
      </span>
    </div>
  )
}

// ── Divider ────────────────────────────────────────────────────────────────────

function Divider() {
  return <div style={{ height: 1, backgroundColor: 'var(--neutral-200)', margin: '0 -14px' }} />
}

// ── SourceCardContent ──────────────────────────────────────────────────────────

interface SourceCardContentProps {
  index:   number
  source:  SourceItem
  onOpen?: (source: SourceItem) => void
}

function SourceCardContent({ index, source, onOpen }: SourceCardContentProps) {
  const { title, url, connector, quote, meta } = source
  const domain    = url ? getDomain(url) : null
  const subtitle  = meta || domain
  const hasQuote  = !!quote
  const hasOpen   = !!url

  return (
    <div
      style={{
        width:           '272px',
        borderRadius:    'var(--radius-xl)',
        backgroundColor: 'var(--neutral-50)',
        boxShadow:       'var(--shadow-popover)',
        padding:         'var(--space-3) var(--space-3)',
        display:         'flex',
        flexDirection:   'column',
        gap:             'var(--space-2-5)',
        isolation:       'isolate',
      }}
    >
      {/* ── Header: logo + title + subtitle ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2-5)' }}>
        <ConnectorLogoBox connector={connector} title={title} url={url} />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-0-5)', minWidth: 0 }}>
          <span
            style={{
              fontFamily:   'var(--font-body)',
              fontWeight:   'var(--font-weight-medium)',
              fontSize:     'var(--font-size-body)',
              lineHeight:   'var(--line-height-body)',
              color:        'var(--neutral-900)',
              overflow:     'hidden',
              textOverflow: 'ellipsis',
              whiteSpace:   'nowrap',
            }}
          >
            {title}
          </span>
          {subtitle && (
            <span
              style={{
                fontFamily:   'var(--font-body)',
                fontSize:     'var(--font-size-caption)',
                lineHeight:   'var(--line-height-caption)',
                color:        'var(--neutral-600)',
                overflow:     'hidden',
                textOverflow: 'ellipsis',
                whiteSpace:   'nowrap',
              }}
            >
              {subtitle}
            </span>
          )}
        </div>

        {/* Citation index — top-right */}
        <span
          aria-hidden
          style={{
            display:         'inline-flex',
            alignItems:      'center',
            justifyContent:  'center',
            width:           '16px',
            height:          '16px',
            borderRadius:    'var(--radius-full)',
            backgroundColor: 'var(--neutral-200)',
            flexShrink:      0,
            fontFamily:      'var(--font-body)',
            fontWeight:      'var(--font-weight-medium)',
            fontSize:        'var(--font-size-caption)',
            lineHeight:      'var(--leading-none)',
            color:           'var(--neutral-500)',
            marginTop:       'var(--space-0-5)',
          }}
        >
          {index}
        </span>
      </div>

      {/* ── Middle content: quote if available, otherwise URL path ── */}
      {(hasQuote || url) && (
        <>
          <Divider />
          {hasQuote ? (
            <p
              style={{
                margin:            0,
                fontFamily:        'var(--font-body)',
                fontSize:          'var(--font-size-caption)',
                lineHeight:        'var(--line-height-caption)',
                color:             'var(--neutral-600)',
                display:           '-webkit-box',
                WebkitLineClamp:   3,
                WebkitBoxOrient:   'vertical',
                overflow:          'hidden',
                fontStyle:         'italic',
                paddingLeft:       'var(--space-2-5)',
                borderLeft:        '2px solid var(--border-default)',
              }}
            >
              {quote}
            </p>
          ) : (
            <p
              style={{
                margin:       0,
                fontFamily:   'var(--font-body)',
                fontSize:     'var(--font-size-caption)',
                lineHeight:   'var(--line-height-caption)',
                color:        'var(--neutral-600)',
                overflow:     'hidden',
                textOverflow: 'ellipsis',
                whiteSpace:   'nowrap',
              }}
            >
              {url}
            </p>
          )}
        </>
      )}

      {/* ── Open footer ── */}
      {hasOpen && (
        <>
          <Divider />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={() => onOpen?.(source)}
              style={{
                background:  'none',
                border:      'none',
                padding:     '0',
                cursor:      'pointer',
                fontFamily:  'var(--font-body)',
                fontWeight:  'var(--font-weight-medium)',
                fontSize:    'var(--font-size-caption)',
                lineHeight:  'var(--line-height-caption)',
                color:       'var(--neutral-500)',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--neutral-900)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--neutral-500)')}
            >
              Open
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ── SourceCitation ─────────────────────────────────────────────────────────────

export const SourceCitation = React.forwardRef<HTMLButtonElement, SourceCitationProps>(
  function SourceCitation({ index, source, onOpen, className }, ref) {
    const [open,    setOpen]    = useState(false)
    const [mounted, setMounted] = useState(false)

    useEffect(() => { if (open) setMounted(true) }, [open])

    return (
      <HoverCard
        open={open}
        onOpenChange={setOpen}
        openDelay={250}
        closeDelay={120}
      >
        <HoverCardTrigger asChild>
          <button
            ref={ref}
            className={className}
            aria-label={`Source ${index}: ${source.title}`}
            style={{
              display:         'inline-flex',
              alignItems:      'center',
              justifyContent:  'center',
              verticalAlign:   'text-bottom',
              width:           '18px',
              height:          '18px',
              borderRadius:    'var(--radius-full)',
              backgroundColor: 'var(--neutral-200)',
              cursor:          'pointer',
              border:          'none',
              marginLeft:      'var(--space-0-5)',
              fontFamily:      'var(--font-body)',
              fontWeight:      'var(--font-weight-medium)',
              fontSize:        'var(--font-size-caption)',
              lineHeight:      'var(--leading-none)',
              color:           'var(--neutral-600)',
              flexShrink:      0,
              outline:         'none',
              transition:      'background-color var(--duration-instant) ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--neutral-300)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--neutral-200)')}
          >
            {index}
          </button>
        </HoverCardTrigger>

        {mounted && (
          <HoverCardPortal forceMount>
            <HoverCardContent
              side="top"
              sideOffset={6}
              align="start"
              forceMount
              className="z-9999"
              style={{ outline: 'none' }}
            >
              <AnimatePresence>
                {open && (
                  <motion.div
                    key="source-card"
                    initial={{ opacity: 0, y: 4, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0,  scale: 1    }}
                    exit={{    opacity: 0, y: 4,  scale: 0.97 }}
                    transition={springs.fast}
                    style={{ transformOrigin: 'bottom left' }}
                    onAnimationComplete={() => { if (!open) setMounted(false) }}
                  >
                    <SourceCardContent index={index} source={source} onOpen={onOpen} />
                  </motion.div>
                )}
              </AnimatePresence>
            </HoverCardContent>
          </HoverCardPortal>
        )}
      </HoverCard>
    )
  },
)

SourceCitation.displayName = 'SourceCitation'

// ── SourceCard ─────────────────────────────────────────────────────────────────
// Compact card used inside the horizontal SourceList row.
// Styled after the secondary Button variant — same bg, shadow, and hover overlay.

function SourceCard({ source }: { source: SourceItem; index: number }) {
  const [imgError, setImgError] = useState(false)
  const [hovered,  setHovered]  = useState(false)

  const domain     = source.url ? getDomain(source.url) : null
  const faviconSrc = domain && !imgError
    ? `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
    : null

  const cardStyle: React.CSSProperties = {
    display:         'flex',
    flexDirection:   'row',
    alignItems:      'center',
    gap:             'var(--space-2)',
    // secondary Button sm: py-[5px] px-[8px]
    padding:         'var(--space-1) var(--space-2)',
    borderRadius:    'var(--radius-md)',
    backgroundColor: 'var(--button-secondary-bg)',
    boxShadow:       hovered
      ? 'var(--shadow-button-secondary-outer-hover)'
      : 'var(--shadow-button-secondary-outer)',
    width:           '200px',
    flexShrink:      0,
    transition:      'box-shadow var(--duration-fast)',
    textDecoration:  'none',
    cursor:          source.url ? 'pointer' : 'default',
    position:        'relative',
    overflow:        'hidden',
  }

  const content = (
    <>
      {/* Hover bg overlay — mirrors secondary Button's inner hover div */}
      <div aria-hidden style={{
        position:        'absolute',
        inset:           0,
        borderRadius:    'inherit',
        backgroundColor: hovered ? 'var(--button-secondary-bg-hover)' : 'transparent',
        transition:      'background-color var(--duration-base)',
        pointerEvents:   'none',
      }} />

      {/* Inner shadow — secondary button 3D depth effect */}
      <div aria-hidden style={{
        position:      'absolute',
        inset:         0,
        borderRadius:  'inherit',
        boxShadow:     hovered
          ? 'var(--shadow-button-secondary-inner-hover)'
          : 'var(--shadow-button-secondary-inner)',
        transition:    'box-shadow var(--duration-fast)',
        pointerEvents: 'none',
      }} />

      {/* Favicon on left */}
      <div style={{
        width:           30,
        height:          30,
        borderRadius:    'var(--radius-sm)',
        backgroundColor: 'var(--neutral-100)',
        border:          '1px solid var(--border-default)',
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'center',
        overflow:        'hidden',
        flexShrink:      0,
        alignSelf:       'center',
        position:        'relative',
        zIndex:          1,
      }}>
        {faviconSrc ? (
          <img
            src={faviconSrc}
            alt=""
            width={20}
            height={20}
            style={{ display: 'block', objectFit: 'contain' }}
            onError={() => setImgError(true)}
          />
        ) : (
          <span style={{
            fontFamily:    'var(--font-body)',
            fontSize:      'var(--font-size-caption)',
            lineHeight:    'var(--leading-none)',
            color:         'var(--neutral-500)',
            textTransform: 'uppercase',
          }}>
            {source.title.charAt(0)}
          </span>
        )}
      </div>

      {/* Link data on right: title + domain */}
      <div style={{
        display:       'flex',
        flexDirection: 'column',
        gap:           'var(--space-0-5)',
        minWidth:      0,
        flex:          1,
        position:      'relative',
        zIndex:        1,
      }}>
        <span style={{
          fontFamily:   'var(--font-body)',
          fontWeight:   'var(--font-weight-medium)' as React.CSSProperties['fontWeight'],
          fontSize:     'var(--font-size-body)',
          lineHeight:   'var(--line-height-body)',
          color:        'var(--button-secondary-text)',
          overflow:     'hidden',
          textOverflow: 'ellipsis',
          whiteSpace:   'nowrap',
          display:      'block',
        }}>
          {source.title}
        </span>

        {domain && (
          <span style={{
            fontFamily:   'var(--font-body)',
            fontSize:     'var(--font-size-caption)',
            lineHeight:   'var(--line-height-caption)',
            color:        'var(--neutral-600)',
            overflow:     'hidden',
            textOverflow: 'ellipsis',
            whiteSpace:   'nowrap',
            display:      'block',
          }}>
            {domain}
          </span>
        )}
      </div>
    </>
  )

  if (source.url) {
    return (
      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        style={cardStyle}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {content}
      </a>
    )
  }

  return (
    <div
      style={cardStyle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {content}
    </div>
  )
}

// ── SourceList ─────────────────────────────────────────────────────────────────
// Horizontal scrollable row of source cards.

export const SourceList = React.forwardRef<HTMLDivElement, SourceListProps>(
  function SourceList({ sources, className }, ref) {
    if (sources.length === 0) return null

    return (
      <div
        ref={ref}
        className={className}
        style={{
          paddingTop: 'var(--space-2-5)',
          borderTop:  '1px solid var(--border-default)',
          marginTop:  'var(--space-3)',
        }}
      >
        <div
          className="kaya-scrollbar"
          role="list"
          aria-label="Sources"
          style={{
            display:       'flex',
            flexDirection: 'row',
            gap:           'var(--space-2)',
            overflowX:     'auto',
            padding:       'var(--space-0-5)',
            paddingBottom: 'var(--space-1)',
          }}
        >
          {sources.map((source, i) => (
            <div key={source.id} role="listitem" style={{ flexShrink: 0 }}>
              <SourceCard source={source} index={i + 1} />
            </div>
          ))}
        </div>
      </div>
    )
  },
)

SourceList.displayName = 'SourceList'
