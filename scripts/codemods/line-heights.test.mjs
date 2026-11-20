// line-heights codemod: static literals convert; a value continuing on the next line does not.
import { describe, expect, it } from "vitest";
import { transform } from "./line-heights.mjs";

const tsx = (src) => transform(src, false, { exact: 0, unitless: 0, snapped: 0 });

describe("line-heights on TSX", () => {
  it("converts a comma-terminated unitless value", () => {
    expect(tsx(`<div style={{ lineHeight: 1.5, padding: 4 }} />`)).toContain(`lineHeight: 'var(--leading-normal)'`);
  });

  it("converts a value that is the last before the closing brace on the next line", () => {
    expect(tsx(`<div style={{ lineHeight: 1.5\n}} />`)).toContain(`lineHeight: 'var(--leading-normal)'`);
  });

  it("converts an on-scale px value", () => {
    expect(tsx(`<div style={{ fontSize: 14, lineHeight: '22px' }} />`)).toContain(`lineHeight: 'var(--line-height-body)'`);
  });

  it("leaves look-alike text inside strings and comments alone", () => {
    const src = [
      `const doc = "lineHeight: 1.5, padding: 4"`,
      `// lineHeight: 1.5,`,
      `<div style={{ lineHeight: 1.5, margin: 0 }} />`,
    ].join("\n");
    const out = tsx(src);
    expect(out).toContain(`"lineHeight: 1.5, padding: 4"`);
    expect(out).toContain(`// lineHeight: 1.5,`);
    expect(out).toContain(`lineHeight: 'var(--leading-normal)', margin: 0`);
  });

  it("leaves a ternary branch named lineHeight, and still converts the property", () => {
    const src = `const s = { padding: compact ? lineHeight : 1.5, }`;
    expect(tsx(src)).toBe(src);
    expect(tsx(`const s = { lineHeight: 1.5, }`)).toContain(`lineHeight: 'var(--leading-normal)'`);
  });

  it("leaves a value that continues as an expression on the next line", () => {
    const src = `<div style={{ lineHeight: 1.5\n  * scale, padding: 4 }} />`;
    expect(tsx(src)).toBe(src);
  });
});

describe("line-heights --snap", () => {
  it("pairs with the active fontSize, not a commented-out one", async () => {
    const { setSnap } = await import("./line-heights.mjs");
    setSnap(true);
    try {
      const src = [
        "const style = {",
        "  // fontSize: 'var(--font-size-small)',",
        "  fontSize: 'var(--font-size-body-sm)',",
        "  lineHeight: '18px',",
        "};",
      ].join("\n");
      expect(tsx(src)).toContain("lineHeight: 'var(--line-height-body-sm)'");
      // Nor a nested rule's: it styles something else.
      const css = [
        ".card {",
        "  & .label { font-size: var(--font-size-small); }",
        "  font-size: var(--font-size-body-sm);",
        "  line-height: 18px;",
        "}",
      ].join("\n");
      expect(transform(css, true, { exact: 0, unitless: 0, snapped: 0 })).toContain("line-height: var(--line-height-body-sm);");
      // Two font-sizes in one rule: the last one wins, so that is the pair.
      const twice = [
        ".card {",
        "  font-size: var(--font-size-small);",
        "  font-size: var(--font-size-body-sm);",
        "  line-height: 18px;",
        "}",
      ].join("\n");
      expect(transform(twice, true, { exact: 0, unitless: 0, snapped: 0 })).toContain("line-height: var(--line-height-body-sm);");
    } finally {
      setSnap(false);
    }
  });
});
