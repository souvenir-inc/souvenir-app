"use client";

import { createPortal } from "react-dom";
import { Upload } from "lucide-react";

/**
 * The full-window "drop files" layer shown while files are dragged over a chat. It renders into
 * document.body above everything else (the composer, its model menu, popovers and toasts), so no
 * stacking context on the page can sit on top of it. It never takes pointer events, so the drop
 * still lands on the page's own drop handler.
 */
const TOP_LAYER = 2147483000;

export function FileDropOverlay({ visible }: { visible: boolean }) {
  if (!visible || typeof document === "undefined") return null;
  return createPortal(
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: TOP_LAYER,
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 'var(--space-4)',
        backgroundColor: "rgba(var(--surface-rgb), 0.72)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 12,
          borderRadius: 'var(--radius-2xl)',
          border: "2px dashed var(--neutral-300)",
        }}
      />
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 'var(--space-3)',
          padding: "var(--space-6) var(--space-7)",
          borderRadius: 'var(--radius-2xl)',
          background: "var(--card-bg)",
          boxShadow: "var(--shadow-card-default)",
          textAlign: "center",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 48,
            height: 48,
            borderRadius: 'var(--radius-xl)',
            background: "var(--neutral-100)",
            color: "var(--neutral-900)",
          }}
        >
          <Upload size={22} />
        </span>
        <span style={{ fontFamily: "var(--font-body)", fontSize: 'var(--font-size-body-lg)', lineHeight: "var(--line-height-body)", fontWeight: 'var(--font-weight-medium)', color: "var(--neutral-900)" }}>
          Drop files to attach
        </span>
        <span style={{ fontFamily: "var(--font-body)", fontSize: 'var(--font-size-body-sm)', lineHeight: "18px", color: "var(--neutral-500)" }}>
          They upload to this chat. Up to 10 files per message.
        </span>
      </div>
    </div>,
    document.body,
  );
}
