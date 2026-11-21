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
        borderRadius: 'var(--radius-lg)',
        backgroundColor: "var(--neutral-50)",
        padding: 'var(--space-3)',
        boxSizing: "border-box",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- static decorative export, not a Next Image candidate */}
      <img
        src="/onboarding/slack-preview.png"
        alt=""
        style={{ display: "block", width: "100%", height: "auto", borderRadius: 'var(--radius-sm)' }}
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
          gap: 'var(--space-5)',
          width: 412,
          maxWidth: "calc(100vw - 48px)",
          borderRadius: 'var(--radius-2xl)',
          backgroundColor: "var(--modal-bg)",
          padding: 'var(--space-4)',
          boxSizing: "border-box",
          overflow: "visible",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 'var(--space-2)' }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 'var(--space-1)' }}>
            <DialogTitle style={{ fontFamily: "var(--font-body)", fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-heading-md)', lineHeight: "var(--line-height-heading-sm)", color: "var(--neutral-700)", margin: 0 }}>
              Add Souvenir to Slack
            </DialogTitle>
            <DialogDescription style={{ fontFamily: "var(--font-body)", fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-body)', lineHeight: "var(--line-height-small)", color: "var(--neutral-600)", margin: 0 }}>
              Bring Souvenir right into your workspace, ready for your workspace to use.
            </DialogDescription>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 'var(--space-0-5)', borderRadius: 'var(--radius-sm)', display: "flex", color: "var(--neutral-700)", flexShrink: 0 }}
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
