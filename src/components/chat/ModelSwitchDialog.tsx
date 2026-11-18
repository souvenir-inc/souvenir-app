"use client";

import { AnimatePresence, m } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AIModel } from "@/types/ai-model";
import { ModelIcon } from "@/components/ModelIcon";

interface ModelSwitchDialogProps {
  isOpen: boolean;
  fromModel: AIModel | null;
  toModel: AIModel | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ModelSwitchDialog({
  isOpen,
  fromModel,
  toModel,
  onConfirm,
  onCancel,
}: ModelSwitchDialogProps) {
  return (
    <AnimatePresence>
      {isOpen && fromModel && toModel && (
        <>
          {/* Backdrop */}
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 'var(--z-overlay)',
              backgroundColor: "color-mix(in srgb, var(--static-black) 40%, transparent)",
            }}
          />

          {/* Dialog */}
          <m.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            role="alertdialog"
            aria-labelledby="model-switch-title"
            aria-describedby="model-switch-desc"
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 'var(--z-modal)',
              width: "400px",
              maxWidth: "calc(100vw - 32px)",
              backgroundColor: "var(--modal-bg)",
              borderRadius: "var(--radius-2xl)",
              boxShadow: "var(--shadow-xl)",
              padding: "var(--space-6)",
            }}
          >
            {/* Warning icon */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "40px",
                height: "40px",
                borderRadius: "var(--radius-lg)",
                backgroundColor: "var(--yellow-50)",
                marginBottom: "var(--space-4)",
              }}
            >
              <AlertTriangle size={20} style={{ color: "var(--yellow-600)" }} />
            </div>

            <h3
              id="model-switch-title"
              style={{
                fontFamily: "var(--font-body)",
                fontSize: "var(--font-size-body-lg)",
                fontWeight: "var(--font-weight-semibold)",
                color: "var(--neutral-900)",
                margin: "0 0 var(--space-2)",
              }}
            >
              Switch model mid-chat?
            </h3>

            <p
              id="model-switch-desc"
              style={{
                fontFamily: "var(--font-body)",
                fontSize: "var(--font-size-body-sm)",
                color: "var(--neutral-600)",
                lineHeight: 1.5,
                margin: "0 0 var(--space-5)",
              }}
            >
              Switching from{" "}
              <strong>{fromModel.modelName}</strong> to{" "}
              <strong>{toModel.modelName}</strong>. Your conversation history
              will be preserved, but the new model may respond differently.
            </p>

            {/* Model comparison */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-3)",
                padding: "var(--space-3)",
                borderRadius: "var(--radius-lg)",
                backgroundColor: "var(--neutral-50)",
                marginBottom: "var(--space-5)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flex: 1 }}>
                <span style={{ lineHeight: 0, flexShrink: 0 }}>
                  <ModelIcon model={fromModel.companyName ?? fromModel.modelName} size={20} />
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: "var(--font-size-small)",
                    color: "var(--neutral-600)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {fromModel.modelName}
                </span>
              </div>

              <span style={{ color: "var(--neutral-600)", fontSize: "var(--font-size-body)" }}>→</span>

              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flex: 1 }}>
                <span style={{ lineHeight: 0, flexShrink: 0 }}>
                  <ModelIcon model={toModel.companyName ?? toModel.modelName} size={20} />
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: "var(--font-size-small)",
                    color: "var(--neutral-900)",
                    fontWeight: "var(--font-weight-medium)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {toModel.modelName}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end" }}>
              <Button variant="cancel" size="sm" onClick={onCancel}>
                Cancel
              </Button>
              <Button variant="default" size="sm" onClick={onConfirm}>
                Switch Model
              </Button>
            </div>
          </m.div>
        </>
      )}
    </AnimatePresence>
  );
}
