// Design-system sweep: hard-coded design values anywhere in the front-end, read through the TypeScript
// AST — the places ds-scan.mjs (a regex over style={{…}} and CSS) doesn't reach: style constants,
// CSSProperties objects, values inside ternaries and template strings, framer-motion props, component
// and SVG props, imperative el.style writes, <style> strings, CSS properties outside ds-scan's
// categories, and Tailwind classes that aren't on a token.
//
//   node scripts/ds-sweep.mjs           misses per feature (A style … F css) and what is exempt
//   node scripts/ds-sweep.mjs --list    every miss with file:line
//
// Exempt (counted apart, not misses): values written as "mixed" (a token colour with written-out
// widths/offsets, e.g. 1px solid var(--border)), icon stroke widths, keyframe animation timing, var()
// fallbacks, ds-keep: <reason> lines, hidden features (Pins, Highlights), /dev, and HTML shown in
// sandboxed frames without the app stylesheet. Added 2026-11-26 (docs/design-system-primitives-plan.md).

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { AREAS } from "./codemods/areas.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const ts = createRequire(ROOT + "/package.json")("typescript");
const LIST = process.argv.includes("--list");

const SKIP = [/\.(test|spec|stories)\.[tj]sx?$/, /^src\/styles\/tokens\//, /\/__tests__\//, /\.d\.ts$/,
  /^src\/components\/(Pin|PinCategory|PinCommentField|PinInsert|PinSkeleton|Pinboard|PinboardExpanded|PinboardHeader|PinboardSkeleton|HighlightCard|HighlightMark|HighlightPanel)\//,
  /^src\/components\/layout\/HighlightSidebar\.tsx$/, /^src\/lib\/pin-markdown\.tsx$/, /^src\/components\/chat\/PinMentionDropdown\.tsx$/,
  /^src\/lib\/(export-pins|rendered-highlights)\.ts$/, /^src\/app\/\(app\)\/dev\//, /^src\/lib\/(library\/viewers\/(inert-html|rtf)|templates\/template-view|apply-marks)\.ts$/];
// values JS reads back (computed-style comparison, canvas paint colours, contrast maths)
const JS_READ = /^src\/components\/(SearchFieldRing\/index\.tsx|chat\/XmlMap\.colors\.ts|chat\/AnimatedTags\.contrast\.ts)$/;
const ART = [/^src\/components\/PersonaCard\/(scenes|job-scenes|AnimatedPersonaAvatar)\.tsx$/, /^src\/lib\/llm-icons\.generated\.ts$/, /^src\/components\/(CardBrandLogo|ModelIcon|SouvenirLogo|ConnectorGlyph|ThemedLlmIcon)\//];
const CONTENT_COLOUR = [/^src\/components\/chat\/CodeBlock(\.module)?\.(tsx|css)$/, /^src\/components\/chat\/XmlWeather\.tsx$/];

const areas = { dashboard: { paths: ["src/app/(app)/dashboard", "src/components/Dashboard"] }, ...AREAS };
const match = (f, p) => p.includes("*") ? new RegExp("^" + p.replace(/[.()]/g, "\\$&").replace("*", "[^/]*")).test(f) : (f === p || f.startsWith(p + "/") || f.startsWith(p + "."));
const ownerOf = (f) => {
  if (f.startsWith("src/components/ui/") || /^src\/components\/(Checkbox|Popover|Slider|Switch|Tabs|Tooltip)\//.test(f)) return "primitives";
  for (const [n, a] of Object.entries(areas)) if (a.paths.some((p) => match(f, p))) return n;
  return "other";
};

// ── property → category ──
const CAT = [
  ["color", /^(color|background|backgroundColor|background-color|borderColor|border-color|fill|stroke|outlineColor|outline-color|caretColor|caret-color|accentColor|accent-color)$/],
  ["spacing", /^(padding|padding[A-Z]\w*|padding-[a-z-]+|margin|margin[A-Z]\w*|margin-[a-z-]+|gap|rowGap|columnGap|row-gap|column-gap)$/],
  ["radius", /^(borderRadius|border-radius|border-[a-z-]*-radius|border[A-Z]\w*Radius|radius)$/],
  ["typography", /^(fontSize|font-size|fontWeight|font-weight|lineHeight|line-height|letterSpacing|letter-spacing|fontFamily|font-family)$/],
  ["shadow", /^(boxShadow|box-shadow)$/],
  ["border", /^(border|borderTop|borderBottom|borderLeft|borderRight|border-top|border-bottom|border-left|border-right)$/],
  ["motion", /^(transition|transitionDuration|transition-duration|transitionTimingFunction|transition-timing-function|animation)$/],
  ["zIndex", /^(zIndex|z-index)$/],
  // not in ds-scan's categories
  ["x-color", /^(border(Top|Bottom|Left|Right|Block|Inline)\w*Color|border-(top|bottom|left|right|block|inline)[a-z-]*-color|textDecorationColor|text-decoration-color|stopColor|stop-color|floodColor|WebkitTextFillColor|-webkit-text-fill-color|scrollbarColor|scrollbar-color|columnRuleColor|backgroundImage|background-image)$/],
  ["x-border", /^(outline|outlineWidth|outline-width|outlineOffset|outline-offset|borderWidth|border-width|border(Top|Bottom|Left|Right|Block|Inline)\w*Width|border-(top|bottom|left|right)-width|borderBlock|borderInline|border-block|border-inline|textDecorationThickness|text-decoration-thickness|textUnderlineOffset|text-underline-offset)$/],
  ["x-shadow", /^(textShadow|text-shadow|filter|backdropFilter|backdrop-filter|WebkitBackdropFilter)$/],
  ["x-motion", /^(transitionDelay|transition-delay|animationDuration|animation-duration|animationDelay|animation-delay|animationTimingFunction|animation-timing-function)$/],
  ["x-spacing", /^(scrollMargin\w*|scrollPadding\w*|scroll-margin[a-z-]*|scroll-padding[a-z-]*|textIndent|text-indent|columnGap)$/],
];
const catOf = (k) => (CAT.find(([, re]) => re.test(k)) || [])[0];
const MOTION_KEYS = /^(duration|delay|ease|stiffness|damping|mass|bounce|staggerChildren|delayChildren|repeatDelay)$/;

// ── literal detection on one piece of text ──
const NEUTRAL_TXT = /^\s*(inherit|initial|unset|none|auto|transparent|currentColor|normal|0|0px|100%|50%|solid|dashed|dotted|hidden|inset|both|forwards|infinite|linear)?\s*$/i;
// var(…) groups removed whole, fallbacks included (balanced parentheses)
function dropVars(s) { let out = "", i = 0; while (i < s.length) { const j = s.indexOf("var(", i); if (j < 0) { out += s.slice(i); break; } out += s.slice(i, j) + " "; let d = 0, k = j; for (; k < s.length; k++) { if (s[k] === "(") d++; else if (s[k] === ")") { d--; if (d === 0) { k++; break; } } } i = k; } return out; }
function literalIn(text, cat) {
  // rgba(var(--surface-rgb), A) is the token pattern for translucent veils (theme.css); vw/vh are fluid layout units
  const t = dropVars(text.replace(/\brgba\(\s*var\(--[\w-]+\)\s*,\s*[\d.]+\s*\)/g, " ").replace(/-?\d*\.?\d+v[wh]\b/g, " "))
    .replace(/\b(brightness|invert|grayscale|saturate|contrast|sepia|opacity|hue-rotate)\([^)]*\)/g, " ") // effect arguments, not design values
    .replace(/\b(linear|radial|conic)-gradient\(/g, " ").replace(/(?<=[\s,])\d+(\.\d+)?%/g, " ") // gradient stop positions
    .replace(/\b(calc|min|max|clamp)\(/g, " ");
  if (NEUTRAL_TXT.test(t)) return null;
  // CSS timing keywords (ease, linear, ease-out…) are named curves, like `solid`: not counted
  const hits = t.match(/-?\d*\.?\d+(px|rem|em|ms|s|vh|vw|%)?(?![\w-])|#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?|oklch|cubic-bezier)\(|(?<![\w-])(white|black)(?![\w-])/g) || [];
  const real = hits.filter((h) => !/^-?0(px|%|ms|s)?$/.test(h) && !(cat === "zIndex" && /^-?\d$/.test(h)) && !/^(100|50)%$/.test(h));
  // unitless small numbers inside a value string are usually multipliers (calc(var(--x) * 2)), not values
  const meaningful = real.filter((h) => !(text.includes("var(--") && /^-?\d+(\.\d+)?$/.test(h)));
  return meaningful.length ? meaningful.join(" ") : null;
}

const findings = [];
const add = (kind, file, line, key, cat, value, snippet) => findings.push({ kind, file, area: ownerOf(file), line, key, cat, value, snippet: snippet.replace(/\s+/g, " ").trim().slice(0, 160) });

function listFiles(dir, out = []) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) listFiles(p, out); else out.push(p); } return out; }
const files = listFiles(path.join(ROOT, "src")).map((f) => path.relative(ROOT, f).split(path.sep).join("/")).filter((f) => !SKIP.some((r) => r.test(f)));

for (const file of files.filter((f) => /\.(tsx?|jsx?|mjs)$/.test(f))) {
  if (ART.some((r) => r.test(file))) continue;
  const text = fs.readFileSync(path.join(ROOT, file), "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const lines = text.split("\n");
  const lineOf = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const kept = (n) => lines[lineOf(n) - 1]?.includes("ds-keep") || lines[lineOf(n) - 2]?.includes("ds-keep");
  const contentColour = CONTENT_COLOUR.some((r) => r.test(file));

  // const NAME = <literal>  (one level of indirection)
  const consts = new Map();
  const collect = (n) => { if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && (ts.isNumericLiteral(n.initializer) || ts.isStringLiteralLike(n.initializer) || (ts.isPrefixUnaryExpression(n.initializer) && ts.isNumericLiteral(n.initializer.operand)))) consts.set(n.name.text, n.initializer); ts.forEachChild(n, collect); };
  collect(sf);

  // literal leaves of a value expression
  function leaves(expr, cat, out, depth = 0) {
    if (!expr || depth > 6) return out;
    if (ts.isNumericLiteral(expr)) { const v = Number(expr.text); if (v !== 0 && !(cat === "zIndex" && Math.abs(v) < 10) && !(cat === "typography" && false)) out.push([expr.text, "direct"]); return out; }
    if (ts.isPrefixUnaryExpression(expr) && ts.isNumericLiteral(expr.operand)) { if (Number(expr.operand.text) !== 0) out.push(["-" + expr.operand.text, "direct"]); return out; }
    if (ts.isStringLiteralLike(expr)) { const l = literalIn(expr.text, cat); if (l) out.push([l, "direct"]); return out; }
    if (ts.isTemplateExpression(expr)) { for (const t of [expr.head.text, ...expr.templateSpans.map((s) => s.literal.text)]) { const l = literalIn(t, cat); if (l) out.push([l, "template"]); } expr.templateSpans.forEach((s) => leaves(s.expression, cat, out, depth + 1)); return out; }
    if (ts.isConditionalExpression(expr)) { leaves(expr.whenTrue, cat, out, depth + 1); leaves(expr.whenFalse, cat, out, depth + 1); return out; }
    if (ts.isBinaryExpression(expr)) {
      if ([ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.AmpersandAmpersandToken].includes(expr.operatorToken.kind)) { leaves(expr.right, cat, out, depth + 1); if (expr.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken) leaves(expr.left, cat, out, depth + 1); }
      else if (expr.operatorToken.kind === ts.SyntaxKind.PlusToken) { leaves(expr.left, cat, out, depth + 1); leaves(expr.right, cat, out, depth + 1); }
      return out; // arithmetic: computed
    }
    if (ts.isParenthesizedExpression(expr) || ts.isAsExpression(expr) || ts.isSatisfiesExpression?.(expr) || ts.isNonNullExpression(expr)) return leaves(expr.expression, cat, out, depth + 1);
    if (ts.isIdentifier(expr) && consts.has(expr.text) && lines[lineOf(consts.get(expr.text)) - 1]?.includes("ds-keep")) return out;
    if (ts.isIdentifier(expr) && consts.has(expr.text)) { const sub = leaves(consts.get(expr.text), cat, [], depth + 1); const init = consts.get(expr.text); const mixed = ts.isStringLiteralLike(init) && /var\(--/.test(init.text); sub.forEach(([v]) => out.push([`${v} (via ${expr.text})`, mixed ? "const-mixed" : "const"])); return out; }
    return out;
  }

  function styleObject(obj, kind) {
    for (const p of obj.properties) {
      if (ts.isSpreadAssignment(p)) { if (ts.isObjectLiteralExpression(p.expression)) styleObject(p.expression, kind); continue; }
      if (!ts.isPropertyAssignment(p)) continue;
      const key = ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : null;
      if (!key) continue;
      if (ts.isObjectLiteralExpression(p.initializer)) { styleObject(p.initializer, kind); continue; } // nested (variants, &:hover)
      if (key.startsWith("--")) { for (const [v, how] of leaves(p.initializer, "custom", [])) if (!kept(p)) add(kind + ":custom-prop", file, lineOf(p), key, "custom", v + (how !== "direct" ? ` [${how}]` : ""), p.getText(sf)); continue; }
      const cat = catOf(key) || (kind === "motion" && MOTION_KEYS.test(key) ? "x-motion" : null);
      if (!cat || (contentColour && /color/.test(cat))) continue;
      for (const [v, how] of leaves(p.initializer, cat, [])) if (!kept(p)) add(kind, file, lineOf(p), key, cat, v + (how !== "direct" ? ` [${how}]` : ""), p.getText(sf));
    }
  }
  const unwrapObjs = (e, out = []) => { if (!e) return out; if (ts.isObjectLiteralExpression(e)) out.push(e); else if (ts.isConditionalExpression(e)) { unwrapObjs(e.whenTrue, out); unwrapObjs(e.whenFalse, out); } else if (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression?.(e)) unwrapObjs(e.expression, out); else if (ts.isBinaryExpression(e)) { unwrapObjs(e.left, out); unwrapObjs(e.right, out); } else if (ts.isArrayLiteralExpression(e)) e.elements.forEach((x) => unwrapObjs(x, out)); return out; };

  const seen = new Set();
  const visit = (n) => {
    // 1. JSX style / motion props / design props on components
    if (ts.isJsxAttribute(n) && n.initializer && ts.isJsxExpression(n.initializer)) {
      const name = n.name.getText(sf), e = n.initializer.expression;
      if (name === "style") unwrapObjs(e).forEach((o) => { seen.add(o); styleObject(o, "jsx-style"); });
      else if (/^(animate|initial|exit|whileHover|whileTap|whileFocus|whileInView|transition|variants)$/.test(name)) unwrapObjs(e).forEach((o) => { seen.add(o); styleObject(o, "motion"); });
      else if (/^(contentStyle|labelStyle|itemStyle|wrapperStyle|tick|label|cursor|activeDot|dot)$/.test(name)) unwrapObjs(e).forEach((o) => { seen.add(o); styleObject(o, "chart-prop"); });
      else if (/^(fill|stroke|color|fontSize|fontWeight|strokeWidth|radius|stopColor)$/.test(name) && e) {
        const parent = n.parent.parent; const tag = (ts.isJsxOpeningElement(parent) || ts.isJsxSelfClosingElement(parent)) ? parent.tagName.getText(sf) : "";
        const cat = /fill|stroke|color|stopColor/i.test(name) && name !== "strokeWidth" ? "color" : name === "radius" ? "radius" : name === "strokeWidth" ? "x-border" : "typography";
        for (const [v, how] of leaves(e, cat, [])) if (!kept(n)) add("jsx-prop", file, lineOf(n), `<${tag} ${name}>`, cat, v + (how !== "direct" ? ` [${how}]` : ""), n.getText(sf));
      }
    }
    if (ts.isJsxAttribute(n) && n.initializer && ts.isStringLiteral(n.initializer) && /^(fill|stroke|color|stopColor|fontSize|fontWeight)$/.test(n.name.getText(sf))) {
      const parent = n.parent.parent; const tag = (ts.isJsxOpeningElement(parent) || ts.isJsxSelfClosingElement(parent)) ? parent.tagName.getText(sf) : "";
      const cat = /fontSize|fontWeight/.test(n.name.getText(sf)) ? "typography" : "color";
      const l = literalIn(n.initializer.text, cat); if (l && !kept(n)) add("jsx-prop", file, lineOf(n), `<${tag} ${n.name.getText(sf)}>`, cat, l, n.getText(sf));
    }
    // 2. CSSProperties-typed objects
    if ((ts.isVariableDeclaration(n) || ts.isPropertyDeclaration(n)) && n.initializer) {
      const typeTxt = n.type?.getText(sf) || "";
      const objs = unwrapObjs(n.initializer);
      if (/CSSProperties|MotionStyle|Variants|Transition|TargetAndTransition/.test(typeTxt) || (ts.isAsExpression(n.initializer) || ts.isSatisfiesExpression?.(n.initializer)) && /CSSProperties|Variants|Transition/.test(n.initializer.type.getText(sf)))
        objs.forEach((o) => { if (!seen.has(o)) { seen.add(o); styleObject(o, /Variants|Transition|Target/.test(typeTxt) ? "motion" : "css-props-const"); } });
    }
    // 3. imperative styles
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(n.left) && ts.isPropertyAccessExpression(n.left.expression) && n.left.expression.name.text === "style") {
      const key = n.left.name.text, cat = catOf(key);
      if (cat) for (const [v, how] of leaves(n.right, cat, [])) if (!kept(n)) add("imperative", file, lineOf(n), key, cat, v + (how !== "direct" ? ` [${how}]` : ""), n.getText(sf));
    }
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === "setProperty" && n.arguments.length >= 2 && ts.isStringLiteralLike(n.arguments[0])) {
      const key = n.arguments[0].text, cat = key.startsWith("--") ? "custom" : catOf(key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())) || catOf(key);
      if (cat) for (const [v, how] of leaves(n.arguments[1], cat, [])) if (!kept(n)) add("imperative", file, lineOf(n), key, cat, v + (how !== "direct" ? ` [${how}]` : ""), n.getText(sf));
    }
    // 4. CSS text in strings (<style>, cssText, injected rules)
    if ((ts.isStringLiteralLike(n) || ts.isTemplateExpression(n)) && n.getText(sf).length > 30) {
      const s = ts.isTemplateExpression(n) ? [n.head.text, ...n.templateSpans.map((x) => x.literal.text)].join("${}") : n.text;
      if (/[{;]\s*[a-z-]+\s*:\s*[^;{}]+;/.test(s) && /[a-z-]+\s*:\s*[^;]+;/.test(s) && !/^\s*(use client|https?:)/.test(s)) {
        for (const m of s.matchAll(/([a-z-]+)\s*:\s*([^;{}]+);/g)) { const cat = catOf(m[1]); if (!cat || m[1].startsWith("--")) continue; const l = literalIn(m[2], cat); if (l && !kept(n)) add("css-in-string", file, lineOf(n), m[1], cat, l, m[0]); }
      }
    }
    // 5. style-like objects nobody typed (≥2 CSS keys, one of them unambiguous)
    if (ts.isObjectLiteralExpression(n) && !seen.has(n)) {
      const keys = n.properties.filter(ts.isPropertyAssignment).map((p) => (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : "");
      const strong = keys.filter((k) => /^(padding\w*|margin\w*|borderRadius|boxShadow|fontSize|fontWeight|lineHeight|letterSpacing|backgroundColor|borderColor|gap|zIndex|transition)$/.test(k));
      if (strong.length >= 1 && keys.filter((k) => catOf(k) || /^(width|height|display|position|top|left|right|bottom|opacity|cursor|overflow|alignItems|justifyContent|flex\w*)$/.test(k)).length >= 2) { seen.add(n); styleObject(n, "style-like-object"); }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

// ── CSS files: custom properties with literals, and props outside ds-scan's categories ──
for (const file of files.filter((f) => f.endsWith(".css"))) {
  const src = fs.readFileSync(path.join(ROOT, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  const lines = src.split("\n");
  const contentColour = CONTENT_COLOUR.some((r) => r.test(file));
  lines.forEach((ln, i) => {
    if (ln.includes("ds-keep")) return;
    for (const m of ln.matchAll(/(?:^|[;{\s])(--[a-zA-Z0-9-]+|[a-z-]+)\s*:\s*([^;{}]+)(?=;|$)/g)) {
      const [_, prop, val] = m;
      if (/^@|^\s*@keyframes/.test(ln)) continue;
      const inKeyframes = (() => { for (let j = i; j >= 0 && j > i - 40; j--) { if (/@keyframes/.test(lines[j])) return true; if (/^\S.*\{\s*$/.test(lines[j]) && j < i && !/^\s*(from|to|\d+%)/.test(lines[j])) return false; } return false; })();
      if (prop.startsWith("--")) { const l = literalIn(val, "custom"); if (l) add("css:custom-prop", file, i + 1, prop, "custom", l, m[0]); continue; }
      const cat = catOf(prop);
      if (!cat || !cat.startsWith("x-")) continue; // ds-scan already covers its own categories in CSS
      if (contentColour && cat === "x-color") continue;
      const l = literalIn(val, cat); if (l) add(inKeyframes ? "css-keyframes" : "css", file, i + 1, prop, cat, l, m[0]);
    }
  });
}

// ── Tailwind classes the classifier skips ──
const scalesCss = fs.readFileSync(path.join(ROOT, "src/styles/tokens/scales.css"), "utf8");
const THEME_KEYS = new Set([...scalesCss.slice(scalesCss.lastIndexOf("@theme")).matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1]));
const TW = /(?<=^|[\s"'`:{(])-?(ring(-offset)?-(\d+|\[[^\]]+\])|outline-(\d+|\[[^\]]+\])|outline-offset-(\d+|\[[^\]]+\])|border(-[trblxyse])?-(\d+|\[\d[^\]]*\])|divide-[xy]-(\d+|\[[^\]]+\])|blur(-[a-z0-9]+|-\[[^\]]+\])?|backdrop-blur(-[a-z0-9]+|-\[[^\]]+\])?|drop-shadow(-[a-z0-9]+|-\[[^\]]+\])?|opacity-(\[[^\]]+\])|delay-(\d+|\[[^\]]+\])|animate-\[[^\]]+\]|underline-offset-(\d+|\[[^\]]+\])|decoration-(\d+|\[\d[^\]]*\])|stroke-(\[\d[^\]]*\]|\d+)|indent-(\d+|\[[^\]]+\])|text-shadow-[a-z0-9[\]-]+|font-light|font-thin|font-extrabold|font-black|\[(?!--)[a-z-]+:[^\]]+\])(?=$|[\s"'`,)}])/g;
for (const file of files.filter((f) => /\.tsx?$/.test(f))) {
  if (ART.some((r) => r.test(file))) continue;
  const lines = fs.readFileSync(path.join(ROOT, file), "utf8").split("\n");
  lines.forEach((ln, i) => {
    if (/^\s*(\/\/|\*)/.test(ln) || ln.includes("ds-keep")) return;
    for (const m of ln.matchAll(TW)) {
      const c = m[0];
      if (/var\(--/.test(c)) continue;
      if (/^\[[a-z-]+:/.test(c)) { const [, prop, val] = c.match(/^\[([a-z-]+):(.+)\]$/) || []; const cat = prop && catOf(prop); if (!cat) { add("tw-arbitrary-prop-other", file, i + 1, prop || c, "other", val || c, ln); continue; } const l = literalIn((val || "").replace(/_/g, " "), cat); if (l) add("tw-arbitrary-prop", file, i + 1, prop, cat, l, ln); continue; }
      // resolved by a theme key in scales.css → a token; stroke widths are icon strokes (no token category)
      const base = c.replace(/^-/, "");
      const key = base.match(/^outline-(\d+)$/) ? `--outline-width-${RegExp.$1}` : base.match(/^outline-offset-(\d+)$/) ? `--outline-offset-${RegExp.$1}` : base.match(/^underline-offset-(\d+)$/) ? `--text-underline-offset-${RegExp.$1}` : base.match(/^decoration-(\d+)$/) ? `--text-decoration-thickness-${RegExp.$1}` : base.match(/^(?:backdrop-)?blur-([a-z0-9]+)$/) ? `--blur-${RegExp.$1}` : null;
      if (key && THEME_KEYS.has(key)) continue;
      if (/^(border|outline|outline-offset|ring)(-[trblxyse])?-0$/.test(base) || /^stroke-/.test(base)) continue;
      add("tw-unmapped-utility", file, i + 1, c.replace(/-?\[.*|-\d+$/, ""), "tw", c, ln);
    }
  });
}

// ── colour literals anywhere in TS, outside the contexts above ──
const counted = new Set(findings.map((f) => `${f.file}:${f.line}`));
for (const file of files.filter((f) => /\.(tsx?|mjs)$/.test(f))) {
  if (ART.some((r) => r.test(file)) || CONTENT_COLOUR.some((r) => r.test(file)) || JS_READ.test(file)) continue;
  // comments blanked (newlines kept), so a colour named in a comment isn't counted
  const raw = fs.readFileSync(path.join(ROOT, file), "utf8");
  const lines = raw.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/(^|[^:"'`])\/\/.*$/gm, "$1").split("\n");
  const rawLines = raw.split("\n");
  lines.forEach((ln0, i) => {
    if (rawLines[i]?.includes("ds-keep") || counted.has(`${file}:${i + 1}`)) return;
    const ln = dropVars(ln0); // a var()'s fallback is not a hard-coded value
    const m = ln.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![\w-])|\brgba?\(\s*\d|\bhsla?\(\s*\d|\boklch\(\s*\d/g);
    if (m && !/var\(--[^)]*,\s*#/.test(ln)) add("colour-literal-elsewhere", file, i + 1, "", "color", m.join(" "), ln);
  });
}


// ── report ──
const HIDDEN = /src\/lib\/(export-pins|rendered-highlights)\.ts|src\/app\/\(app\)\/dev\//;
const SANDBOX = /src\/lib\/(library\/viewers\/(inert-html|rtf)|templates\/template-view|apply-marks)\.ts/;
const afterColon = (s) => s.slice(s.indexOf(":") + 1);
// "mixed" covers widths and offsets written next to a token colour, nothing else: a duration, curve or
// colour literal in the same value is still a miss
const onlyLengths = (value) => value.replace(/\s*\[[a-z-]+\]\s*$/, "").replace(/\(via [^)]*\)/, "").trim().split(/\s+/).every((t) => /^-?\d*\.?\d+px$/.test(t));
const bucket = (r) => {
  if (HIDDEN.test(r.file)) return "x hidden/dev";
  if (r.kind === "css-in-string" && SANDBOX.test(r.file)) return "x sandboxed-document CSS";
  if (r.kind === "jsx-prop" && r.cat === "color" && !/#|rgb|hsl|^(white|black)b/i.test(r.value)) return "x false-positive";
  if (r.kind === "tw-unmapped-utility" && /^-?(border|outline|ring)(-[trblxyse])?-0$/.test(r.value)) return "x false-positive";
  if (r.kind === "tw-unmapped-utility" && /^(blur)$/.test(r.key) && !/(^|\s|:)(backdrop-)?blur-/.test(r.snippet)) return "x false-positive";
  if (r.kind === "jsx-prop" && /strokeWidth/.test(r.key)) return "o icon/svg stroke width (no token category)";
  if (r.kind === "css:custom-prop") return "o token defined outside the token files";
  if (/^(jsx-style|css-props-const|style-like-object|imperative|jsx-style:custom-prop)$/.test(r.kind)) {
    const v = afterColon(r.snippet);
    if (/^animation/i.test(r.key) && !/var\(--/.test(v)) return "o keyframe animation timing (counted apart)";
    if (/\[const-mixed\]/.test(r.value) && onlyLengths(r.value)) return "M mixed: token colour + written-out width/offsets";
    // a template whose only literals are lengths, around an interpolated (data or token) colour
    if (/\[template\]/.test(r.value) && /\$\{/.test(v) && /^(-?\d*\.?\d+px\s*)+\[template\]$/.test(r.value.trim())) return "M mixed: token colour + written-out width/offsets";
    if (/^\d+px solid transparent|solid transparent/.test(v.replace(/['"`]/g, "").trim())) return "x neutral";
    if (r.cat === "zIndex" && /-1\b/.test(r.value)) return "x neutral";
    if (/var\(--/.test(v) && onlyLengths(r.value)) return "M mixed: token colour + written-out width/offsets";
    return "A style value with no token";
  }
  if (r.kind === "motion") return /filter/.test(r.key) ? "B framer-motion effect (blur)" : "B framer-motion timing / springs";
  if (r.kind === "jsx-prop") return r.cat === "radius" ? "C component prop: Skeleton radius" : "C component/SVG prop: " + r.cat;
  if (r.kind === "tw-unmapped-utility" || r.kind.startsWith("tw-arbitrary")) return "D Tailwind: " + r.key.replace(/^-/, "");
  if (r.kind === "colour-literal-elsewhere") return "E colour/shadow string in a JS constant";
  if (r.kind === "css" && /var\(--/.test(r.snippet) && !/\b\d*\.?\d+px\b/.test(r.snippet.replace(/var\([^)]*\)/g, "").replace(/(radial|linear|conic)-gradient\([^;]*/, (g) => g.replace(/\d*\.?\d+px/g, "")))) return "M mixed: token colour + written-out width/offsets";
  if (r.kind === "css" && r.key === "background-image" && /var\(--/.test(r.snippet)) return "M mixed: token colour + written-out width/offsets";
  if (r.kind === "css" || r.kind === "css-keyframes") return /animation-(delay|duration)/.test(r.key) ? "o keyframe animation timing (counted apart)" : "F CSS: " + r.key;
  if (r.kind === "css-in-string") return /var\(--/.test(r.snippet) && onlyLengths(r.value) ? "M mixed: token colour + written-out width/offsets" : "F CSS in a <style> string";
  if (r.kind === "css" && r.key === "background-image" && /var\(--/.test(r.snippet)) return "M mixed: token colour + written-out width/offsets";
  return "? " + r.kind;
};

const byBucket = {}, byArea = {};
for (const r of findings) { const b = bucket(r); (byBucket[b] ||= []).push(r); if (/^[A-F]/.test(b)) (byArea[r.area] ||= {})[b[0]] = (byArea[r.area]?.[b[0]] || 0) + 1; }
const misses = Object.entries(byBucket).filter(([b]) => /^[A-F]/.test(b)).flatMap(([, v]) => v);
console.log("Design-system sweep · misses by feature (A style values, B framer motion, C props, D Tailwind, E JS colour/shadow constants, F CSS)\n");
console.log("feature".padEnd(14) + "A    B    C    D    E    F    total");
for (const [a, c] of Object.entries(byArea).sort()) { const s = "ABCDEF".split("").map((k) => c[k] || 0); console.log(a.padEnd(14) + s.map((n) => String(n).padEnd(5)).join("") + s.reduce((x, y) => x + y, 0)); }
console.log(misses.length ? `\n${misses.length} misses` : "\nNo misses.");
console.log("\nExempt (not misses):");
for (const [b, v] of Object.entries(byBucket).filter(([b]) => !/^[A-F]/.test(b)).sort()) console.log(`  ${String(v.length).padStart(4)}  ${b.slice(2)}`);
if (LIST) for (const r of misses) console.log(`${bucket(r)[0]}  ${r.file}:${r.line}  ${r.key}  ${r.value}`);
process.exitCode = misses.length ? 1 : 0;
