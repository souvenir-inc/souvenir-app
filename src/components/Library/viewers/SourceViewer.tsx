'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Skeleton } from '@/components/Skeleton'
import Tabs from '@/components/Tabs'
import { CodeBlock } from '@/components/chat/CodeBlock'
import { MarkdownRenderer } from '@/lib/markdown-utils'
import type { LibraryFileDetail } from '@/lib/library/file'
import { useFileSource } from '@/lib/library/queries'
import { parseEmail } from '@/lib/library/viewers/eml'
import { RTF_STYLES, isRtfDocument, rtfToHtml } from '@/lib/library/viewers/rtf'
import { inertHtml } from '@/lib/library/viewers/inert-html'
import { formatHtml, formatXml } from '@/lib/library/viewers/xml-format'
import { sourceModeOf } from '@/lib/library/viewers/source-mode'

// Past this, code is shown as plain text (highlighting is the slow part).
const MAX_HIGHLIGHT_CHARS = 300_000

// File extension → highlight.js language, where they differ. Anything else is tried by its extension.
const LANGUAGE: Record<string, string> = {
  cjs: 'javascript', mjs: 'javascript', pyi: 'python', zsh: 'bash', env: 'bash', conf: 'ini', cfg: 'ini',
  jsonl: 'json', ndjson: 'json', hpp: 'cpp', cc: 'cpp', h: 'c', kt: 'kotlin', rs: 'rust', rb: 'ruby',
}

// The tallest a rendered page or email is shown before it scrolls inside its frame.
const MAX_FRAME_HEIGHT = 20_000

const muted: React.CSSProperties = { fontFamily: 'var(--font-body)', fontSize: 'var(--font-size-body-sm)', lineHeight: 'var(--line-height-body-sm)', color: 'var(--neutral-500)' }

// ── HTML (web pages and email bodies) ───────────────────────────────────────

/**
 * A document in a sandboxed frame that grows to its content, so the page scrolls as one. Scripts never
 * run (no allow-scripts); same-origin is granted only so the page can measure the frame's height.
 */
function HtmlFrame({ html, title }: { html: string; title: string }) {
  // The document the person chose to show images for: a different file (or email) starts hidden again.
  const [imagesShownFor, setImagesShownFor] = useState<string | null>(null)
  const showImages = imagesShownFor === html
  const setShowImages = (show: boolean) => setImagesShownFor(show ? html : null)
  const { srcDoc, blocked } = useMemo(() => inertHtml(html, showImages), [html, showImages])
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(240)
  const observer = useRef<ResizeObserver | null>(null)
  useEffect(() => () => observer.current?.disconnect(), [])

  const measure = () => {
    const doc = frameRef.current?.contentDocument
    if (!doc?.body) return
    // The body's own box (it contains its margins, see frameHead): the document's scroll height is
    // never less than the frame itself, so it could grow the frame but never shrink it.
    // Capped as a last guard: should a document still size itself from the frame, it stops there
    // (and scrolls inside) instead of growing forever.
    const fit = () => setHeight(Math.min(MAX_FRAME_HEIGHT, Math.max(80, Math.ceil(doc.body.getBoundingClientRect().height) + 2)))
    fit()
    observer.current?.disconnect()
    observer.current = new ResizeObserver(fit)
    observer.current.observe(doc.body)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', width: '100%' }}>
      {blocked > 0 && !showImages && (
        <p style={{ ...muted, margin: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {blocked === 1 ? '1 image from the web is hidden.' : `${blocked} images from the web are hidden.`}
          <button
            type="button"
            onClick={() => setShowImages(true)}
            style={{ ...muted, padding: 0, border: 'none', background: 'none', color: 'var(--neutral-900)', textDecoration: 'underline', cursor: 'pointer' }}
          >
            Show images
          </button>
        </p>
      )}
      <iframe
        ref={frameRef}
        title={title}
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        srcDoc={srcDoc}
        onLoad={measure}
        style={{ display: 'block', width: '100%', height, border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', background: 'var(--static-white)' }}
      />
    </div>
  )
}

// ── Text and code ───────────────────────────────────────────────────────────

function Plain({ text, mono }: { text: string; mono?: boolean }) {
  return (
    <pre
      style={{
        width: '100%', margin: 0, boxSizing: 'border-box', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', tabSize: 4,
        color: 'var(--neutral-900)',
        ...(mono
          ? { padding: 'var(--space-4) var(--space-5)', borderRadius: 'var(--radius-md)', background: 'var(--neutral-50)', border: '1px solid var(--border-default)', fontFamily: 'var(--font-mono, ui-monospace, monospace)', fontSize: 'var(--font-size-body-sm)', lineHeight: 'var(--line-height-body-sm)' }
          : { fontFamily: 'var(--font-body)', fontSize: 'var(--font-size-body)', lineHeight: 'var(--line-height-body)' }),
      }}
    >
      {text}
    </pre>
  )
}

function Code({ text, extension, id, wrap }: { text: string; extension: string; id: string; wrap: boolean }) {
  const value = useMemo(() => {
    // JSON and XML are laid out when they parse (XML only when it is not laid out already);
    // JSON Lines and anything else stay as written.
    if (extension === 'xml') return formatXml(text)
    if (extension === 'html') return formatHtml(text)
    if (extension !== 'json') return text
    try {
      return JSON.stringify(JSON.parse(text), null, 2)
    } catch {
      return text
    }
  }, [text, extension])
  if (value.length > MAX_HIGHLIGHT_CHARS) return <Plain text={value} mono />
  return (
    <div style={{ width: '100%', minWidth: 0 }}>
      <CodeBlock language={LANGUAGE[extension] ?? extension} value={value} elementKey={`library-source-${id}`} wrap={wrap} />
    </div>
  )
}

// ── Email ───────────────────────────────────────────────────────────────────

function Email({ raw, title }: { raw: string; title: string }) {
  const email = useMemo(() => parseEmail(raw), [raw])
  const rows = (['from', 'to', 'cc', 'date'] as const).filter((key) => email.headers[key])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', width: '100%' }}>
      <header style={{ paddingBottom: 'var(--space-4)', borderBottom: '1px solid var(--border-default)', fontFamily: 'var(--font-body)', fontSize: 'var(--font-size-body)', lineHeight: 'var(--line-height-body)', color: 'var(--neutral-900)' }}>
        <h2 style={{ margin: '0 0 var(--space-2-5)', fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-heading-sm)', lineHeight: 'var(--line-height-heading-sm)' }}>{email.headers.subject || '(no subject)'}</h2>
        <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: 'var(--space-0-5) var(--space-4)', margin: 0 }}>
          {rows.map((key) => (
            <React.Fragment key={key}>
              <dt style={{ color: 'var(--neutral-500)', textTransform: 'capitalize' }}>{key}</dt>
              <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{email.headers[key]}</dd>
            </React.Fragment>
          ))}
          {email.attachments.length > 0 && (
            <>
              <dt style={{ color: 'var(--neutral-500)' }}>Attachments</dt>
              <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{email.attachments.join(', ')}</dd>
            </>
          )}
        </dl>
      </header>
      {email.html !== null ? <HtmlFrame html={email.html} title={title} /> : <Plain text={email.text ?? ''} />}
    </div>
  )
}

// ── RTF ─────────────────────────────────────────────────────────────────────

export interface RtfPreviewProps {
  file: LibraryFileDetail
  /** The server could not convert the file; render it here even when it is a complete document. */
  serverFailed?: boolean
  /** What to show otherwise: the server's PDF (or, when the file cannot be read, the no-preview card). */
  children: React.ReactNode
}

/**
 * An RTF file. A complete document keeps the server's page-accurate PDF. A body fragment (no {\rtf1
 * header, which the server converts as plain text and so shows its control words) or a file the server
 * could not convert is laid out here instead, in the same sandboxed frame as web pages.
 */
export function RtfPreview({ file, serverFailed = false, children }: RtfPreviewProps) {
  const source = useFileSource(file.id, true)
  const html = useMemo(() => {
    if (source.data === undefined || (isRtfDocument(source.data) && !serverFailed)) return null
    return `<style>${RTF_STYLES}</style>${rtfToHtml(source.data)}`
  }, [source.data, serverFailed])
  if (source.isPending) return <Skeleton height={420} radius={8} style={{ width: '100%' }} />
  if (html === null) return <>{children}</>
  return <HtmlFrame html={html} title={`Preview of ${file.name}`} />
}

// ── Viewer ──────────────────────────────────────────────────────────────────

export interface SourceViewerProps {
  file: LibraryFileDetail
  /** The indexed text preview, shown while the file cannot be read (too big, storage unreachable). */
  fallback: React.ReactNode
}

/**
 * A text file shown the way it is meant to be read: HTML and email rendered (sandboxed), Markdown
 * formatted, code highlighted, JSON pretty-printed, plain text with its own spacing. Rendered views
 * can switch to the file's source.
 */
export default function SourceViewer({ file, fallback }: SourceViewerProps) {
  const extension = (file.extension ?? '').toLowerCase()
  const mode = sourceModeOf(extension) ?? 'plain'
  const source = useFileSource(file.id, true)
  const [view, setView] = useState<'preview' | 'source'>('preview')
  // Long lines wrap by default: a file is read, not edited, and a 1,000-character line is unreadable sideways.
  const [wrap, setWrap] = useState(true)
  const title = `Preview of ${file.name}`

  if (source.isPending) return <Skeleton height={420} radius={8} style={{ width: '100%' }} />
  if (source.isError || source.data === undefined) return <>{fallback}</>

  const text = source.data
  if (!text.trim()) return <p style={{ ...muted, fontSize: 'var(--font-size-body)', margin: 0 }}>This file is empty.</p>

  const rendered = mode === 'html' || mode === 'markdown' || mode === 'email'
  const showsCode = (rendered && view === 'source') || mode === 'code'
  let body: React.ReactNode
  if (rendered && view === 'source') body = <Code text={text} extension={mode === 'html' ? 'html' : mode === 'markdown' ? 'markdown' : 'plaintext'} id={file.id} wrap={wrap} />
  else if (mode === 'html') body = <HtmlFrame html={text} title={title} />
  else if (mode === 'markdown') body = <div style={{ width: '100%', minWidth: 0 }}><MarkdownRenderer content={text} /></div>
  else if (mode === 'email') body = <Email raw={text} title={title} />
  else if (mode === 'code') body = <Code text={text} extension={extension} id={file.id} wrap={wrap} />
  else body = <Plain text={text} mono={extension === 'log'} />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 'var(--space-4)', width: '100%', minWidth: 0 }}>
      {(rendered || showsCode) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', minHeight: 32 }}>
          {rendered ? (
            <Tabs value={view} onValueChange={(value) => setView(value as 'preview' | 'source')}>
              <Tabs.List size="small" aria-label="View">
                <Tabs.Trigger value="preview">Preview</Tabs.Trigger>
                <Tabs.Trigger value="source">Source</Tabs.Trigger>
              </Tabs.List>
            </Tabs>
          ) : <span />}
          {showsCode && (
            <label style={{ ...muted, display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1-5)', cursor: 'pointer', userSelect: 'none' }}>
              <input type="checkbox" checked={wrap} onChange={(event) => setWrap(event.target.checked)} style={{ margin: 0, accentColor: 'var(--neutral-900)' }} />
              Wrap lines
            </label>
          )}
        </div>
      )}
      {body}
    </div>
  )
}
