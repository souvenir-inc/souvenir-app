// shadows-exact codemod: which shadow layers it can read, and which it must leave alone.
import { describe, expect, it } from "vitest";
import { parseLayer } from "./shadows-exact.mjs";

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
});
