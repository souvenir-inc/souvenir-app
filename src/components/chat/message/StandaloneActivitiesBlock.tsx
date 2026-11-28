"use client";

import React, { useState } from "react";
import { m } from "framer-motion";
import { ActivitiesSection } from "../ActivityRow";
import type { ActivityItem } from "@/types/chat";
import { SPRING } from "@/styles/tokens/motion"

// ── Standalone Activities Block (collapsible, used when no reasoning) ─────────

const wrapperStyle: React.CSSProperties = { margin: "var(--space-1) 0 var(--space-2)" };

const headerRowStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 'var(--space-1-5)', minHeight: 20, userSelect: "none" };

const summaryStyle: React.CSSProperties = {
  fontSize: 'var(--font-size-body)',
  color: "var(--neutral-600)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  flex: 1,
  minWidth: 0,
};

const toggleStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  cursor: "pointer",
  padding: 'var(--space-0-5)',
  display: "flex",
  alignItems: "center",
  borderRadius: 'var(--radius-xs)',
  flexShrink: 0,
};

const chevronStyle: React.CSSProperties = { display: "block", flexShrink: 0 };

const clipStyle: React.CSSProperties = { overflow: "hidden", minHeight: 0 };

const panelStyle: React.CSSProperties = { paddingTop: 'var(--space-2-5)' };

export function StandaloneActivitiesBlock({
  activities,
}: {
  activities: ActivityItem[];
}) {
  const [isOpen, setIsOpen] = useState(true);

  // Derive summary for collapsed state
  const doneCount = activities.filter((a) => a.status === "done").length;
  const allDone = doneCount === activities.length;
  const summaryText = allDone
    ? `${activities.length} ${activities.length === 1 ? "action" : "actions"} completed`
    : `${doneCount}/${activities.length} actions`;

  return (
    <div style={wrapperStyle}>
      {/* Header row - summary + chevron. Logo/model name live in the
          message-level attribution header above this block, not here. */}
      <div draggable={false} style={headerRowStyle}>
        <span style={summaryStyle}>
          {summaryText}
        </span>
        <button
          onClick={() => setIsOpen(!isOpen)}
          type="button"
          style={toggleStyle}
        >
          <m.svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ type: "spring", ...SPRING.brisk }}
            style={chevronStyle}
          >
            <path
              d="M3 5.5 L7 9.5 L11 5.5"
              stroke="var(--neutral-300)"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </m.svg>
        </button>
      </div>

      {/* Collapsible activities panel — grid-rows collapse instead of
          animating `height`, so the transition runs on the compositor
          instead of forcing a layout recalculation every frame. */}
      <div
        aria-hidden={!isOpen}
        style={{
          display: "grid",
          gridTemplateRows: isOpen ? "1fr" : "0fr",
          opacity: isOpen ? 1 : 0,
          visibility: isOpen ? "visible" : "hidden",
          transition: `grid-template-rows var(--standalone-activities-block-reveal-duration) var(--ease-out-expo), opacity var(--standalone-activities-block-fade-duration) ease, visibility 0s linear ${isOpen ? "0s" : "var(--standalone-activities-block-duration)"}`,
        }}
      >
        <div style={clipStyle}>
          <div style={panelStyle}>
            <ActivitiesSection activities={activities} />
          </div>
        </div>
      </div>
    </div>
  );
}
