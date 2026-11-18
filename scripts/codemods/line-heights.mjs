#!/usr/bin/env node
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

const ROOT = path.resolve(import.meta.dirname, "../..");
const args = process.argv.slice(2);
const SNAP = args.includes("--snap");
const dry = args.includes("--dry");

// One token per px value; when two share a value, the scale name first.
const PX = { 16: "--line-height-small", 20: "--line-height-body-sm", 22: "--line-height-body", 24: "--line-height-heading-sm", 28: "--line-height-heading-md", 32: "--line-height-heading", 36: "--line-height-heading-xl", 48: "--line-height-display" };
const STEPS = Object.keys(PX).map(Number);
const LEADING = [[1, "--leading-none"], [1.25, "--leading-tight"], [1.375, "--leading-snug"], [1.5, "--leading-normal"], [2, "--leading-loose"]];
// font-size token → its paired line-height token (scales.css / typography.css)
const PAIR = { "heading-xl": 36, "heading-md": 28, "heading-sm": 24, "body-sm": 20, small: 16, display: 48, heading: 32, "body-lg": 22, body: 22, caption: 16, code: 16 };
const PAIR_TOKEN = { "body-lg": "--line-height-body-lg", body: "--line-height-body", caption: "--line-height-caption", code: "--line-height-code" };

function enclosing(src, at) {
  let depth = 0, start = 0, end = src.length;
  for (let i = at; i >= 0; i--) {
    if (src[i] === "}") depth++;
    else if (src[i] === "{") { if (depth === 0) { start = i; break; } depth--; }
  }
  depth = 0;
  for (let i = at; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { if (depth === 0) { end = i; break; } depth--; }
  }
  return src.slice(start, end);
}

function mapValue(raw, block, counter) {
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
  const font = block.match(/font-?[sS]ize\s*:\s*['"]?var\(--font-size-([a-z0-9-]+)\)/);
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
function transform(src, isCss, counter) {
  const re = isCss ? /(line-height\s*:\s*)([^;{}]+)(;)/g : /(\blineHeight\s*:\s*)('[^']*'|"[^"]*"|-?[\d.]+)(?=\s*[,}\n])/g;
  return src.replace(re, (w, pre, val, post = "", off) => {
    if (typeof post === "number") { off = post; post = ""; }
    if (keep(src, off)) return w;
    const out = mapValue(val, enclosing(src, off), counter);
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
const files = [];
const walk = (p) => {
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
