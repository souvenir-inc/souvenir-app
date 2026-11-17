"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CancelOneIcon } from "@strange-huge/icons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { getSlackInstallUrl } from "@/lib/api/slack";

// ── A1 screen 5 / A2 screen 3 — "Into the app" + "Add Souvenir to Slack" modal ──
// Figma: node 55:2475 (A1), 182:10127 (A2, same modal design). This is not a
// dedicated onboarding step — it's a modal shown over the home/new-chat page
// right after onboarding completes. The illustration behind the copy (a Slack
// message-composer preview with the Souvenir app mention) is a static export
// (public/onboarding/slack-preview.png) rather than a rebuilt Slack UI mockup —
// it's purely decorative and not interactive in the design.

function SlackPreviewIllustration() {
  return (
    <div
      style={{
        width: "100%",
        borderRadius: 10,
        backgroundColor: "var(--neutral-50)",
        padding: 12,
        boxSizing: "border-box",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- static decorative export, not a Next Image candidate */}
      <img
        src="/onboarding/slack-preview.png"
        alt=""
        style={{ display: "block", width: "100%", height: "auto", borderRadius: 6 }}
      />
    </div>
  );
}

export function AddSouvenirToSlackModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [connecting, setConnecting] = useState(false);

  if (!isOpen) return null;

  const handleAddToSlack = async () => {
    if (connecting) return;
    setConnecting(true);
    try {
      const url = await getSlackInstallUrl();
      window.location.href = url;
    } catch (err) {
      setConnecting(false);
      toast.error(err instanceof Error ? err.message : "Couldn't start Slack setup — please try again.");
    }
  };

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent
        hideClose
        style={{
          gap: 20,
          width: 412,
          maxWidth: "calc(100vw - 48px)",
          borderRadius: 18,
          backgroundColor: "var(--modal-bg)",
          padding: 16,
          boxSizing: "border-box",
          overflow: "visible",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
            <DialogTitle style={{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: 20, lineHeight: "24px", color: "var(--neutral-700,#524b47)", margin: 0 }}>
              Add Souvenir to Slack
            </DialogTitle>
            <DialogDescription style={{ fontFamily: "var(--font-body)", fontWeight: 400, fontSize: 14, lineHeight: "16px", color: "var(--neutral-600,#6a625d)", margin: 0 }}>
              Bring Souvenir right into your workspace, ready for your workspace to use.
            </DialogDescription>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 3, borderRadius: 6, display: "flex", color: "var(--neutral-700,#524b47)", flexShrink: 0 }}
          >
            <CancelOneIcon size={18} />
          </button>
        </div>

        <SlackPreviewIllustration />

        <Button fluid size="sm" loading={connecting} onClick={() => void handleAddToSlack()}>
          Add Souvenir to Slack
        </Button>
      </DialogContent>
    </Dialog>
  );
}
