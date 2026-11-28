// One-off migration (2026-11-26), kept as a record: the design values ds-sweep.mjs found outside ds-scan.mjs → tokens.
// Exact values only. Every edit is checked: old and new values resolve to the same string in light and
// dark. Values with no equal token get a token: shared steps (pre-declared below) or a component token.
//
//   node scripts/codemods/fix-all-tokens.mjs --dry   plan only
//   node scripts/codemods/fix-all-tokens.mjs         apply (it has been applied; rerunning finds nothing)
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const HERE = path.join(ROOT, ".ds-screens"); // plan files (git-ignored)
const DRY = process.argv.includes("--dry");
const ts = createRequire(ROOT + "/package.json")("typescript");
const TOK = path.join(ROOT, "src/styles/tokens");

// ── token database ────────────────────────────────────────────────────────────────────────────────
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
function rootVars(file) { const out = {}; for (const b of strip(fs.readFileSync(path.join(TOK, file), "utf8")).matchAll(/(^|\n)\s*:root\s*\{([\s\S]*?)\n\}/g)) for (const m of b[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim(); return out; }
function darkVars() { const out = {}; for (const b of strip(fs.readFileSync(path.join(TOK, "theme.css"), "utf8")).matchAll(/:root\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/g)) for (const m of b[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim(); return out; }
const ORDER = ["primitives.css", "scales.css", "typography.css", "aliases.css", "semantic.css"];
const light = Object.assign({}, ...ORDER.map(rootVars));
const dark = darkVars();
const NEW = {}; // name -> { value, where: 'scales'|'component', comment }
const res = (v, vars, d = 0) => d > 14 ? v : v.replace(/var\((--[\w-]+)(?:\s*,\s*([^)]+))?\)/g, (_, n, fb) => { const x = vars[n] ?? NEW[n]?.value ?? light[n]; return x === undefined ? (fb ?? `var(${n})`) : res(x, vars, d + 1); });
const L = (v) => res(v, light), D = (v) => res(v, { ...light, ...dark });
const norm = (v) => String(v).trim().replace(/^["'`]|["'`]$/g, "").toLowerCase().replace(/\s*,\s*/g, ",").replace(/\(\s*/g, "(").replace(/\s*\)/g, ")")
  .replace(/(^|[\s,(])\.(\d)/g, "$10.$2").replace(/(^|[\s,(-])0px\b/g, "$10").replace(/(\d+\.\d*?)0+\b/g, "$1").replace(/\.(?=[\s,)]|$)/g, "")
  .replace(/#ffffff\b/g, "#fff").replace(/#000000\b/g, "#000").replace(/\bwhite\b/g, "#fff").replace(/\bblack\b/g, "#000").replace(/rgba\((\d+),(\d+),(\d+),1\)/g, "rgb($1,$2,$3)").replace(/\s+/g, " ");
// value index of tokens by light value, built once (new tokens are appended as they're created).
// A token that changes in dark mode is only used where the literal's dark value matches it too.
const INDEX = new Map(); // norm(light value) -> [names in file order]
for (const name of Object.keys(light)) {
  const lv = norm(L(light[name]));
  (INDEX.get(lv) || INDEX.set(lv, []).get(lv)).push(name);
}
const indexNew = (name) => { const lv = norm(L(NEW[name].value)); (INDEX.get(lv) || INDEX.set(lv, []).get(lv)).push(name); };
// Component tokens (2026-11-25 block, and the ones made here) belong to one component: another file
// with an equal value gets its own token instead of borrowing one named for something else.
const semText = fs.readFileSync(path.join(TOK, "semantic.css"), "utf8");
const COMP_BLOCK = new Set([...semText.slice(semText.indexOf("Component values (mapped 2026-11-25)")).matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((m) => m[1]));
let CURRENT_FILE = "", CURRENT_KIND = "";
function lookup(value, prefixRe) {
  const list = INDEX.get(norm(L(value))); if (!list) return null;
  const dv = norm(D(value));
  const sameDark = (n) => norm(D(`var(${n})`)) === dv;
  const mine = (n) => { if (!sameDark(n)) return false; const c = compName(CURRENT_FILE); if (COMP_BLOCK.has(n)) return n.startsWith(`--${c}-`); if (NEW[n]?.where === "component") return compName(NEW[n].comment) === c; return true; };
  return list.find((n) => prefixRe.test(n) && mine(n)) || null;
}

// ── shared steps declared up front (go into scales.css) ──────────────────────────────────────────
const SHARED = [
  ["--focus-ring-width", "2px", "focus outline width"], ["--focus-ring-width-thin", "1px", ""],
  ["--focus-ring-offset", "2px", "focus outline offset"], ["--focus-ring-offset-sm", "1px", ""], ["--focus-ring-offset-md", "3px", ""], ["--focus-ring-offset-lg", "4px", ""], ["--focus-ring-offset-xl", "6px", "search fields, while the ring settles"],
  ["--underline-offset", "2px", "link underline offset"], ["--underline-offset-lg", "3px", ""], ["--underline-offset-xl", "4px", ""],
  ["--decoration-thickness", "1px", ""],
  ["--border-width-thick", "2px", ""],
  ["--blur-2xs", "2px", "blur scale: the same names and values as Tailwind's, plus 2xs"], ["--blur-xs", "4px", ""], ["--blur-sm", "8px", ""], ["--blur-md", "12px", ""], ["--blur-lg", "16px", ""], ["--blur-xl", "24px", ""],
  ["--ease-out-expo", "cubic-bezier(0.16, 1, 0.3, 1)", "long settles: disclosure rows, chart sweeps"], ["--ease-out-quint", "cubic-bezier(0.22, 1, 0.36, 1)", ""],
  ["--duration-quick", "150ms", "between fast and base: sidebar rows, message bubble"],
  ["--radius-card", "14px", "agent, connector and skeleton cards"],
  // Shadows several components write out by hand (each value is used by 3+ components)
  ["--shadow-drop-xs", "0px 1px 1.5px 0px rgba(82, 75, 71, 0.12)", "the small drop under controls"],
  ["--shadow-control", "var(--shadow-drop-xs), 0px 0px 0px 1px var(--neutral-100)", "controls and rows: drop + hairline ring"],
  ["--shadow-field", "var(--shadow-drop-xs), 0px 0px 0px 1px var(--text-field-ring)", "text fields"],
  ["--shadow-field-hover", "var(--shadow-drop-xs), 0px 0px 0px 1px var(--text-field-ring-hover)", ""],
  ["--shadow-chip", "var(--shadow-drop-xs), 0px 0px 0px 1px rgba(212, 212, 212, 0.4)", "raised chips and badges"],
  ["--shadow-chip-selected", "0px 1px 1.5px 0px rgba(2, 15, 24, 0.2), 0px 0px 0px 1px var(--blue-600-50)", ""],
  ["--shadow-badge-inner", "inset 0px 1px 0px 0px color-mix(in srgb, var(--static-white) 61%, transparent), inset 0px -1px 0px 0px rgba(106, 98, 93, 0.05)", "bevel inside chips and badges"],
  ["--shadow-card-raised", "0px 1.091px 1.091px 0px rgba(59, 54, 50, 0.05), 0px 1.455px 3.127px 0px rgba(38, 33, 30, 0.15), 0px 0px 0px 1px var(--neutral-100)", "settings cards and pickers"],
  ["--shadow-card-raised-danger", "0px 1.091px 1.091px 0px rgba(24, 2, 2, 0.05), 0px 1.455px 3.127px 0px rgba(24, 2, 2, 0.15), 0px 0px 0px 1px var(--red-100)", ""],
  ["--shadow-pill-active", "0px 0px 0px 1px var(--neutral-black), 0px 1.091px 1.091px 0px rgba(59, 54, 50, 0.1), 0px 1.455px 3.127px 0px rgba(59, 54, 50, 0.4)", "selected pills"],
  ["--shadow-modal-soft", "0px 12px 16px -4px rgba(130, 122, 116, 0.12), var(--shadow-soft), 0px 0px 0px 1px var(--neutral-100)", "share and invite modals"],
  ["--shadow-ring-strong", "0px 0px 0px 1px rgba(59, 54, 50, 0.3)", ""],
];
for (const [n, v, c] of SHARED) if (!light[n]) { NEW[n] = { value: v, where: "scales", comment: c }; indexNew(n); }

// ── categories ───────────────────────────────────────────────────────────────────────────────────
const CAT = {
  spacing: /^(padding|padding[A-Z]\w*|margin|margin[A-Z]\w*|gap|rowGap|columnGap|padding-[a-z-]+|margin-[a-z-]+|row-gap|column-gap)$/,
  radius: /^(borderRadius|border[A-Z]\w*Radius|radius|border-radius|border-[a-z-]*-radius)$/,
  fontSize: /^(fontSize|font-size)$/, lineHeight: /^(lineHeight|line-height)$/, fontWeight: /^(fontWeight|font-weight)$/, letterSpacing: /^(letterSpacing|letter-spacing)$/,
  zIndex: /^(zIndex|z-index)$/,
  color: /^(color|background|backgroundColor|borderColor|fill|stroke|outlineColor|caretColor|accentColor|stopColor|border(Top|Bottom|Left|Right)Color|background-color|border-color|border-top-color|border-bottom-color|outline-color|textDecorationColor)$/,
  shadow: /^(boxShadow|box-shadow|textShadow|text-shadow)$/,
  border: /^(border|borderTop|borderBottom|borderLeft|borderRight|border-top|border-bottom|border-left|border-right)$/,
  motion: /^(transition|transition-duration|transitionDuration|transition-timing-function|transitionTimingFunction)$/,
  outline: /^(outline)$/, outlineOffset: /^(outlineOffset|outline-offset)$/, underlineOffset: /^(textUnderlineOffset|text-underline-offset)$/,
  filter: /^(filter|backdropFilter|WebkitBackdropFilter|backdrop-filter|-webkit-backdrop-filter)$/,
  borderWidth: /^(borderWidth|border-width)$/,
};
const catOf = (k) => Object.keys(CAT).find((c) => CAT[c].test(k));
const UNITLESS = new Set(["lineHeight", "fontWeight", "zIndex", "line-height", "font-weight", "z-index"]);
const PREFIX = { spacing: /^--space-(\d|px)/, radius: /^--radius-/, fontSize: /^--font-size-/, lineHeightPx: /^--line-height-/, lineHeightUnitless: /^--leading-/, fontWeight: /^--font-weight-/, letterSpacing: /^--tracking-/, zIndex: /^--z-/, duration: /^--duration-/, outline: /^--focus-ring-width/, outlineOffset: /^--focus-ring-offset/, underlineOffset: /^--underline-offset/, blur: /^--blur-/, borderWidth: /^--border-width-/ };

// ── component token naming ───────────────────────────────────────────────────────────────────────
const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/[_\s]+/g, "-").replace(/[^a-zA-Z0-9-]/g, "").toLowerCase().replace(/-+/g, "-").replace(/^-|-$/g, "");
function compName(file) {
  const parts = file.replace(/^src\//, "").replace(/\.(tsx?|css|mjs)$/, "").replace(/\.module$/, "").split("/").filter((p) => !/^\(.*\)$|^_components$|^\[.*\]$|^components$|^app$|^lib$/.test(p));
  let last = parts.pop(); if (/^(index|page|layout|styles|parts|shared)$/.test(last) && parts.length) last = parts.pop() + (/(parts|shared)/.test(last) ? "" : "");
  return kebab(last);
}
const PROPNAME = { borderRadius: "radius", radius: "radius", boxShadow: "shadow", textShadow: "text-shadow", backgroundColor: "bg", background: "bg", borderColor: "border-color", fontSize: "size", lineHeight: "line-height", fontWeight: "weight", letterSpacing: "tracking", zIndex: "z", outlineOffset: "outline-offset", backdropFilter: "backdrop-blur", WebkitBackdropFilter: "backdrop-blur", filter: "filter", transition: "transition" };
const created = new Map(); // comp|prop|value -> name
function componentToken(file, prop, value, hint) {
  const comp = compName(file), p = hint ? kebab(hint) : (PROPNAME[prop] || kebab(prop));
  const key = `${comp}|${p}|${norm(value)}`;
  if (created.has(key)) return created.get(key);
  let base = "--" + `${comp}-${p}`.replace(/-+/g, "-").replace(/^-|-$/g, ""), name = base, i = 2;
  while (light[name] || NEW[name]) name = `${base}-${i++}`;
  NEW[name] = { value, where: "component", comment: file }; indexNew(name);
  created.set(key, name);
  return name;
}

// ── value mapping ────────────────────────────────────────────────────────────────────────────────
const pxOf = (s) => { const m = String(s).match(/^(-?\d*\.?\d+)(px)?$/); return m ? Number(m[1]) : null; };
function lengthToken(cat, part) { // "12px" → var(--space-3), negatives via calc
  const n = pxOf(part); if (n === null) return null; if (n === 0) return part;
  const pre = PREFIX[cat]; if (!pre) return null;
  // a 999px pill radius renders the same as --radius-full on anything under 1998px tall
  const t = cat === "radius" && Math.abs(n) === 999 ? "--radius-full" : lookup(`${Math.abs(n)}px`, pre); if (!t) return null;
  return n < 0 ? `calc(var(${t}) * -1)` : `var(${t})`;
}
// Colour literals outside var(…) only (a token name like --neutral-white is not a colour).
const COLOUR_SRC = String.raw`#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\((?![^)]*var\()[^)]*\)|(?<![\w-])(?:white|black)(?![\w-])`;
function outsideVar(str, fn) { // apply fn to the text between var(...) groups
  let out = "", i = 0;
  while (i < str.length) {
    const j = str.indexOf("var(", i);
    if (j < 0) { out += fn(str.slice(i)); break; }
    out += fn(str.slice(i, j));
    let d = 0, k = j; for (; k < str.length; k++) { if (str[k] === "(") d++; else if (str[k] === ")") { d--; if (d === 0) { k++; break; } } }
    out += str.slice(j, k); i = k;
  }
  return out;
}
const COLOUR_RE = { lastIndex: 0, test: (s) => { let hit = false; outsideVar(s, (seg) => { if (new RegExp(COLOUR_SRC).test(seg)) hit = true; return seg; }); return hit; } };
const replaceColours = (s, fn) => outsideVar(s, (seg) => seg.replace(new RegExp(COLOUR_SRC, "g"), fn));
function colourToken(c) { return lookup(c, /^--(static-|neutral-|brown-|blue-|red-|green-|amber-|yellow-|orange-|purple-|success-|warning-|danger-|info-|grey-|gray-|teal-)/) || lookup(c, /^--/); }
const PARTS = (v) => { const out = []; let d = 0, s = 0; for (let i = 0; i < v.length; i++) { if (v[i] === "(") d++; else if (v[i] === ")") d--; else if (v[i] === "," && d === 0) { out.push(v.slice(s, i)); s = i + 1; } } out.push(v.slice(s)); return out.map((p) => p.trim()); };
function composeShadow(v) { // layers → run of tokens
  const ps = PARTS(v); const best = (i) => { if (i === ps.length) return []; for (let j = ps.length; j > i; j--) { const t = lookup(ps.slice(i, j).join(", "), /^--/); if (t) { const r = best(j); if (r) return [`var(${t})`, ...r]; } } return null; }; const r = best(0); return r ? r.join(", ") : null;
}

/** Returns the tokenised string for value `v` of property `prop` (category `cat`), or null when nothing
 *  needs to change. Creates component tokens for values with no equal token. */
function mapValue(file, prop, cat, v, hint) {
  const raw = String(v).trim();
  if (!raw || /^(inherit|initial|unset|none|auto|transparent|currentColor|0|0px|normal|100%|50%)$/i.test(raw)) return null;
  // already made of tokens only (a var's fallback included): leave it
  if (/var\(/.test(raw)) { let rest = ""; outsideVar(raw, (s) => { rest += s; return s; }); if (rest.replace(/[\s,]/g, "") === "") return null; }
  const T = (val) => `var(${componentToken(file, prop, val, hint)})`;
  switch (cat) {
    case "spacing": case "radius": case "fontSize": case "letterSpacing": case "outlineOffset": case "underlineOffset": case "borderWidth": {
      const c = cat;
      if (cat === "letterSpacing") { if (/var\(--/.test(raw)) return null; const t = lookup(raw, PREFIX.letterSpacing); return t ? `var(${t})` : T(raw); }
      // px lengths outside var(…) (a var's fallback stays as written); each must map, else one token
      // for the whole value
      let ok = true, any = false;
      const out = outsideVar(raw, (seg) => seg.replace(/(?<![\w.-])-?\d*\.?\d+px\b/g, (m) => { if (/^-?0+(\.0+)?px$/.test(m)) return m; any = true; const t = lengthToken(c, m); if (!t) ok = false; return t || m; }));
      if (!any) return null;
      return ok ? out : T(raw);
    }
    case "lineHeight": {
      if (/var\(--/.test(raw)) return null;
      if (/px$/.test(raw)) { const t = lookup(raw, PREFIX.lineHeightPx); return t ? `var(${t})` : T(raw); }
      if (/^\d*\.?\d+$/.test(raw)) { const t = lookup(raw, PREFIX.lineHeightUnitless); return t ? `var(${t})` : T(raw); }
      return null;
    }
    case "fontWeight": { if (!/^\d+$/.test(raw)) return null; const t = lookup(raw, PREFIX.fontWeight); return t ? `var(${t})` : T(raw); }
    case "zIndex": { const n = Number(raw); if (!Number.isFinite(n) || Math.abs(n) < 10) return null; const t = lookup(raw, PREFIX.zIndex); return t ? `var(${t})` : T(raw); }
    case "color": {
      if (!COLOUR_RE.test(raw)) { COLOUR_RE.lastIndex = 0; return null; } COLOUR_RE.lastIndex = 0;
      const whole = colourToken(raw); if (whole && !/gradient|color-mix/.test(raw)) return `var(${whole})`;
      return replaceColours(raw, (c) => `var(${colourToken(c) || componentToken(file, prop, c, (hint || PROPNAME[prop] || kebab(prop)) )})`);
    }
    case "shadow": {
      if (/^none$/.test(raw)) return null;
      const exact = lookup(raw, /^--shadow-/) || lookup(raw, /^--/); if (exact) return `var(${exact})`;
      const comp = composeShadow(raw); if (comp) return comp;
      if (/var\(--/.test(raw) && !COLOUR_RE.test(raw.replace(/var\([^)]*\)/g, ""))) { COLOUR_RE.lastIndex = 0; return null; } COLOUR_RE.lastIndex = 0;
      return T(raw);
    }
    case "border": { // width style colour: map the colour part
      if (!COLOUR_RE.test(raw)) { COLOUR_RE.lastIndex = 0; return null; } COLOUR_RE.lastIndex = 0;
      return replaceColours(raw, (c) => `var(${colourToken(c) || componentToken(file, prop, c, "border-color")})`);
    }
    case "motion": { // durations in transition strings
      let changed = false;
      const out = raw.replace(/(?<![\w.-])(\d*\.?\d+)(ms|s)\b/g, (m, n, u) => { const ms = u === "s" ? Number(n) * 1000 : Number(n); if (ms === 0) return m; changed = true; return `var(${lookup(`${ms}ms`, PREFIX.duration) || componentToken(file, prop, `${ms}ms`, "duration")})`; })
        .replace(/cubic-bezier\([^)]*\)/g, (m) => { changed = true; return `var(${lookup(m, /^--ease-/) || componentToken(file, prop, m, "ease")})`; });
      return changed ? out : null;
    }
    case "outline": { // "2px solid var(--focus-ring)"
      let changed = false;
      const out = replaceColours(raw.replace(/(?<![\w.-])(\d*\.?\d+)px\b/, (m) => { const t = lookup(m, PREFIX.outline); changed = true; return `var(${t || componentToken(file, prop, m, "outline-width")})`; }),
        (c) => { changed = true; return `var(${colourToken(c) || componentToken(file, prop, c, "outline-color")})`; });
      return changed ? out : null;
    }
    case "filter": {
      let changed = false;
      const out = raw.replace(/blur\((\d*\.?\d+)px\)/g, (m, n) => { if (Number(n) === 0) return m; changed = true; return `blur(var(${lookup(`${n}px`, PREFIX.blur) || componentToken(file, prop, `${n}px`, "blur")}))`; })
        .replace(/drop-shadow\(([^()]*(\([^)]*\))?[^()]*)\)/g, (m, inner) => { if (/var\(--/.test(inner)) return m; changed = true; return `drop-shadow(var(${componentToken(file, prop, inner.trim(), "drop-shadow")}))`; });
      return changed ? out : null;
    }
  }
  return null;
}

// ── edits ────────────────────────────────────────────────────────────────────────────────────────
const plan = [], manual = [];
// equal forms: calc(Npx * -1) = -Npx; 0.15s = 150ms
const canon = (v) => norm(v).replace(/\b(999|9999)px\b/g, "PILL").replace(/calc\((-?\d*\.?\d+)px \* -1\)/g, (_, n) => `${-Number(n)}px`).replace(/(?<![\w.])(\d*\.?\d+)s\b/g, (_, n) => `${Math.round(Number(n) * 1000)}ms`);
const verify = (oldV, newV) => canon(L(oldV)) === canon(L(newV)) && canon(D(oldV)) === canon(D(newV));
function record(file, start, end, oldText, newText, oldVal, newVal, why) {
  if (oldText === newText) return; why = (CURRENT_KIND ? CURRENT_KIND + ": " : "") + why;
  const ok = verify(oldVal, newVal);
  plan.push({ file, start, end, oldText, newText, ok, why, oldVal, newVal });
}

const SKIP = [/\.(test|spec|stories)\.[tj]sx?$/, /^src\/styles\/tokens\//, /^src\/lib\/springs\.ts$/ /* KDS spring presets: a token source */, /\/__tests__\//, /\.d\.ts$/, /^src\/app\/\(app\)\/dev\//,
  /^src\/components\/(Pin|PinCategory|PinCommentField|PinInsert|PinSkeleton|Pinboard|PinboardExpanded|PinboardHeader|PinboardSkeleton|HighlightCard|HighlightMark|HighlightPanel)\//,
  /^src\/components\/layout\/HighlightSidebar\.tsx$/, /^src\/lib\/(pin-markdown\.tsx|export-pins\.ts|rendered-highlights\.ts)$/, /^src\/components\/chat\/PinMentionDropdown\.tsx$/,
  /^src\/lib\/(library\/viewers\/(inert-html|rtf)|templates\/template-view|apply-marks)\.ts$/];
const ART = [/^src\/components\/PersonaCard\/(scenes|job-scenes|AnimatedPersonaAvatar)\.tsx$/, /^src\/lib\/llm-icons\.generated\.ts$/, /^src\/components\/(CardBrandLogo|ModelIcon|SouvenirLogo|ConnectorGlyph|ThemedLlmIcon)\//];
const CONTENT_COLOUR = [/^src\/components\/chat\/CodeBlock(\.module)?\.(tsx|css)$/, /^src\/components\/chat\/XmlWeather\.tsx$/];
function listFiles(dir, out = []) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) listFiles(p, out); else out.push(p); } return out; }
const files = listFiles(path.join(ROOT, "src")).map((f) => path.relative(ROOT, f).split(path.sep).join("/")).filter((f) => !SKIP.some((r) => r.test(f)) && !ART.some((r) => r.test(f)));

// Strings JS reads back (computed-style comparisons, canvas/map paint colours, contrast maths): not CSS.
const E_SKIP = /^src\/components\/(SearchFieldRing\/index\.tsx|chat\/XmlMap\.colors\.ts|chat\/AnimatedTags\.contrast\.ts)$/;
// motion tokens (JS)
const DUR_NAMED = { 80: "instant", 120: "fast", 200: "base", 320: "slow" };
const durUsed = new Set(), springUsed = new Map(), blurUsed = new Set();
const durRef = (sec) => { const ms = Math.round(Number(sec) * 1000); durUsed.add(ms); return DUR_NAMED[ms] ? `DURATION.${DUR_NAMED[ms]}` : `DURATION[${ms}]`; };
const BLUR_NAMED = { 2: "'2xs'", 4: "xs", 8: "sm", 12: "md", 16: "lg", 24: "xl" };
const blurRef = (px) => { blurUsed.add(Number(px)); const n = BLUR_NAMED[px]; return n ? (n.startsWith("'") ? `BLUR[${n}]` : `BLUR.${n}`) : `BLUR[${String(px).replace(".", "_") === String(px) ? px : `'${px}'`}]`; };
const SPRING_NAMED = { "500|30|": "snappy", "500|32|": "snappyFirm", "380|28|": "brisk", "140|18|1": "gentle", "140|18|": "gentle", "400|32|0.8": "settle", "260|32|0.9": "glide" };
const springRef = (s, d, m) => { const k = `${s}|${d}|${m ?? ""}`; const name = SPRING_NAMED[k] || `s${s}d${d}${m ? `m${String(m).replace(".", "_")}` : ""}`; springUsed.set(name, { stiffness: Number(s), damping: Number(d), ...(m ? { mass: Number(m) } : {}) }); return `SPRING.${name}`; };

const importsNeeded = new Map(); // file -> Set
for (const file of files.filter((f) => /\.(tsx?|mjs)$/.test(f))) {
  const text = fs.readFileSync(path.join(ROOT, file), "utf8"); CURRENT_FILE = file;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const lines = text.split("\n");
  const lineOf = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;
  const kept = (n) => { const l = lineOf(n.getStart(sf)); return lines[l - 1]?.includes("ds-keep") || lines[l - 2]?.includes("ds-keep"); };
  const contentColour = CONTENT_COLOUR.some((r) => r.test(file));
  const q = text.includes("'use client'") || (text.match(/'/g) || []).length > (text.match(/"/g) || []).length ? "'" : '"';
  const handled = new Set();

  // consts with literal initialisers, and their references
  const consts = new Map(); const refs = new Map(); const exported = new Set();
  const scanDecl = (n) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && (ts.isNumericLiteral(n.initializer) || ts.isStringLiteralLike(n.initializer) || (ts.isPrefixUnaryExpression(n.initializer) && ts.isNumericLiteral(n.initializer.operand)))) {
      consts.set(n.name.text, n); if (n.parent?.parent?.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) exported.add(n.name.text);
    }
    if (ts.isIdentifier(n) && !(ts.isVariableDeclaration(n.parent) && n.parent.name === n) && !(ts.isPropertyAssignment(n.parent) && n.parent.name === n) && !(ts.isPropertyAccessExpression(n.parent) && n.parent.name === n)) { (refs.get(n.text) || refs.set(n.text, []).get(n.text)).push(n); }
    ts.forEachChild(n, scanDecl);
  };
  scanDecl(sf);
  const constUse = new Map(); // name -> [{prop, cat, ctx}]
  const markConst = (id, prop, cat) => (constUse.get(id.text) || constUse.set(id.text, []).get(id.text)).push({ prop, cat, id });

  // replace literal leaves of one style value
  function leafEdits(expr, prop, cat, depth = 0) {
    if (!expr || depth > 6) return;
    if (ts.isNumericLiteral(expr) || (ts.isPrefixUnaryExpression(expr) && ts.isNumericLiteral(expr.operand) && expr.operator === ts.SyntaxKind.MinusToken)) {
      const n = ts.isNumericLiteral(expr) ? Number(expr.text) : -Number(expr.operand.text); if (n === 0) return;
      const unitless = UNITLESS.has(prop);
      const val = unitless ? String(n) : `${n}px`;
      const m = mapValue(file, prop, cat, val); if (!m) return;
      record(file, expr.getStart(sf), expr.end, expr.getText(sf), `${q}${m}${q}`, val, m, `${prop} number`);
      return;
    }
    if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
      const m = mapValue(file, prop, cat, expr.text); if (!m || m === expr.text) return;
      const quote = expr.getText(sf)[0];
      record(file, expr.getStart(sf), expr.end, expr.getText(sf), `${quote}${m}${quote}`, expr.text, m, `${prop} string`);
      return;
    }
    if (ts.isTemplateExpression(expr)) {
      // map literal pieces inside the template text; interpolations stay
      let changed = false; const segs = [expr.head.text, ...expr.templateSpans.map((s) => s.literal.text)];
      const mapped = segs.map((seg, i) => {
        if (cat === "motion" || cat === "filter" || cat === "shadow" || cat === "border" || cat === "color" || cat === "outline") {
          // only standalone pieces: lengths/durations/colours not glued to an interpolation
          const m = mapPieces(seg, prop, cat, i > 0, i < segs.length - 1); if (m !== seg) changed = true; return m;
        }
        const m = mapPieces(seg, prop, cat, i > 0, i < segs.length - 1); if (m !== seg) changed = true; return m;
      });
      if (changed) {
        const txt = "`" + mapped[0] + expr.templateSpans.map((s, i) => "${" + s.expression.getText(sf) + "}" + mapped[i + 1]).join("") + "`";
        const probe = (a) => a[0] + expr.templateSpans.map((_, i) => "X" + a[i + 1]).join("");
        record(file, expr.getStart(sf), expr.end, expr.getText(sf), txt, probe(segs), probe(mapped), `${prop} template`);
      }
      expr.templateSpans.forEach((s) => leafEdits(s.expression, prop, cat, depth + 1));
      return;
    }
    if (ts.isConditionalExpression(expr)) { leafEdits(expr.whenTrue, prop, cat, depth + 1); leafEdits(expr.whenFalse, prop, cat, depth + 1); return; }
    if (ts.isBinaryExpression(expr) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.AmpersandAmpersandToken].includes(expr.operatorToken.kind)) { leafEdits(expr.right, prop, cat, depth + 1); if (expr.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken) leafEdits(expr.left, prop, cat, depth + 1); return; }
    if (ts.isParenthesizedExpression(expr) || ts.isAsExpression(expr) || ts.isNonNullExpression(expr)) return leafEdits(expr.expression, prop, cat, depth + 1);
    if (ts.isIdentifier(expr) && consts.has(expr.text)) { markConst(expr, prop, cat); return; }
  }
  // standalone pieces in template text
  function mapPieces(seg, prop, cat, gluedLeft, gluedRight) {
    // protect a number glued to an interpolation: "${x}px" (seg starts with "px") or "...-${"
    let s = seg;
    if (cat === "spacing" || cat === "radius" || cat === "fontSize" || cat === "outlineOffset" || cat === "underlineOffset" || cat === "borderWidth") {
      return s.replace(/(^|[\s(,])(-?\d*\.?\d+px)(?=$|[\s),])/g, (m, pre, len, off) => {
        if (off === 0 && gluedLeft && pre === "") return m;
        if (off + m.length === s.length && gluedRight && /-$/.test(len)) return m;
        const t = lengthToken(cat, len); return pre + (t || `var(${componentToken(file, prop, len)})`);
      });
    }
    // A template piece is only part of a value: never one token for it (it may not be balanced CSS).
    // Map the complete literals inside it: colours, durations/curves, blur radii.
    if (cat === "motion") return mapValue(file, prop, "motion", s) ? keepEdgeSpace(s, mapValue(file, prop, "motion", s)) : s;
    if (cat === "filter") { const r = mapValue(file, prop, "filter", s); return r ? keepEdgeSpace(s, r) : s; }
    return replaceColours(s, (c) => `var(${colourToken(c) || componentToken(file, prop, c, (PROPNAME[prop] || kebab(prop)) + "-color")})`);
  }
  const keepEdgeSpace = (a, b) => (a.match(/^\s*/)[0]) + b.trim() + (a.match(/\s*$/)[0]);

  function styleObject(obj, kind) {
    handled.add(obj);
    for (const p of obj.properties) {
      if (ts.isSpreadAssignment(p)) { if (ts.isObjectLiteralExpression(p.expression)) styleObject(p.expression, kind); continue; }
      if (!ts.isPropertyAssignment(p)) continue;
      const key = ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : null; if (!key) continue;
      if (ts.isObjectLiteralExpression(p.initializer)) { styleObject(p.initializer, kind); continue; }
      if (kept(p) || handled.has(p)) continue;
      if (key.startsWith("--")) { const cat = /color|bg|border|fill|stroke/.test(key) ? "color" : /shadow/.test(key) ? "shadow" : null; if (cat) leafEdits(p.initializer, key, cat); continue; }
      const cat = catOf(key); if (!cat || (contentColour && cat === "color")) continue;
      if (kind === "motion") continue; // framer values handled by motion pass
      leafEdits(p.initializer, key, cat);
    }
  }
  const unwrapObjs = (e, out = []) => { if (!e) return out; if (ts.isObjectLiteralExpression(e)) out.push(e); else if (ts.isConditionalExpression(e)) { unwrapObjs(e.whenTrue, out); unwrapObjs(e.whenFalse, out); } else if (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression?.(e)) unwrapObjs(e.expression, out); else if (ts.isBinaryExpression(e)) { unwrapObjs(e.left, out); unwrapObjs(e.right, out); } else if (ts.isArrayLiteralExpression(e)) e.elements.forEach((x) => unwrapObjs(x, out)); return out; };

  // motion pass on a framer object
  function motionObject(obj) {
    handled.add(obj);
    const props = obj.properties.filter(ts.isPropertyAssignment);
    const get = (k) => props.find((p) => (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) && p.name.text === k);
    const st = get("stiffness"), dm = get("damping"), ms = get("mass");
    if (st && dm && ts.isNumericLiteral(st.initializer) && ts.isNumericLiteral(dm.initializer) && (!ms || ts.isNumericLiteral(ms.initializer)) && !kept(st)) {
      const ref = springRef(st.initializer.text, dm.initializer.text, ms?.initializer.text);
      const group = [st, dm, ms].filter(Boolean).sort((a, b) => a.getStart(sf) - b.getStart(sf));
      // replace the first with the spread, delete the others (with their trailing comma)
      record(file, group[0].getStart(sf), group[0].end, group[0].getText(sf), `...${ref}`, "s", "s", "spring");
      for (const g of group.slice(1)) { let end = g.end; const after = text.slice(end); const mm = after.match(/^\s*,/); if (mm) end += mm[0].length; let start = g.getStart(sf); const before = text.slice(0, start); const bm = before.match(/,\s*$/); if (bm && !mm) start -= bm[0].length; record(file, start, end, text.slice(start, end), "", "s", "s", "spring-part"); }
      need("SPRING");
    }
    for (const p of props) {
      const key = (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : null; if (!key || kept(p)) continue;
      if (ts.isObjectLiteralExpression(p.initializer)) { motionObject(p.initializer); continue; }
      if (/^(duration|delay|staggerChildren|delayChildren|repeatDelay)$/.test(key)) {
        const lit = (e) => { if (ts.isNumericLiteral(e) && Number(e.text) !== 0) { record(file, e.getStart(sf), e.end, e.getText(sf), durRef(e.text), "d", "d", "duration"); need("DURATION"); } else if (ts.isConditionalExpression(e)) { lit(e.whenTrue); lit(e.whenFalse); } };
        lit(p.initializer);
      }
      if (key === "filter") {
        const fix = (e) => { if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) { const m = e.text.match(/^blur\((\d*\.?\d+)px\)$/); if (m && Number(m[1]) !== 0) { record(file, e.getStart(sf), e.end, e.getText(sf), "`blur(${" + blurRef(m[1]) + "}px)`", "b", "b", "blur"); need("BLUR"); } } else if (ts.isArrayLiteralExpression(e)) e.elements.forEach(fix); else if (ts.isConditionalExpression(e)) { fix(e.whenTrue); fix(e.whenFalse); } };
        fix(p.initializer);
      }
      if (ts.isArrayLiteralExpression(p.initializer) || ts.isConditionalExpression(p.initializer)) unwrapObjs(p.initializer).forEach(motionObject);
    }
  }
  const need = (n) => (importsNeeded.get(file) || importsNeeded.set(file, new Set()).get(file)).add(n);

  const visit = (n) => {
    if (ts.isJsxAttribute(n) && n.initializer && ts.isJsxExpression(n.initializer)) {
      const name = n.name.getText(sf), e = n.initializer.expression;
      const parent = n.parent.parent; const tag = (ts.isJsxOpeningElement(parent) || ts.isJsxSelfClosingElement(parent)) ? parent.tagName.getText(sf) : "";
      const hasLayout = parent.attributes?.properties?.some((a) => ts.isJsxAttribute(a) && /^(layout|layoutId)$/.test(a.name.getText(sf)));
      if (name === "style") unwrapObjs(e).forEach((o) => { if (hasLayout) { for (const p of o.properties) if (ts.isPropertyAssignment(p) && /radius/i.test(p.name.getText(sf))) handled.add(p); } styleObject(o, "jsx-style"); });
      else if (/^(animate|initial|exit|whileHover|whileTap|whileFocus|whileInView|transition|variants)$/.test(name)) unwrapObjs(e).forEach(motionObject);
      else if (/^(contentStyle|labelStyle|itemStyle|wrapperStyle)$/.test(name)) unwrapObjs(e).forEach((o) => styleObject(o, "chart"));
      else if (name === "radius" && /Skeleton/.test(tag) && e && !kept(n)) leafEdits(e, "borderRadius", "radius");
      else if (/^(fontSize)$/.test(name) && /^(text|tspan)$/.test(tag) && e && !kept(n)) { if (ts.isNumericLiteral(e)) { const m = mapValue(file, "fontSize", "fontSize", `${e.text}px`); if (m) record(file, n.initializer.getStart(sf), n.initializer.end, n.initializer.getText(sf), `"${m}"`, `${e.text}px`, m, "svg fontSize"); } }
      else if (/^(fill|stroke|stopColor|color)$/.test(name) && /^[a-z]/.test(tag) && e && !kept(n) && (ts.isStringLiteral(e))) leafEdits(e, name, "color");
    }
    if (ts.isJsxAttribute(n) && n.initializer && ts.isStringLiteral(n.initializer) && !kept(n)) {
      const name = n.name.getText(sf); const parent = n.parent.parent; const tag = (ts.isJsxOpeningElement(parent) || ts.isJsxSelfClosingElement(parent)) ? parent.tagName.getText(sf) : "";
      if (/^(fill|stroke|stopColor|color)$/.test(name) && /^[a-z]/.test(tag) && !contentColour) { const m = mapValue(file, name, "color", n.initializer.text); if (m) record(file, n.initializer.getStart(sf), n.initializer.end, n.initializer.getText(sf), `"${m}"`, n.initializer.text, m, "svg colour attr"); }
      if (name === "fontSize" && /^(text|tspan)$/.test(tag)) { const m = mapValue(file, "fontSize", "fontSize", /px$/.test(n.initializer.text) ? n.initializer.text : n.initializer.text + "px"); if (m) record(file, n.initializer.getStart(sf), n.initializer.end, n.initializer.getText(sf), `"${m}"`, n.initializer.text + (/px$/.test(n.initializer.text) ? "" : "px"), m, "svg fontSize"); }
    }
    if ((ts.isVariableDeclaration(n) || ts.isPropertyDeclaration(n)) && n.initializer) {
      const typeTxt = n.type?.getText(sf) || ""; const init = n.initializer;
      const asType = (ts.isAsExpression(init) || ts.isSatisfiesExpression?.(init)) ? init.type.getText(sf) : "";
      if (/Variants|Transition|TargetAndTransition/.test(typeTxt + asType)) unwrapObjs(init).forEach(motionObject);
      else if (/CSSProperties|MotionStyle/.test(typeTxt + asType)) unwrapObjs(init).forEach((o) => { if (!handled.has(o)) styleObject(o, "const"); });
    }
    // imperative
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(n.left) && ts.isPropertyAccessExpression(n.left.expression) && n.left.expression.name.text === "style" && !kept(n)) {
      const key = n.left.name.text, cat = catOf(key); if (cat) leafEdits(n.right, key, cat);
    }
    // untyped style-like objects
    if (ts.isObjectLiteralExpression(n) && !handled.has(n)) {
      const keys = n.properties.filter(ts.isPropertyAssignment).map((p) => (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : "");
      const strong = keys.filter((k) => /^(padding\w*|margin\w*|borderRadius|boxShadow|fontSize|fontWeight|lineHeight|letterSpacing|backgroundColor|borderColor|gap|zIndex|transition)$/.test(k));
      if (strong.length >= 1 && keys.filter((k) => catOf(k) || /^(width|height|display|position|top|left|right|bottom|opacity|cursor|overflow|alignItems|justifyContent|flex\w*)$/.test(k)).length >= 2) { CURRENT_KIND = "style-like"; styleObject(n, "style-like"); CURRENT_KIND = ""; }
      if (keys.some((k) => /^(stiffness|damping|duration|delay)$/.test(k)) && (keys.includes("type") || keys.includes("ease") || keys.includes("stiffness"))) motionObject(n);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);

  // consts used only as style values → map the initialiser; otherwise report
  for (const [name, uses] of constUse) {
    const decl = consts.get(name); if (!decl) continue;
    const allRefs = (refs.get(name) || []);
    const styleIds = new Set(uses.map((u) => u.id));
    const others = allRefs.filter((r) => !styleIds.has(r));
    const cats = new Set(uses.map((u) => u.cat)); const prop = uses[0].prop;
    const declLine = lineOf(decl.getStart(sf));
    if (lines[declLine - 1].includes("ds-keep")) continue;
    const isString = ts.isStringLiteralLike(decl.initializer);
    if (cats.size > 1 || (!isString && (others.length || exported.has(name)))) { manual.push({ file, line: declLine, what: `const ${name} used in ${[...cats]} and ${others.length} other place(s)${exported.has(name) ? ", exported" : ""}` }); continue; }
    const init = decl.initializer;
    const isNum = ts.isNumericLiteral(init) || ts.isPrefixUnaryExpression(init);
    const val = isNum ? (UNITLESS.has(prop) ? init.getText(sf) : `${init.getText(sf).replace(/\s/g, "")}px`) : init.text;
    const m = mapValue(file, prop, [...cats][0], val, kebab(name));
    if (m) record(file, init.getStart(sf), init.end, init.getText(sf), `${q}${m}${q}`, val, m, `const ${name}`);
  }

  // colour/shadow literals left in other strings (E): object values, arrays, consts
  const inPlan = (s, e) => plan.some((p) => p.file === file && p.start <= s && p.end >= e);
  const strVisit = (n) => {
    if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && /[{}]/.test(n.text) && /[a-z-]+\s*:\s*[^;{}]+;/.test(n.text) && !kept(n) && !inPlan(n.getStart(sf), n.end)) {
      // CSS rules in a string (a <style> block): map each declaration
      const t = n.text; let changed = false;
      const out = t.replace(/(^|[;{\s])([a-z-]+)\s*:\s*([^;{}]+)(?=;)/g, (m, pre, prop, val) => { const cat = catOf(prop); if (!cat || prop.startsWith("--")) return m; const r = mapValue(file, prop, cat, val.trim()); if (!r) return m; changed = true; return m.replace(val.trim(), r); });
      if (changed) { const qch = n.getText(sf)[0]; record(file, n.getStart(sf), n.end, n.getText(sf), qch + out + qch, t, out, "css-in-string"); }
      ts.forEachChild(n, strVisit); return;
    }
    if (E_SKIP.test(file)) { ts.forEachChild(n, strVisit); return; }
    if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && !contentColour && !kept(n) && !inPlan(n.getStart(sf), n.end)) {
      const t = n.text; COLOUR_RE.lastIndex = 0;
      if (/#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?)\((?![^)]*var\()/.test(outsideVar(t, (s) => s)) && /#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?)\(\s*\d/.test(t) && !/^(use client|https?:)/.test(t) && !ts.isImportDeclaration(n.parent) && !ts.isJsxAttribute(n.parent)) {
        COLOUR_RE.lastIndex = 0;
        let hint = null, p = n.parent; for (let i = 0; i < 4 && p; i++, p = p.parent) { if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) { hint = p.name.text; break; } if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) { hint = p.name.text; break; } }
        const shadowy = /\d(px)?\s+\d/.test(t) && /px/.test(t) && !/gradient/.test(t);
        const cat = shadowy ? "shadow" : "color";
        const m = mapValue(file, hint || cat, cat, t, kebab(hint || cat));
        if (m) record(file, n.getStart(sf), n.end, n.getText(sf), `${n.getText(sf)[0]}${m}${n.getText(sf)[0]}`, t, m, `E ${hint || ""}`);
      }
    }
    ts.forEachChild(n, strVisit);
  };
  strVisit(sf);
}

// ── CSS files (F) ────────────────────────────────────────────────────────────────────────────────
const cssEdits = [];
for (const file of files.filter((f) => f.endsWith(".css"))) {
  CURRENT_FILE = file;
  const src = fs.readFileSync(path.join(ROOT, file), "utf8"); const lines = src.split("\n");
  lines.forEach((ln, i) => {
    if (ln.includes("ds-keep") || /^\s*\/?\*/.test(ln)) return;
    const out = ln.replace(/(^|[;{\s])(outline|outline-offset|filter|backdrop-filter|-webkit-backdrop-filter|text-shadow|border-top-color|text-underline-offset)\s*:\s*([^;{}]+)(?=;)/g, (m, pre, prop, val) => {
      const cat = catOf(prop); const r = mapValue(file, prop, cat, val.trim()); if (!r) return m;
      const ok = verify(val.trim(), r); plan.push({ file, start: -1, end: -1, oldText: val.trim(), newText: r, ok, why: `css ${prop}`, oldVal: val.trim(), newVal: r, line: i + 1 });
      return m.replace(val.trim(), r);
    });
    if (out !== ln) cssEdits.push({ file, i, out });
  });
}

// ── report ───────────────────────────────────────────────────────────────────────────────────────
const bad = plan.filter((p) => !p.ok);
fs.writeFileSync(path.join(HERE, "fixall-plan.tsv"), "ok\twhy\tfile\told\tnew\n" + plan.map((p) => [p.ok, p.why, p.file, p.oldText.replace(/\s+/g, " ").slice(0, 140), p.newText.replace(/\s+/g, " ").slice(0, 160)].join("\t")).join("\n"));
fs.writeFileSync(path.join(HERE, "fixall-manual.tsv"), manual.map((m) => `${m.file}:${m.line}\t${m.what}`).join("\n"));
fs.writeFileSync(path.join(HERE, "fixall-newtokens.json"), JSON.stringify({ NEW, durUsed: [...durUsed].sort((a, b) => a - b), springUsed: Object.fromEntries(springUsed), blurUsed: [...blurUsed].sort((a, b) => a - b) }, null, 1));
const byWhy = {}; for (const p of plan) { const k = p.why.split(" ")[0] === "E" ? "E" : p.why.replace(/^.* (number|string|template)$/, "style $1").replace(/^const .*/, "const"); byWhy[k] = (byWhy[k] || 0) + 1; }
console.log("planned edits", plan.length, byWhy);
console.log("verification failures", bad.length); for (const b of bad.slice(0, 30)) console.log("  ✗", b.file, b.why, "|", b.oldVal, "→", b.newVal);
console.log("new tokens", Object.keys(NEW).length, "(component", Object.values(NEW).filter((x) => x.where === "component").length + ")", "| motion: durations", durUsed.size, "springs", springUsed.size, "blurs", blurUsed.size);
console.log("manual", manual.length);

if (!DRY) {
  if (bad.length) { console.log("refusing to apply with verification failures"); process.exit(1); }
  const byFile = {}; for (const p of plan.filter((p) => p.start >= 0)) (byFile[p.file] ||= []).push(p);
  for (const [file, ps] of Object.entries(byFile)) {
    let text = fs.readFileSync(path.join(ROOT, file), "utf8");
    ps.sort((a, b) => b.start - a.start);
    let lastStart = Infinity; for (const p of ps) { if (p.end > lastStart) continue; text = text.slice(0, p.start) + p.newText + text.slice(p.end); lastStart = p.start; }
    const need = importsNeeded.get(file);
    if (need) {
      const imp = `import { ${[...need].sort().join(", ")} } from "@/styles/tokens/motion"`;
      const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
      const lastImport = [...sf.statements].filter(ts.isImportDeclaration).pop();
      const at = lastImport ? lastImport.end : (text.match(/^(['"]use client['"];?\s*\n)/)?.[0].length ?? 0);
      text = text.slice(0, at) + (lastImport ? "\n" : "") + imp + (lastImport ? "" : "\n") + text.slice(at);
    }
    fs.writeFileSync(path.join(ROOT, file), text);
  }
  const cssByFile = {}; for (const e of cssEdits) (cssByFile[e.file] ||= []).push(e);
  for (const [file, es] of Object.entries(cssByFile)) { const lines = fs.readFileSync(path.join(ROOT, file), "utf8").split("\n"); for (const e of es) lines[e.i] = e.out; fs.writeFileSync(path.join(ROOT, file), lines.join("\n")); }
  console.log("applied to", Object.keys(byFile).length + Object.keys(cssByFile).length, "files");

  // token definitions
  const shared = Object.entries(NEW).filter(([, v]) => v.where === "scales");
  const scalesPath = path.join(TOK, "scales.css"); let scales = fs.readFileSync(scalesPath, "utf8");
  const block = ["", "/* ── Added 2026-11-26: steps the fix-all pass needed ─────────────────────────────",
    "   Focus rings, underline offsets, a blur scale (Tailwind's names and values, plus 2xs), two easing",
    "   curves and the shadows several components wrote out by hand. Exact current values. */", ":root {",
    ...shared.map(([n, v]) => `  ${n}: ${v.value};${v.comment ? ` /* ${v.comment} */` : ""}`), "}", ""].join("\n");
  scales = scales.replace("/* ── Tailwind mapping", block + "\n/* ── Tailwind mapping");
  fs.writeFileSync(scalesPath, scales);
  const comps = Object.entries(NEW).filter(([, v]) => v.where === "component");
  const byComp = {}; for (const [n, v] of comps) (byComp[v.comment] ||= []).push([n, v.value]);
  const semPath = path.join(TOK, "semantic.css");
  const semBlock = ["", "/* ── Component values (mapped 2026-11-26) ── */",
    "/* Exact values from style constants, ternaries, template strings, CSSProperties objects and props that",
    "   ds-scan did not read. One component each, named for it; grouped by file. */", ":root {",
    ...Object.entries(byComp).sort().flatMap(([file, toks]) => [`  /* ${file.replace(/^src\//, "")} */`, ...toks.map(([n, v]) => `  ${n}: ${v};`)]), "}",
    "/* ── end component values (2026-11-26) ── */", ""].join("\n");
  fs.writeFileSync(semPath, fs.readFileSync(semPath, "utf8").replace(/\n?$/, "\n") + semBlock);
  // JS motion tokens
  const ms = [...durUsed].sort((a, b) => a - b);
  const blurs = [...blurUsed].sort((a, b) => a - b);
  const BLUR_KEY = { 2: "'2xs'", 4: "xs", 8: "sm", 12: "md", 16: "lg", 24: "xl" };
  const motion = `// Motion tokens for framer-motion, which needs numbers: it can't animate a CSS variable.
// Durations are in seconds. instant / fast / base / slow equal --duration-* in scales.css, and BLUR's named
// steps equal --blur-*; the other steps are the exact values in use, keyed by milliseconds (DURATION) or
// pixels (BLUR), until they're consolidated onto the named steps.
//
// Generated 2026-11-26 by the fix-all token pass (docs/design-system-primitives-plan.md).

export const DURATION = {
  instant: 0.08,
  fast: 0.12,
  base: 0.2,
  slow: 0.32,
${ms.filter((m) => !DUR_NAMED[m]).map((m) => `  ${m}: ${m / 1000},`).join("\n")}
} as const

/** Springs: the most used ones by name; the rest keyed s<stiffness>d<damping>[m<mass>]. */
export const SPRING = {
${[...springUsed.entries()].sort((a, b) => (a[0].startsWith("s") && /\d/.test(a[0][1])) - (b[0].startsWith("s") && /\d/.test(b[0][1])) || a[0].localeCompare(b[0], undefined, { numeric: true })).map(([k, v]) => `  ${k}: { stiffness: ${v.stiffness}, damping: ${v.damping}${v.mass !== undefined ? `, mass: ${v.mass}` : ""} },`).join("\n")}
} as const

/** Blur radii in px (for animated filter: blur()). */
export const BLUR = {
${blurs.map((b) => `  ${BLUR_KEY[b] ? BLUR_KEY[b] : (Number.isInteger(b) ? b : `'${b}'`)}: ${b},`).join("\n")}
} as const
`;
  fs.writeFileSync(path.join(TOK, "motion.ts"), motion);
  console.log("wrote", shared.length, "shared tokens,", comps.length, "component tokens, motion.ts");
}
