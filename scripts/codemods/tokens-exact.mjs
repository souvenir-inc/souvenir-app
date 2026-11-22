// Codemod: replace literal style values with the token that has exactly the same value.
// Pass 1 of each Phase 6 area (docs/design-system-primitives-plan.md): no pixel changes, because a
// value is only replaced when a token equals it exactly. Off-scale values are left for pass 2.
//
//   node scripts/codemods/tokens-exact.mjs <file or folder>... [--dry] [--snap]
//
// Where it acts:
//   - .tsx/.ts: inside `style={{ … }}` blocks and objects typed `CSSProperties` / `React.CSSProperties`
//     (never other objects: chart configs pass fontSize to SVG attributes, where var() doesn't resolve).
//   - .css modules: declarations, not custom-property definitions.
// What it replaces: gap / padding / margin (incl. longhands), border-radius, font-size, line-height
// (px), font-weight, transition durations, z-index. A multi-value padding is only replaced when every
// part maps.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SPACE = { 2: "--space-0-5", 4: "--space-1", 6: "--space-1-5", 8: "--space-2", 10: "--space-2-5", 12: "--space-3", 16: "--space-4", 20: "--space-5", 24: "--space-6", 32: "--space-7", 40: "--space-8", 48: "--space-9", 64: "--space-10" };
const RADIUS = { 4: "--radius-xs", 6: "--radius-sm", 8: "--radius-md", 10: "--radius-lg", 12: "--radius-xl", 16: "--radius-2xl", 999: "--radius-full", 9999: "--radius-full" };
const FONT_SIZE = { 11: "--font-size-caption", 12: "--font-size-small", 13: "--font-size-body-sm", 14: "--font-size-body", 16: "--font-size-body-lg", 18: "--font-size-heading-sm", 20: "--font-size-heading-md", 24: "--font-size-heading", 28: "--font-size-heading-xl", 40: "--font-size-display" };
const LINE_HEIGHT = { 16: "--line-height-small", 20: "--line-height-body-sm", 22: "--line-height-body", 24: "--line-height-heading-sm", 28: "--line-height-heading-md", 32: "--line-height-heading", 36: "--line-height-heading-xl", 48: "--line-height-display" };
const WEIGHT = { 400: "--font-weight-regular", 500: "--font-weight-medium", 600: "--font-weight-semibold" };

// --snap: off-scale values move to the nearest step (plan Appendix B). Small visual changes, so a
// snap run is always followed by a screenshot review. Values not listed stay as they are.
const SNAP_SPACE = { 1: 2, 3: 2, 5: 4, 7: 6, 9: 8, 11: 10, 13: 12, 14: 12, 15: 16, 18: 16, 22: 20, 28: 24, 30: 32, 36: 32 };
const SNAP_RADIUS = { 2: 4, 3: 4, 5: 6, 7: 8, 9: 10, 11: 12, 14: 12, 18: 16, 20: 16, 24: 16 };
const SNAP_FONT_SIZE = { 9: 11, 10: 11, 15: 14, 17: 16, 22: 20, 26: 24, 30: 28, 32: 28 };
const SNAP = process.argv.includes("--snap");
const snapped = (table, snap) => (SNAP ? new Proxy(table, { get: (t, k) => t[k] ?? t[snap[k]] }) : table);
const S_SPACE = snapped(SPACE, SNAP_SPACE);
const S_RADIUS = snapped(RADIUS, SNAP_RADIUS);
const S_FONT_SIZE = snapped(FONT_SIZE, SNAP_FONT_SIZE);

const SPACE_PROPS = /^(gap|rowGap|columnGap|row-gap|column-gap|padding|padding[A-Z]\w*|padding-[a-z-]+|margin|margin[A-Z]\w*|margin-[a-z-]+)$/;
const RADIUS_PROPS = /^(borderRadius|border-radius|border[A-Z]\w*Radius|border-[a-z-]+-radius)$/;
const FS_PROPS = /^(fontSize|font-size)$/;
const LH_PROPS = /^(lineHeight|line-height)$/;
const FW_PROPS = /^(fontWeight|font-weight)$/;
const TRANSITION_PROPS = /^(transition|transitionDuration|transition-duration)$/;
const Z_PROPS = /^(zIndex|z-index)$/;

// Motion: durations inside a transition. --snap moves 0–400ms to the nearest step; longer ones (and
// animations, which loop) keep their timing.
const DURATION = { 80: "--duration-instant", 120: "--duration-fast", 200: "--duration-base", 320: "--duration-slow" };
const snapDuration = (ms) => (ms <= 100 ? 80 : ms <= 160 ? 120 : ms <= 260 ? 200 : ms <= 400 ? 320 : null);
// Layering: exact values only. Rounding would merge layers that are ordered on purpose (1 vs 2).
const Z = { 0: "--z-base", 10: "--z-raised", 100: "--z-sticky", 1000: "--z-dropdown", 1100: "--z-overlay", 1200: "--z-modal", 1300: "--z-popover", 1400: "--z-toast", 1500: "--z-tooltip" };

function replaceDurations(value) {
  let changed = false
  const out = value.replace(/(?<![\w.(-])(\d*\.?\d+)(ms|s)\b/g, (whole, num, unit) => {
    const ms = Math.round(unit === "s" ? Number(num) * 1000 : Number(num));
    if (ms === 0) return whole;
    const target = DURATION[ms] ? ms : SNAP ? snapDuration(ms) : null;
    if (!target) return whole;
    changed = true;
    return v(DURATION[target]);
  });
  return changed ? out : null;
}

const v = (name) => `var(${name})`;

/** Map one length token ("12px", "12", "0") through a table; null when it doesn't map. */
function mapLength(part, table) {
  if (part === "0" || part === "0px") return "0";
  const m = part.match(/^(\d+)(px)?$/);
  if (!m) return null;
  const t = table[Number(m[1])];
  return t ? v(t) : null;
}

/** Return the replacement value string for (prop, raw value), or null. `raw` has no quotes. */
function replaceValue(prop, raw) {
  const value = raw.trim();
  // Already tokenised (or computed): skip, except transitions, which can mix several durations.
  if ((value.includes("var(") || value.includes("calc(")) && !TRANSITION_PROPS.test(prop)) return null;
  if (SPACE_PROPS.test(prop)) {
    const parts = value.split(/\s+/);
    if (parts.some((p) => p === "auto")) {
      const mapped = parts.map((p) => (p === "auto" ? "auto" : mapLength(p, S_SPACE)));
      return mapped.includes(null) ? null : mapped.join(" ");
    }
    const mapped = parts.map((p) => mapLength(p, S_SPACE));
    if (mapped.includes(null) || mapped.every((p) => p === "0")) return null;
    return mapped.join(" ");
  }
  if (RADIUS_PROPS.test(prop)) {
    const parts = value.split(/\s+/);
    const mapped = parts.map((p) => mapLength(p, S_RADIUS));
    if (mapped.includes(null) || mapped.every((p) => p === "0")) return null;
    return mapped.join(" ");
  }
  if (FS_PROPS.test(prop)) return mapLength(value, S_FONT_SIZE);
  if (LH_PROPS.test(prop)) return /^\d+px$/.test(value) ? mapLength(value, LINE_HEIGHT) : null; // unitless stays
  if (FW_PROPS.test(prop)) return WEIGHT[Number(value)] ? v(WEIGHT[Number(value)]) : null;
  if (TRANSITION_PROPS.test(prop)) return replaceDurations(value);
  if (Z_PROPS.test(prop)) return /^\d+$/.test(value) && Z[Number(value)] ? v(Z[Number(value)]) : null;
  return null;
}

// ── Strings and comments ────────────────────────────────────────────────────

/**
 * 1 for every character inside a string or a comment, 0 for code. Text there can look like a
 * declaration (`content: 'padding: 16'`, `// style={{`) and must never be rewritten.
 * In TS/TSX a quote right after a letter or digit is JSX text (`Don't`), not a string — unless
 * those letters are a keyword that takes an operand (`typeof'…'`, `case'…':`), where a string
 * starts. '/" strings end at a newline, templates at their `.
 */
const OPERAND_KEYWORDS = new Set(["typeof", "case", "return", "in", "of", "instanceof", "void", "delete", "await", "yield", "new", "throw", "else", "do", "from", "extends"]);
// Scripts never write outside the repository. A target is checked by its real path, so a
// path that leaves it (`../other-app`) or a symlink that points out of it is refused.
const REPO_ROOT = fs.realpathSync(path.resolve(import.meta.dirname, "../.."));
export function insideRepo(p) {
  let real;
  try { real = fs.realpathSync(p); } catch { return false; }
  const rel = path.relative(REPO_ROOT, real);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

// Whether `at` sits in a type rather than a value: the object braces around it open a
// `type X = {…}` or `interface X {…}` body. A literal there is a literal type, which other
// code is checked against; swapping it for a token would break that check.
export const inTypeBody = (src, masked, at) => {
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

/** Regular-expression literal spans in JS/TS source ([from, to] pairs): a `/` where an
 *  expression starts, outside strings and comments (`masked`). codeMask leaves them as code,
 *  but text inside one (`/{lineHeight: 1.5,}/`) is not a declaration. */
export function regexLiteralSpans(src, masked) {
  return [...src.matchAll(/(?<=(?:^|[=(,:[!&|?{};]|\breturn)\s*)\/(?![*/])(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n[])+\/[a-z]*/gm)]
    .filter((m) => !masked[m.index])
    .map((m) => [m.index, m.index + m[0].length]);
}

export function codeMask(src, { css = false } = {}) {
  const mask = new Uint8Array(src.length);
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const n = src[i + 1];
    let end = -1;
    if (c === "/" && n === "*") {
      end = src.indexOf("*/", i + 2);
      end = end < 0 ? src.length - 1 : end + 1;
    } else if (!css && c === "/" && n === "/") {
      end = src.indexOf("\n", i);
      end = end < 0 ? src.length - 1 : end - 1;
    } else if (c === "'" || c === '"' || (!css && c === "`")) {
      if (!css && c !== "`" && /[A-Za-z0-9]/.test(src[i - 1] ?? "")) {
        const word = /[A-Za-z_$][\w$]*$/.exec(src.slice(Math.max(0, i - 20), i))?.[0];
        if (!OPERAND_KEYWORDS.has(word)) continue;
      }
      let j = i + 1;
      while (j < src.length && src[j] !== c && (c === "`" || src[j] !== "\n")) j += src[j] === "\\" ? 2 : 1;
      end = Math.min(j, src.length - 1);
    } else if (css && (c === "u" || c === "U") && /^url\(\s*(?!["'])/i.test(src.slice(i, i + 6)) && !/[\w-]/.test(src[i - 1] ?? "")) {
      // An unquoted url(…) is one token in CSS: what is inside (`url(/a;padding:8px;b)`) is a
      // path, never declarations. Masked to its closing parenthesis.
      end = src.indexOf(")", i);
      end = end < 0 ? src.length - 1 : end;
    }
    if (end >= i) {
      mask.fill(1, i, end + 1);
      i = end;
    }
  }
  return mask;
}

// ── TSX ─────────────────────────────────────────────────────────────────────

/** Brace depth at each index of `body` (which starts with the object's own `{`), strings skipped. */
function depthMap(body) {
  const depth = new Array(body.length).fill(0);
  const masked = codeMask(body);
  let d = 0;
  for (let j = 0; j < body.length; j++) {
    // Inside a string or comment: never a property, and its braces do not count.
    if (masked[j]) { depth[j] = -1; continue; }
    const c = body[j];
    if (c === "{") d++;
    depth[j] = d;
    if (c === "}") d--;
  }
  return depth;
}

function transformObjectBody(body, counter) {
  // Only the style object's own properties: a nested object literal inside it
  // (a motion config, a lookup) is not a style and keeps its values.
  const depth = depthMap(body);
  const masked = codeMask(body);
  // `key: value` where value is a number or a quoted string, ending where the next
  // non-space character is , or } (a newline alone does not end it: `16\n * scale`).
  return body.replace(/(\b[a-zA-Z]+)(\s*:\s*)(-?\d+(?:\.\d+)?|'[^'\n]*'|"[^"\n]*")(?=\s*[,}])/g, (whole, key, sep, val, offset) => {
    if (depth[offset] !== 1) return whole;
    // A property starts right after `{` or `,`. In `padding: wide ? gap : 8` the `gap : 8`
    // is the false branch of a conditional, not a property, and keeps its value.
    let before = offset - 1;
    while (before >= 0 && (masked[before] || /\s/.test(body[before]))) before--;
    if (before >= 0 && body[before] !== "{" && body[before] !== ",") return whole;
    // `// ds-keep: <reason>` on the same line leaves the value alone (e.g. a framer-motion layout radius).
    const lineEnd = body.indexOf("\n", offset);
    if (body.slice(offset, lineEnd < 0 ? undefined : lineEnd).includes("ds-keep")) return whole;
    const quoted = /^['"]/.test(val);
    const raw = quoted ? val.slice(1, -1) : val;
    // A bare number for lineHeight is unitless; for the others React reads it as px.
    if (!quoted && LH_PROPS.test(key)) return whole;
    const next = replaceValue(key, quoted || FW_PROPS.test(key) || Z_PROPS.test(key) ? raw : `${raw}px`);
    if (!next) return whole;
    counter.n++;
    const q = quoted ? val[0] : "'";
    return `${key}${sep}${q}${next}${q}`;
  });
}

/** Find the matching close brace for the `{` at index i. */
// Braces inside strings and comments (per `masked`, from codeMask) do not count, so a
// `}` in a comment cannot end the object early.
function matchBrace(s, i, masked) {
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    if (masked[j]) continue;
    const c = s[j];
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return j; }
  }
  return -1;
}

export function transformTsx(source, counter) {
  const masked = codeMask(source);
  const starts = [];
  // The whole attribute name: `tickstyle={{…}}` is some other prop, typed by its component.
  for (const m of source.matchAll(/(?<![\w$-])style=\{\{/g)) if (!masked[m.index]) starts.push(m.index + "style={".length);
  for (const m of source.matchAll(/:\s*(?:React\.)?CSSProperties\s*=\s*\{/g)) if (!masked[m.index]) starts.push(m.index + m[0].length - 1);
  // Identifier-aware on both sides: `$` continues a name, so \b alone let CSSProperties$Config match.
  for (const m of source.matchAll(/(?<![\w$.])as (?:React\.)?CSSProperties(?![\w$])/g)) {
    if (masked[m.index]) continue;
    // `{ … } as React.CSSProperties`: walk back to the object's opening brace — but only
    // when an object literal is what is being cast. `style as CSSProperties` or a call
    // would otherwise send the walk back to some unrelated earlier object.
    let close = m.index - 1;
    while (close >= 0 && /\s/.test(source[close])) close--;
    if (source[close] !== "}") continue;
    let depth = 0;
    for (let j = close; j >= 0; j--) {
      const c = source[j];
      if (c === "}") depth++;
      else if (c === "{") { depth--; if (depth === 0) { starts.push(j); break; } }
      if (depth < 0) break;
    }
  }
  // Process from the end so earlier indices stay valid; skip ranges nested in one already done.
  const ranges = starts.map((i) => [i, matchBrace(source, i, masked)]).filter(([, e]) => e > 0).sort((a, b) => b[0] - a[0]);
  let out = source;
  let lastStart = Infinity;
  for (const [s, e] of ranges) {
    if (e >= lastStart) continue;
    out = out.slice(0, s) + transformObjectBody(out.slice(s, e + 1), counter) + out.slice(e + 1);
    lastStart = s;
  }
  return out;
}

// ── CSS ─────────────────────────────────────────────────────────────────────

export function transformCss(source, counter) {
  const masked = codeMask(source, { css: true });
  // The boundary before a declaration and its closing `;` are looked at, not consumed: in
  // `.a{color:red;padding:16px;}` the `;` that ends one declaration is where the next begins.
  return source.replace(/(?<=^|[;{\s])([a-z-]+)(\s*:\s*)([^;{}]+)(?=;)/g, (whole, prop, sep, val, offset) => {
    if (prop.startsWith("--") || masked[offset]) return whole;
    const important = /\s*!important\s*$/.test(val) ? " !important" : "";
    const next = replaceValue(prop, val.replace(/\s*!important\s*$/, ""));
    if (!next) return whole;
    counter.n++;
    return `${prop}${sep}${next}${important}`;
  });
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function main() {
const args = process.argv.slice(2);
const dry = args.includes("--dry");
const files = [];
// Never touched: the primitive layer (exact pixels on purpose), token files, hidden features (plan D6),
// generated art (D7), the hidden settings previews and the out-of-scope old Sidebar.
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
const walk = (p) => {
  if (!insideRepo(p)) { console.warn(`skipped (outside the repository): ${p}`); return; }
  const st = fs.statSync(p);
  const norm = p.split(path.sep).join("/");
  if (SKIP.some((re) => re.test(norm))) return;
  if (st.isDirectory()) for (const f of fs.readdirSync(p)) walk(path.join(p, f));
  else if (/\.(tsx|ts|css)$/.test(p) && !/\.d\.ts$/.test(p) && !/\.(test|spec|stories)\./.test(p)) files.push(p);
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
    console.log(`${String(counter.n).padStart(4)}  ${file}`);
  }
}
console.log(`${dry ? "[dry] " : ""}${total} values replaced in ${files.length} files scanned`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
