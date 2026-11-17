"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface DeleteChatDialogProps {
  open: boolean;
  chatTitle: string;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export function DeleteChatDialog({
  open,
  chatTitle,
  onConfirm,
  onCancel,
}: DeleteChatDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirm = async () => {
    setIsDeleting(true);
    try {
      await onConfirm();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !isDeleting) onCancel();
      }}
    >
      <DialogContent
        size="sm"
        hideClose
        style={{
          backgroundColor: "var(--modal-bg)",
          borderRadius: "16px",
          padding: "24px",
          width: "min(420px, 90vw)",
          boxShadow:
            "0 8px 32px color-mix(in srgb, var(--static-black) 12%, transparent), 0 2px 8px color-mix(in srgb, var(--static-black) 8%, transparent)",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <DialogTitle
            style={{
              fontFamily: "var(--font-body)",
              fontWeight: "var(--font-weight-semibold)",
              fontSize: "var(--font-size-body-lg, 16px)",
              lineHeight: "var(--line-height-body)",
              color: "var(--neutral-900)",
              margin: 0,
            }}
          >
            Delete chat?
          </DialogTitle>
          <DialogDescription
            style={{
              fontFamily: "var(--font-body)",
              fontWeight: "var(--font-weight-regular)",
              fontSize: "var(--font-size-body)",
              lineHeight: "var(--line-height-body)",
              color: "var(--neutral-500)",
              margin: 0,
            }}
          >
            &ldquo;{chatTitle.length > 60 ? chatTitle.slice(0, 60) + "…" : chatTitle}&rdquo; will
            be permanently deleted. This can&rsquo;t be undone.
          </DialogDescription>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "8px",
          }}
        >
          <Button variant="ghost" onClick={onCancel} disabled={isDeleting}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleConfirm} disabled={isDeleting} loading={isDeleting}>
            Delete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
