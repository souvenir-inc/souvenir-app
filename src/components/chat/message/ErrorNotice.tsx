"use client";

import React from "react";
import { m } from "framer-motion";
import { DURATION } from "@/styles/tokens/motion"

// ── ErrorNotice - a failure below output that was already shown ───────────────
// Styled after the connector-error card (AnimatedConnectorError).

const noticeStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 'var(--space-3)',
  marginTop: 'var(--space-3)',
  padding: "var(--space-2-5) var(--space-3) var(--space-2-5) var(--space-3)",
  borderRadius: 'var(--radius-xl)',
  background: "color-mix(in srgb, var(--red-500) 4%, transparent)",
  border: "1px solid color-mix(in srgb, var(--red-500) 18%, transparent)",
};

const messageStyle: React.CSSProperties = { flex: 1, minWidth: 0, fontFamily: "var(--font-body)", fontSize: 'var(--font-size-body)', lineHeight: "var(--line-height-body)", color: "var(--neutral-700)" };

const retryStyle: React.CSSProperties = {
  flexShrink: 0,
  background: "transparent",
  border: "1px solid color-mix(in srgb, var(--red-500) 28%, transparent)",
  borderRadius: 'var(--radius-md)',
  padding: "var(--space-1-5) var(--space-3)",
  fontFamily: "var(--font-body)",
  fontSize: 'var(--font-size-body)',
  fontWeight: 'var(--font-weight-semibold)',
  color: "var(--red-600)",
  cursor: "pointer",
};

export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <m.div
      role="alert"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.moderate, ease: [0.16, 1, 0.3, 1] }}
      style={noticeStyle}
    >
      <span style={messageStyle}>
        {message}
      </span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          style={retryStyle}
        >
          Retry
        </button>
      )}
    </m.div>
  );
}
