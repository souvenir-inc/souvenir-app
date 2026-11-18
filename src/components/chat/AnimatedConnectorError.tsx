"use client";

import { useState, useEffect } from "react";
import { m } from "framer-motion";
import Exchange01Icon from "@hugeicons/core-free-icons/Exchange01Icon";
import type { ConnectorErrorData } from "@/types/chat";
import { HIcon } from "./response-blocks-shared";

// �"��"� AnimatedConnectorError �"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"�

export function AnimatedConnectorError({ data, onComplete, onRetry }: { data: ConnectorErrorData; onComplete: () => void; onRetry?: () => void }) {
  useEffect(() => { const t = setTimeout(onComplete, 420); return () => clearTimeout(t); }, []); // eslint-disable-line
  const [retryHovered, setRetryHovered] = useState(false);
  return (
    <m.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      style={{ display: "flex", gap: 'var(--space-3)', alignItems: "flex-start", background: "color-mix(in srgb, var(--red-500) 4%, transparent)", border: "1px solid color-mix(in srgb, var(--red-500) 18%, transparent)", borderRadius: 'var(--radius-xl)', padding: "var(--space-3) var(--space-4)" }}>
      <div style={{ width: 3, borderRadius: 99, background: "var(--red-500)", flexShrink: 0, alignSelf: "stretch", minHeight: 32 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 'var(--space-1-5)', flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 'var(--space-2-5)' }}>
          <div style={{ display: "flex", alignItems: "center", gap: 'var(--space-1-5)', flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 'var(--font-size-body)' }}>{data.icon ?? "⚠️"}</span>
            <span style={{ fontSize: 'var(--font-size-body)', fontWeight: 'var(--font-weight-semibold)', color: "var(--neutral-900)" }}>{data.connector}</span>
            <span style={{ fontSize: 'var(--font-size-small)', fontWeight: 'var(--font-weight-semibold)', letterSpacing: "0.4px", textTransform: "uppercase", color: "var(--red-600)", background: "color-mix(in srgb, var(--red-500) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--red-500) 20%, transparent)", borderRadius: 'var(--radius-sm)', padding: "var(--space-0-5) var(--space-1-5)", flexShrink: 0 }}>Auth expired</span>
          </div>
          <button onMouseEnter={() => setRetryHovered(true)} onMouseLeave={() => setRetryHovered(false)} onClick={onRetry}
            style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 'var(--space-1-5)', background: retryHovered ? "color-mix(in srgb, var(--red-500) 8%, transparent)" : "white", border: "1px solid color-mix(in srgb, var(--red-500) 28%, transparent)", borderRadius: 'var(--radius-md)', padding: "var(--space-1-5) var(--space-3)", fontSize: 'var(--font-size-body)', fontWeight: 'var(--font-weight-semibold)', color: "var(--red-600)", cursor: "pointer", transition: "background var(--duration-fast)" }}>
            <HIcon icon={Exchange01Icon} size={16} color="var(--red-600)" strokeWidth={1.5} />
            {data.cta}
          </button>
        </div>
        {data.message && <div style={{ fontSize: 'var(--font-size-body)', color: "var(--neutral-500)", lineHeight: "var(--line-height-body)" }}>{data.message}</div>}
      </div>
    </m.div>
  );
}
