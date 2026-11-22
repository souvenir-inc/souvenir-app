/**
 * Line-height pass.
 *
 *   node scripts/codemods/line-heights.mjs <paths…> [--snap] [--dry]
 *
 * Touches `lineHeight: …` in TSX/TS (any object, typed or not) and `line-height: …;` in CSS.
 *   default  px on the scale        → its token            (16px → var(--line-height-small))
 *            unitless on a step     → --leading-*          (1.5 → var(--leading-normal))
 *   --snap   unitless near a step   → --leading-*          (1.3 → var(--leading-tight)); within 0.08
 *            px off the scale      → the line height paired with the element's font-size token, when
 *            it's within 4px (13px text with 18px → var(--line-height-body-sm)); otherwise the nearest
 *            step within 2px, rounding up on a tie. Further away stays literal.
 * `0`, `normal`, var(), dynamic values and lines marked `// ds-keep` are left alone. Same SKIP list as
 * tokens-exact.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// The same string/comment mask as tokens-exact, so both codemods agree on what is code.
import { codeMask, inJsxText, inTypeBody, insideRepo, regexLiteralSpans } from "./tokens-exact.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const args = process.argv.slice(2);
let SNAP = args.includes("--snap");
/** For tests: turn --snap on or off without the CLI. */
export const setSnap = (on) => { SNAP = on; };
const dry = args.includes("--dry");

// One token per px value; when two share a value, the scale name first.
const PX = { 16: "--line-height-small", 20: "--line-height-body-sm", 22: "--line-height-body", 24: "--line-height-heading-sm", 28: "--line-height-heading-md", 32: "--line-height-heading", 36: "--line-height-heading-xl", 48: "--line-height-display" };
const STEPS = Object.keys(PX).map(Number);
const LEADING = [[1, "--leading-none"], [1.25, "--leading-tight"], [1.375, "--leading-snug"], [1.5, "--leading-normal"], [2, "--leading-loose"]];
// font-size token → its paired line-height token (scales.css / typography.css)
const PAIR = { "heading-xl": 36, "heading-md": 28, "heading-sm": 24, "body-sm": 20, small: 16, display: 48, heading: 32, "body-lg": 22, body: 22, caption: 16, code: 16 };
const PAIR_TOKEN = { "body-lg": "--line-height-body-lg", body: "--line-height-body", caption: "--line-height-caption", code: "--line-height-code" };

// The block around `at`. `masked` (the codeMask) marks string and comment text, whose braces
// (`fontFamily: '{'`) are not block boundaries.
function enclosing(src, at, masked) {
  let depth = 0, start = 0, end = src.length;
  for (let i = at; i >= 0; i--) {
    if (masked?.[i]) continue;
    if (src[i] === "}") depth++;
    else if (src[i] === "{") { if (depth === 0) { start = i; break; } depth--; }
  }
  depth = 0;
  for (let i = at; i < src.length; i++) {
    if (masked?.[i]) continue;
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { if (depth === 0) { end = i; break; } depth--; }
  }
  return src.slice(start, end);
}

function mapValue(raw, block, counter, isCss = false) {
  const v = raw.trim().replace(/^['"]|['"]$/g, "");
  if (/^-?[\d.]+$/.test(v)) {
    const n = parseFloat(v);
    if (n === 0) return null;
    let best = null;
    for (const [val, tok] of LEADING) if (Math.abs(val - n) <= 0.08 && (!best || Math.abs(val - n) < Math.abs(best[0] - n))) best = [val, tok];
    if (best && best[0] === n) { counter.exact++; return `var(${best[1]})`; }
    if (best && SNAP) { counter.unitless++; return `var(${best[1]})`; }
    return null;
  }
  const m = v.match(/^(\d+(?:\.\d+)?)px$/);
  if (!m) return null;
  const px = parseFloat(m[1]);
  if (PX[px]) { counter.exact++; return `var(${PX[px]})`; }
  if (!SNAP) return null;
  // Only this scope's active fontSize pairs: not a commented-out one, and not one inside a
  // nested rule or object (`& .label { … }`), which styles something else.
  // Strings are matched first and kept, so a `//` or `/*` inside one (`content: "//"`) is text,
  // not a comment that would swallow the declarations after it.
  // CSS has no line comments (`//` is text there, as in `url(https://…)`): only /* */ go.
  const comment = isCss
    ? /(['"])(?:\\.|(?!\1)[^\\\n])*\1|\/\*[\s\S]*?\*\//g
    : /(['"`])(?:\\.|(?!\1)[^\\\n])*\1|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;
  let scope = block.replace(comment, (m) => (/^['"`]/.test(m) ? m : ""));
  // Braces inside a string are text, not a nested block: blanked before nested blocks go.
  scope = scope.replace(/(['"`])(?:\\.|(?!\1)[^\\\n])*\1/g, (str) => str.replace(/[{}]/g, " "));
  while (/\{[^{}]*\}/.test(scope)) scope = scope.replace(/\{[^{}]*\}/g, "");
  // The last declaration wins (CSS order, and a repeated object key): pair with that one,
  // and only when it is a font-size token; any other last value means no pairing.
  // Only a declaration, not text inside a string (`content: "font-size: …"`) that looks like one.
  const strings = [...scope.matchAll(/(['"`])(?:\\.|(?!\1)[^\\\n])*\1/g)].map((m) => [m.index, m.index + m[0].length]);
  const inString = (i) => strings.some(([from, to]) => i > from && i < to);
  // A quoted key (`"fontSize": …`) is a declaration too: both quotes, then the colon. The match
  // starts at its opening quote, a string's start, not inside one; text in a string value
  // (`content: "font-size: …"`) has no closing quote after the name, so it never matches.
  // Only at a declaration boundary (the block's start, or after `,` / `;`): a `fontSize` in a
  // value (`padding: compact ? fontSize : …`) is an expression, not this block's font size.
  const lastFont = [...scope.matchAll(/(?<=(?:^|[{,;])\s*)(?:(["'])font-?[sS]ize\1|font-?[sS]ize)\s*:\s*(?<value>[^;,}\n]+)/g)]
    .filter((m) => !inString(m.index))
    // `!important` is not part of the value; an important declaration beats a normal one,
    // whatever their order, and among equals the last one wins.
    .map((m) => {
      const raw = m.groups.value.trim();
      const important = /!\s*important$/i.test(raw);
      return { important, value: raw.replace(/\s*!\s*important$/i, "").replace(/^['"]|['"]$/g, "") };
    })
    .reduce((win, d) => (!win || d.important || !win.important ? d : win), null)?.value;
  // A spread (`...other`, `...{ fontSize }`) can override any key, so with one there is no
  // telling which fontSize wins: no pairing.
  // A `font` shorthand sets font-size too, and may come after the longhand: no pairing either.
  const shorthand = [...scope.matchAll(/(?<=(?:^|[{,;])\s*)(["']?)font\1\s*:/gm)].some((m) => !inString(m.index));
  const font = /\.\.\./.test(scope) || shorthand ? null : lastFont?.match(/^var\(--font-size-([a-z0-9-]+)\)$/);
  if (font && PAIR[font[1]] && Math.abs(PAIR[font[1]] - px) <= 4) {
    counter.snapped++;
    return `var(${PAIR_TOKEN[font[1]] || PX[PAIR[font[1]]]})`;
  }
  let near = null;
  for (const s of STEPS) {
    const d = Math.abs(s - px);
    if (d <= 2 && (!near || d < Math.abs(near - px) || (d === Math.abs(near - px) && s > near))) near = s;
  }
  if (near) { counter.snapped++; return `var(${PX[near]})`; }
  return null;
}

const keep = (src, off) => { const e = src.indexOf("\n", off); return src.slice(off, e < 0 ? undefined : e).includes("ds-keep"); };
export function transform(src, isCss, counter) {
  // A value ends where the next non-space character is `,` or `}`; a newline alone does not
  // end it, or `lineHeight: 1.5` followed by `* scale` on the next line would be split.
  // The whole property name: `--grid-line-height` is a custom property, not line-height.
  const re = isCss ? /(?<![\w-])(line-height\s*:\s*)([^;{}]+)(;)/g : /(?<=(?:^|[{,])\s*)(\blineHeight\s*:\s*)('[^']*'|"[^"]*"|-?[\d.]+)(?=\s*[,}])/gm;
  // lineHeight must start an object property: in `a ? lineHeight : 1.5` it is a ternary branch.
  // Text inside a string or comment can look like a declaration (`"lineHeight: 1.5,"`).
  const masked = codeMask(src, { css: isCss });
  // Regular-expression literals (`/\{lineHeight: 1.5,\}/`) are not masked as strings are:
  // their spans are found here (a `/` where an expression starts) and left alone.
  // In CSS, an unquoted url(…) is one token (the mask covers only quoted strings): text inside it
  // (`url(/a/line-height:1.5;b.svg)`) is a path, not a declaration, and is left alone too.
  const regexSpans = isCss
    ? [...src.matchAll(/\burl\(\s*(?!["'])[^)]*\)/gi)].map((m) => [m.index, m.index + m[0].length])
    : regexLiteralSpans(src, masked);
  const inRegex = (i) => regexSpans.some(([from, to]) => i >= from && i < to);
  return src.replace(re, (w, pre, val, post = "", off) => {
    if (typeof post === "number") { off = post; post = ""; }
    if (masked[off] || inRegex(off)) return w;
    // A literal type (`type T = { lineHeight: 1.5 }`) is checked against, not shown: left alone.
    if (!isCss && inTypeBody(src, masked, off)) return w;
    // Displayed JSX text that reads like a property is left as written.
    if (!isCss && inJsxText(src, masked, off)) return w;
    if (keep(src, off)) return w;
    const out = mapValue(val, enclosing(src, off, masked), counter, isCss);
    if (!out) return w;
    return isCss ? `${pre}${out}${post}` : `${pre}'${out}'${post}`;
  });
}

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
  // Chart geometry stays literal (plan Phase 6).
  /src\/components\/chat\/(AnimatedBarChart|XmlChart\w*|Sparkline)\.tsx$/,
  /UsageBarChart/,
];
function main() {
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

const total = { exact: 0, unitless: 0, snapped: 0 };
for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  const counter = { exact: 0, unitless: 0, snapped: 0 };
  const out = transform(src, file.endsWith(".css"), counter);
  const n = counter.exact + counter.unitless + counter.snapped;
  if (n && out !== src) {
    for (const k in total) total[k] += counter[k];
    if (!dry) fs.writeFileSync(file, out);
    console.log(`${String(n).padStart(4)}  ${path.relative(ROOT, file).split(path.sep).join("/")}`);
  }
}
console.log(`${dry ? "[dry] " : ""}exact ${total.exact} · unitless→leading ${total.unitless} · snapped ${total.snapped}`);
}

// Run only when executed directly, so tests can import transform().
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
