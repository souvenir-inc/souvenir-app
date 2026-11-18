"use client";

import React, { useState } from "react";
import Image from "next/image";
import { ImageLightbox, downloadImage } from "./ImageLightbox";
import type { Attachment } from "@/types/chat";

// ── An image the person attached to their own message: the same tile the
//    composer previewed, and the same lightbox a generated image opens ──

const cardStyle: React.CSSProperties = {
  position:        "relative",
  display:         "inline-flex",
  alignItems:      "center",
  gap:             "var(--space-2-5)",
  padding:         "var(--space-1-5)",
  paddingRight:    "var(--space-3)",
  borderRadius:    "var(--radius-xl)",
  backgroundColor: "color-mix(in srgb, var(--neutral-800) 7%, transparent)",
  border:          "1px solid var(--neutral-800-10)",
  maxWidth:        "260px",
};

// The tile is a button (keyboard-reachable, opens the lightbox) that looks like the bare image.
const tileButtonStyle: React.CSSProperties = {
  position:     "relative",
  width:        56,
  height:       56,
  padding:      0,
  border:       "none",
  background:   "none",
  borderRadius: 'var(--radius-lg)',
  overflow:     "hidden",
  flexShrink:   0,
  cursor:       "zoom-in",
};

const textStyle: React.CSSProperties = {
  display:       "flex",
  flexDirection: "column",
  gap:           'var(--space-0-5)',
  minWidth:      0,
};

const nameStyle: React.CSSProperties = {
  fontFamily:   "var(--font-body)",
  fontSize:     "var(--font-size-small)",
  fontWeight:   'var(--font-weight-medium)',
  color:        "var(--neutral-700)",
  overflow:     "hidden",
  textOverflow: "ellipsis",
  whiteSpace:   "nowrap",
};

const metaStyle: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize:   "var(--font-size-small)",
  color:      "var(--neutral-600)",
  flexShrink: 0,
};

export function SentImageAttachment({ att, url, uploading }: { att: Attachment; url: string; uploading?: boolean }) {
  const [expanded, setExpanded] = useState(false);

  const ext = att.file_name.split(".").pop()?.toUpperCase() ?? "IMAGE";
  // While the file is still going up the picture is shown dimmed, with the
  // progress in place of the file type, so the tile doesn't claim to be sent yet.
  const meta = uploading
    ? (att.uploadProgress !== undefined && att.uploadProgress < 100 ? `${att.uploadProgress}%` : "Uploading…")
    : ext;

  function handleDownload() {
    downloadImage(url, att.file_name || "image.png");
  }

  // No hover overlay here, unlike the generated-image card: its buttons need a
  // 320px card to sit on, and over a 56px tile they would cover the picture and
  // swallow the click that opens it. Expand and Download live in the lightbox.
  return (
    <div style={cardStyle}>
      <button
        type="button"
        onClick={() => setExpanded(true)}
        aria-label={`Expand ${att.file_name || "image"}`}
        className="focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        style={tileButtonStyle}
      >
        <Image src={url} alt="" fill sizes="56px" unoptimized style={{ objectFit: "cover", opacity: uploading ? 0.55 : 1, transition: "opacity var(--duration-fast) ease" }} />
      </button>
      <span style={textStyle}>
        <span style={nameStyle}>{att.file_name}</span>
        <span style={metaStyle}>{meta}</span>
      </span>
      <ImageLightbox
        open={expanded}
        onOpenChange={setExpanded}
        url={url}
        alt={att.file_name || "Attached image"}
        onDownload={handleDownload}
      />
    </div>
  );
}
