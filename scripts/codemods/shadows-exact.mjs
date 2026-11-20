/**
 * Shadow pass: points hand-written box-shadows at tokens with exactly the same light-theme value.
 *
 *   node scripts/codemods/shadows-exact.mjs <paths…> [--dry]
 *
 * Touches `boxShadow: '…'`, `SHADOW_X = '…'` constants and CSS `box-shadow: …;`. For each value:
 *   1. the whole value equals a `--shadow-*` token        → `var(--shadow-*)`
 *   2. one layer equals a single-layer `--shadow-*` token → that layer becomes `var(--shadow-*)`
 *   3. a ring layer (`[inset] 0 0 0 Npx <colour>`) whose colour equals a palette primitive
 *      → the colour becomes `var(--<primitive>)`. A ring is a border, so following the theme is right.
 *      Blur colours are left alone: flipping them in dark would turn a shadow into a glow.
 * Light pixels never change; in dark the value picks up the token's dark definition.
 * Template strings with `${…}` and lines marked `// ds-keep` are skipped. Same SKIP list as tokens-exact.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// The same string/comment mask as tokens-exact, so the codemods agree on what is code.
import { codeMask, insideRepo } from "./tokens-exact.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const TOKENS = path.join(ROOT, "src/styles/tokens");

// ── Canonical form ──────────────────────────────────────────────────────────
// Case doesn't matter in hex digits or function names, but custom-property names are
// case-sensitive: var(--Brand) and var(--brand) are different properties. So everything
// is lowercased except what's inside var().
const lowerOutsideVar = (s) => s.split(/(var\([^)]*\))/).map((part, i) => (i % 2 ? part : part.toLowerCase())).join("");

function canonColour(c) {
  c = lowerOutsideVar(c.trim());
  let m = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/);
  if (m) {
    let h = m[1];
    if (h.length === 3) h = [...h].map((x) => x + x).join("");
    const n = (i) => parseInt(h.slice(i, i + 2), 16);
    const a = h.length === 8 ? +(n(6) / 255).toFixed(3) : 1;
    return `rgba(${n(0)},${n(2)},${n(4)},${a})`;
  }
  m = c.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (m) return `rgba(${+m[1]},${+m[2]},${+m[3]},${m[4] === undefined ? 1 : +m[4]})`;
  return c.replace(/\s+/g, "");
}
const splitTop = (s) => {
  const out = []; let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
};
export function parseLayer(layer) {
  const parts = layer.trim().match(/(?:[a-z-]+\([^()]*(?:\([^()]*\)[^()]*)*\)|[^\s]+)/gi) || [];
  let inset = false, colour = null; const lens = [];
  for (const p of parts) {
    if (p.toLowerCase() === "inset") inset = true;
    else if (/^-?[\d.]+(px)?$/.test(p)) lens.push(parseFloat(p));
    // Anything else that is a length (1rem, +1rem, 0.5em) or computes one (calc(), min(),
    // max(), clamp()) can't be compared with the px scale: the layer is left as it is,
    // rather than that value being taken for its colour.
    else if (/^[+-]?[\d.]/.test(p) || /^(calc|min|max|clamp)\(/i.test(p)) return null;
    // A layer has one colour. A second non-length token means one of them is something
    // else (`var(--spread)` may be a length), and taking either as the colour would drop
    // the other: the layer is ambiguous and left as it is. A single var() colour is fine.
    else if (colour !== null) return null;
    else colour = p;
  }
  if (!colour || lens.length < 2 || lens.length > 4) return null;
  while (lens.length < 4) lens.push(0);
  return { inset, lens, colour };
}
const canonLayer = (l) => {
  const p = parseLayer(l);
  return p ? `${p.inset ? "inset " : ""}${p.lens.join(" ")} ${canonColour(p.colour)}` : lowerOutsideVar(l.replace(/\s+/g, " ").trim());
};

// ── Token tables (light values) ─────────────────────────────────────────────
const lightCss = ["scales.css", "primitives.css", "aliases.css", "semantic.css", "theme.css"].map((f) => {
  const s = fs.readFileSync(path.join(TOKENS, f), "utf8");
  const dark = s.search(/\[data-theme=["']?dark/);
  return dark < 0 ? s : s.slice(0, dark);
}).join("\n").replace(/\/\*[\s\S]*?\*\//g, "");
const defs = new Map();
for (const m of lightCss.matchAll(/(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/g)) if (!defs.has(m[1])) defs.set(m[1], m[2].replace(/\s+/g, " ").trim());
const expand = (v, depth = 0) => depth > 6 ? v : v.replace(/var\((--shadow-[a-z0-9-]+)\)/g, (w, n) => defs.has(n) ? expand(defs.get(n), depth + 1) : w);

const shadowWhole = new Map(), shadowLayer = new Map();
// Scale names first, so `--shadow-1` wins over the generic name it aliases.
// Generic elevation tokens only: a component-named token (--shadow-chat-input…) is never
// borrowed, or the value would pick up that component's dark override.
const shadowNames = [...defs.keys()].filter((n) => /^--shadow-([1-4]|soft|panel|tile)$/.test(n))
  .sort((a, b) => (/^--shadow-([1-4]|soft|panel|tile)$/.test(b) ? 1 : 0) - (/^--shadow-([1-4]|soft|panel|tile)$/.test(a) ? 1 : 0));
for (const n of shadowNames) {
  const layers = splitTop(expand(defs.get(n))).map(canonLayer);
  const key = layers.join(", ");
  if (!shadowWhole.has(key)) shadowWhole.set(key, n);
  if (layers.length === 1 && !shadowLayer.has(key)) shadowLayer.set(key, n);
}
const prims = new Map();
const primCss = fs.readFileSync(path.join(TOKENS, "primitives.css"), "utf8");
for (const m of primCss.matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))\s*;/g)) {
  const k = canonColour(m[2]);
  if (!prims.has(k)) prims.set(k, m[1]);
}

// ── Transform ───────────────────────────────────────────────────────────────
export function transformValue(value, counter) {
  if (value.includes("${") || /^\s*(none|inherit|initial|unset)\s*$/i.test(value)) return value;
  const layers = splitTop(value);
  const whole = shadowWhole.get(layers.map(canonLayer).join(", "));
  if (whole) { counter.n++; return `var(${whole})`; }
  let changed = false;
  const out = layers.map((l) => {
    const single = shadowLayer.get(canonLayer(l));
    if (single) { changed = true; counter.n++; return `var(${single})`; }
    const p = parseLayer(l);
    if (p && p.lens[0] === 0 && p.lens[1] === 0 && p.lens[2] === 0 && p.lens[3] > 0 && !p.colour.startsWith("var(")) {
      const prim = prims.get(canonColour(p.colour));
      if (prim) { changed = true; counter.n++; return l.replace(p.colour, `var(${prim})`); }
    }
    return l;
  });
  return changed ? out.join(", ") : value;
}
const keep = (src, offset) => {
  const end = src.indexOf("\n", offset);
  return src.slice(offset, end < 0 ? undefined : end).includes("ds-keep");
};
// A match that starts inside a string or comment is look-alike text, not a declaration
// (same mask as tokens-exact). The value's own quotes start after the match, so a real
// `boxShadow: '…'` is still code where it begins. Only a whole literal value is converted:
// one that an expression goes on to use (`'…'.replace(…)`) is left alone.
// Whether `at` sits in a type rather than a value: the object braces around it open a
// `type X = {…}` or `interface X {…}` body. A literal there is a literal type, which other
// code is checked against; swapping it for a token would break that check.
const inTypeBody = (src, masked, at) => {
  let depth = 0;
  for (let i = at - 1; i >= 0; i--) {
    if (masked[i]) continue;
    if (src[i] === "}") depth++;
    else if (src[i] === "{") {
      if (depth > 0) { depth--; continue; }
      // An enclosing brace: a type body here, or further out (`type T = { card: { … } }`).
      const before = src.slice(Math.max(0, i - 200), i);
      if (/(?:\btype\s+[\w$]+(?:<[^>]*>)?\s*=\s*|\binterface\s+[\w$]+[^{;]*)$/.test(before)) return true;
    }
  }
  return false;
};
export const transformTsx = (src, c) => {
  const masked = codeMask(src);
  // Whole identifiers only: `rawboxShadow` or `MY_SHADOW_X` is some other name. A `:` must
  // start an object property (after `{`, `,` or a line start): in `a ? boxShadow : '…'` it is
  // a ternary branch. An `=` must be an assignment, not `==`.
  return src.replace(/((?:(?<=(?:^|[{,])\s*)(?:boxShadow|SHADOW_\w*)(?![\w$])\s*:|(?<![\w$.])(?:boxShadow|SHADOW_\w*)(?![\w$])\s*=(?!=))\s*)(['"`])([^'"`\n]*)\2(?=\s*(?:[,;}]|$))/gm,
    (w, pre, q, v, off) => masked[off] || keep(src, off) || inTypeBody(src, masked, off) ? w : `${pre}${q}${transformValue(v, c)}${q}`);
};
export const transformCss = (src, c) => {
  const masked = codeMask(src, { css: true });
  return src.replace(/(box-shadow\s*:\s*)([^;{}]+);/g,
    (w, pre, v, off) => masked[off] || keep(src, off) ? w : `${pre}${transformValue(v.trim(), c)};`);
};

// ── Files ───────────────────────────────────────────────────────────────────
const SKIP = [
  /src\/components\/ui\//,
  /src\/components\/(Checkbox|Popover|Slider|Switch|Tabs|Tooltip)\//,
  /src\/styles\/tokens\//,
  /src\/components\/(Pin|PinCategory|PinCommentField|PinInsert|PinSkeleton|Pinboard|PinboardExpanded|PinboardHeader|PinboardSkeleton|HighlightCard|HighlightMark|HighlightPanel)\//,
  /src\/components\/layout\/HighlightSidebar\.tsx$/,
  /src\/lib\/pin-markdown\.tsx$/,
  /src\/components\/PersonaCard\/(scenes|job-scenes|AnimatedPersonaAvatar)\.tsx$/,
  /src\/components\/(CardBrandLogo|ModelIcon|SouvenirLogo|ConnectorGlyph|ThemedLlmIcon)\//,
  /settings\/\(shell\)\/(files|notifications|preferences|security)\//,
  /src\/components\/(Sidebar|SidebarMenuItem|SidebarProjectsSection|SidebarMenuSkeleton)\//,
  /src\/components\/layout\/ChatHistoryItem\.tsx$/,
  /src\/components\/layout\/sidebar\/(PersonaChatItem|ProjectChatItem|RecentsSection|StarredSection|ProjectsSection|PersonasSectionIndividual|RecentAgentChatsSection)\.tsx$/,
];
function main() {
const args = process.argv.slice(2);
const dry = args.includes("--dry");
const files = [];
const walk = (p) => {
  if (!insideRepo(p)) { console.warn(`skipped (outside the repository): ${p}`); return; }
  const norm = p.split(path.sep).join("/");
  if (SKIP.some((re) => re.test(norm))) return;
  const st = fs.statSync(p);
  if (st.isDirectory()) for (const f of fs.readdirSync(p)) walk(path.join(p, f));
  else if (/\.(tsx|ts|css)$/.test(p) && !/\.(test|spec|stories)\./.test(p) && !/\.d\.ts$/.test(p)) files.push(p);
};
for (const a of args.filter((x) => !x.startsWith("--"))) walk(a);

let total = 0;
for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  const counter = { n: 0 };
  const out = file.endsWith(".css") ? transformCss(src, counter) : transformTsx(src, counter);
  if (counter.n && out !== src) {
    total += counter.n;
    if (!dry) fs.writeFileSync(file, out);
    console.log(`${String(counter.n).padStart(4)}  ${path.relative(ROOT, file).split(path.sep).join("/")}`);
  }
}
console.log(`${dry ? "[dry] " : ""}${total} shadow values in ${files.length} files scanned`);
}

// Run only when executed directly, so tests can import parseLayer().
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
