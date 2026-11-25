// Codemod: the spacing, radius and type values tokens-exact.mjs leaves behind, when every part of the
// value equals a token: negative margins (calc(var(--space-2) * -1)), rem sizes, unitless line
// heights, quoted px written in forms the first pass skips. No pixel changes, with one stated
// exception: a pill radius of 99/100px becomes --radius-full (9999px), which renders the same on any
// element up to 198px tall — every one of them is a small pill or bar (checked by hand).
//
//   node scripts/codemods/value-map.mjs <spacing|radius|typography> [--dry]

import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"

const ROOT = path.resolve(import.meta.dirname, "..", "..")
const category = process.argv[2]
const DRY = process.argv.includes("--dry")

const SPACE = { 2: "--space-0-5", 4: "--space-1", 6: "--space-1-5", 8: "--space-2", 10: "--space-2-5", 12: "--space-3", 16: "--space-4", 20: "--space-5", 24: "--space-6", 32: "--space-7", 40: "--space-8", 48: "--space-9", 64: "--space-10" }
const RADIUS = { 4: "--radius-xs", 6: "--radius-sm", 8: "--radius-md", 10: "--radius-lg", 12: "--radius-xl", 16: "--radius-2xl", 99: "--radius-full", 100: "--radius-full", 999: "--radius-full", 9999: "--radius-full" }
const FONT_SIZE = { 11: "--font-size-caption", 12: "--font-size-small", 13: "--font-size-body-sm", 14: "--font-size-body", 16: "--font-size-body-lg", 18: "--font-size-heading-sm", 20: "--font-size-heading-md", 24: "--font-size-heading", 28: "--font-size-heading-xl", 40: "--font-size-display" }
const LINE_HEIGHT = { 16: "--line-height-small", 20: "--line-height-body-sm", 22: "--line-height-body", 24: "--line-height-heading-sm", 28: "--line-height-heading-md", 32: "--line-height-heading", 36: "--line-height-heading-xl", 48: "--line-height-display" }
const LEADING = { 1: "--leading-none", 1.25: "--leading-tight", 1.375: "--leading-snug", 1.5: "--leading-normal", 2: "--leading-loose" }
const WEIGHT = { 400: "--font-weight-regular", 500: "--font-weight-medium", 600: "--font-weight-semibold" }

/** px for "8", "8px", "0.5rem" (16px root); null otherwise. */
const px = (s) => {
  const m = s.match(/^(-?\d*\.?\d+)(px|rem)?$/)
  if (!m) return null
  return m[2] === "rem" ? Number(m[1]) * 16 : Number(m[1])
}

function mapSpacing(value) {
  const parts = value.split(/\s+/)
  const out = []
  for (const p of parts) {
    if (/^(0|0px|auto)$/.test(p)) { out.push(p); continue }
    const n = px(p)
    if (n === null) return null
    const name = SPACE[Math.abs(n)]
    if (!name) return null
    out.push(n < 0 ? `calc(var(${name}) * -1)` : `var(${name})`)
  }
  return out.join(" ")
}

function mapOne(prop, value) {
  const v = value.trim()
  if (category === "spacing") return mapSpacing(v)
  if (category === "radius") { const n = px(v); return n !== null && RADIUS[n] ? `var(${RADIUS[n]})` : null }
  if (/^(fontSize|font-size)$/.test(prop)) { const n = px(v); return n !== null && FONT_SIZE[n] ? `var(${FONT_SIZE[n]})` : null }
  if (/^(lineHeight|line-height)$/.test(prop)) {
    if (/^-?\d*\.?\d+$/.test(v) && LEADING[Number(v)]) return `var(${LEADING[Number(v)]})`
    const n = px(v); return n !== null && /px|rem/.test(v) && LINE_HEIGHT[n] ? `var(${LINE_HEIGHT[n]})` : null
  }
  if (/^(fontWeight|font-weight)$/.test(prop)) return WEIGHT[v] ? `var(${WEIGHT[v]})` : null
  return null
}

const out = execFileSync("node", [path.join(ROOT, "scripts", "ds-scan.mjs"), `--list=${category}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 26 })
const lines = out.split("\n")
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
let done = 0
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^\s*(\d+)× ([\w-]+): (.*)$/)
  if (!m) continue
  const [, , prop, raw] = m
  const quote = /^["'`]/.test(raw) ? raw[0] : ""
  const inner = quote ? raw.slice(1, -1) : raw
  const mapped = mapOne(prop, inner)
  if (!mapped) continue
  const files = (lines[i + 1] ?? "").trim().split(", ").filter(Boolean)
  for (const rel of files) {
    const isCss = rel.endsWith(".css")
    // Inline styles: a mapped value is a string; CSS: written as is.
    const replacement = isCss ? mapped : `${quote || "'"}${mapped}${quote || "'"}`
    const file = path.join(ROOT, rel)
    const src = fs.readFileSync(file, "utf8")
    // Not inside a value already holding the same digits (e.g. "-8" within "-80").
    const re = new RegExp(`(${escape(prop)}\\s*:\\s*)${escape(raw)}(?![\\w.%])`, "g")
    const next = src.replace(re, (_, head) => { done++; console.log(`  ${rel}: ${prop}: ${raw} → ${replacement}`); return head + replacement })
    if (next !== src && !DRY) fs.writeFileSync(file, next)
  }
}
console.log(`${DRY ? "[dry] " : ""}${done} ${category} values mapped`)
