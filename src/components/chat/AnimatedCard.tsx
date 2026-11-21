"use client";

import { useEffect } from "react";
import { m } from "framer-motion";
import type { CardData } from "@/types/chat";
import { InlineMd } from "./response-blocks-shared";

// �"��"� AnimatedCard �"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"�

export function AnimatedCard({ data, onComplete }: { data: CardData; onComplete: () => void }) {
  useEffect(() => { const t = setTimeout(onComplete, 380); return () => clearTimeout(t); }, []); // eslint-disable-line
  return (
    <m.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      style={{ background: "var(--neutral-white)", border: "1px solid var(--neutral-100)", borderRadius: 'var(--radius-xl)', padding: "var(--space-4) var(--space-4)" }}>
      {data.badge && (
        <div style={{ display: "inline-flex", fontSize: 'var(--font-size-small)', fontWeight: 'var(--font-weight-semibold)', letterSpacing: "0.4px", textTransform: "uppercase", color: data.badgeColor ?? "var(--brown-700)", background: `${data.badgeColor ?? "var(--brown-700)"}12`, border: `1px solid ${data.badgeColor ?? "var(--brown-700)"}20`, borderRadius: 'var(--radius-sm)', padding: "var(--space-0-5) var(--space-2)", marginBottom: 'var(--space-2-5)' }}>
          {data.badge}
        </div>
      )}
      {data.title && <div style={{ fontSize: 'var(--font-size-body-lg)', fontWeight: 'var(--font-weight-semibold)', color: "var(--neutral-900)", lineHeight: "var(--line-height-body)", marginBottom: data.subtitle ? 2 : 8 }}>{data.title}</div>}
      {data.subtitle && <div style={{ fontSize: 'var(--font-size-small)', color: "var(--neutral-600)", marginBottom: 'var(--space-2-5)' }}>{data.subtitle}</div>}
      <div style={{ fontSize: 'var(--font-size-body)', color: "var(--neutral-700)", lineHeight: "var(--line-height-body)" }}><InlineMd text={data.body} /></div>
    </m.div>
  );
}
