"use client";

import { useState, useEffect } from "react";
import { m } from "framer-motion";
import GlobeXIcon from "@hugeicons/core-free-icons/GlobeXIcon";
import Exchange01Icon from "@hugeicons/core-free-icons/Exchange01Icon";
import type { SearchTimeoutData } from "@/types/chat";
import { HIcon } from "./response-blocks-shared";
import { DURATION } from "@/styles/tokens/motion"

// �"��"� AnimatedSearchTimeout �"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"�

export function AnimatedSearchTimeout({ data, onComplete, onRetry }: { data: SearchTimeoutData; onComplete: () => void; onRetry?: () => void }) {
  useEffect(() => { const t = setTimeout(onComplete, 420); return () => clearTimeout(t); }, []); // eslint-disable-line
  const [retryHovered, setRetryHovered] = useState(false);
  return (
    <m.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: DURATION.moderate, ease: [0.16, 1, 0.3, 1] }}
      style={{ display: "flex", gap: 'var(--space-3)', alignItems: "flex-start", background: "color-mix(in srgb, var(--yellow-500) 5%, transparent)", border: "1px solid color-mix(in srgb, var(--yellow-500) 22%, transparent)", borderRadius: 'var(--radius-xl)', padding: "var(--space-3) var(--space-4)" }}>
      <div style={{ width: 3, borderRadius: 'var(--radius-full)', background: "var(--yellow-500)", flexShrink: 0, alignSelf: "stretch", minHeight: 32 }} />
      <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 'var(--space-2-5)', flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 'var(--space-1)', flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 'var(--space-1-5)' }}>
            <span style={{ lineHeight: 0 }}><HIcon icon={GlobeXIcon} size={16} color="var(--yellow-700)" strokeWidth={1.5} /></span>
            <span style={{ fontSize: 'var(--font-size-body)', fontWeight: 'var(--font-weight-semibold)', color: "var(--neutral-900)" }}>Web search timed out</span>
          </div>
          <div style={{ display: "inline-flex", alignSelf: "flex-start", fontSize: 'var(--font-size-body-sm)', fontFamily: "var(--font-code, monospace)", color: "var(--neutral-500)", background: "color-mix(in srgb, var(--neutral-800) 8%, transparent)", border: "var(--widget-border)", borderRadius: 'var(--radius-sm)', padding: "var(--space-0-5) var(--space-2)" }}>
            {data.query}
          </div>
        </div>
        <button onMouseEnter={() => setRetryHovered(true)} onMouseLeave={() => setRetryHovered(false)} onClick={onRetry}
          style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 'var(--space-1-5)', background: retryHovered ? "color-mix(in srgb, var(--yellow-500) 10%, transparent)" : "var(--static-white)", border: "1px solid color-mix(in srgb, var(--yellow-500) 32%, transparent)", borderRadius: 'var(--radius-md)', padding: "var(--space-1-5) var(--space-3)", fontSize: 'var(--font-size-body)', fontWeight: 'var(--font-weight-semibold)', color: "var(--yellow-700)", cursor: "pointer", transition: "background var(--duration-fast)" }}>
          <HIcon icon={Exchange01Icon} size={16} color="var(--yellow-700)" strokeWidth={1.5} />
          {data.cta}
        </button>
      </div>
    </m.div>
  );
}
