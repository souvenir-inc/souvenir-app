"use client";

import { useState, useEffect } from "react";
import { AnimatePresence, m } from "framer-motion";
import type { StepsData } from "@/types/chat";

// �"��"� AnimatedSteps �"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"�

export function AnimatedSteps({ data, onComplete, animate = true }: { data: StepsData; onComplete: () => void; animate?: boolean }) {
  const [revealedSteps, setRevealedSteps] = useState(() => animate ? 0 : data.steps.length);
  const stepCount = data.steps.length;

  useEffect(() => {
    if (!animate) { onComplete(); return; }
    let completionTimer: ReturnType<typeof setTimeout> | undefined;
    if (stepCount === 0) {
      completionTimer = setTimeout(onComplete, 320);
      return () => clearTimeout(completionTimer);
    }
    const revealTimers = Array.from({ length: stepCount }, (_, index) => (
      setTimeout(() => {
        setRevealedSteps(index + 1);
        if (index === stepCount - 1) completionTimer = setTimeout(onComplete, 320);
      }, (index + 1) * 220)
    ));
    return () => {
      revealTimers.forEach(clearTimeout);
      if (completionTimer) clearTimeout(completionTimer);
    };
  }, [animate, onComplete, stepCount]);

  return (
    <m.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}>
      {data.title && <div style={{ fontFamily: "var(--font-body)", fontSize: 'var(--font-size-body)', fontWeight: 'var(--font-weight-semibold)', color: "var(--neutral-900)", marginBottom: 'var(--space-4)', lineHeight: "var(--line-height-body-sm)" }}>{data.title}</div>}
      <div style={{ display: "flex", flexDirection: "column", fontFamily: "var(--font-body)" }}>
        <AnimatePresence initial={false}>
          {data.steps.slice(0, revealedSteps).map((step, i) => (
            <m.div key={step.label} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              style={{ display: "flex", gap: 'var(--space-3)' }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                <m.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 25, delay: 0.04 }}
                  style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--brown-700)", color: "var(--neutral-white)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 'var(--font-size-caption)', fontWeight: 'var(--font-weight-bold)', flexShrink: 0 }}>
                  {i + 1}
                </m.div>
                {i < data.steps.length - 1 && (
                  <m.div initial={{ scaleY: 0 }} animate={{ scaleY: 1 }}
                    transition={{ duration: 0.22, delay: 0.12, ease: "easeOut" }}
                    style={{ width: 1, flex: 1, minHeight: 20, background: "var(--neutral-100)", transformOrigin: "top", marginTop: 'var(--space-1)' }} />
                )}
              </div>
              <div style={{ paddingBottom: i < data.steps.length - 1 ? 18 : 0, paddingTop: 'var(--space-0-5)', minWidth: 0 }}>
                <div style={{ fontSize: 'var(--font-size-body)', fontWeight: 'var(--font-weight-medium)', color: "var(--neutral-900)", lineHeight: "var(--line-height-body-sm)" }}>{step.label}</div>
                {step.description && <div style={{ fontSize: 'var(--font-size-body-sm)', color: "var(--neutral-600)", lineHeight: "var(--line-height-body-sm)", marginTop: 'var(--space-0-5)' }}>{step.description}</div>}
              </div>
            </m.div>
          ))}
        </AnimatePresence>
      </div>
    </m.div>
  );
}
