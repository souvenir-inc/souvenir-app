// Which literal style values already equal a token, once both are normalised (0px = 0, spaces in
// rgba(), .5 = 0.5, letter case, the order of nothing else). Light-theme values: the tokens on :root
// in primitives/aliases/semantic/scales/typography, with var() references resolved.
//
//   node scripts/codemods/token-match.mjs <category>      shadow | color | motion | border | spacing | radius | typography
//
// Prints each literal with the tokens it equals. A token whose dark-theme value differs is marked
// "(themed)": swapping it in also changes dark mode, which a literal never did.

import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"

const ROOT = path.resolve(import.meta.dirname, "..", "..")
const TOKENS = path.join(ROOT, "src", "styles", "tokens")

/** --name: value from the first :root block(s) of a file (not [data-theme] scopes). */
function rootVars(file) {
  const css = fs.readFileSync(path.join(TOKENS, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")
  const out = {}
  for (const block of css.matchAll(/(^|\n)\s*:root\s*\{([\s\S]*?)\n\}/g))
    for (const m of block[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim()
  return out
}
function darkVars() {
  const css = fs.readFileSync(path.join(TOKENS, "theme.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")
  const out = {}
  for (const block of css.matchAll(/:root\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/g))
    for (const m of block[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim()
  return out
}

const light = Object.assign({}, ...["primitives.css", "aliases.css", "scales.css", "semantic.css", "typography.css"].map(rootVars))
const dark = darkVars()

function resolve(value, vars, depth = 0) {
  if (depth > 12) return value
  return value.replace(/var\((--[\w-]+)(?:\s*,\s*([^)]+))?\)/g, (_, name, fallback) => {
    const v = vars[name] ?? light[name]
    return v === undefined ? (fallback ?? `var(${name})`) : resolve(v, vars, depth + 1)
  })
}
// Note: theme.css also lifts some tokens inside raised surfaces (a nested scope); those scopes are
// ignored here, so the screenshot diff remains the final check for dark mode.

export function normalise(v) {
  return v.trim().replace(/^["'`]|["'`]$/g, "")
    .toLowerCase()
    .replace(/\s*,\s*/g, ",")
    .replace(/\(\s*/g, "(").replace(/\s*\)/g, ")")
    .replace(/(^|[\s,(])\.(\d)/g, "$10.$2")
    .replace(/(^|[\s,(-])0px\b/g, "$10")
    .replace(/(\d+\.\d*?)0+\b/g, "$1").replace(/\.(?=[\s,)]|$)/g, "")
    .replace(/#ffffff\b/g, "#fff").replace(/#000000\b/g, "#000")
    .replace(/rgba\((\d+),(\d+),(\d+),1\)/g, "rgb($1,$2,$3)")
    .replace(/\s+/g, " ")
}

const merged = { ...light, ...dark }
const byValue = new Map()
for (const name of Object.keys(light)) {
  const resolved = normalise(resolve(light[name], light))
  if (!byValue.has(resolved)) byValue.set(resolved, [])
  // Themed when its final dark value differs: set in the dark block, or built on a token that is.
  const themed = normalise(resolve(dark[name] ?? light[name], merged)) !== resolved
  byValue.get(resolved).push(themed ? `${name} (themed)` : name)
}

export function matches(literal) {
  return byValue.get(normalise(literal)) ?? []
}

/** Top-level comma parts of a value (commas inside rgba() etc. don't split). */
function parts(value) {
  const out = []
  let depth = 0, start = 0
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "(") depth++
    else if (value[i] === ")") depth--
    else if (value[i] === "," && depth === 0) { out.push(value.slice(start, i)); start = i + 1 }
  }
  out.push(value.slice(start))
  return out.map((p) => p.trim())
}

/**
 * A multi-part value (a shadow with several layers) written as a run of tokens, each covering one or
 * more consecutive parts: ["--a", "--b"] when the whole value is var(--a), var(--b). Unthemed tokens
 * are preferred; null when some part has no token.
 */
export function compose(literal) {
  const ps = parts(literal.trim().replace(/^["'`]|["'`]$/g, ""))
  const best = (i) => {
    if (i === ps.length) return []
    for (let j = ps.length; j > i; j--) {
      const found = matches(ps.slice(i, j).join(", "))
      if (!found.length) continue
      const rest = best(j)
      if (rest) return [found.find((t) => !t.endsWith("(themed)")) ?? found[0], ...rest]
    }
    return null
  }
  return best(0)
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const category = process.argv[2] ?? "shadow"
  const out = execFileSync("node", [path.join(ROOT, "scripts", "ds-scan.mjs"), `--list=${category}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 26 })
  let hit = 0, total = 0
  for (const line of out.split("\n")) {
    const m = line.match(/^\s*(\d+)× ([\w-]+): (.*)$/)
    if (!m) continue
    total += Number(m[1])
    const found = matches(m[3])
    const composed = found.length ? null : compose(m[3])
    if (found.length || composed) hit += Number(m[1])
    const note = found.length ? `\n        = ${found.slice(0, 4).join(", ")}` : composed ? `\n        = ${composed.join(" + ")}` : ""
    console.log(`${m[1].padStart(4)}× ${m[2]}: ${m[3].slice(0, 110)}${note}`)
  }
  console.log(`\n${hit} of ${total} literal ${category} values equal a token`)
}
