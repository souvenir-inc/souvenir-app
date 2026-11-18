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

  it("leaves a value that continues as an expression on the next line", () => {
    const src = `<div style={{ lineHeight: 1.5\n  * scale, padding: 4 }} />`;
    expect(tsx(src)).toBe(src);
  });
});
