"use client";

import React from "react";
import { m } from "framer-motion";
import { PINS_ENABLED } from "@/lib/feature-flags";
import { IconButton } from "@/components/ui/button";
import { Tooltip } from "@/components/Tooltip";
import { PinIcon, CopyOneIcon, RedoIcon, TickTwoIcon } from "@strange-huge/icons";
import { DURATION } from "@/styles/tokens/motion"

// ── Assistant action bar: Pin / Copy / Regenerate ─────────────────────────────

function ActionIconButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip content={label} side="top" sideOffset={6} delayDuration={400}>
      <IconButton
        variant="ghost-2"
        size="xs"
        icon={icon}
        aria-label={label}
        onClick={onClick}
      />
    </Tooltip>
  );
}

/** Fades in once the answer is fully on screen (`revealSettled`); until then
 *  it's laid out but invisible and not clickable. */
export function MessageActionBar({
  revealSettled,
  canUseContentActions,
  showPin,
  pinned,
  copied,
  showRegenerate,
  onPin,
  onCopy,
  onRegenerate,
}: {
  revealSettled: boolean;
  canUseContentActions: boolean;
  showPin: boolean;
  pinned: boolean;
  copied: boolean;
  showRegenerate: boolean;
  onPin: () => void;
  onCopy: () => void;
  onRegenerate?: () => void;
}) {
  return (
    <m.div
      animate={{ opacity: revealSettled ? 1 : 0 }}
      transition={{ duration: DURATION.quick }}
      style={{
        display: "flex",
        gap: 'var(--space-0-5)',
        marginTop: 'var(--space-1)',
        pointerEvents: revealSettled ? "auto" : "none",
      }}
    >
      {PINS_ENABLED && canUseContentActions && showPin && (
        <ActionIconButton
          icon={<PinIcon size={18} color={pinned ? "var(--brown-700)" : "var(--neutral-400)"} />}
          label={pinned ? "Unpin" : "Pin"}
          onClick={onPin}
        />
      )}
      {canUseContentActions && (
        <ActionIconButton
          icon={copied ? <TickTwoIcon size={18} color="var(--success-600)" /> : <CopyOneIcon size={18} color="var(--neutral-400)" />}
          label={copied ? "Copied" : "Copy"}
          onClick={onCopy}
        />
      )}
      {showRegenerate && onRegenerate && (
        <ActionIconButton
          icon={<RedoIcon size={18} color="var(--neutral-400)" />}
          label="Regenerate"
          onClick={onRegenerate}
        />
      )}
    </m.div>
  );
}
