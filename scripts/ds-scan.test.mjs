// ds-scan: which CSS declarations the ratchet counts.
import { describe, expect, it } from "vitest";
import { cssDeclarations } from "./ds-scan.mjs";

describe("cssDeclarations", () => {
  it("collects declarations that follow each other with no space", () => {
    expect(cssDeclarations(".a{padding:16px;margin:8px;}")).toEqual([["padding", "16px"], ["margin", "8px"]]);
  });

  it("collects spaced declarations and leaves custom properties out", () => {
    expect(cssDeclarations(".a {\n  color: red;\n  --x: 1px;\n  gap: 4px;\n}")).toEqual([["color", "red"], ["gap", "4px"]]);
  });
});
