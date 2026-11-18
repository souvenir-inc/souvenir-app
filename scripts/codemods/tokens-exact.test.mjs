// tokens-exact codemod: what it rewrites, and the look-alike text it must leave alone.
import { describe, expect, it } from "vitest";
import { transformCss, transformTsx } from "./tokens-exact.mjs";

const tsx = (src) => transformTsx(src, { n: 0 });
const css = (src) => transformCss(src, { n: 0 });

describe("tokens-exact on TSX", () => {
  it("replaces a style value with the token that holds it exactly", () => {
    expect(tsx(`<div style={{ padding: 16 }} />`)).toBe(`<div style={{ padding: 'var(--space-4)' }} />`);
  });

  it("leaves a nested object literal inside a style alone", () => {
    const out = tsx(`<div style={{ padding: 16, transition: { gap: 8 } as any }} />`);
    expect(out).toContain(`padding: 'var(--space-4)'`);
    expect(out).toContain(`{ gap: 8 }`);
  });

  it("does not walk back to an unrelated object for `x as CSSProperties`", () => {
    const src = `const other = { padding: 16 }\nconst cast = other as React.CSSProperties\n`;
    expect(tsx(src)).toBe(src);
  });

  it("matches CSSProperties only as a whole identifier", () => {
    for (const name of ["CSSPropertiesConfig", "CSSProperties$Config", "CSSProperties_2"]) {
      const src = `const c = { padding: 16 } as ${name}\n`;
      expect(tsx(src)).toBe(src);
    }
    expect(tsx(`const c = { padding: 16 } as CSSProperties\n`)).toContain(`padding: 'var(--space-4)'`);
  });

  it("reads a quote after a keyword as the start of a string", () => {
    const src = [
      `if (typeof'style={{ padding: 16 }}' === "string") {}`,
      `switch (k) { case'style={{ padding: 8 }}': break }`,
      `function f() { return'style={{ gap: 8 }}' }`,
    ].join("\n");
    expect(tsx(src)).toBe(src);
  });

  it("leaves style-like text inside strings and comments alone", () => {
    const src = [
      `const doc = "style={{ padding: 16 }}"`,
      `// style={{ padding: 16 }}`,
      `/* const s: CSSProperties = { padding: 16 } */`,
      `<div style={{ content: 'padding: 16', margin: 8 }} />`,
    ].join("\n");
    const out = tsx(src);
    expect(out).toContain(`"style={{ padding: 16 }}"`);
    expect(out).toContain(`// style={{ padding: 16 }}`);
    expect(out).toContain(`{ padding: 16 } */`);
    expect(out).toContain(`content: 'padding: 16', margin: 'var(--space-2)'`);
  });

  it("leaves the false branch of a conditional alone", () => {
    const out = tsx(`<div style={{ padding: wide ? gap : 8, margin: 8 }} />`);
    expect(out).toContain(`wide ? gap : 8`);
    expect(out).toContain(`margin: 'var(--space-2)'`);
  });

  it("is not cut short by a brace inside a comment", () => {
    expect(tsx(`<div style={{ /* } */ padding: 16 }} />`)).toContain(`padding: 'var(--space-4)'`);
  });

  it("does not split a value that continues on the next line", () => {
    const src = `<div style={{ padding: 16\n  * scale }} />`;
    expect(tsx(src)).toBe(src);
  });

  it("still converts after an apostrophe in JSX text", () => {
    expect(tsx(`<p>Don't wait</p>\n<div style={{ padding: 16 }} />`)).toContain(`padding: 'var(--space-4)'`);
  });
});

describe("tokens-exact on CSS", () => {
  it("replaces a declaration", () => {
    expect(css(`.a { padding: 16px; }`)).toBe(`.a { padding: var(--space-4); }`);
  });

  it("leaves declarations inside comments and strings alone", () => {
    const src = `/* padding: 16px; */\n.a { content: "padding: 16px;"; margin: 8px; }`;
    const out = css(src);
    expect(out).toContain(`/* padding: 16px; */`);
    expect(out).toContain(`content: "padding: 16px;"`);
    expect(out).toContain(`margin: var(--space-2);`);
  });
});
