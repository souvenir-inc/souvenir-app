"use client";

import React, { useState, useEffect, useRef } from "react";
import { AnimatePresence, m } from "framer-motion";
import type { LineChartData } from "@/types/chat";
import { DURATION, SPRING, LONG, STAGGER } from "@/styles/tokens/motion"

// �"��"� AnimatedLineChart �"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"�

export function AnimatedLineChart({ data, onComplete, animate = true }: { data: LineChartData; onComplete: () => void; animate?: boolean }) {
  const [revealed, setRevealed] = useState(!animate);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [hoverContainerX, setHoverContainerX] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const W = 700, H = 160;
  const PAD = { top: 14, right: 18, bottom: 32, left: 38 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const LINE_COLORS = ["var(--brown-700)", "var(--blue-600)", "var(--green-600)", "var(--neutral-400)"];

  const allY = data.lines.flatMap((l) => l.points.map((p) => p.y));
  const minY = Math.min(...allY);
  const maxY = Math.max(...allY);
  const range = maxY - minY || 1;
  const maxXIdx = (data.lines[0]?.points.length ?? 1) - 1 || 1;

  const toSVG = (xi: number, y: number) => ({
    x: PAD.left + (xi / maxXIdx) * chartW,
    y: PAD.top + (1 - (y - minY) / range) * chartH,
  });

  useEffect(() => {
    if (!animate) { onComplete(); return; }
    let doneT: ReturnType<typeof setTimeout> | null = null;
    const t = setTimeout(() => { setRevealed(true); doneT = setTimeout(onComplete, 1300); }, 120);
    return () => {
      clearTimeout(t);
      if (doneT !== null) clearTimeout(doneT);
    };
  }, []); // eslint-disable-line

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || !containerRef.current) return;
    const svgRect = svgRef.current.getBoundingClientRect();
    const contRect = containerRef.current.getBoundingClientRect();
    const scaleX = W / svgRect.width;
    const svgX = (e.clientX - svgRect.left) * scaleX;
    if (svgX < PAD.left || svgX > PAD.left + chartW) { setHoverIdx(null); return; }
    const xi = Math.round((svgX - PAD.left) / chartW * maxXIdx);
    setHoverIdx(Math.max(0, Math.min(maxXIdx, xi)));
    setHoverContainerX(e.clientX - contRect.left);
  };

  const tooltipItems = hoverIdx !== null
    ? data.lines.map((line, li) => ({ label: line.label ?? `Series ${li + 1}`, value: line.points[hoverIdx]?.y ?? 0, color: line.color ?? LINE_COLORS[li % LINE_COLORS.length] }))
    : [];

  const crosshairSvgX = hoverIdx !== null ? PAD.left + (hoverIdx / maxXIdx) * chartW : 0;
  const tooltipWidth = 120;
  const tooltipLeft = Math.min(Math.max(hoverContainerX - tooltipWidth / 2, 4), (containerRef.current?.clientWidth ?? 360) - tooltipWidth - 4);

  return (
    <m.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: DURATION.moderate, ease: [0.16, 1, 0.3, 1] }}
      style={{ background: "var(--neutral-white)", border: "1px solid var(--brown-50)", borderRadius: 'var(--radius-xl)', padding: "var(--space-4) var(--space-4) var(--space-3)" }}>
      {data.title && <div style={{ fontSize: 'var(--font-size-body-sm)', fontWeight: 'var(--font-weight-semibold)', color: "var(--neutral-900)", marginBottom: 'var(--space-3)' }}>{data.title}</div>}
      <div ref={containerRef} style={{ position: "relative" }}>
        <svg ref={svgRef} width="100%" viewBox={`0 0 ${W} ${H}`}
          style={{ display: "block", overflow: "visible", cursor: "crosshair" }}
          onMouseMove={handleMouseMove} onMouseLeave={() => setHoverIdx(null)}>
          {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
            const yv = PAD.top + pct * chartH;
            return <m.line key={pct} x1={PAD.left} x2={PAD.left + chartW} y1={yv} y2={yv} stroke="color-mix(in srgb, var(--neutral-800) 7%, transparent)" strokeWidth={1} initial={{ opacity: 0 }} animate={{ opacity: revealed ? 1 : 0 }} transition={{ duration: DURATION.slow, delay: DURATION.snap }} />;
          })}
          {[0, 0.5, 1].map((pct) => {
            const val = maxY - pct * range;
            return <text key={pct} x={PAD.left - 6} y={PAD.top + pct * chartH + 4} textAnchor="end" fill="var(--neutral-300)" fontSize="var(--font-size-caption)" fontFamily="inherit">{Math.round(val)}{data.unit ?? ""}</text>;
          })}
          {data.lines.map((line, li) => {
            const color = line.color ?? LINE_COLORS[li % LINE_COLORS.length];
            const pts = line.points.map((p, i) => { const { x, y } = toSVG(i, p.y); return `${x},${y}`; }).join(" ");
            const areaPts = pts + ` ${PAD.left + chartW},${PAD.top + chartH} ${PAD.left},${PAD.top + chartH}`;
            return (
              <g key={line.label ?? `line-${li}`}>
                <m.polygon points={areaPts} fill={`${color}10` /* ds-keep: the chart colour with a hex alpha */} stroke="none" initial={{ opacity: 0 }} animate={{ opacity: revealed ? 1 : 0 }} transition={{ delay: DURATION.slow, duration: DURATION.gentle }} />
                <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} pathLength={1} strokeDasharray="1"
                  strokeDashoffset={revealed ? 0 : 1} strokeLinecap="round" strokeLinejoin="round"
                  style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(0.16,1,0.3,1)" /* ds-keep: the chart line draws in */ }} />
                {line.points.map((p, i) => {
                  const { x, y } = toSVG(i, p.y);
                  const isHovered = hoverIdx === i;
                  return (
                    <m.circle key={String(p.x)} cx={x} cy={y} r={isHovered ? 4 : 2.5}
                      fill={isHovered ? "var(--static-white)" : color} stroke={isHovered ? color : "none"} strokeWidth={isHovered ? 2 : 0}
                      initial={{ scale: 0 }} animate={{ scale: revealed ? 1 : 0 }}
                      transition={{ type: "spring", ...SPRING.lively,  delay: revealed ? 0 : LONG.xs + i * STAGGER.xs }}
                      style={{ transformOrigin: `${x}px ${y}px` }} />
                  );
                })}
              </g>
            );
          })}
          <line x1={PAD.left} x2={PAD.left + chartW} y1={PAD.top + chartH} y2={PAD.top + chartH} stroke="var(--neutral-800-15)" strokeWidth={0.8} />
          {data.lines[0]?.points.map((p, i) => {
            const total = data.lines[0].points.length;
            const skip = Math.ceil(total / 7);
            if (i % skip !== 0 && i !== total - 1) return null;
            const { x } = toSVG(i, 0);
            return <text key={String(p.x)} x={x} y={H - 6} textAnchor="middle" fill="var(--neutral-300)" fontSize="var(--font-size-caption)" fontFamily="inherit">{p.x}</text>;
          })}
          {hoverIdx !== null && <line x1={crosshairSvgX} x2={crosshairSvgX} y1={PAD.top} y2={PAD.top + chartH} stroke="color-mix(in srgb, var(--neutral-800) 18%, transparent)" strokeWidth={0.8} strokeDasharray="4 3" />}
        </svg>
        <AnimatePresence initial={false}>
          {hoverIdx !== null && tooltipItems.length > 0 && (
            <m.div key="tooltip" initial={{ opacity: 0, y: 4, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 4, scale: 0.96 }} transition={{ duration: DURATION.fast }}
              style={{ position: "absolute", top: -8, left: tooltipLeft, width: tooltipWidth, background: "var(--chart-tooltip-bg)", borderRadius: 'var(--radius-md)', padding: "var(--space-1-5) var(--space-2-5)", pointerEvents: "none", zIndex: 'var(--z-raised)', boxShadow: "var(--shadow-3)" }}>
              <div style={{ fontSize: 'var(--font-size-small)', color: "var(--neutral-600)", fontWeight: 'var(--font-weight-medium)', marginBottom: 'var(--space-1)', letterSpacing: "var(--tracking-wide)" }}>{data.lines[0]?.points[hoverIdx]?.x}</div>
              {tooltipItems.map((item, ti) => (
                <div key={item.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 'var(--space-2)', marginTop: ti > 0 ? "var(--space-0-75)" : 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 'var(--space-1)' }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: item.color, flexShrink: 0 }} />
                    {tooltipItems.length > 1 && <span style={{ fontSize: 'var(--font-size-small)', color: "var(--neutral-600)", maxWidth: 52, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</span>}
                  </div>
                  <span style={{ fontSize: 'var(--font-size-small)', fontWeight: 'var(--font-weight-semibold)', color: "var(--static-white)", fontVariantNumeric: "tabular-nums" }}>{item.value}{data.unit ?? ""}</span>
                </div>
              ))}
            </m.div>
          )}
        </AnimatePresence>
      </div>
      {data.lines.length > 1 && (
        <div style={{ display: "flex", gap: 'var(--space-3)', marginTop: 'var(--space-2)', flexWrap: "wrap" }}>
          {data.lines.map((line, li) => (
            <div key={line.label ?? `legend-${li}`} style={{ display: "flex", alignItems: "center", gap: 'var(--space-1)' }}>
              <div style={{ width: 12, height: 2, background: line.color ?? LINE_COLORS[li % LINE_COLORS.length], borderRadius: 'var(--radius-xs)' }} />
              <span style={{ fontSize: 'var(--font-size-small)', color: "var(--neutral-500)" }}>{line.label}</span>
            </div>
          ))}
        </div>
      )}
    </m.div>
  );
}
