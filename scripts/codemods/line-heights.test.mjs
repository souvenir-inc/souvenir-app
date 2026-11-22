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
      // A spread can override fontSize: no pairing with the small size it would hide.
      const spread = [
        "const s = {",
        "  fontSize: 'var(--font-size-small)',",
        "  ...{ fontSize: 'var(--font-size-body-sm)' },",
        "  lineHeight: '18px',",
        "}",
      ].join("\n");
      expect(tsx(spread)).not.toContain("--line-height-small");
      // A brace inside a string is not a block boundary: fontSize is still this object's.
      const quoted = [
        "const style = {",
        "  fontSize: 'var(--font-size-small)',",
        "  fontFamily: '{',",
        "  lineHeight: '18px',",
        "};",
      ].join("\n");
      expect(tsx(quoted)).toContain("lineHeight: 'var(--line-height-small)'");
      // --font-size is a custom property, not font-size: the pair stays with font-size.
      const custom = [
        ".card {",
        "  font-size: var(--font-size-small);",
        "  --font-size: var(--font-size-body-sm);",
        "  line-height: 18px;",
        "}",
      ].join("\n");
      expect(transform(custom, true, { exact: 0, unitless: 0, snapped: 0 })).toContain("line-height: var(--line-height-small);");
      // A custom property whose name ends in line-height is left alone; the real one converts.
      const grid = [".grid {", "  --grid-line-height: 18px;", "  grid-auto-rows: var(--grid-line-height);", "}"].join("\n");
      expect(transform(grid, true, { exact: 0, unitless: 0, snapped: 0 })).toBe(grid);
      // Text in a string that looks like a declaration is not one.
      const content = [
        ".label::before {",
        "  font-size: var(--font-size-small);",
        '  content: "font-size: var(--font-size-body-sm)";',
        "  line-height: 18px;",
        "}",
      ].join("\n");
      expect(transform(content, true, { exact: 0, unitless: 0, snapped: 0 })).toContain("line-height: var(--line-height-small);");
      expect(transform(".a { font-size: var(--font-size-small); line-height: 18px; }", true, { exact: 0, unitless: 0, snapped: 0 })).toContain("line-height: var(--line-height-small);");
    } finally {
      setSnap(false);
    }
  });
});

describe("unquoted CSS urls", () => {
  it("leaves line-height text inside url(…) alone and still converts a real declaration", () => {
    const css = ".a { background-image: url(/assets/line-height:1.5;icon.svg); }";
    expect(transform(css, true, { exact: 0, unitless: 0, snapped: 0 })).toBe(css);
    expect(transform(".a { line-height: 1.5; }", true, { exact: 0, unitless: 0, snapped: 0 })).toContain("line-height: var(--leading-normal);");
  });
});

describe("type bodies", () => {
  it("leaves lineHeight literal types alone and converts runtime properties", () => {
    const type = "type Fixed = { lineHeight: 1.5 };";
    expect(tsx(type)).toBe(type);
    expect(tsx("interface Fixed { lineHeight: 1.5, }")).toBe("interface Fixed { lineHeight: 1.5, }");
    expect(tsx("const s = { lineHeight: 1.5, }")).toContain("lineHeight: 'var(--leading-normal)'");
  });
});

describe("quoted keys", () => {
  it("pairs with a quoted fontSize key", async () => {
    const { setSnap } = await import("./line-heights.mjs");
    setSnap(true);
    try {
      const src = `const s = { "fontSize": "var(--font-size-small)", lineHeight: "18px" }`;
      expect(tsx(src)).toContain("lineHeight: 'var(--line-height-small)'");
      expect(tsx(`const s = { fontSize: 'var(--font-size-small)', lineHeight: '18px' }`)).toContain("lineHeight: 'var(--line-height-small)'");
      // A fontSize inside a value is not a declaration: the pair stays with the real one.
      const ternary = [
        "const s = {",
        "  fontSize: 'var(--font-size-small)',",
        "  padding: compact ? fontSize : 'var(--font-size-body-sm)',",
        "  lineHeight: '18px',",
        "}",
      ].join("\n");
      expect(tsx(ternary)).toContain("lineHeight: 'var(--line-height-small)'");
      // CSS has no line comments: the `//` of a url is text, and the font-size after it pairs.
      const url = transform(".a {\n  background-image: url(https://example.test/icon.svg); font-size: var(--font-size-small);\n  line-height: 18px;\n}", true, { exact: 0, unitless: 0, snapped: 0 });
      expect(url).toContain("line-height: var(--line-height-small);");
      // A `//` inside a string is not a comment: the font-size after it still pairs.
      const slashes = transform('.a::before {\n  content: "//"; font-size: var(--font-size-small);\n  line-height: 18px;\n}', true, { exact: 0, unitless: 0, snapped: 0 });
      expect(slashes).toContain("line-height: var(--line-height-small);");
      // `!important` is not part of the value, and an important declaration wins over a later one.
      const imp = transform(".a {\n  font-size: var(--font-size-small) !important;\n  line-height: 18px;\n}", true, { exact: 0, unitless: 0, snapped: 0 });
      expect(imp).toContain("line-height: var(--line-height-small);");
      const impFirst = transform(".a {\n  font-size: var(--font-size-small) !important;\n  font-size: var(--font-size-body-sm);\n  line-height: 18px;\n}", true, { exact: 0, unitless: 0, snapped: 0 });
      expect(impFirst).toContain("line-height: var(--line-height-small);");
      // A later `font` shorthand sets font-size too: the longhand is not the pair.
      const css = [".a {", "  font-size: var(--font-size-small);", "  font: var(--font-size-body-sm) sans-serif;", "  line-height: 18px;", "}"].join("\n");
      expect(transform(css, true, { exact: 0, unitless: 0, snapped: 0 })).not.toContain("--line-height-small");
    } finally {
      setSnap(false);
    }
  });
});

describe("regular expressions", () => {
  it("leaves a regex literal that contains lineHeight alone", () => {
    const src = "const pattern = /\{lineHeight: 1.5,\}/;";
    expect(tsx(src)).toBe(src);
    expect(tsx("const s = { lineHeight: 1.5, }; const ratio = a / b;")).toContain("lineHeight: 'var(--leading-normal)'");
  });
});
