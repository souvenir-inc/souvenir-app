// Design-system scan: how much styling comes from tokens and how much UI goes through primitives.
// Plan: docs/design-system-primitives-plan.md (Phase 0).
//
//   node scripts/ds-scan.mjs            readable summary
//   node scripts/ds-scan.mjs --json     full counts as JSON
//   node scripts/ds-scan.mjs --top=raw.button [--limit=N]   files with the most of one counter (default 30)
//   node scripts/ds-scan.mjs --check    fail if any tracked count is above scripts/ds-baseline.json
//   node scripts/ds-scan.mjs --update   lower the baseline to today's counts (never raises it)
//
// It is a regex scan, not an AST parse: counts are within a few percent, proportions are reliable.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "src");
const BASELINE = path.join(import.meta.dirname, "ds-baseline.json");

// ── Exclusions ───────────────────────────────────────────────────────────────
// Not scanned at all: tests, token definitions, hidden features (plan D6).
const SKIP_FILE = [
  /\.(test|spec|stories)\.[tj]sx?$/,
  /^src\/styles\/tokens\//,
  // Hidden on purpose; not part of this work.
  /^src\/components\/(Pin|PinCategory|PinCommentField|PinInsert|PinSkeleton|Pinboard|PinboardExpanded|PinboardHeader|PinboardSkeleton|HighlightCard|HighlightMark|HighlightPanel)\//,
  /^src\/components\/layout\/HighlightSidebar\.tsx$/,
  /^src\/lib\/pin-markdown\.tsx$/,
  /^src\/components\/chat\/PinMentionDropdown\.tsx$/,
];
// Scanned for elements, but their colours and values are illustration, not UI (plan D7).
const ART_FILE = [
  /^src\/components\/PersonaCard\/(scenes|job-scenes|AnimatedPersonaAvatar)\.tsx$/,
  /^src\/lib\/llm-icons\.generated\.ts$/,
  /^src\/components\/(CardBrandLogo|ModelIcon|SouvenirLogo|ConnectorGlyph|ThemedLlmIcon)\//,
];
// Content colours: a syntax-highlighting theme and weather illustration. Their colours aren't counted
// (decided 2026-11-18); their spacing and type still are.
const CONTENT_COLOUR_FILE = [
  /^src\/components\/chat\/CodeBlock(\.module)?\.(tsx|css)$/,
  /^src\/components\/chat\/XmlWeather\.tsx$/,
];

// ── Style property categories ───────────────────────────────────────────────
const CATEGORIES = {
  color: /^(color|background|backgroundColor|background-color|borderColor|border-color|fill|stroke|outlineColor|outline-color|caretColor|caret-color|accentColor|accent-color)$/,
  spacing: /^(padding|padding[A-Z]\w*|padding-[a-z-]+|margin|margin[A-Z]\w*|margin-[a-z-]+|gap|rowGap|columnGap|row-gap|column-gap)$/,
  radius: /^(borderRadius|border-radius|border-[a-z-]*-radius|border[A-Z]\w*Radius)$/,
  typography: /^(fontSize|font-size|fontWeight|font-weight|lineHeight|line-height|letterSpacing|letter-spacing|fontFamily|font-family)$/,
  shadow: /^(boxShadow|box-shadow)$/,
  border: /^(border|borderTop|borderBottom|borderLeft|borderRight|border-top|border-bottom|border-left|border-right)$/,
  motion: /^(transition|transitionDuration|transition-duration|transitionTimingFunction|transition-timing-function|animation)$/,
  zIndex: /^(zIndex|z-index)$/,
};
const NEUTRAL = /^["'`]?(inherit|initial|unset|none|auto|transparent|currentColor|0|0px|100%|50%)["'`]?$/i;

// `isCss`: a stylesheet value. CSS has no variables by bare name, so a word there
// (`red`, `bold`) is a literal; only in a style object can it be a JS identifier.
/** A stylesheet's declarations as [property, value] pairs (custom properties left out).
 *  The closing `;` is looked at, not consumed: it is also where the next declaration starts,
 *  so `.a{padding:16px;margin:8px;}` gives both. */
export function cssDeclarations(source) {
  const decls = [];
  for (const m of source.matchAll(/(?:^|[;{\s])([a-z-]+)\s*:\s*([^;{}]+)(?=;)/g)) {
    if (m[1].startsWith("--")) continue;
    const after = m.index + m[0].length;
    const lineEnd = source.indexOf("\n", after);
    decls.push([m[1], m[2], source.slice(after, lineEnd < 0 ? undefined : lineEnd).includes(KEEP)]);
  }
  return decls;
}

/**
 * Key/value pairs of an inline style object's body. A value runs to the next comma at the top level,
 * so `color-mix(in srgb, var(--a) 40%, transparent)`, gradients and multi-part shadows are read whole
 * (cutting at the first comma counted token-built values as literals).
 */
export function inlineDeclarations(body) {
  const decls = [];
  const re = /([a-zA-Z]+)\s*:\s*/g;
  let m;
  while ((m = re.exec(body))) {
    let i = re.lastIndex;
    let depth = 0;
    let quote = null;
    for (; i < body.length; i++) {
      const ch = body[i];
      if (quote) { if (ch === quote && body[i - 1] !== "\\") quote = null; continue; }
      if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue; }
      if (ch === "(" || ch === "[" || ch === "{") depth++;
      else if (ch === ")" || ch === "]" || ch === "}") { if (depth === 0) break; depth--; }
      else if ((ch === "," || ch === "\n") && depth === 0) break;
    }
    const value = body.slice(re.lastIndex, i).trim();
    const lineEnd = body.indexOf("\n", i);
    const kept = body.slice(i, lineEnd < 0 ? undefined : lineEnd).includes(KEEP) || value.includes(KEEP);
    if (value) decls.push([m[1], value.replace(KEEP, "").trim(), kept]);
    re.lastIndex = i + 1;
  }
  return decls;
}

function classify(value, isCss = false) {
  const v = value.trim();
  if (/var\(--/.test(v)) return "token";
  if (NEUTRAL.test(v)) return "neutral";
  // Centering and resets made only of neutral parts ("0 auto", "auto 0", "0 !important").
  if (/^["'`]?(0|0px|auto)(\s+(0|0px|auto))*(\s*!important)?["'`]?$/i.test(v)) return "neutral";
  // Keyword resets that carry no design value: `transparent !important`, `normal` (line height),
  // and a placeholder border that only reserves its width (`1px solid transparent`).
  if (/^["'`]?(transparent|currentColor|inherit|none|normal)(\s*!important)?["'`]?$/i.test(v)) return "neutral";
  if (/^["'`]?\d+(\.\d+)?px\s+solid\s+transparent["'`]?$/i.test(v)) return "neutral";
  if (isCss) return "literal";
  if (/^[A-Z_][A-Z0-9_]*(\.[\w.]+)?$/.test(v) || /^(tokens?|theme)\./.test(v)) return "token";
  if (/^[a-zA-Z_$][\w$.]*$/.test(v) || /\?/.test(v) || /\$\{/.test(v) || /\(/.test(v) && !/^["'`]/.test(v) && !/^(rgba?|hsla?|calc|cubic-bezier)\(/.test(v)) return "dynamic";
  // An unquoted expression with a name in it (`TRACK_W / 2`, `size * 0.64`, `-EDGE`, `MARGINS[tag]`)
  // is computed in code, not a hard-coded value.
  if (!/^["'`]/.test(v) && /[A-Za-z_$]/.test(v)) return "dynamic";
  return "literal";
}

// ── Raw elements and primitives ─────────────────────────────────────────────
const RAW_TAGS = ["button", "motion.button", "input", "textarea", "select", "label", "a", "img", "table", "hr", "kbd", "svg", "h1", "h2", "h3"];
const PRIMITIVES = ["Button", "IconButton", "ChipButton", "InputField", "PasswordInputField", "InputGroup", "TimeField", "Checkbox", "Switch", "Slider", "Tooltip", "Popover", "Dropdown", "FloatingMenu", "Tabs", "Badge", "Chip", "Skeleton", "Spinner", "LoadingSpinner", "Divider", "Avatar", "ConfirmModal", "Toast", "Dialog", "DialogContent", "Sheet", "SheetContent"];

// Counters the ratchet watches. Each must only go down.
const TRACKED = [
  "literal.color", "literal.spacing", "literal.radius", "literal.typography", "literal.shadow", "literal.border", "literal.motion", "literal.zIndex",
  "colorLiteral.hex", "colorLiteral.rgb",
  "raw.button", "raw.input", "raw.textarea", "raw.select", "raw.label",
  "pattern.roleDialog", "pattern.radixOutsideUi",
  "twArbitrary",
];

// ── Walk ─────────────────────────────────────────────────────────────────────
function listFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listFiles(full, out);
    else if (/\.(tsx|ts|css)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const count = (s, re) => (s.match(re) || []).length;
const tagCount = (s, tag) => count(s, new RegExp("<" + tag.replace(".", "\\.") + "(?=[\\s>/])", "g"));
// A `ds-keep: <reason>` comment marks a value that stays literal on purpose (a framer-motion layout
// radius, a keyframe loop…). It survives comment stripping as a marker, so the value on its line is
// counted as "kept": listed, but neither wired nor hard-coded.
const KEEP = "__DS_KEEP__";
/** Every literal value seen, per category, for `--list=<category>`. */
const LITERALS = {};
const stripComments = (s) => s
  .replace(/\/\*\s*ds-keep[\s\S]*?\*\//g, KEEP)
  .replace(/\/\/\s*ds-keep.*$/gm, KEEP)
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

function scan() {
  const counts = {};
  const byFile = {};
  const add = (key, file, n = 1) => {
    if (!n) return;
    counts[key] = (counts[key] || 0) + n;
    (byFile[key] ||= {})[file] = (byFile[key][file] || 0) + n;
  };

  const files = listFiles(SRC).map((f) => path.relative(ROOT, f).split(path.sep).join("/")).filter((f) => !SKIP_FILE.some((re) => re.test(f)));
  for (const file of files) {
    const source = stripComments(fs.readFileSync(path.join(ROOT, file), "utf8"));
    const isArt = ART_FILE.some((re) => re.test(file));
    const contentColour = CONTENT_COLOUR_FILE.some((re) => re.test(file));
    const isCss = file.endsWith(".css");
    const isTsx = file.endsWith(".tsx");
    // The primitive layer: components/ui plus the Radix wrappers that still have their own folders.
    const inUi = file.startsWith("src/components/ui/") || /^src\/components\/(Checkbox|Popover|Slider|Switch|Tabs|Tooltip)\//.test(file);
    add("files", file);

    if (!isArt) {
      // Declarations: CSS rules, or keys of inline style objects.
      const decls = [];
      if (isCss) {
        decls.push(...cssDeclarations(source));
      } else if (isTsx) {
        for (const block of source.matchAll(/style=\{\{([\s\S]*?)\}\}/g)) decls.push(...inlineDeclarations(block[1]));
      }
      for (const [prop, value, kept] of decls) {
        const category = Object.keys(CATEGORIES).find((c) => CATEGORIES[c].test(prop));
        if (category && kept) { add(`kept.${category}`, file); continue; }
        // A keyframe animation keeps its own timing (plan: "animations, which loop, keep their timing");
        // only transitions belong on the duration scale. Counted apart, like local z-index.
        if (category === "motion" && /^animation$/.test(prop) && classify(value, isCss) === "literal") { add("keyframe.motion", file); continue; }
        // z-index -1…9 orders siblings inside one component; page layers (10+) must use the --z-* scale.
        const local = category === "zIndex" && /^["'`]?(-1|\d)["'`]?$/.test(value.trim());
        if (category === "color" && contentColour) continue;
        if (category && !local && classify(value, isCss) === "literal") (LITERALS[category] ||= []).push({ file, prop, value: value.trim() });
        if (category) add(`${local ? "local" : classify(value, isCss)}.${category}`, file);
      }
      if (!contentColour) add("colorLiteral.hex", file, count(source, /#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z_-])/g));
      if (!contentColour) add("colorLiteral.rgb", file, count(source, /\brgba?\(\s*\d/g));
    }

    if (!isTsx) continue;
    add("styleBlocks", file, count(source, /style=\{/g));
    add("classNames", file, count(source, /className=/g));
    // Arbitrary values that hold a literal (`p-[13px]`) in feature code; `text-[var(--neutral-500)]` points at a
    // token and isn't counted. Primitives may pin exact optical pixels (plan Appendix B), so they're skipped.
    if (!inUi) add("twArbitrary", file, (source.match(/(?<![\w-])-?[a-z][a-z-]*-\[[^\]\s"'`]+\]/g) || []).filter((v) => !v.includes("var(")).length);
    if (!inUi) {
      for (const tag of RAW_TAGS) add(`raw.${tag === "motion.button" ? "button" : tag}`, file, tagCount(source, tag));
      add("pattern.roleDialog", file, count(source, /role=["']dialog["']/g));
      // react-slot (asChild) is a composition helper, not a widget.
      add("pattern.radixOutsideUi", file, count(source, /from ["']@radix-ui\/(?!react-slot["'])/g));
      add("pattern.ariaExpanded", file, count(source, /aria-expanded=/g));
      add("pattern.roleAlert", file, count(source, /role=["']alert["']/g));
      add("pattern.roleProgressbar", file, count(source, /role=["']progressbar["']/g));
      add("pattern.roleRadiogroup", file, count(source, /role=["']radiogroup["']/g));
    }
    for (const p of PRIMITIVES) add(`use.${p}`, file, tagCount(source, p));
  }
  return { counts, byFile };
}

// ── Summary ──────────────────────────────────────────────────────────────────
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : "—");

function summary(counts) {
  const g = (k) => counts[k] || 0;
  const lines = [];
  lines.push(`Design-system scan · ${g("files")} files\n`);
  lines.push("Style values        token   literal   wired   hardcoded");
  let tTok = 0, tLit = 0;
  for (const c of Object.keys(CATEGORIES)) {
    const tok = g(`token.${c}`), lit = g(`literal.${c}`);
    tTok += tok; tLit += lit;
    lines.push(`  ${c.padEnd(16)}${String(tok).padStart(7)}${String(lit).padStart(10)}${pct(tok, tok + lit).padStart(8)}${pct(lit, tok + lit).padStart(12)}`);
  }
  lines.push(`  ${"TOTAL".padEnd(16)}${String(tTok).padStart(7)}${String(tLit).padStart(10)}${pct(tTok, tTok + tLit).padStart(8)}${pct(tLit, tTok + tLit).padStart(12)}`);
  lines.push(`  (not counted: ${g("local.zIndex")} z-index values -1…9, sibling order inside one component)`);
  if (g("keyframe.motion")) lines.push(`  (not counted: ${g("keyframe.motion")} keyframe animations, which keep their own timing)`);
  const keptCats = Object.keys(CATEGORIES).filter((c) => g(`kept.${c}`));
  if (keptCats.length) lines.push(`  (kept on purpose with ds-keep, not counted: ${keptCats.map((c) => `${c} ${g(`kept.${c}`)}`).join(", ")})`);
  lines.push(`\nColour literals    hex ${g("colorLiteral.hex")} · rgb()/rgba() ${g("colorLiteral.rgb")}`);
  lines.push(`Inline style blocks ${g("styleBlocks")} · className ${g("classNames")} · Tailwind arbitrary values ${g("twArbitrary")}`);

  const btnPrim = g("use.Button") + g("use.IconButton") + g("use.ChipButton");
  const inPrim = g("use.InputField") + g("use.PasswordInputField") + g("use.TimeField");
  const btnRaw = g("raw.button"), inRaw = g("raw.input") + g("raw.textarea");
  lines.push("\nInteractive         primitive   raw   wired");
  lines.push(`  buttons         ${String(btnPrim).padStart(11)}${String(btnRaw).padStart(6)}${pct(btnPrim, btnPrim + btnRaw).padStart(8)}`);
  lines.push(`  text inputs     ${String(inPrim).padStart(11)}${String(inRaw).padStart(6)}${pct(inPrim, inPrim + inRaw).padStart(8)}`);
  lines.push(`  overall         ${String(btnPrim + inPrim).padStart(11)}${String(btnRaw + inRaw).padStart(6)}${pct(btnPrim + inPrim, btnPrim + inPrim + btnRaw + inRaw).padStart(8)}`);

  lines.push("\nOutside components/ui");
  for (const k of ["raw.select", "raw.label", "raw.a", "raw.table", "raw.hr", "raw.kbd", "raw.svg", "raw.h1", "raw.h2", "raw.h3", "pattern.roleDialog", "pattern.radixOutsideUi", "pattern.ariaExpanded", "pattern.roleAlert", "pattern.roleProgressbar", "pattern.roleRadiogroup"])
    lines.push(`  ${k.padEnd(26)}${g(k)}`);
  return lines.join("\n");
}

// ── Baseline / ratchet ───────────────────────────────────────────────────────
function tracked(counts) {
  return Object.fromEntries(TRACKED.map((k) => [k, counts[k] || 0]));
}

function check(counts) {
  if (!fs.existsSync(BASELINE)) {
    console.error("No baseline yet. Run: node scripts/ds-scan.mjs --update");
    process.exit(1);
  }
  const base = JSON.parse(fs.readFileSync(BASELINE, "utf8")).counts;
  const now = tracked(counts);
  const worse = TRACKED.filter((k) => now[k] > (base[k] ?? Infinity));
  const better = TRACKED.filter((k) => now[k] < (base[k] ?? 0));
  for (const k of worse) console.error(`✗ ${k}: ${base[k]} → ${now[k]} (+${now[k] - base[k]})`);
  for (const k of better) console.log(`✓ ${k}: ${base[k]} → ${now[k]}`);
  if (worse.length) {
    console.error("\nHardcoded counts went up. Use a token or primitive, or see docs/design-system-primitives-plan.md.");
    console.error("List offenders with: node scripts/ds-scan.mjs --top=<counter>");
    process.exit(1);
  }
  console.log(better.length ? "\nImproved. Lock it in with: npm run ds:check -- --update" : "ds:check passed (no change).");
}

function update(counts) {
  const now = tracked(counts);
  let next = now;
  if (fs.existsSync(BASELINE)) {
    const base = JSON.parse(fs.readFileSync(BASELINE, "utf8")).counts;
    next = Object.fromEntries(TRACKED.map((k) => [k, k in base ? Math.min(base[k], now[k]) : now[k]]));
    const raised = TRACKED.filter((k) => now[k] > (base[k] ?? Infinity));
    if (raised.length) console.warn(`Not raised (still above baseline): ${raised.join(", ")}`);
  }
  fs.writeFileSync(BASELINE, JSON.stringify({ updated: new Date().toISOString().slice(0, 10), counts: next }, null, 2) + "\n");
  console.log(`Baseline written to ${path.relative(ROOT, BASELINE)}`);
}

// ── CLI ──────────────────────────────────────────────────────────────────────
// Only when run directly, so tests can import cssDeclarations.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const { counts, byFile } = scan();
  const top = args.find((a) => a.startsWith("--top="));
  const list = args.find((a) => a.startsWith("--list="));
  if (list) {
    // Every hard-coded value of one category (e.g. --list=shadow), most common first, with where it is.
    const rows = LITERALS[list.slice(7)] || [];
    const groups = new Map();
    for (const r of rows) { const k = `${r.prop}: ${r.value}`; (groups.get(k) || groups.set(k, []).get(k)).push(r.file); }
    for (const [k, fs_] of [...groups].sort((a, b) => b[1].length - a[1].length)) console.log(`${String(fs_.length).padStart(4)}× ${k}\n        ${[...new Set(fs_)].join(", ")}`);
    console.log(`${rows.length} literal ${list.slice(7)} values`);
  } else if (args.includes("--json")) console.log(JSON.stringify(counts, null, 2));
  else if (top) {
    const key = top.slice(6);
    const rows = Object.entries(byFile[key] || {}).sort((a, b) => b[1] - a[1]).slice(0, Number(args.find((a) => a.startsWith("--limit="))?.slice(8) ?? 30));
    console.log(rows.length ? rows.map(([f, n]) => `${String(n).padStart(5)}  ${f}`).join("\n") : `No matches for ${key}`);
  } else if (args.includes("--check")) {
    if (args.includes("--update")) update(counts);
    else check(counts);
  } else if (args.includes("--update")) update(counts);
  else console.log(summary(counts));
}
