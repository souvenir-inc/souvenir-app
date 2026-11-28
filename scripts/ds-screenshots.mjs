// Visual baseline for the design-system work (docs/design-system-primitives-plan.md, Phase 0).
// Screenshots key screens in light and dark mode against a running dev server, and compares them
// with the saved baseline. Local only; images live in .ds-screens/ (git-ignored).
//
//   npm run ds:screens -- --update     capture and save as the baseline
//   npm run ds:screens                 capture and compare with the baseline
//   npm run ds:screens -- --only=settings-members,chat-home
//
// Needs: a dev server on BASE_URL (default http://localhost:3000, as Auth0 expects), and
// ADMIN_EMAIL / ADMIN_PASSWORD in .env.local (the test account). Chromium comes from the
// Playwright cache (npx playwright-core install chromium if missing).

import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, ".ds-screens");
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const args = process.argv.slice(2);
const UPDATE = args.includes("--update");
const ONLY = args.find((a) => a.startsWith("--only="))?.slice(7).split(",");
// Share of pixels that may differ before a screen counts as changed (anti-aliasing noise).
const TOLERANCE = 0.001;

// Routes only; dialogs and menus are covered once their primitives exist (Phase 2).
// Hidden features (Pins, Highlights) are left out on purpose. Onboarding is not covered: the test
// account is already onboarded, so those routes redirect to /chat.
const SCREENS = [
  // The greeting is picked at random on each load (and its width varies), so it is hidden.
  ["chat-home", "/chat", ["main h1"]],
  ["agents", "/agents"],
  ["agents-new", "/agents/new"],
  ["library", "/library"],
  ["schedules", "/schedules"],
  ["projects", "/projects"],
  ["projects-new", "/projects/new"],
  ["connectors", "/connectors"],
  ["souvenir-slack", "/souvenir-slack"],
  ["settings-account", "/settings/account"],
  ["settings-memory", "/settings/memory"],
  ["settings-ai", "/settings/ai"],
  ["settings-usage", "/settings/usage"],
  ["settings-plans-billing", "/settings/plans-and-billing"],
  ["settings-report-bug", "/settings/report-bug"],
  ["settings-feature-request", "/settings/feature-request"],
  ["settings-general", "/settings/general"],
  ["settings-members", "/settings/members"],
  ["settings-analytics", "/settings/analytics"],
  ["settings-workspace-library", "/settings/workspace-library"],
  ["org-change-plan", "/org/change-plan"],
].filter(([name]) => !ONLY || ONLY.includes(name));

const THEMES = ["light", "dark"];

function readEnv(file) {
  const env = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

async function login(context) {
  const env = readEnv(path.join(ROOT, ".env.local"));
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) throw new Error("ADMIN_EMAIL / ADMIN_PASSWORD missing from .env.local");
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/auth/login`, { waitUntil: "domcontentloaded" });
  // Auth0 identifier-first: the password field appears after the email step.
  await page.fill('input[name="username"], input[type="email"]', env.ADMIN_EMAIL);
  await page.keyboard.press("Enter");
  await page.fill("input[type=password]:visible", env.ADMIN_PASSWORD, { timeout: 30_000 });
  await page.keyboard.press("Enter");
  await page.waitForURL((u) => u.origin === new URL(BASE_URL).origin && !u.pathname.startsWith("/auth"), { timeout: 60_000 });
  await page.close();
}

async function settle(page) {
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  // The Next.js dev badge and toasts change between runs.
  await page.addStyleTag({ content: "nextjs-portal,[data-sonner-toaster]{display:none!important}" }).catch(() => {});
  // Let skeletons resolve and entrance animations finish.
  await page.waitForTimeout(2500);
}

// Pixel diff in the browser, so no image library is needed.
async function compare(page, aPath, bPath, diffPath) {
  const toUrl = (p) => `data:image/png;base64,${fs.readFileSync(p).toString("base64")}`;
  const result = await page.evaluate(async ([a, b]) => {
    const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    if (ia.width !== ib.width || ia.height !== ib.height) return { sizeChanged: `${ia.width}x${ia.height} → ${ib.width}x${ib.height}` };
    const c = document.createElement("canvas");
    c.width = ia.width; c.height = ia.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(ia, 0, 0); const da = ctx.getImageData(0, 0, c.width, c.height);
    ctx.drawImage(ib, 0, 0); const db = ctx.getImageData(0, 0, c.width, c.height);
    const out = ctx.createImageData(c.width, c.height);
    let changed = 0;
    for (let i = 0; i < da.data.length; i += 4) {
      const d = Math.abs(da.data[i] - db.data[i]) + Math.abs(da.data[i + 1] - db.data[i + 1]) + Math.abs(da.data[i + 2] - db.data[i + 2]);
      const hit = d > 30;
      if (hit) changed++;
      const g = (da.data[i] + da.data[i + 1] + da.data[i + 2]) / 3;
      out.data[i] = hit ? 255 : g * 0.3 + 170;
      out.data[i + 1] = hit ? 0 : g * 0.3 + 170;
      out.data[i + 2] = hit ? 80 : g * 0.3 + 170;
      out.data[i + 3] = 255;
    }
    ctx.putImageData(out, 0, 0);
    return { ratio: changed / (c.width * c.height), diff: changed ? c.toDataURL("image/png") : null };
  }, [toUrl(aPath), toUrl(bPath)]);
  if (result.diff) fs.writeFileSync(diffPath, Buffer.from(result.diff.split(",")[1], "base64"));
  return result;
}

async function main() {
  const target = path.join(OUT, UPDATE ? "baseline" : "current");
  fs.mkdirSync(target, { recursive: true });
  fs.mkdirSync(path.join(OUT, "diff"), { recursive: true });

  const browser = await chromium.launch();
  const contextOptions = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce" };
  const context = await browser.newContext(contextOptions);
  await login(context);
  // Each theme gets its own context, signed in with this one's session. Init scripts
  // accumulate on a context and run in no defined order, so on a shared context the
  // dark pass also ran the light pass's theme script and could come out light.
  const session = await context.storageState();

  const failures = [];
  const changed = [];
  for (const theme of THEMES) {
    const themed = await browser.newContext({ ...contextOptions, storageState: session });
    await themed.addInitScript((t) => { try { localStorage.setItem("souvenir-theme", t); } catch {} }, theme);
    const page = await themed.newPage();
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    for (const [name, route, masks = []] of SCREENS) {
      const file = path.join(target, `${name}.${theme}.png`);
      try {
        await page.goto(`${BASE_URL}${route}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
        await settle(page);
        if (masks.length) await page.addStyleTag({ content: `${masks.join(",")}{visibility:hidden!important}` });
        await page.screenshot({ path: file, fullPage: false, animations: "disabled", caret: "hide" });
        const landed = new URL(page.url()).pathname;
        process.stdout.write(`  ${theme.padEnd(5)} ${name}${landed !== route ? `  (redirected to ${landed})` : ""}\n`);
      } catch (e) {
        failures.push(`${name}.${theme}: ${e.message.split("\n")[0]}`);
        process.stdout.write(`  ${theme.padEnd(5)} ${name}  FAILED\n`);
      }
    }
    await page.close();
    await themed.close();
  }

  if (!UPDATE) {
    const page = await context.newPage();
    for (const [name] of SCREENS) for (const theme of THEMES) {
      const base = path.join(OUT, "baseline", `${name}.${theme}.png`);
      const cur = path.join(target, `${name}.${theme}.png`);
      if (!fs.existsSync(base)) { changed.push(`${name}.${theme}: no baseline`); continue; }
      if (!fs.existsSync(cur)) continue;
      const r = await compare(page, base, cur, path.join(OUT, "diff", `${name}.${theme}.png`));
      if (r.sizeChanged) changed.push(`${name}.${theme}: size ${r.sizeChanged}`);
      else if (r.ratio > TOLERANCE) changed.push(`${name}.${theme}: ${(r.ratio * 100).toFixed(2)}% of pixels changed`);
    }
    await page.close();
  }
  await browser.close();

  console.log(`\n${SCREENS.length * THEMES.length - failures.length} screenshots in ${path.relative(ROOT, target)}`);
  if (failures.length) console.log(`\nFailed:\n  ${failures.join("\n  ")}`);
  if (!UPDATE) {
    console.log(changed.length ? `\nChanged (diffs in .ds-screens/diff):\n  ${changed.join("\n  ")}` : "\nNo visual changes.");
  }
  if (failures.length || changed.length) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
