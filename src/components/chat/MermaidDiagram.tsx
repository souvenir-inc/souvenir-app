"use client"

/**
 * MermaidDiagram.tsx
 *
 * Renders ```mermaid code fences from the assistant as SVG diagrams
 * (flowcharts, sequence/state/class/ER diagrams, gantt, pie) via
 * beautiful-mermaid — a lightweight renderer that takes our design tokens so
 * diagrams match the app palette.
 *
 * Streaming: the fence body keeps changing while the model writes, so
 * rendering is debounced until the code is briefly stable. Transient parse
 * failures show the skeleton; only code that stays unparseable surfaces the
 * raw-source fallback.
 */

import React, { useEffect, useRef, useState } from "react"
import { m, useReducedMotion } from "framer-motion"
import { Check, Copy, GitBranch, Maximize2, Minimize2 } from "lucide-react"
import { ChatChartShell } from "@/components/chat/ChatChartShell"
import { sanitizeSVG } from "@/lib/security"
import { CHAT_CHART_PALETTE } from "@/components/chat/chat-chart-theme"
import { DURATION, SPRING } from "@/styles/tokens/motion"

const THEME = {
  bg:          "var(--neutral-white)",
  fg:          "var(--neutral-800)",
  muted:       "var(--neutral-400)",
  border:      "var(--neutral-300)",
  line:        "var(--neutral-400)",
  accent:      CHAT_CHART_PALETTE[0],
  surface:     "var(--neutral-800-05)",
  transparent: true,
  font:        "Geist",
}

// beautiful-mermaid bundles a graph-layout engine (~1.4 MB raw / ~420 KB gzip), and most chats
// never contain a diagram — so it is loaded the first time a diagram renders, not with the chat
// page. The promise is cached; a failed load (e.g. offline) clears the cache so the next
// diagram can retry.
type MermaidModule = typeof import("beautiful-mermaid")
let mermaidModule: Promise<MermaidModule> | null = null

function loadMermaid(): Promise<MermaidModule> {
  if (!mermaidModule) {
    mermaidModule = import("beautiful-mermaid").catch((error: unknown) => {
      mermaidModule = null
      throw error
    })
  }
  return mermaidModule
}

function Skeleton() {
  return (
    <div
      aria-label="Rendering diagram…"
      style={{
        display:      "flex",
        alignItems:   "center",
        gap:          'var(--space-2)',
        margin:       "var(--space-3) 0",
        padding:      "var(--space-2-5) var(--space-4)",
        borderRadius: 'var(--radius-md)',
        border:       "1px dashed var(--border-default)",
        background:   "var(--neutral-50)",
        color:        "var(--neutral-600)",
        fontSize:     'var(--font-size-body-sm)',
        fontFamily:   "var(--font-body)",
      }}
    >
      <svg width={20} height={8} viewBox="0 0 20 8" aria-hidden>
        {[0, 7, 14].map((x, dotIdx) => (
          <circle key={x} cx={x + 3} cy={4} r={2.5} fill="var(--neutral-300)">
            <animate
              attributeName="opacity"
              values="0.3;1;0.3"
              dur="1.2s"
              begin={`${dotIdx * 0.24}s`}
              repeatCount="indefinite"
            />
          </circle>
        ))}
      </svg>
      <span>Rendering diagram…</span>
    </div>
  )
}

export function MermaidDiagram({ code }: { code: string }) {
  const [svg, setSvg] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reduceMotion = Boolean(useReducedMotion())

  useEffect(() => {
    let cancelled = false
    let failTimer: ReturnType<typeof setTimeout> | undefined
    const markFailedSoon = () => {
      failTimer = setTimeout(() => setFailed(true), 1000)
    }
    const renderTimer = setTimeout(() => {
      loadMermaid().then(
        ({ renderMermaidSVG }) => {
          if (cancelled) return
          try {
            setSvg(sanitizeSVG(renderMermaidSVG(code, THEME)))
            setFailed(false)
          } catch {
            markFailedSoon()
          }
        },
        () => {
          if (!cancelled) markFailedSoon()
        },
      )
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(renderTimer)
      if (failTimer) clearTimeout(failTimer)
    }
  }, [code])

  useEffect(() => () => {
    if (copyResetTimerRef.current) clearTimeout(copyResetTimerRef.current)
  }, [])

  const copySource = () => {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true)
      if (copyResetTimerRef.current) clearTimeout(copyResetTimerRef.current)
      copyResetTimerRef.current = setTimeout(() => setCopied(false), 1500)
    })
  }

  if (failed) {
    return (
      <div style={{ margin: "var(--space-3) 0", borderRadius: 'var(--radius-md)', border: "1px solid var(--border-default)", background: "var(--neutral-50)" }}>
        <pre
          className="kaya-scrollbar"
          style={{
            margin:     0,
            padding:    "var(--space-3) var(--space-4)",
            overflowX:  "auto",
            fontFamily: "var(--font-code)",
            fontSize:   'var(--font-size-body-sm)',
            color:      "var(--neutral-700)",
          }}
        >
          {code.trim()}
        </pre>
        <p
          style={{
            margin:     0,
            padding:    "var(--space-1-5) var(--space-4)",
            borderTop:  "1px solid var(--border-default)",
            fontFamily: "var(--font-body)",
            fontSize:   "var(--font-size-caption)",
            color:      "var(--neutral-600)",
          }}
        >
          Diagram could not be rendered
        </p>
      </div>
    )
  }

  if (!svg) return <Skeleton />

  return (
    <ChatChartShell
      initial={reduceMotion ? false : { opacity: 0, y: 10, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: DURATION.slow, ease: [0.16, 1, 0.3, 1] }}
      style={{
        position: expanded ? "fixed" : "relative",
        inset: expanded ? 24 : undefined,
        zIndex: expanded ? "var(--z-overlay)" : undefined,
        display: "flex",
        flexDirection: "column",
        margin: expanded ? 0 : "var(--space-4) 0",
        padding: 0,
        minHeight: expanded ? 0 : 220,
        maxHeight: expanded ? "calc(100vh - 48px)" : undefined,
        boxShadow: expanded ? "var(--mermaid-diagram-shadow)" : undefined,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 'var(--space-2)',
          minHeight: 52,
          padding: "var(--space-2-5) var(--space-3) var(--space-2-5) var(--space-4)",
          borderBottom: "1px solid var(--neutral-100)",
        }}
      >
        <m.span
          aria-hidden
          initial={reduceMotion ? false : { scale: 0.82, rotate: -8 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", ...SPRING.springy }}
          style={{ display: "grid", placeItems: "center", color: CHAT_CHART_PALETTE[0] }}
        >
          <GitBranch size={15} strokeWidth={1.8} />
        </m.span>
        <div
          style={{
            flex: "1 1 0",
            minWidth: 0,
            color: "var(--neutral-900)",
            fontFamily: "var(--font-body)",
            fontSize: 'var(--font-size-body-sm)',
            fontWeight: 'var(--font-weight-semibold)',
          }}
        >
          Flow visualization
        </div>
        <m.button
          type="button"
          onClick={copySource}
          aria-label={copied ? "Diagram source copied" : "Copy diagram source"}
          whileHover={reduceMotion ? undefined : { scale: 1.04 }}
          whileTap={reduceMotion ? undefined : { scale: 0.96 }}
          style={{ width: 32, height: 32, display: "grid", placeItems: "center", borderRadius: 'var(--radius-lg)', border: "1px solid var(--neutral-100)", backgroundColor: "var(--neutral-white)", color: copied ? "var(--green-700)" : "var(--neutral-500)", cursor: "pointer" }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </m.button>
        <m.button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-label={expanded ? "Exit expanded diagram" : "Expand diagram"}
          aria-pressed={expanded}
          whileHover={reduceMotion ? undefined : { scale: 1.04 }}
          whileTap={reduceMotion ? undefined : { scale: 0.96 }}
          style={{ width: 32, height: 32, display: "grid", placeItems: "center", borderRadius: 'var(--radius-lg)', border: "1px solid var(--neutral-100)", backgroundColor: "var(--neutral-white)", color: "var(--neutral-500)", cursor: "pointer" }}
        >
          {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </m.button>
      </div>

      <m.div
        className="kaya-scrollbar"
        initial={reduceMotion ? false : { opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: reduceMotion ? 0 : DURATION.instant, duration: DURATION.slow }}
        style={{
          flex: expanded ? "1 1 0" : undefined,
          minHeight: 0,
          display: "grid",
          placeItems: "center",
          padding: expanded ? "var(--space-6)" : "var(--space-4-5)",
          overflow: "auto",
          backgroundColor: "var(--neutral-white)",
          backgroundImage: "radial-gradient(circle at 1px 1px, var(--neutral-800-05) 1px, transparent 0)",
          backgroundSize: "18px 18px",
        }}
        // Library-generated SVG, passed through sanitizeSVG because labels come from the AI response.
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </ChatChartShell>
  )
}
