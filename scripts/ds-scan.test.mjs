import { describe, expect, it } from "vitest";

import { cssDeclarations, inlineDeclarations } from "./ds-scan.mjs";

// Each declaration is [property, value, kept]: kept is true when a `ds-keep` marker follows on its line.
describe("cssDeclarations", () => {
  it("collects declarations that follow each other with no space", () => {
    expect(cssDeclarations(".a{padding:16px;margin:8px;}")).toEqual([["padding", "16px", false], ["margin", "8px", false]]);
  });

  it("collects spaced declarations and leaves custom properties out", () => {
    expect(cssDeclarations(".a {\n  color: red;\n  --x: 1px;\n  gap: 4px;\n}")).toEqual([["color", "red", false], ["gap", "4px", false]]);
  });
});

describe("inlineDeclarations", () => {
  it("reads a value whole, commas inside brackets included", () => {
    expect(inlineDeclarations(" background: 'color-mix(in srgb, var(--a) 40%, transparent)', gap: 4 ")).toEqual([
      ["background", "'color-mix(in srgb, var(--a) 40%, transparent)'", false],
      ["gap", "4", false],
    ]);
  });

  it("marks a value kept when the ds-keep marker follows it on its line", () => {
    expect(inlineDeclarations(" borderRadius: 10, __DS_KEEP__\n gap: 8 ")).toEqual([
      ["borderRadius", "10", true],
      ["gap", "8", false],
    ]);
  });
});
