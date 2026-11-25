"use client";

import { useState, useEffect } from "react";
import { m } from "framer-motion";
import type { FollowUpsData } from "@/types/chat";

// �"��"� FollowUps renderer �"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"�

export function AnimatedFollowUps({ data, onComplete, onFollowUp, animate = true }: {
  data: FollowUpsData;
  onComplete: () => void;
  onFollowUp?: (prompt: string) => void;
  animate?: boolean;
}) {
  const [revealed, setRevealed] = useState(() => animate ? 0 : data.prompts.length);

  useEffect(() => {
    if (!animate) { onComplete(); return; }
    let idx = 0;
    let doneT: ReturnType<typeof setTimeout> | null = null;
    const t = setInterval(() => {
      idx++;
      setRevealed(idx);
      if (idx >= data.prompts.length) { clearInterval(t); doneT = setTimeout(onComplete, 160); }
    }, 100);
    return () => {
      clearInterval(t);
      if (doneT !== null) clearTimeout(doneT);
    };
  }, []); // eslint-disable-line

  return (
    <m.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
      <div style={{ fontSize: 'var(--font-size-small)', fontWeight: 'var(--font-weight-medium)', color: "var(--neutral-600)", marginBottom: 'var(--space-2-5)', textTransform: "uppercase", letterSpacing: "var(--tracking-wider)" }}>
        Follow-up suggestions
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 'var(--space-1-5)' }}>
        {data.prompts.slice(0, revealed).map((prompt) => (
          <m.button key={prompt}
            initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            onClick={() => onFollowUp?.(prompt)}
            style={{ display: "flex", alignItems: "center", gap: 'var(--space-2)', background: "var(--neutral-white)", border: "1px solid var(--neutral-100)", borderRadius: 'var(--radius-lg)', padding: "var(--space-2-5) var(--space-3)", fontSize: 'var(--font-size-body)', color: "var(--neutral-700)", cursor: "pointer", textAlign: "left", width: "100%", transition: "all var(--duration-fast)", fontFamily: "var(--font-body)" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "color-mix(in srgb, var(--brown-700) 4%, transparent)"; e.currentTarget.style.borderColor = "color-mix(in srgb, var(--brown-700) 20%, transparent)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "var(--static-white)"; e.currentTarget.style.borderColor = "var(--neutral-100)"; }}>
            <span style={{ color: "var(--neutral-300)", flexShrink: 0 }}>�'</span>
            {prompt}
          </m.button>
        ))}
      </div>
    </m.div>
  );
}
