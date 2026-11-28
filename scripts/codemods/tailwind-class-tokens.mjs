// One-off migration (2026-11-26): Tailwind bracket and palette classes → token classes, exact values.
// Companion to the @theme keys added to scales.css the same day (numeric spacing, leading-4…8,
// text-xs…2xl, font-normal, ease-out, z-10/20/30). Kept as a record of what was mapped where.
//   node scripts/codemods/tailwind-class-tokens.mjs [--dry]
import fs from "node:fs";
import path from "node:path";

const FE = path.resolve(import.meta.dirname, "..", "..");
const DRY = process.argv.includes("--dry");

// [old class, new class]
export const MAP = [
  // shared spacing steps
  ["gap-[3px]", "gap-[var(--space-0-75)]"], ["p-[3px]", "p-[var(--space-0-75)]"], ["pl-[3px]", "pl-[var(--space-0-75)]"], ["pr-[3px]", "pr-[var(--space-0-75)]"], ["mt-[3px]", "mt-[var(--space-0-75)]"],
  ["gap-[5px]", "gap-[var(--space-1-25)]"], ["pt-[5px]", "pt-[var(--space-1-25)]"], ["py-[5px]", "py-[var(--space-1-25)]"],
  ["pl-[7px]", "pl-[var(--space-1-75)]"], ["pr-[7px]", "pr-[var(--space-1-75)]"], ["py-[7px]", "py-[var(--space-1-75)]"],
  ["mt-[18px]", "mt-[var(--space-4-5)]"], ["pb-[18px]", "pb-[var(--space-4-5)]"], ["px-[18px]", "px-[var(--space-4-5)]"],
  // component spacing
  ["pt-[15px]", "pt-[var(--dashboard-page-top)]"],
  ["pl-[21px]", "pl-[var(--dashboard-download-note-indent)]"],
  ["px-[13px]", "px-[var(--dashboard-tab-lifted-padding-x)]"],
  ["gap-[8%]", "gap-[var(--dashboard-empty-bar-gap)]"], ["px-[4%]", "px-[var(--dashboard-empty-bar-inset)]"],
  ["px-[22px]", "px-[var(--button-lg-padding-x)]"],
  ["py-[9px]", "py-[var(--schedule-instructions-padding-y)]"],
  // radius
  ["rounded-[1px]", "rounded-hairline"], ["rounded-[2px]", "rounded-2xs"],
  ["rounded-[3px]", "rounded-[var(--dashboard-sync-icon-radius)]"],
  ["rounded-[7px]", "rounded-[var(--dashboard-toggle-radius)]"],
  ["rounded-[9.5px]", "rounded-[var(--switch-thumb-radius)]"],
  ["rounded-[11px]", "rounded-[var(--connector-modal-icon-radius)]"],
  // type
  ["text-[15px]", "text-[length:var(--font-size-body-md)]"],
  ["leading-[18px]", "leading-[var(--line-height-compact)]"],
  ["leading-[17px]", "leading-[var(--dashboard-line-height-sm)]"],
  ["leading-[14px]", "leading-[var(--dashboard-tag-line-height)]"],
  ["text-[10px]", "text-[length:var(--dashboard-micro-size)]"],
  ["text-[8px]", "text-[length:var(--dashboard-avatar-xs-size)]"],
  ["text-[44px]", "text-[length:var(--dashboard-metric-value-size)]"],
  ["leading-[52px]", "leading-[var(--dashboard-metric-value-line-height)]"],
  ["tracking-[-0.88px]", "tracking-[var(--dashboard-metric-value-tracking)]"],
  ["tracking-[-0.56px]", "tracking-[var(--dashboard-card-value-tracking)]"],
  ["tracking-[-0.07px]", "tracking-[var(--dashboard-tab-tracking)]"],
  ["tracking-[0.6px]", "tracking-[var(--dashboard-section-tracking)]"],
  ["tracking-[0.04em]", "tracking-wider"],
  ["text-[22px]", "text-[length:var(--connector-modal-title-size)]"],
  ["leading-[1.2]", "leading-[var(--connector-modal-title-line-height)]"],
  ["leading-[34px]", "leading-[var(--checkout-title-line-height)]"],
  ["leading-[26px]", "leading-[var(--template-title-line-height)]"],
  // colour
  ["text-white", "text-[var(--static-white)]"],
  ["border-white/25", "border-[color-mix(in_oklab,var(--static-white)_25%,transparent)]"],
  // shadow
  ["shadow-[0px_0px_0px_3px_rgba(74,131,191,0.25),0px_1px_1.5px_0px_rgba(82,75,71,0.12)]", "shadow-[var(--instructions-field-focus-shadow)]"],
  ["shadow-[0px_1px_1.5px_0px_rgba(82,75,71,0.08)]", "shadow-[var(--instructions-field-shadow)]"],
  // motion, layering
  ["duration-150", "duration-[var(--toggle-transition-duration)]"],
  ["z-9999", "z-[var(--citation-popover-z)]"],
];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&");
const SKIP = /\.(test|spec|stories)\.[tj]sx?$|[\\/]styles[\\/]tokens[\\/]/;
const files = [];
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(tsx?|css)$/.test(e.name) && !SKIP.test(p)) files.push(p); } };
walk(path.join(FE, "src"));
const total = {};
for (const f of files) {
  let src = fs.readFileSync(f, "utf8"), changed = false;
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*\/\//.test(lines[i]) || lines[i].includes("ds-keep")) continue;
    for (const [from, to] of MAP) {
      const re = new RegExp(`(?<=^|[\\s"'\`:{(])${esc(from)}(?=$|[\\s"'\`,)}])`, "g");
      const next = lines[i].replace(re, () => { total[from] = (total[from] || 0) + 1; return to; });
      if (next !== lines[i]) { lines[i] = next; changed = true; }
    }
  }
  if (changed) { if (!DRY) fs.writeFileSync(f, lines.join("\n")); console.log(path.relative(FE, f)); }
}
console.log(total);
