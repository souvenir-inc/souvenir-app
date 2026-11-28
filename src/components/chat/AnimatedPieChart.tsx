"use client";

import { useState, useEffect } from "react";
import { m } from "framer-motion";
import type { PieChartData } from "@/types/chat";
import { DURATION } from "@/styles/tokens/motion"

// �"��"� AnimatedPieChart �"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"�

const PIE_COLORS_HEX = ["var(--brown-700)", "var(--blue-600)", "var(--green-600)", "var(--neutral-400)", "var(--neutral-700)", "var(--yellow-500)"];

export function AnimatedPieChart({ data, onComplete, animate = true }: { data: PieChartData; onComplete: () => void; animate?: boolean }) {
  const [revealedCount, setRevealedCount] = useState(() => animate ? 0 : data.segments.length);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const R = 90, CX = 110, CY = 110, SW = 26;
  const circ = 2 * Math.PI * R;
  const total = data.segments.reduce((s, seg) => s + seg.value, 0);

  let cumPct = 0;
  const arcs = data.segments.map((seg, i) => {
    const pct = seg.value / total;
    const startDeg = cumPct * 360 - 90;
    cumPct += pct;
    return { pct, startDeg, dashLen: pct * circ, gapLen: (1 - pct) * circ, color: seg.color ?? PIE_COLORS_HEX[i % PIE_COLORS_HEX.length], label: seg.label, value: seg.value };
  });

  useEffect(() => {
    if (!animate) { onComplete(); return; }
    let idx = 0;
    let doneT: ReturnType<typeof setTimeout> | null = null;
    const t = setInterval(() => {
      idx++;
      setRevealedCount(idx);
      if (idx >= data.segments.length) { clearInterval(t); doneT = setTimeout(onComplete, 800); }
    }, 180);
    return () => {
      clearInterval(t);
      if (doneT !== null) clearTimeout(doneT);
    };
  }, []); // eslint-disable-line

  return (
    <div style={{ background: "var(--neutral-white)", border: "1px solid var(--brown-50)", borderRadius: 'var(--radius-xl)', padding: "var(--space-4) var(--space-5)" }}>
      {data.title && <div style={{ fontSize: 'var(--font-size-body-sm)', fontWeight: 'var(--font-weight-semibold)', color: "var(--neutral-900)", marginBottom: 'var(--space-1)' }}>{data.title}</div>}
      <div style={{ fontSize: 'var(--font-size-small)', color: "var(--neutral-300)", fontWeight: 'var(--font-weight-medium)', textTransform: "uppercase", letterSpacing: "var(--tracking-wider)", marginBottom: 'var(--space-4)' }}>pie chart</div>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 'var(--space-5)' }}>
        <svg width={220} height={220} viewBox="0 0 220 220" style={{ display: "block", maxWidth: "100%" }}>
          <circle r={R} cx={CX} cy={CY} fill="none" stroke="color-mix(in srgb, var(--neutral-800) 7%, transparent)" strokeWidth={SW} />
          {arcs.map((arc, i) => (
            <circle key={arc.label} r={R} cx={CX} cy={CY} fill="none" stroke={arc.color}
              strokeWidth={i === hoveredIdx ? SW + 4 : SW}
              strokeDasharray={`${arc.dashLen} ${arc.gapLen}`}
              strokeDashoffset={i < revealedCount ? 0 : arc.dashLen}
              transform={`rotate(${arc.startDeg} ${CX} ${CY})`}
              style={{ transition: "stroke-dashoffset var(--animated-pie-chart-duration) var(--ease-out-expo), stroke-width var(--duration-fast)", strokeLinecap: "butt", cursor: "pointer" }}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            />
          ))}
          {hoveredIdx !== null ? (
            <>
              <text x={CX} y={CY - 6} textAnchor="middle" fill={arcs[hoveredIdx].color} fontSize="var(--animated-pie-chart-size)" fontWeight="var(--font-weight-bold)" fontFamily="inherit">{Math.round(arcs[hoveredIdx].pct * 100)}%</text>
              <text x={CX} y={CY + 16} textAnchor="middle" fill="var(--neutral-600)" fontSize="var(--animated-pie-chart-size-2)" fontFamily="inherit">{data.unit ? `${Math.round(arcs[hoveredIdx].pct * total)}${data.unit}` : arcs[hoveredIdx].label.split(" ").slice(0, 2).join(" ")}</text>
            </>
          ) : (
            <>
              {data.centerLabel && <text x={CX} y={CY - 4} textAnchor="middle" fill="var(--neutral-900)" fontSize="var(--font-size-heading)" fontWeight="var(--font-weight-bold)" fontFamily="inherit">{data.centerLabel}</text>}
              <text x={CX} y={CY + 16} textAnchor="middle" fill="var(--neutral-600)" fontSize="var(--animated-pie-chart-size-2)" fontFamily="inherit">total</text>
            </>
          )}
        </svg>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-2) var(--space-4)" }}>
        {arcs.map((arc, i) => (
          <m.div key={arc.label}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: i < revealedCount ? 1 : 0, y: i < revealedCount ? 0 : 4 }}
            transition={{ duration: DURATION.base, ease: "easeOut" }}
            onMouseEnter={() => setHoveredIdx(i)} onMouseLeave={() => setHoveredIdx(null)}
            style={{ display: "flex", alignItems: "center", gap: 'var(--space-2)', cursor: "default", opacity: hoveredIdx !== null && hoveredIdx !== i ? 0.45 : undefined, transition: "opacity var(--duration-fast)" }}>
            <div style={{ width: 10, height: 10, borderRadius: 'var(--radius-xs)', background: arc.color, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 'var(--font-size-small)', color: "var(--neutral-700)", lineHeight: "var(--line-height-small)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{arc.label}</div>
              <div style={{ fontSize: 'var(--font-size-small)', color: "var(--neutral-600)", lineHeight: 'var(--line-height-small)' }}>
                {Math.round(arc.pct * 100)}%
                {data.unit && <span style={{ marginLeft: 'var(--space-1)' }}>{Math.round(arc.pct * total)}{data.unit}</span>}
              </div>
            </div>
          </m.div>
        ))}
      </div>
    </div>
  );
}
