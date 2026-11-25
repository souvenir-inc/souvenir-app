// Codemod: literal style values that already equal a token → var(--token), for the categories
// tokens-exact.mjs doesn't cover (shadows, colours). Uses token-match.mjs, so values match after
// normalising, and a multi-layer shadow can become a run of tokens. No pixel changes: only tokens
// whose dark-theme value is the same as their light one are used (a literal never changed in dark).
//
//   node scripts/codemods/token-swap.mjs <shadow|color|border> [--dry]

import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { compose, matches } from "./token-match.mjs"

const ROOT = path.resolve(import.meta.dirname, "..", "..")
const category = process.argv[2]
const DRY = process.argv.includes("--dry")
if (!category) throw new Error("usage: token-swap.mjs <category> [--dry]")

const out = execFileSync("node", [path.join(ROOT, "scripts", "ds-scan.mjs"), `--list=${category}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 26 })
const lines = out.split("\n")
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

let swapped = 0
const skipped = []
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^\s*(\d+)× ([\w-]+): (.*)$/)
  if (!m) continue
  const [, , prop, value] = m
  const files = (lines[i + 1] ?? "").trim().split(", ").filter(Boolean)
  const direct = matches(value).filter((t) => !t.endsWith("(themed)"))
  const run = direct.length ? [direct[0]] : compose(value)
  if (!run || run.some((t) => t.endsWith("(themed)"))) {
    if (matches(value).length || run) skipped.push(`${prop}: ${value.slice(0, 80)} → only themed tokens`)
    continue
  }
  const quote = /^["'`]/.test(value) ? value[0] : ""
  const replacement = `${quote}${run.map((t) => `var(${t})`).join(", ")}${quote}`
  for (const rel of files) {
    // A feature's own tokens (--dashboard-*) only inside that feature: same pixels elsewhere, wrong meaning.
    if (run.some((t) => t.startsWith("--dashboard-")) && !rel.includes("/Dashboard/")) {
      skipped.push(`${prop}: ${value.slice(0, 60)} in ${rel} → only a dashboard token matches`)
      continue
    }
    const file = path.join(ROOT, rel)
    const src = fs.readFileSync(file, "utf8")
    const re = new RegExp(`(${escape(prop)}\\s*:\\s*)${escape(value)}`, "g")
    const next = src.replace(re, (_, head) => { swapped++; return head + replacement })
    if (next !== src && !DRY) fs.writeFileSync(file, next)
  }
}
console.log(`${DRY ? "[dry] " : ""}${swapped} ${category} values swapped for tokens`)
if (skipped.length) console.log(`Left (only a themed token matches, which would change dark mode):\n  ${skipped.join("\n  ")}`)
