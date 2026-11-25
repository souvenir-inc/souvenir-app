// Codemod: Tailwind arbitrary values that equal a token exactly → the token.
// The companion of tokens-exact.mjs (inline styles and CSS modules), for className strings.
// No pixel changes: a value is only replaced when a token has exactly that value, and each
// property keeps its own meaning:
//   text-[13px]      → text-[length:var(--font-size-body-sm)]   (font size only; `text-body-sm`
//                      would also set a line height, so it's not used)
//   leading-[20px]   → leading-[var(--line-height-body-sm)]
//   rounded-[8px]    → rounded-md   (and rounded-t-/-tl-/… sides)
//   p-[8px], gap-[4px], mt-[12px] … → p-[var(--space-2)] …   (positive values only)
//   font-[500]       → font-[number:var(--font-weight-medium)]
// Variants (hover:, md:, data-[…]:) are kept. Skipped: tests, token files, hidden features and
// illustration files (as in ds-scan.mjs), and any line holding `ds-keep`.
//
//   node scripts/codemods/tailwind-tokens.mjs <file or folder>... [--dry]

import fs from "node:fs"
import path from "node:path"

const DRY = process.argv.includes("--dry")
const targets = process.argv.slice(2).filter((a) => !a.startsWith("--"))

const SPACE = { 2: "--space-0-5", 4: "--space-1", 6: "--space-1-5", 8: "--space-2", 10: "--space-2-5", 12: "--space-3", 16: "--space-4", 20: "--space-5", 24: "--space-6", 32: "--space-7", 40: "--space-8", 48: "--space-9", 64: "--space-10" }
const RADIUS = { 4: "xs", 6: "sm", 8: "md", 10: "lg", 12: "xl", 16: "2xl", 999: "full", 9999: "full" }
const FONT_SIZE = { 11: "--font-size-caption", 12: "--font-size-small", 13: "--font-size-body-sm", 14: "--font-size-body", 16: "--font-size-body-lg", 18: "--font-size-heading-sm", 20: "--font-size-heading-md", 24: "--font-size-heading", 28: "--font-size-heading-xl", 40: "--font-size-display" }
const LINE_HEIGHT = { 16: "--line-height-small", 20: "--line-height-body-sm", 22: "--line-height-body", 24: "--line-height-heading-sm", 28: "--line-height-heading-md", 32: "--line-height-heading", 36: "--line-height-heading-xl", 48: "--line-height-display" }
const WEIGHT = { 400: "--font-weight-regular", 500: "--font-weight-medium", 600: "--font-weight-semibold" }

const SKIP = [
  /\.(test|spec|stories)\.[tj]sx?$/,
  /[\\/]styles[\\/]tokens[\\/]/,
  /[\\/]components[\\/](Pin|PinCategory|PinCommentField|PinInsert|PinSkeleton|Pinboard|PinboardExpanded|PinboardHeader|PinboardSkeleton|HighlightCard|HighlightMark|HighlightPanel)[\\/]/,
  /[\\/]layout[\\/]HighlightSidebar\.tsx$/,
  /[\\/]PersonaCard[\\/](scenes|job-scenes|AnimatedPersonaAvatar)\.tsx$/,
  /[\\/]components[\\/](CardBrandLogo|ModelIcon|SouvenirLogo|ConnectorGlyph|ThemedLlmIcon)[\\/]/,
]

// A class token boundary: start, whitespace, a quote/backtick, or the colon of a variant.
const B = String.raw`(?<=^|[\s"'\`:{(])`
const RULES = [
  [new RegExp(`${B}text-\\[(\\d+)px\\]`, "g"), (n) => FONT_SIZE[n] && `text-[length:var(${FONT_SIZE[n]})]`],
  [new RegExp(`${B}leading-\\[(\\d+)px\\]`, "g"), (n) => LINE_HEIGHT[n] && `leading-[var(${LINE_HEIGHT[n]})]`],
  [new RegExp(`${B}rounded(-(?:t|b|l|r|s|e|tl|tr|bl|br|ss|se|es|ee))?-\\[(\\d+)px\\]`, "g"), (side, n) => RADIUS[n] && `rounded${side ?? ""}-${RADIUS[n]}`],
  [new RegExp(`${B}(p|px|py|pt|pb|pl|pr|ps|pe|m|mx|my|mt|mb|ml|mr|ms|me|gap|gap-x|gap-y|space-x|space-y)-\\[(\\d+)px\\]`, "g"), (prop, n) => SPACE[n] && `${prop}-[var(${SPACE[n]})]`],
  [new RegExp(`${B}font-\\[(\\d{3})\\]`, "g"), (n) => WEIGHT[n] && `font-[number:var(${WEIGHT[n]})]`],
]

function rewrite(source) {
  let count = 0
  const lines = source.split("\n").map((line) => {
    if (line.includes("ds-keep")) return line
    let out = line
    for (const [re, to] of RULES) {
      out = out.replace(re, (match, ...groups) => {
        const args = groups.slice(0, -2)
        const next = to(...args)
        if (!next) return match
        count++
        return next
      })
    }
    return out
  })
  return { text: lines.join("\n"), count }
}

const files = []
const walk = (p) => {
  const stat = fs.statSync(p)
  if (stat.isDirectory()) { for (const e of fs.readdirSync(p)) walk(path.join(p, e)); return }
  if (/\.(tsx|ts)$/.test(p) && !SKIP.some((re) => re.test(p))) files.push(p)
}
for (const t of targets) walk(t)

let total = 0
const touched = []
for (const file of files) {
  const source = fs.readFileSync(file, "utf8")
  const { text, count } = rewrite(source)
  if (!count) continue
  total += count
  touched.push([count, file])
  if (!DRY) fs.writeFileSync(file, text)
}
for (const [count, file] of touched.sort((a, b) => b[0] - a[0])) console.log(`${String(count).padStart(4)}  ${file}`)
console.log(`${DRY ? "[dry] " : ""}${total} values replaced in ${files.length} files scanned`)
