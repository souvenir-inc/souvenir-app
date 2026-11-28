// shadows-exact codemod: which shadow layers it can read, and which it must leave alone.
import { describe, expect, it } from "vitest";
import { parseLayer, transformTsx, transformValue } from "./shadows-exact.mjs";

describe("parseLayer", () => {
  it("reads px layers, with or without inset, colour first or last", () => {
    expect(parseLayer("0 1px 2px rgba(0,0,0,0.1)")).toEqual({ inset: false, lens: [0, 1, 2, 0], colour: "rgba(0,0,0,0.1)" });
    expect(parseLayer("0 -1px 2px #000")?.lens).toEqual([0, -1, 2, 0]);
    expect(parseLayer("inset 0 0 0 1px var(--neutral-200)")).toEqual({ inset: true, lens: [0, 0, 0, 1], colour: "var(--neutral-200)" });
    expect(parseLayer("rgba(0,0,0,.2) 0 4px 12px")?.colour).toBe("rgba(0,0,0,.2)");
  });

  it("leaves a layer with a length it can't compare to the px scale", () => {
    for (const layer of [
      "0 1rem 2px rgba(0,0,0,.1)",
      "0 +1rem 2px #000",
      "0 0.5em 2px #000",
      "0 calc(1rem) 2px #000",
      "0 clamp(1px, 2vw, 4px) 2px #000",
    ]) expect(parseLayer(layer)).toBeNull();
  });

  it("leaves a layer with two non-length tokens: one may be a length", () => {
    expect(parseLayer("0px 2px 2.8px var(--spread) rgba(82,75,71,0.12)")).toBeNull();
    // A single var() colour is still a colour.
    expect(parseLayer("0 1px 2px var(--shadow-colour)")?.colour).toBe("var(--shadow-colour)");
  });
});

describe("transformValue", () => {
  it("does not drop a var() spread by matching the rest of the layer to a token", () => {
    const counter = { n: 0 };
    const value = "0px 2px 2.8px var(--spread) rgba(82,75,71,0.12)";
    expect(transformValue(value, counter)).toBe(value);
    expect(counter.n).toBe(0);
  });

  it("keeps differently cased custom properties apart, and still ignores case in hex", () => {
    // --shadow-panel is --shadow-soft plus a ring in var(--neutral-200). The same shadow
    // with var(--Neutral-200), a different property, must not be taken for it.
    const soft = "0px 2px 2.8px rgba(82,75,71,0.12)";
    expect(transformValue(`${soft}, 0px 0px 0px 1px var(--neutral-200)`, { n: 0 })).toBe("var(--shadow-panel)");
    const other = `${soft}, 0px 0px 0px 1px var(--Neutral-200)`;
    expect(transformValue(other, { n: 0 })).not.toBe("var(--shadow-panel)");
    // Case outside var() is still ignored: RGBA() matches the same token as rgba().
    const token = transformValue("0px 2px 2.8px rgba(82,75,71,0.12)", { n: 0 });
    expect(token).toMatch(/^var\(--shadow-/);
    expect(transformValue("0px 2px 2.8px RGBA(82,75,71,0.12)", { n: 0 })).toBe(token);
  });

  it("still swaps the same shadow for its token when nothing is ambiguous", () => {
    const counter = { n: 0 };
    expect(transformValue("0px 2px 2.8px rgba(82,75,71,0.12)", counter)).toMatch(/^var\(--shadow-[a-z0-9-]+\)$/);
    expect(counter.n).toBe(1);
  });
});

describe("transformTsx", () => {
  it("leaves look-alike text in strings and comments, and converts a real declaration", () => {
    const shadow = "0px 2px 2.8px rgba(82,75,71,0.12)";
    const src = [
      `const doc = "boxShadow: '${shadow}'"`,
      `// boxShadow: '${shadow}'`,
      `<div style={{ boxShadow: '${shadow}' }} />`,
    ].join("\n");
    const out = transformTsx(src, { n: 0 }).split("\n");
    expect(out[0]).toContain(shadow);
    expect(out[1]).toContain(shadow);
    expect(out[2]).toMatch(/boxShadow: 'var\(--shadow-[a-z0-9-]+\)'/);
  });

  it("leaves a literal that an expression goes on to use", () => {
    const src = `<div style={{ boxShadow: '0px 2px 2.8px rgba(82,75,71,0.12)'.replace('2.8px', '8px') }} />`;
    expect(transformTsx(src, { n: 0 })).toBe(src);
    expect(transformTsx(`const SHADOW_A = '0px 2px 2.8px rgba(82,75,71,0.12)'`, { n: 0 })).toMatch(/= 'var\(--shadow-/);
  });
});

describe("token choice", () => {
  it("never borrows a component-named token, even for an exact match", async () => {
    const fs = await import("node:fs");
    const css = fs.readFileSync(new URL("../../src/styles/tokens/semantic.css", import.meta.url), "utf8")
      + fs.readFileSync(new URL("../../src/styles/tokens/theme.css", import.meta.url), "utf8");
    const value = css.match(/--shadow-chat-input\s*:\s*([^;]+);/)?.[1].replace(/\s+/g, " ").trim();
    expect(value).toBeTruthy();
    expect(transformValue(value, { n: 0 })).not.toContain("--shadow-chat-input");
  });
});

describe("identifiers", () => {
  it("only matches whole boxShadow / SHADOW_ names", () => {
    const shadow = "0px 2px 2.8px rgba(82,75,71,0.12)";
    for (const src of [`const rawboxShadow = '${shadow}';`, `const MY_SHADOW_X = '${shadow}';`]) {
      expect(transformTsx(src, { n: 0 })).toBe(src);
    }
    expect(transformTsx(`const SHADOW_X = '${shadow}';`, { n: 0 })).toMatch(/'var\(--shadow-/);
  });

  it("leaves literal types in type and interface bodies alone", () => {
    const shadow = "0px 2px 2.8px rgba(82,75,71,0.12)";
    for (const src of [
      `type Fixed = { boxShadow: '${shadow}' };`,
      `interface Fixed { boxShadow: '${shadow}' }`,
      `type Nested = { card: { boxShadow: '${shadow}' } };`,
    ]) expect(transformTsx(src, { n: 0 })).toBe(src);
    // A runtime object is still converted.
    expect(transformTsx(`const style = { boxShadow: '${shadow}' };`, { n: 0 })).toMatch(/'var\(--shadow-/);
  });

  it("leaves a ternary branch alone, and still converts a property", () => {
    const shadow = "0px 2px 2.8px rgba(82,75,71,0.12)";
    const src = `const raw = compact ? boxShadow : '${shadow}';`;
    expect(transformTsx(src, { n: 0 })).toBe(src);
    expect(transformTsx(`const s = {\n  boxShadow: '${shadow}',\n}`, { n: 0 })).toMatch(/boxShadow: 'var\(--shadow-/);
  });
});

describe("transformCss", () => {
  it("converts box-shadow but not a custom property whose name ends in it", async () => {
    const { transformCss } = await import("./shadows-exact.mjs");
    const shadow = "0px 2px 2.8px rgba(82,75,71,0.12)";
    const custom = `.icon { --icon-box-shadow: ${shadow}; filter: drop-shadow(var(--icon-box-shadow)); }`;
    expect(transformCss(custom, { n: 0 })).toBe(custom);
    expect(transformCss(`.card { box-shadow: ${shadow}; }`, { n: 0 })).toMatch(/box-shadow: var\(--shadow-/);
  });
});
describe("regex literals", () => {
  it("leaves shadow text inside a regex literal alone", () => {
    const src = "const pattern = /[{boxShadow: '0px 2px 2.8px rgba(82,75,71,0.12)'}]/;";
    expect(transformTsx(src, { n: 0 })).toBe(src);
    expect(transformTsx("const s = { boxShadow: '0px 2px 2.8px rgba(82,75,71,0.12)' };", { n: 0 })).toContain("'var(--shadow-");
  });
});


describe("JSX text", () => {
  it("leaves displayed text that reads like a property alone, and converts real styles", () => {
    const shadow = "0px 2px 2.8px rgba(82,75,71,0.12)";
    const src = `const view = <p>\nboxShadow: '${shadow}',\n</p>;`;
    expect(transformTsx(src, { n: 0 })).toBe(src);
    expect(transformTsx(`const s = {\n  boxShadow: '${shadow}',\n}`, { n: 0 })).toMatch(/boxShadow: 'var\(--shadow-/);
  });
});
