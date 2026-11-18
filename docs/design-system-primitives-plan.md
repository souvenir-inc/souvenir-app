# Design system primitives — standardisation plan

Branch: `ds-dev` · Written 2026-11-17 · Status: **proposed**, no phase started

This plan makes the front-end draw its styling from tokens and every interactive element from one shared set of primitives. It starts from a scan of `ds-dev` at `2880f600` and ends with lint rules and a CI check that stop the code drifting back.

Related docs: [design-tokens-audit.md](design-tokens-audit.md) (colour audit, 2026-10-02) · [design-tokens-mapping.md](design-tokens-mapping.md) · [design-tokens-primitives.md](design-tokens-primitives.md)

---

## Contents

1. [Where we are today](#1-where-we-are-today)
2. [Goals and targets](#2-goals-and-targets)
3. [Decisions this plan rests on](#3-decisions-this-plan-rests-on)
4. [Phase 0 — Guardrails](#phase-0--guardrails)
5. [Phase 1 — Token foundation](#phase-1--token-foundation)
6. [Phase 2 — Consolidate duplicates](#phase-2--consolidate-duplicates)
7. [Phase 3 — Layout and type primitives](#phase-3--layout-and-type-primitives)
8. [Phase 4 — Form primitives](#phase-4--form-primitives)
9. [Phase 5 — Feedback and display primitives](#phase-5--feedback-and-display-primitives)
10. [Phase 6 — Migration sweep](#phase-6--migration-sweep)
11. [Phase 7 — Lock it in](#phase-7--lock-it-in)
12. [Schedule and effort](#12-schedule-and-effort)
13. [Risks](#13-risks)
14. [Working rules](#14-working-rules)
15. [Appendix A — Scan method](#appendix-a--scan-method)
16. [Appendix B — Draft snapping table](#appendix-b--draft-snapping-table)
17. [Appendix C — Primitive API sketches](#appendix-c--primitive-api-sketches)
18. [Appendix D — Definition of done for a primitive](#appendix-d--definition-of-done-for-a-primitive)

---

## 1. Where we are today

### 1.1 How styling is written

| Measure | Count |
|---|---|
| Source files scanned (`.tsx` + `.css`, tests excluded) | 686 |
| Inline `style={}` blocks | 5,717 |
| `className=` uses | 1,620 |
| Token definitions in `src/styles/tokens/` | about 1,950 lines across 5 files |

About 78% of styling is inline style objects. Tailwind v4, `cva` and `tailwind-merge` are installed but used mostly inside a few primitives, and many of those classes are arbitrary values such as `rounded-[10px]`.

### 1.2 Wired vs hardcoded, by category

Style declarations in `.tsx` style objects and `.css` modules. Generated art (persona scenes, LLM / brand / model icons, logo) is excluded. Neutral values (`0`, `auto`, `inherit`, `transparent`, `100%`) and computed values are excluded from the percentages.

| Category | Token | Literal | Neutral | Dynamic | Wired | Hardcoded |
|---|---|---|---|---|---|---|
| Color | 2,619 | 170 | 176 | 146 | **94%** | 6% |
| Border | 384 | 29 | 234 | 18 | **93%** | 7% |
| Shadow | 306 | 190 | 5 | 68 | 62% | 38% |
| Typography | 2,079 | 2,806 | 86 | 22 | 43% | **57%** |
| Radius | 24 | 965 | 140 | 29 | 2% | **98%** |
| Motion | 5 | 355 | 27 | 9 | 1% | **99%** |
| Spacing | 29 | 3,831 | 726 | 144 | 1% | **99%** |
| **Total** | **5,446** | **8,346** | 1,394 | 436 | **39.5%** | **60.5%** |

Colour literals outside style declarations (SVG attributes, constants, gradients): **398 hex** and **545 `rgba()`**. Heaviest: onboarding `plans/page.tsx` (48), `XmlWeather.tsx` (45), `globals.css` (23), `step-shell.tsx` (15), `CodeBlock.module.css` (15), `ImageGenerationPreview.module.css` (15), `WelcomeModal.tsx` (15).

### 1.3 Spread of distinct values

| Property | Distinct values in use | Most common |
|---|---|---|
| `fontSize` | 43 | 14 (≈350), 12 (176), 13 (89), 24 (45), 16 (56), 11 (37) |
| `borderRadius` | 57 | 10 (113), 8 (118), 6 (79), 4 (54), 12 (47), 16 (42), 999 (25) |
| `gap` | 54 | 8 (305), 12 (182), 4 (147), 6 (137), 10 (97), 16 (67) |
| `padding` | 72 | — |

### 1.4 Token scales

| Scale | Tokens defined | Used |
|---|---|---|
| Colour | full primitive + semantic layers | heavily |
| Spacing | `--space-0` … `--space-10` | 29 times |
| Radius | 3 | 24 times |
| Font size | 6 (`display`, `heading`, `body-lg`, `body`, …) | partly |
| Font weight | 3 (`regular`, `medium`, `semibold`) | partly |
| Shadow | 78 (mostly component-specific) | 306 times |
| Motion (duration / easing) | 0 duration, 1 ease | 5 |
| z-index | 0 | — |

### 1.5 Primitive usage vs raw HTML

| Element | Via primitive | Raw | Wired |
|---|---|---|---|
| Buttons (`Button` 464, `IconButton` 146, `ChipButton` 9) | 619 | 227 `<button>` (incl. 4 `<motion.button>`) | **73%** |
| Text inputs (`InputField` 41, `TimeField` 1) | 42 | 79 `<input>` + 31 `<textarea>` | **28%** |
| Dialogs | `ui/dialog` (35 uses), `ConfirmModal` (17) | 19 files with own `role="dialog"`, 17 files importing `@radix-ui/react-dialog` directly | ≈50% |
| Labels | — | 44 `<label>` | 0% |
| Links | `next/link` 27 | 21 `<a>` | — |
| Tables | `SettingsTable` | 7 `<table>` | — |
| Headings | — | 54 `<h1>`, 53 `<h2>`, 24 `<h3>` | 0% |
| **Interactive overall** | 661 | 337 | **≈66%** |

Worst files for raw buttons: `FlatSidebarRow` (7), `org/change-plan` (6), `FlatSidebarProjectGroup` (6), `settings/security` (5), `onboarding/plans` (5), `MemorySection` (5).

### 1.6 Duplicate implementations

| Concern | Implementations |
|---|---|
| Button | `components/Button` (re-exported by `components/ui/index.ts`, 15 importing files) and `components/ui/button.tsx` (shadcn-based, 32 importing files) |
| Dialog | `components/ui/dialog.tsx`, `ConfirmModal`, raw Radix re-export in `ui/index.ts`, 17 direct Radix imports, 19 hand-rolled dialogs |
| Menu | `Dropdown`, `FloatingMenu`, `components/ui/dropdown-menu.tsx`, raw Radix `DropdownMenu` re-export |
| Spinner | `Spinner`, `shared/LoadingSpinner` |
| Sidebar | `Sidebar` and `FlatSidebar` (intentional per `ui/index.ts` comment; out of scope beyond token alignment) |

### 1.7 Patterns built by hand with no primitive

| Pattern | Occurrences |
|---|---|
| `aria-expanded` toggles (collapsibles) | 34 |
| `role="alert"` | 35 |
| `role="progressbar"` | 7 |
| `role="radiogroup"` | 5 |
| `role="switch"` outside `Switch` | 2 |
| `<kbd>` | 3 |
| inline `<svg>` | 94 |
| `createPortal` outside primitives | 7 |
| empty states | no shared component |

### 1.8 Hardest-hit areas

Ranked by literal count: `onboarding/plans/page.tsx`, `org/change-plan/page.tsx`, `settings/(shell)/files`, `settings/(shell)/security`, `settings/(shell)/preferences`, `souvenir-slack/slack-config.module.css`, `SettingsSkeleton`, `MemorySection`, `AnalyticsParts`, `chat/ChatWidget.module.css`, `chat/AnimatedBarChart`, `Sidebar`.

---

## 2. Goals and targets

1. **One implementation per primitive.** No second Button, Dialog, Menu or Spinner.
2. **Tokens for every design decision.** Colour, spacing, radius, type, shadow, motion and z-index come from tokens. Literals remain only where the value is genuinely computed or one-off (chart geometry, brand art).
3. **Primitives for every interactive element.** Raw `<button>`, `<input>`, `<textarea>`, `<select>` and hand-rolled dialogs disappear from feature code.
4. **The system can't drift back.** Lint rules and a CI ratchet block regressions.

| Metric | Now | After Phase 2 | After Phase 6 (target) |
|---|---|---|---|
| Colour wired | 94% | 94% | ≥ 99% |
| Border wired | 93% | 93% | ≥ 99% |
| Shadow wired | 62% | 65% | ≥ 95% |
| Typography wired | 43% | 45% | ≥ 90% |
| Spacing wired | 1% | 2% | ≥ 85% |
| Radius wired | 2% | 10% | ≥ 90% |
| Motion wired | 1% | 1% | ≥ 80% |
| **Overall style wired** | 39.5% | ≈42% | **≥ 90%** |
| Interactive via primitives | 66% | 75% | ≥ 97% |
| Raw `<button>` | 227 | ≈180 | ≤ 5 (allow-listed) |
| Raw `<input>` + `<textarea>` | 110 | 110 | ≤ 8 (file / hidden inputs) |
| Hand-rolled dialogs | 19 files | 0 | 0 |
| Duplicate implementation sets | 4 | 0 | 0 |
| Distinct font sizes / radii / gaps | 43 / 57 / 54 | — | ≤ 8 / 7 / 10 |

Why spacing stops at 85%: some spacing is layout geometry (sidebar widths, chart padding, offsets derived from measured elements) and is better left literal or computed.

---

## 3. Decisions this plan rests on

| # | Decision | Reason |
|---|---|---|
| D1 | **`components/ui/*` is the home of base primitives.** Feature components live elsewhere and compose them. | `ui/` already holds the shadcn-based Button, Dialog, Sheet and Menu. |
| D2 | **`components/ui/button.tsx` is the canonical Button.** `components/Button` becomes a deprecated alias, then is removed. | It's the newer implementation and matches the prototype redesign. |
| D3 | **New and migrated code styles with `className` + token-backed Tailwind classes.** Inline `style` is kept only for runtime-computed values. | Makes values lintable, shareable through `cva` variants, and consistent with shadcn. |
| D4 | **Radix stays the behaviour layer** (plus `@base-ui/react/field` for Field). Feature code never imports Radix directly. | Already a dependency; one place to fix a11y issues. |
| D5 | **Off-scale values are snapped, not tokenised.** `fontSize: 13` maps to the nearest step; it does not get its own token. | Otherwise the token layer just copies today's 57 radii. |
| D6 | **Hidden features are out of scope**: Pins, Pinboard, PinboardExpanded, Highlights. | Hidden on purpose; not to be touched. |
| D7 | **Generated art is exempt**: persona scenes, `AnimatedPersonaAvatar`, `llm-icons.generated.ts`, `CardBrandLogo`, `ModelIcon`, `SouvenirLogo`. | Their colours are illustration, not UI. |

### Decision log (2026-11-17)

| Question | Answer |
|---|---|
| Canonical Button (D2) | **Approved**: `ui/button.tsx` |
| Styling approach (D3) | **Approved**: token-backed `className`, inline `style` only for computed values |
| Source of truth for values | **Current code only.** The `may-day` reference in `AGENTS.md` is not used for this work. |
| Rounding off-scale values (D5) | **Approved**: small visual shifts are acceptable |
| Enforcement | **Local only** (no CI gate); lint becomes errors in Phase 7 |
| Token values in Phase 1 | **Approved as proposed** |
| `/ds` catalog page | **Skipped.** Primitives are checked on real screens with the Phase 0 screenshot set. |
| Menu wrappers vs direct migration | **Option A**: `Dropdown` / `FloatingMenu` become thin wrappers over `Menu` in Phase 2; call sites move in Phase 6; wrappers deleted in Phase 7 |
| Standard input look | **InputField** (decided with Phase 4) |
| Scope beyond D6/D7, branching, merge cadence, diff review | On hold |

---

## Phase 0 — Guardrails

**Effort:** ½ day · **Depends on:** nothing

Stop the numbers getting worse before improving them.

### Tasks

1. **Scanner in the repo.** Move the scan script to `scripts/ds-scan.mjs` and add `"ds:scan": "node scripts/ds-scan.mjs"` to `package.json`. Output: the tables in §1 as JSON plus a readable summary. Exclusions per D6/D7 are configured at the top of the script.
2. **Baseline file.** Commit today's counts to `scripts/ds-baseline.json`.
3. **Ratchet.** `npm run ds:check` fails if any *hardcoded* count (literal per category, raw elements, hand-rolled dialogs, direct Radix imports) is higher than the baseline. Run it locally (manually or as a pre-push hook); no CI gate for now. `npm run ds:check -- --update` lowers the baseline after a phase lands; it never raises it.
4. **ESLint, as warnings for now** (`eslint.config.*`):
   - `no-restricted-syntax` for JSX elements `button`, `input`, `textarea`, `select`, and the attribute `role="dialog"`, ignored inside `src/components/ui/**`.
   - `no-restricted-imports` for `@radix-ui/*` outside `src/components/ui/**`.
   - A custom rule (or `no-restricted-syntax` on `Literal[value=/^#[0-9a-f]{3,8}$/i]`) for hex colours in `.tsx`.
   - An allow comment form: `// ds-allow: <reason>`.
5. **Stylelint for CSS modules.** Add `stylelint` + `stylelint-declaration-strict-value` for `color`, `background-color`, `border-color`, `padding*`, `margin*`, `gap`, `border-radius`, `font-size`, `line-height`, `box-shadow`, `z-index`, `transition-duration`. Warnings only.
6. **Visual baseline.** Playwright screenshots of these screens in light and dark mode, saved as the reference set:
   - Chat: home, conversation with reasoning, code block, table and chart widgets, model selector open
   - Sidebar: flat sidebar expanded and collapsed, project group open, account menu open
   - Settings: general, members, preferences, notifications, security, files, plans and billing, analytics
   - Onboarding: profile, workspace, plans, connectors, setup, welcome modal
   - Agents: list, editor, share modal
   - Library, Schedules, Projects, Connectors catalog
   - Modals: confirm delete, invite, leave workspace, report bug
   - `org/change-plan`, `souvenir-slack`

### Exit criteria

- `npm run ds:scan` reproduces §1 within ±1%.
- `npm run ds:check` passes on `ds-dev` and fails on a test commit that adds a raw `<button>`.
- The screenshot reference set exists and re-runs without diffs.

### Status: done 2026-11-17 (branch `ds/phase-0-guardrails`, uncommitted)

| Item | Result |
|---|---|
| Scanner | `scripts/ds-scan.mjs`; `npm run ds:scan` (summary), `--json`, `--top=<counter>` |
| Baseline + ratchet | `scripts/ds-baseline.json`; `npm run ds:check` (fails on any rise), `ds:check -- --update` (only lowers). Verified: a probe file with a raw `<button>` and `gap: 7` fails the check. |
| ESLint | `no-restricted-syntax` warnings in `eslint.config.mjs`: raw button / motion.button / input / textarea / select, `role="dialog"`, `@radix-ui/*` imports, hex and `rgb()` literals. ~744 warnings today; no new errors. Exception form: `// eslint-disable-next-line no-restricted-syntax -- ds-allow: <reason>` |
| Stylelint | `stylelint.config.mjs` + `npm run lint:css` (new dev deps `stylelint`, `stylelint-declaration-strict-value`). 1,261 warnings across 33 of 40 CSS files; 0 parse errors. |
| Screenshots | `scripts/ds-screenshots.mjs`, `npm run ds:screens` (`-- --update`, `-- --only=`). 25 screens × light/dark = 50 images in `.ds-screens/` (git-ignored). Uses the running dev server and the `ADMIN_*` test account. `playwright-core` pinned as a dev dep. |

Baseline numbers (exclusions D6/D7 applied, so slightly below §1): style values **39.5% wired**; spacing 1.6%, radius 2.5%, typography 42.1%, motion 1.6%, z-index 3.7%, shadow 65.4%, colour 94.7%, border 95.0%. Interactive **66.1%** (buttons 72.5%, text inputs 29.2%).

Differences from the tasks above:
- **No pre-push hook.** The repo has no hook tool (husky etc.); `ds:check` is run by hand.
- **Onboarding not screenshotted.** The test account is onboarded, so those routes redirect to `/chat`.
- **Dialogs and menus not screenshotted yet.** They need click-through steps; added in Phase 2 alongside the Dialog/Menu work.
- **Live data shifts screenshots.** Relative dates ("5d ago") and recent-chat lists change over time; recapture the baseline (`-- --update`) right before a phase starts.

---

## Phase 1 — Token foundation

**Effort:** 1–2 days · **Depends on:** Phase 0

Fill the missing scales and make every token reachable as a Tailwind class.

### 1.1 Radius scale (`primitives.css` + `theme.css`)

```css
--radius-xs:   4px;
--radius-sm:   6px;
--radius-md:   8px;
--radius-lg:   10px;
--radius-xl:   12px;
--radius-2xl:  16px;
--radius-full: 9999px;
```

Covers ≈90% of current values (4, 6, 8, 10, 12, 16, 999).

### 1.2 Spacing

Keep the 4px `--space-*` scale; confirm it contains 0, 2, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48. Add semantic aliases in `semantic.css`:

```css
--space-inset-xs: var(--space-1);   /* 4  */
--space-inset-sm: var(--space-2);   /* 8  */
--space-inset-md: var(--space-3);   /* 12 */
--space-inset-lg: var(--space-4);   /* 16 */
--space-inset-xl: var(--space-6);   /* 24 */
--space-stack-xs … --space-stack-xl   /* vertical rhythm */
--space-inline-xs … --space-inline-lg /* gaps between inline items */
```

The exact index mapping depends on the current `--space-N` values; confirm before writing.

### 1.3 Type scale and text styles (`typography.css`)

Add the missing size steps (11, 12, 13, 18, 20) and composite styles that bundle size, line height, weight and letter spacing:

| Style | Size / line height | Weight | Typical use |
|---|---|---|---|
| `display` | 40 / 48 | semibold | onboarding hero |
| `heading-lg` | 24 / 32 | semibold | page titles |
| `heading-md` | 20 / 28 | semibold | section titles |
| `heading-sm` | 16 / 22 | semibold | card titles |
| `body-lg` | 16 / 22 | regular | chat output |
| `body` | 14 / 20 | regular | default text |
| `body-sm` | 13 / 18 | regular | dense lists, sidebar |
| `label` | 13 / 16 | medium | form labels, buttons |
| `caption` | 12 / 16 | regular | metadata, hints |
| `micro` | 11 / 14 | medium | badges, eyebrows |
| `code` | 13 / 20 | regular, mono | code blocks |

Exact values to be checked against the prototype before committing.

### 1.4 Motion

```css
--duration-instant: 80ms;
--duration-fast:    120ms;
--duration-base:    200ms;
--duration-slow:    320ms;
--ease-standard:    cubic-bezier(0.2, 0, 0, 1);
--ease-emphasized:  cubic-bezier(0.3, 0, 0, 1.3);
--ease-out:         cubic-bezier(0, 0, 0.2, 1);
```

Also used by framer-motion via a `motion.ts` constants file that reads the same values, so JS and CSS animations agree.

### 1.5 z-index

```css
--z-base: 0;  --z-raised: 10;  --z-sticky: 100;  --z-dropdown: 1000;
--z-overlay: 1100;  --z-modal: 1200;  --z-popover: 1300;  --z-toast: 1400;  --z-tooltip: 1500;
```

### 1.6 Shadow / elevation

Audit the 78 shadow tokens. Keep component-specific ones that are genuinely unique (button lift and glow), and add a general elevation scale `--shadow-1` … `--shadow-4` for cards, menus, popovers and modals.

### 1.7 Tailwind `@theme` mapping (`theme.css`)

Map every scale into Tailwind v4 `@theme` so these classes resolve to tokens: `p-*`, `m-*`, `gap-*` → `--space-*`; `rounded-*` → `--radius-*`; `text-body`, `text-caption`, … → composite styles; `shadow-1…4`; `duration-*`, `ease-*`; `z-*`. Remove default Tailwind values that aren't on our scales, so `rounded-[10px]` and `p-[13px]` stand out in review and lint.

### 1.8 Snapping table

Publish the off-scale → token mapping (draft in [Appendix B](#appendix-b--draft-snapping-table)) as part of this doc. Every migration uses it; nobody decides values file by file.

### Exit criteria

- Every scale exists in CSS and is reachable from Tailwind.
- `ds:scan` unchanged (this phase only adds tokens).
- Screenshot set unchanged.

### Status: done 2026-11-17 (branch `ds/phase-1-tokens`)

New file `src/styles/tokens/scales.css`, imported by `globals.css` after `typography.css`. Every token is a plain `:root` variable (usable as `var(--…)` in inline styles and CSS modules) and is mapped into Tailwind with `@theme inline reference`.

| Scale | CSS variables | Tailwind classes |
|---|---|---|
| Radius | `--radius-xs` 4 · `sm` 6 · `md` 8 · `lg` 10 · `xl` 12 · `2xl` 16 · `full` | `rounded-xs` … `rounded-full` |
| Spacing half steps | `--space-0-5` 2 · `--space-1-5` 6 · `--space-2-5` 10 | Tailwind's numeric scale already matches (`p-0.5`, `gap-1.5`, `p-2.5`) |
| Spacing aliases | `--space-inset-{xs…xl}`, `--space-stack-{xs…xl}`, `--space-inline-{xs…lg}` | `p-inset-md`, `gap-stack-lg`, `gap-inline-sm`, … |
| Type styles | new sizes `--font-size-heading-xl/-md/-sm`, `--font-size-body-sm`, `--font-size-small` (+ line heights) | `text-display`, `text-heading-xl`, `text-heading`, `text-heading-md`, `text-heading-sm`, `text-body-lg`, `text-body`, `text-body-sm`, `text-small`, `text-caption`, `text-code` |
| Elevation | `--shadow-1` card · `2` raised card · `3` menu/popover · `4` dialog — aliases of existing shadows, so dark mode follows | `shadow-1` … `shadow-4` |
| Motion | `--duration-instant` 80 · `fast` 120 · `base` 200 · `slow` 320; `--ease-standard`, `--ease-emphasized`, `--ease-exit` | `duration-fast`, `ease-standard`, … |
| Layering | `--z-base` … `--z-tooltip` (0 → 1500) | `z-modal`, `z-tooltip`, … |

Differences from the draft above:
- **Type values follow the code, not the draft table.** `body` stays 14/22 (245 of 365 uses; already the token value), `caption` stays 11/16, and 12/16 gets the new name `small`. `label` and `micro` were dropped: weight is chosen separately, since each size appears at 400, 500 and 600.
- **`--ease-out` is named `--ease-exit`**, because `ease-out` is a Tailwind class already used in the code with its default curve.
- **`--shadow-4`** is the popover shadow plus one deeper layer; there was no existing dialog shadow to alias.
- **Tailwind default names that changed value:** `rounded-md` 6 → 8 px and `rounded-lg` 8 → 10 px. The three places that used them (`CatalogDiscover`, `ContactSalesModal`, `RequestDemoModal`) were moved to the class with the same pixels. Tailwind's `text-xs`…`text-2xl`, `ease-in/out`, `shadow-sm`… keep their defaults.

Checks: every class above measured in the running app (light and dark); `theme.test` and `theme-contrast.test` pass; `ds:check` unchanged; Stylelint unchanged (1,261). The full unit suite has 13 failures that also fail without this change (12 `ChatInput.render` snapshots, 1 `tier-contract` 402 test).

---

## Phase 2 — Consolidate duplicates

**Effort:** 2–3 days · **Depends on:** Phase 1

Each concern ends this phase with exactly one implementation.

### 2.1 Button

1. Confirm `ui/button.tsx` covers every variant and size the old `components/Button` offers: variants `default`, `secondary`, `outline`, `ghost`, `danger`; sizes `xs` (24), `sm` (32), `md` (36), `lg` (40); `loading`, `leading`/`trailing` icon, `asChild`, tooltip.
2. Replace `rounded-[10px] pt-[6px] pb-[8px] px-[10px]`-style arbitrary values in its `cva` with token classes from Phase 1.
3. Point `components/ui/index.ts` at `ui/button`. Make `components/Button/index.tsx` re-export it with `@deprecated`.
4. Migrate the 15 files that use the old import; the 3 literal colours inside `components/Button` go to tokens.
5. Delete `components/Button`. Fold `IconButton` into `ui/button` as a `size="icon"` variant (or keep the named export pointing at it).

### 2.2 Dialog

1. `ui/dialog.tsx` exports `Dialog`, `DialogTrigger`, `DialogContent` (sizes `sm`, `md`, `lg`, `full`), `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogBody`, `DialogFooter`, `DialogClose`.
2. Add `AlertDialog` (Radix `alert-dialog`) for destructive confirmations; rebuild `ConfirmModal` on it with the same props so its 17 call sites don't change.
3. Migrate the hand-rolled and direct-Radix dialogs:
   - `AgentsGrid`, `add-to-slack-modal`, `step-shell`, `AgentDetailsSidebar`, `BrowserScreen`, `ModelSelector`, `PresetModelSelectorDialog`, `DeleteProjectModal`, `InviteModal`, `LeaveProjectModal`, `LeaveWorkspaceModal`, `WelcomeModal`, `ScheduleDeleteModal`, and the rest of the 19
   - `ImageLightbox`, `ChatHistoryItem`, `DeleteChatDialog`, `PersonaChatItem`, `ProjectChatItem`, and the rest of the 17 direct Radix imports
4. Remove `export * as Dialog from "@radix-ui/react-dialog"` from `ui/index.ts`.
5. Skip `Pinboard` (hidden feature).

### 2.3 Menu

1. `ui/dropdown-menu.tsx` exports `Menu`, `MenuTrigger`, `MenuContent`, `MenuItem` (with `icon`, `shortcut`, `destructive`), `MenuCheckboxItem`, `MenuRadioGroup`, `MenuRadioItem`, `MenuLabel`, `MenuSeparator`, `MenuSub`.
2. Rebuild `Dropdown`, `FloatingMenu`, `DropdownMenuItem`, `DropdownSection` as thin wrappers over it, keeping their props so the 99 `Dropdown` call sites keep working.
3. Migrate the 4 direct `@radix-ui/react-dropdown-menu` imports.
4. Remove the raw `DropdownMenu` re-export from `ui/index.ts`.
5. Over Phase 6, call sites move from the wrappers to `Menu` directly; the wrappers are deleted at the end.

### 2.4 Popover, Tooltip, HoverCard

Move `Popover`, `Tooltip` and the one `react-hover-card` use under `ui/`, token-align them, and make them the only importers of their Radix packages.

### 2.5 Spinner and Sheet

- Fold `shared/LoadingSpinner` into `Spinner` (sizes `xs`–`lg`, `tone`).
- Make `ui/sheet` the single side-panel primitive; rebuild `FloatingPanel` and `LinksSidePanel` on it.

### Exit criteria

- One implementation per concern; deprecated aliases only where call sites are still moving.
- Zero `@radix-ui/*` imports outside `components/ui/**`.
- Zero `role="dialog"` outside `components/ui/**` (hidden features excepted).
- Screenshot diffs reviewed and accepted.
- Ratchet lowered.

### Status: done 2026-11-17 (branch `ds/phase-2-consolidate`), with follow-ups

What the code turned out to be: most of the consolidation had already happened. 219 files used `ui/button`; the old `components/Button` and `components/IconButton` had no importers; `Dropdown` was already built on `ui/dropdown-menu`; most dialogs already used `ui/dialog` and only reached into Radix for `Title asChild`.

| Item | Result |
|---|---|
| Button | Deleted `components/Button` and `components/IconButton` (dead). `ui/index.ts` now re-exports `ui/button`. In `ui/button`, `rounded-[10/8/6px]` → `rounded-lg/md/sm` and `duration-200` → `duration-base` (same pixels and timing). |
| Spinner | Deleted `shared/LoadingSpinner.tsx` (`LoadingSpinner`, `PageLoader`): no users. |
| Dialog | `ui/dialog` gained `bare` (no card styling, for shells that draw their own card), `overlay={false}` and `DialogTitle visuallyHidden`; `asChild` titles/descriptions no longer get the default text style. Moved onto it: 10 files that only imported Radix `Title/Description`, plus `ImageLightbox`, `DeleteChatDialog`, `MemorySection`, `InviteModal` (inner duplicate `role="dialog"` removed), `SlackConnectModal`, `NavGuardModal`, onboarding `LeaveGuardModal` and `AddSouvenirToSlackModal`. The last three gain a focus trap, Escape and focus return they didn't have. Deleted dead `chat/ModelSelector.tsx`. `ConfirmModal` was already on `ui/dialog` as an alertdialog, so no separate AlertDialog was added. |
| Menu | No change needed: `Dropdown` / `Dropdown.Float` is the menu, built on `ui/dropdown-menu`. `FloatingMenu` is a toolbar (`role="toolbar"`), a different widget. Removed the unused raw Radix re-exports (`Dialog`, `DropdownMenu`, `ScrollArea`, `Tooltip`) from `ui/index.ts`. |
| HoverCard | New `ui/hover-card.tsx`; `SourceCitation` imports it instead of Radix. |
| Sheet | No change: `FloatingPanel` is the Pins/Highlights toolbar (hidden feature) and `LinksSidePanel` is an inline panel, not an overlay. |
| Rules | `react-slot` (asChild helper) is allowed outside `ui/`. The Radix wrappers that still have their own folders (`Checkbox`, `Popover`, `Slider`, `Switch`, `Tabs`, `Tooltip`) count as the primitive layer in ESLint and `ds-scan`. |

Numbers: `role="dialog"` outside the primitive layer 11 → 6 (2 are CSS selector strings in `AgentsGrid` / `AgentDetailsSidebar`; 4 are allow-listed below). Radix imports outside the primitive layer 52 → 4.

Allow-listed, with a `ds-allow` comment in the code:
- `WorkspaceLockedOverlay`: covers one panel (`position: absolute`), not the page.
- `PresetModelSelectorDialog`: anchored, non-modal panel opened imperatively from several triggers.
- `WelcomeModal`, `SuperLinkDrawer`: framer-motion exit animations.
- `chat/ModelMenu` `EffortSlider`: bespoke Radix slider.

Follow-ups:
- **Motion variant for `ui/dialog`** (Radix `forceMount` + `AnimatePresence`), then move `WelcomeModal` and `SuperLinkDrawer` onto it.
- **`PresetModelSelectorDialog`** onto `Popover` with a virtual anchor (`Popover.Anchor virtualRef`).
- **`EffortSlider`** onto `components/Slider` (Phase 4).
- **Old sidebar menus** (`ChatHistoryItem`, `PersonaChatItem`, `ProjectChatItem` use Radix `DropdownMenu` directly): waits on decision 9 (is the old Sidebar in scope?).
- **Dialog screenshots**: not added yet; dialogs were checked by typecheck, lint and unit tests only.

Tests: snapshot updates are limited to the class renames (`ChatMessage.render`: 7 lines; `ChatInput.render` "bare": 1 line), verified line by line. The suite otherwise has the same 13 failures as before Phase 1.

---

## Phase 3 — Layout and type primitives

**Effort:** 2 days · **Depends on:** Phase 1

These carry most of the spacing, radius and type improvement.

| Primitive | Replaces | Notes |
|---|---|---|
| `Text` | ≈2,800 literal font declarations, many of 624 `<p>` | variants from §1.3; `tone`, `weight`, `truncate`, `lineClamp`, `as` |
| `Heading` | 131 `<h1>`–`<h3>` | `level` 1–4 → `heading-*` styles; `as` to decouple semantics from size |
| `Stack` | `display:flex; flexDirection:column; gap:N` | `gap` accepts only spacing tokens; `align`, `justify` |
| `Inline` | `display:flex; alignItems:center; gap:N` | `wrap`, `gap`, `align` |
| `Box` | padded containers | `p`, `px`, `py`, `m*`, `radius`, `bg` (surface tokens), `as` |
| `Grid` | settings / analytics / catalog grids | `cols` (number or responsive object), `gap` |
| `Card` | settings cards, `ChartCard`, `StatCard`, `ProjectCard`, `DocumentCard`, `ConnectorCatalogCard` | `variant`: `plain`, `raised`, `inset`, `interactive`; `padding`; owns radius, border, shadow |
| `Separator` | `Divider`, 6 `<hr>` | rename `Divider` or alias it; `orientation`, `spacing` |

All of them use `cva`, forward refs, accept `className`, and support `asChild` where it makes sense. API sketches are in [Appendix C](#appendix-c--primitive-api-sketches).

**No catalog page** (decided 2026-11-17). Each primitive is checked on the first real screen that uses it and through the Phase 0 screenshot set.

### Exit criteria

- Each primitive meets [Appendix D](#appendix-d--definition-of-done-for-a-primitive).
- Each primitive is used on at least one real screen and passes the screenshot diff.
- At least one real screen migrated per primitive as a proof (for example `settings/notifications`).

### Status: done 2026-11-17 (branch `ds/phase-3-layout-type`)

| File | Exports |
|---|---|
| `components/ui/text.tsx` | `Text` (`variant` = the 11 type styles, `tone` default/secondary/tertiary/muted/subtle/inverse/danger/success/inherit, `weight`, `truncate`, `lineClamp`, `align`, `as`), `Heading` (`level` 1–4 sets element + default size/weight; `as`, `variant`, `weight` override), `textVariants` |
| `components/ui/layout.tsx` | `Box` (`p`/`px`/`py`, `radius`, `surface`, `bordered`, `as`), `Stack`, `Inline` (`gap`, `align`, `justify`, `wrap`), `Grid` (`cols` number or `{ base, md, lg }`, `gap`). Spacing props accept only the 4px scale (`'0'` … `'16'`). |
| `components/ui/card.tsx` | `Card` (`variant` plain/raised/inset/panel/tile/interactive, `padding` none/sm/md/lg, `as`), `CardHeader`, `CardBody`, `CardFooter` |
| `components/ui/index.ts` | the above, plus `Separator` (= `Divider`) |

Also:
- **`cn()` knows the token scales** (`src/lib/utils.ts`). Without it, tailwind-merge read `text-body` as a colour and dropped it when a `text-[var(--…)]` colour followed, and `p-inset-md` didn't replace `p-2`.
- **New shadow tokens** `--shadow-soft`, `--shadow-panel`, `--shadow-tile` (`shadow-panel` etc. in Tailwind) for the settings surface shadow that was hand-written 46 times in 33 files; `Card` variants `panel` and `tile` use them.
- **`ds-scan`'s `twArbitrary`** now counts only arbitrary values holding a literal; `text-[var(--…)]` is a token reference. Real count: 58 (it read 222 before).
- **Tests:** `components/ui/layout-type.test.tsx`, 18 tests (variants, elements, className precedence, `cn` merging).
- **Proof screen:** Settings → Members header and stats row moved onto `Heading`, `Text`, `Stack`, `Inline`, `Card panel` and `Card tile`. The screenshot diff is 0.19% / 0.16%: the stat tiles move 1px because their 9px gap snapped to 8px; nothing else changes.

Corrections found on the way:
- **4 settings routes were 404s in the screenshot set** (`files`, `notifications`, `preferences`, `security`): they sit behind `NEXT_PUBLIC_ENABLE_SETTINGS_PREVIEW` (off, "not wired to real data yet"). The Phase 1–2 screenshot checks therefore covered 21 live screens, not 25. Those routes are removed from `ds-screenshots.mjs`.
- **Phase 6 hotspots:** `settings/files`, `security` and `preferences` are among the worst files in §1.8 but are hidden previews. Migrating them can't be checked visually unless the preview flag is turned on locally.

---

## Phase 4 — Form primitives

**Effort:** 2–3 days · **Depends on:** Phases 2 and 3 · **Can run in parallel with:** Phase 5, Phase 6

| Primitive | Replaces / builds on | Notes |
|---|---|---|
| `Field` | 44 raw `<label>` + hint/error markup | Built on `@base-ui/react/field`. Wires `id`, `htmlFor`, `aria-describedby` and `aria-invalid` automatically. Slots: `Field.Label`, `Field.Control`, `Field.Hint`, `Field.Error`. |
| `Label` | raw `<label>` | Standalone, for cases outside a Field. |
| `Input` | 79 raw `<input>` | Promote `InputField` to `ui/input`. `size` (sm, md), `leading` / `trailing` slots, `invalid`. Rebuild `PasswordInputField`, `InputGroup`, `ChipInput`, `SearchFieldRing` and `TimeField` on it. |
| `Textarea` | 31 raw `<textarea>` | `autoResize`, `minRows` / `maxRows`, `showCount`. `ChatInput` and `MessageBubble` edit mode keep their custom behaviour but render the base. |
| `RadioGroup` | 5 hand-rolled radiogroups | Radix `radio-group`; `orientation`; option cards variant for plan pickers. |
| `SegmentedControl` | `ProjectViewToggle`, `ThemeModeSwitcher`, plan/period toggles | Radix `toggle-group` (single); `size`. |
| `Select` | simple dropdown selects | Built on the Phase 2 Menu or Radix `select`. |
| `Combobox` / `Command` | model selector, `ScopeFilterDropdown`, `GlobalSearchModal`, `ProjectAddMembersList` | Add `cmdk` (or Base UI combobox); keyboard navigation and empty state built in. |
| `Checkbox`, `Switch`, `Slider` | already exist | Move under `ui/`, token-align, remove the 2 stray `role="switch"`. |

Legitimate raw inputs that stay, marked `// ds-allow`: `type="file"` (`AttachmentManager`), hidden inputs.

### Exit criteria

- Raw `<input>` + `<textarea>` ≤ 8, all allow-listed.
- Every form control in settings, onboarding and the modals sits inside a `Field`.
- An axe check on settings and onboarding reports no unlabelled controls.

### Status: primitives done 2026-11-17 (branch `ds/phase-4-forms`); migration and one decision open

Built on `@base-ui/react` (already a dependency), so no new packages.

| File | Exports | Notes |
|---|---|---|
| `ui/field.tsx` | `Field`, `FieldLabel`, `FieldHint`, `FieldError` | Base UI Field: label `for`, `aria-describedby` (hint + error) and `aria-invalid` are wired automatically. `FieldError` renders only with content. |
| `ui/input.tsx` | `Input` (= `InputField`), `PasswordInput` (= `PasswordInputField`) | `InputField` already was the shared input on Base UI Field; not rewritten. |
| `ui/textarea.tsx` | `Textarea`, `textareaClassName` | InputField's surface (text-field tokens, ring states, settling focus outline); `autoResize` with `minRows` / `maxRows`; `showCount` with `maxLength`. |
| `ui/radio-group.tsx` | `RadioGroup`, `RadioItem` | Base UI RadioGroup; the dot uses the Checkbox tokens. |
| `ui/segmented-control.tsx` | `SegmentedControl` | Base UI RadioGroup + sliding pill; the connector-permissions look. |
| `ui/select.tsx` | `Select` | The existing select pattern (secondary button + `Dropdown.Float` with the chosen item ticked), packaged once — not a second dropdown implementation. |

Tests: `ui/forms.test.tsx`, 7 tests (Field wiring through Base UI, Textarea count and rows, RadioGroup and SegmentedControl selection, Select trigger).

Proof: connector permissions (`AccountPermissions`) use `SegmentedControl`; its `.segmented` / `.segment*` CSS was removed. The values match the old CSS one for one (26px segments, 36px min width, 12px medium text, 3px track padding, 8px track / 6px pill radius, neutral-400 focus outline, 0.6 disabled opacity). **Not checked on screen**: the test account has no connected connectors, and connecting one needs a third-party OAuth sign-in.

`ds-scan` change: `twArbitrary` no longer counts the primitive layer (primitives may pin exact optical pixels). Feature code: 42.

**Decided 2026-11-17 — InputField is the standard input look.** The FeedbackPage forms (Report a bug, Feature request) and Contact sales moved onto `Textarea` / `Input`; FeedbackPage's own `.input` / `.textarea` CSS was removed. Labels still resolve to their controls (checked in the browser). `InputField` fix on the way: an uncontrolled field whose `defaultValue` arrives after the first render (the prefilled email) drew its placeholder over the value; "filled" now follows `defaultValue` until the person types.

Not done in this phase:
- **Combobox**: deferred until its first consumer is migrated (model selector, scope filter, global search, add-members); each is a bespoke picker and the API should come from a real one.
- **Raw input / textarea migration** (exit target ≤ 8): the rest moves into the Phase 6 area sweeps.
- **`EffortSlider`** onto `components/Slider`: still a Phase 2 follow-up.
- **Other radiogroups** (`ThemeModeSwitcher`, `AvatarCarousel`, `MoveToProjectModal`, `FeedbackPage` ChoiceGroup): each has its own look or animation; migrate in their Phase 6 areas.
- **axe check**: not run.

---

## Phase 5 — Feedback and display primitives

**Effort:** 2–3 days · **Depends on:** Phase 3 · **Can run in parallel with:** Phase 4, Phase 6

| Primitive | Replaces | Notes |
|---|---|---|
| `Alert` / `Banner` | 35 `role="alert"`, `CreditStatusBanner`, `ExhaustionBanner`, `InlineCreditNotice` | `tone`: info, success, warning, danger; `layout`: inline, full-width; `icon`, `action`, `dismissible`. Credit banners become thin compositions. |
| `Progress` / `Meter` | 7 `role="progressbar"`, `UsageMeter`, `TokenBudgetBar`, `TokenPoolBar` | Linear; `value`, `max`, `tone`, segmented variant for pools. |
| `EmptyState` | inline empty states across Library, Agents, Schedules, Projects, Connectors | `icon`, `title`, `description`, `action`; `size`. |
| `Table` | 7 raw `<table>`, `SettingsTable` | `Table`, `TableHeader`, `TableRow`, `TableHead` (sortable slot), `TableCell`, `TableEmpty`. `SettingsTable` built on it. |
| `Collapsible` / `Accordion` | 34 `aria-expanded` toggles, `ReasoningBlock`, sidebar groups | Radix `collapsible` / `accordion`; animated height using motion tokens. |
| `Kbd` | 3 `<kbd>`, the shortcut pill | Uses the existing `--shortcut-pill-*` tokens. |
| `Link` | 21 raw `<a>` | Wraps `next/link`; `variant`: inline, subtle, standalone; `external` adds icon and `rel`. |
| `Icon` | sizing and colour of lucide and `@strange-huge/icons` | `size` (12, 14, 16, 20, 24), `tone`, `label` for accessible icons. Review the 94 inline `<svg>`: UI glyphs move to the icon set, brand art stays. |
| `ScrollArea` | 11 `overflow: auto` containers that need styled scrollbars | Radix `scroll-area`, already re-exported. |
| `Avatar`, `Badge`, `Tooltip`, `Toast`, `Skeleton`, `Eyebrow`, `Chip` | already exist | Move under `ui/`, token-align. Toast stays on sonner; its styling lives in one place. |

### Exit criteria

- No `role="alert"`, `role="progressbar"` or `aria-expanded` toggles outside primitives.
- The three credit banners and three usage bars are compositions of the base primitives.

### Status: primitives done 2026-11-17 (branch `ds/phase-5-feedback-display`)

| File | Exports | Look taken from |
|---|---|---|
| `ui/alert.tsx` | `Alert` (`tone` info/success/warning/danger, `title`, `icon`, `action`, `onDismiss`, `urgency` status/alert) | `InlineCreditNotice` / toasts: `--toast-{tone}-*`, `--toast-radius`, soft shadow + tone ring |
| `ui/meter.tsx` | `Meter` (`value`, `max`, `tone` neutral/auto/success/warning/danger, `size` xs/sm/lg, `caption`, `trailing`), `meterToneFor` | `UsageMeter` (neutral) and `TokenBudgetBar` (auto: green → amber at 60% → red at 85%) |
| `ui/empty-state.tsx` | `EmptyState` (`icon`, `title`, `description`, `action`, `size`, `role`) | new; neutral icon tile, title, muted description |
| `ui/table.tsx` | `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell` (`align`), `TableEmpty` | settings tables: small muted headers, hairline rows, 24px side padding; real `<table>` markup |
| `ui/collapsible.tsx` | `Collapsible`, `CollapsibleTrigger`, `CollapsiblePanel`, `Accordion`, `AccordionItem`, `AccordionTrigger`, `AccordionPanel` | Base UI; panels animate their measured height |
| `ui/kbd.tsx` | `Kbd` | the account-menu shortcut pill (`--shortcut-pill-*`) |
| `ui/link.tsx` | `TextLink` (`variant` inline/standalone/subtle, `external`) | next/link; external adds `rel="noreferrer"`, an arrow and screen-reader text |
| `ui/icon.tsx` | `Icon` (`as`, `size` 12–24, `tone`, `label`) | decorative by default, `role="img"` with a label |
| `ui/scroll-area.tsx` | `ScrollArea` (`orientation`) | the `kaya-scrollbar` style |

Tests: `ui/feedback-display.test.tsx`, 15 tests.

Rebuilt on the primitives:
- **`UsageMeter`** → `Meter` (neutral); same props. `height` is now 4 / 6 / 10 (the only values in use).
- **`TokenBudgetBar`** → `Meter` (auto) + its label row; same props. A non-zero budget now shows a minimum sliver, like `UsageMeter` already did.
- **`AccountMenu` shortcut pill** → `Kbd`. Measured in the app: 20px tall, 4px radius, 11/16 text, 2×4px padding — the same as before.

Deleted as unused: `CreditStatusBanner` and `TokenPoolBar` (no importers; two code comments that named `CreditStatusBanner` now point at `ExhaustionBanner`).

Not changed:
- **`ExhaustionBanner`** is a wrapper around the chat composer (tinted frame + status row), not a standalone alert.
- **`InlineCreditNotice`** could compose `Alert`, but it only appears in a credit state the test account can't reach; left for its Phase 6 area so it can be checked on screen.
- **`role="alert"` sites** (35): mostly inline error text (→ `FieldError` / `Text tone="danger"`) or load-failure panels (→ `EmptyState role="alert"`); migrate per Phase 6 area.
- **`SettingsTable`** (4 users) keeps its grid layout; its pages move to `Table` in the settings sweep.

---

## Phase 6 — Migration sweep

**Effort:** 6–9 days · **Depends on:** Phases 2 and 3 (Phases 4 and 5 for the matching elements)

One area per branch, worst first. For each area:

1. Run the codemod (below), then review every changed file by hand.
2. Replace raw elements with primitives.
3. Snap remaining literals using [Appendix B](#appendix-b--draft-snapping-table).
4. Run the screenshot diff in light and dark mode, plus a manual pass on the dev server.
5. Lower the ratchet.

| # | Area | Main files | Est. |
|---|---|---|---|
| 1 | Settings | `settings/(shell)/files`, `security`, `preferences`, `notifications`, `(org)/members`, `(org)/general/*`, `(org)/analytics/*`, `plans-and-billing/*`, `report-bug`, `feature-request`, `SettingsSkeleton`, `SettingsPageShell`, `SettingsTable` | 1.5–2 d |
| 2 | Onboarding | `onboarding/plans`, `step-shell`, `profile`, `join`, `workspace`, `setup`, `connectors`, `import`, `pricing/confirmation`, `team/[inviteId]/profile`, `WelcomeModal`, `add-to-slack-modal` | 1.5 d |
| 3 | Plans | `org/change-plan` | 0.5 d |
| 4 | Slack | `souvenir-slack/slack-config.module.css`, `SlackWorkspaceConfig`, `SlackAppPanel`, `SlackConnectModal`, `SlackChannelMappingRow` | 0.5–1 d |
| 5 | Sidebar and shell | `Sidebar`, `FlatSidebar*`, `SidebarMenuItem`, `layout/*`, `TopBar`, `TeamSwitcher*`, `AccountMenu` | 1 d |
| 6 | Chat | `MessageBubble`, `ReasoningBlock`, `ChatInput`, `ChatWidget.module.css`, `CodeBlock*`, `AnimatedTable`, `Xml*` widgets, `ApprovalCard`, `QuestionCard`, `ModelSelector` | 1.5–2 d |
| 7 | Feature areas | Agents (`AgentEditor`, `AgentsGrid`, `SuperLinksTab`), Library, Schedules, Projects, Connectors, `MemorySection`, `NotificationPanel`, `AiModelsView` | 1.5–2 d |
| 8 | Leftovers | `globals.css` literals, `global-error.tsx`, `RouteState`, `CheckoutReturn`, anything `ds:scan` still lists | 0.5 d |

**Skipped:** `Pin`, `Pinboard*`, `PinCategory`, `PinCommentField`, `PinInsert`, `PinSkeleton`, `HighlightCard`, `HighlightMark`, `HighlightPanel`, `layout/HighlightSidebar`, `lib/pin-markdown.tsx`.

**Stays literal (by design):** chart geometry in `AnimatedBarChart`, `XmlChart*`, `Sparkline`, `UsageBarChart`; weather illustration colours in `XmlWeather` (move to a local palette constant at most); generated art (D7).

### Codemod

A jscodeshift transform at `scripts/codemods/style-to-tokens.ts`:

- Reads static keys from `style={{ … }}` (`gap`, `padding*`, `margin*`, `borderRadius`, `fontSize`, `lineHeight`, `fontWeight`, `color`/`background` when already `var(--…)`).
- Maps them through the snapping table to Tailwind token classes and merges them into `className` with `cn()`.
- Turns `display: flex` + `flexDirection: column` + `gap` into `<Stack>`, and row flex into `<Inline>`, when the element is a plain `div`.
- Leaves dynamic values (identifiers, ternaries, template strings) in `style`.
- Prints a per-file report of what it couldn't convert.

Run it per area, never across the whole repo in one go.

### Exit criteria

- Targets in §2 met.
- No screenshot diffs left unexplained.
- `ds:scan` lists no unexpected hotspots.

### Working defaults while decisions 9–10 are on hold

One branch per area (`ds/phase-6-<area>`); every screenshot diff is reviewed and reported with the area; the old `Sidebar` (and its `ChatHistoryItem` / `PersonaChatItem` / `ProjectChatItem` menus) is out of scope; hidden preview pages (`settings/files`, `notifications`, `preferences`, `security`) and hidden features are skipped.

### Method per area (as run on settings)

1. **Pass 1 — exact tokens** (`scripts/codemods/tokens-exact.mjs`): a literal becomes the token with exactly the same value (`gap: 8` → `var(--space-2)`, `borderRadius: 10` → `var(--radius-lg)`, `fontWeight: 500` → `var(--font-weight-medium)`). Screenshots must show no change.
2. **Pass 2 — rounding** (`--snap`): off-scale values move to the nearest step (Appendix B). Screenshot diffs are reviewed; expected result is 1–2px shifts.
3. **Structure** (by hand, where a component is being restructured anyway): primitives (`Card`, `Text`, `Stack`, `Table`, `Field`…) and token classes instead of inline `style`.

Passes 1–2 keep inline `style` objects (now token-backed) instead of converting them to `className` as D3 prefers; conversion follows in step 3. The codemod only touches `style={{}}`, objects typed `CSSProperties` and CSS modules — never chart configs, where SVG attributes can't resolve `var()`.

### Area 1 — Settings: passes 1–2 done 2026-11-17 (branch `ds/phase-6-settings`)

Scope: the live settings pages (account, usage, memory, library, AI, help, plans & billing, report a bug, feature request, and the org pages: general, members, analytics, activity, workspace library…), plus `SettingsPageShell`, `SettingsTable`, `SettingsSidebar`, `Library/settings`, `MemorySection`, `AiModelsView`.

| | Result |
|---|---|
| Pass 1 | 1,269 values in 67 files; 11 live settings screens × light/dark: **no visual change** |
| Pass 2 | 68 values rounded; diffs are 1–2px shifts (e.g. sidebar items' `5px 6px` → `4px 6px`, which accumulates down the list); pages reviewed and accepted as the new baseline |
| Whole app after settings | style values wired **39.5% → 49.2%**; spacing 1.6% → 18.6%; radius 2.5% → 13.8%; typography 42% → 53.9% |

Still to do in settings (step 3): untyped style objects (e.g. `const HINT_STYLE = {…}`) that the codemod skips, raw buttons, `SettingsTable` pages onto `Table`, `role="alert"` text onto `FieldError` / `Text`.

### All areas — passes 1–2 done 2026-11-18 (branch `ds/phase-6-tokens`, renamed from `ds/phase-6-settings`)

Codemod extended: transition durations (exact 80/120/200/320ms; `--snap` moves ≤400ms to the nearest step; animations and longer transitions keep their timing) and z-index (exact only — rounding would merge layers ordered on purpose). It now carries the same skip list as `ds-scan`, and `// ds-keep: <reason>` on a line leaves that value alone. `scripts/codemods/areas.mjs` maps each feature to its folders and screenshot screens and runs the codemod one area at a time.

| Area | Pass 1 (exact) | Pass 2 (rounded) |
|---|---|---|
| settings | 9 (+1,269 earlier) | 10 (+68 earlier) |
| onboarding | 536 | 45 |
| change-plan | 185 | 18 |
| slack | 151 | 74 |
| shell | 277 | 62 |
| chat | 1,288 | 363 |
| agents | 484 | 70 |
| library | 587 | 54 |
| projects | 414 | 33 |
| schedules | 161 | 17 |
| connectors | 99 | 7 |
| rest (shared components, other routes) | 481 | 75 |

Checks:
- Pass 1: all 21 live screens × light/dark show **no visual change**.
- Pass 2: diffs are uniform 1–2px shifts (Connectors 9.3% is the whole page 2px higher); every changed screen was opened and reviewed, then accepted as the new baseline.
- One layout-animated element (`QueuedMessagesTray` row) keeps a numeric radius (`ds-keep`): framer-motion corrects px radii during layout animation, not `var()`.
- Tests that record inline styles were updated (3 snapshot files, 2 assertions). Every changed snapshot line is a token swap, an approved rounding, or an equivalent value (`999px` → `9999px` pill radius; `8px` → `8px 8px 8px 8px`; jsdom dropping a `var()` shorthand when a longhand follows it). Unit suite: the same 13 pre-existing failures.
- Not checked on screen: onboarding (the test account is already onboarded) and chat widgets that need a live answer.

| | Before Phase 6 | After passes 1–2 |
|---|---|---|
| **Style values wired** | 39.5% | **88.8%** |
| Spacing | 1.6% | 89.6% |
| Radius | 2.6% | 89.8% |
| Typography | 42.0% | 89.1% |
| Motion | 1.7% | 73.6% |
| z-index | 3.3% | 21.7% |

What is left (about 11%): z-index values off the scale (1, 2, 50, 9997–9999…) that need a per-site decision rather than rounding; hand-written shadows; colour literals in onboarding and the weather / code-block widgets; unitless line heights; untyped style objects the codemod skips; chart geometry.

### Leftovers 1 — z-index onto the scale: done 2026-11-18 (branch `ds/phase-6-zindex`)

The primitives themselves sat off the scale (`ui/dialog` 9997, `Dropdown` 9998, `Tooltip` 9999, `Sheet`/`Popover` 50), so the 1000–1500 layers were unused. Each page-level site was mapped by what it is, keeping today's relative order:

| Today | Sites | Now |
|---|---|---|
| 9999 | `Tooltip` default | `--z-tooltip` |
| 9998, 50, 51 (portalled floating content) | `Dropdown`, `Popover`, `PresetModelSelectorDialog` | `--z-popover`, **not** `--z-dropdown`: menus open inside dialogs and must sit above `--z-modal` |
| 9997/9996; fixed modals at 9998, 9999, 60/61, 60, 20/22 | `ui/dialog` (+overlay), `Sheet` (was 50), billing cancel modal, `RightSidebar` ×3, `ModelSwitchDialog`, `AccountDetailView` | `--z-modal` / `--z-overlay` |
| 20–50 (absolute, in-page) | `TeamSwitcher`, `AgentCardMenu`, `AgentMentionMenu` | `--z-dropdown` |
| 20–30 (floating page chrome) | `AgentPageShell` actions, `ProjectToolsMenu`, `ChatFilePanelSlot` | `--z-sticky` |
| 50, 49 | `WorkspaceLockedOverlay`, `FlatSidebar` scrim | `--z-overlay` |
| 10, 11 | `QuestionCard` drag, scroll fades over a `--z-raised` header | `--z-raised`, `calc(var(--z-raised) + 1)` |

**Rule (new):** z-index −1…9 orders siblings inside one component and stays literal; `ds-scan` reports these separately and doesn't count them. Anything 10+ uses a `--z-*` token. The `Sheet` / `Tooltip` `zIndex` props now accept a token string.

Result: z-index wired 21.7% → **94.5%** (3 left, all in the out-of-scope old `Sidebar`; 74 local values not counted); total 88.8% → **89.5%**. Screens: 21 × light/dark, no visual change (pre-change diffs on settings-ai/analytics were live data and were re-baselined first). Unit suite: the same 13 pre-existing failures. Static screens don't open overlays, so dialog-over-menu stacking follows from the order above but wasn't seen on screen.

---

## Phase 7 — Lock it in

**Effort:** ½ day · **Depends on:** Phase 6

1. Switch the ESLint and Stylelint rules from `warn` to `error`.
2. Delete the remaining deprecated aliases and wrappers (`Dropdown`, `FloatingMenu`, old exports in `ui/index.ts`).
3. Write `docs/design-system/README.md`:
   - token scales with values;
   - primitive list with the props of each;
   - "which one do I use": Dialog vs AlertDialog vs Sheet vs Popover; Menu vs Select vs Combobox; Alert vs Toast;
   - the snapping table;
   - how to add a new primitive (Appendix D).
4. Keep `ds:check` as a local check permanently.
5. Add a line for this doc and the README to `docs/INDEX.md`.

---

## 12. Schedule and effort

| Phase | Effort | Depends on | Parallel with |
|---|---|---|---|
| 0 Guardrails | ½ d | — | — |
| 1 Tokens | 1–2 d | 0 | — |
| 2 Consolidate | 2–3 d | 1 | 3 |
| 3 Layout & type | 2 d | 1 | 2 |
| 4 Forms | 2–3 d | 2, 3 | 5, 6 |
| 5 Feedback & display | 2–3 d | 3 | 4, 6 |
| 6 Migration | 6–9 d | 2, 3 (+4, 5 per element) | 4, 5 |
| 7 Lock in | ½ d | 6 | — |
| **Total** | **≈17–24 working days** for one person | | |

Done in parallel where marked, the calendar time drops to about 3½–4 weeks.

---

## 13. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Visual regressions while snapping values | Medium | Screenshot diffs in light and dark mode per branch; snapping table reviewed once up front; manual pass on the dev server. |
| React Compiler freezes renders | High | Primitives never read stores directly in hooks; use `useSyncExternalStore` snapshots. Check in review. |
| Conflict with the prototype restyle | Medium | Primitive styling follows the prototype; restyling and standardising become one pass, not two. |
| Merge pain into `front-end-test` | Medium | Merge `ds-dev` → `test` after each phase, not at the end. Keep the test-only `/home` page and test chip. |
| Codemod produces wrong classes | Medium | Run per area, review every file, keep dynamic values untouched. |
| Hidden features accidentally changed | Low | Excluded in the scanner config, the codemod ignore list and the lint ignore list. |
| Scope creep into redesign | Medium | This plan changes structure, not appearance. Visual changes beyond snapping go to a separate ticket. |
| Accessibility regressions in rebuilt dialogs / menus | Medium | Radix provides focus trap and keyboard handling; axe check per migrated area. |

---

## 14. Working rules

- One branch per phase (and per area in Phase 6) off `ds-dev`, for example `ds/phase-1-tokens`, `ds/phase-6-settings`.
- Ask before every commit and push.
- Each phase report includes: the new `ds:scan` numbers against the previous ones, screenshot diffs, and anything skipped with the reason.
- No backend changes.
- Primitives get unit tests; migrated screens get screenshot coverage.

---

## Appendix A — Scan method

- Files: `src/**/*.tsx` and `src/**/*.css`, excluding `*.test.*`, `*.spec.*`, `*.stories.*` and `src/styles/tokens/**`.
- Style declarations: keys inside `style={{ … }}` in `.tsx`, and declarations in `.css` (custom-property definitions excluded).
- Classification of a value:
  - **token**: contains `var(--`, or is a constant identifier (`UPPER_CASE`, `tokens.*`, `theme.*`);
  - **neutral**: `0`, `0px`, `auto`, `inherit`, `initial`, `unset`, `none`, `transparent`, `currentColor`, `100%`, `50%`;
  - **dynamic**: a plain identifier, ternary or template string;
  - **literal**: everything else.
- Categories by property: colour, spacing, radius, typography, shadow, border shorthand, motion.
- Raw elements: JSX opening tags (`<button`, `<motion.button`, `<input`, `<textarea`, `<select`, `<a`, `<img`, `<table`, `<hr`, `<label`, `<svg`).
- It's a regex scan, not an AST parse; counts are within roughly ±5%. Percentages are reliable as proportions. Phase 0 can move it to an AST-based scan with `@babel/parser` if more precision is needed.

---

## Appendix B — Draft snapping table

Confirmed in Phase 1 against current code (decision: code is the source of truth).

### Font size

Snap the size, then use the style's line height. Weight stays a separate choice (`--font-weight-regular/medium/semibold`).

| Literal size | Type style (Tailwind class) | Size / line height |
|---|---|---|
| 9, 10, 11 | `caption` (`text-caption`) | 11 / 16 |
| 12 | `small` (`text-small`) | 12 / 16 |
| 13 | `body-sm` (`text-body-sm`) | 13 / 20 |
| 14, 15 | `body` (`text-body`) | 14 / 22 |
| 16, 17 | `body-lg` (`text-body-lg`) | 16 / 22 |
| 18 | `heading-sm` (`text-heading-sm`) | 18 / 24 |
| 20, 22 | `heading-md` (`text-heading-md`) | 20 / 28 |
| 24, 26 | `heading` (`text-heading`) | 24 / 32 |
| 28, 30, 32 | `heading-xl` (`text-heading-xl`) | 28 / 36 |
| 36 and above | `display` (`text-display`) | 40 / 48 |
| monospace 12–14 | `code` (`text-code`) | 13 / 16 |

Chat answer text keeps its own prose ladder (`--prose-*` in `typography.css`); it isn't snapped to this table.

### Radius

| Literal | Token |
|---|---|
| 2, 3, 4 | `xs` (4) |
| 5, 6 | `sm` (6) |
| 7, 8 | `md` (8) |
| 9, 10 | `lg` (10) |
| 11, 12, 14 | `xl` (12) |
| 16, 18, 20, 24 | `2xl` (16) |
| 50%, 999, 9999 | `full` |

### Spacing (gap, padding, margin)

| Literal | Token |
|---|---|
| 1, 2, 3 | 2 |
| 4, 5 | 4 |
| 6, 7 | 6 |
| 8, 9 | 8 |
| 10, 11 | 10 |
| 12, 13, 14 | 12 |
| 15, 16, 18 | 16 |
| 20, 22 | 20 |
| 24, 28 | 24 |
| 30, 32, 36 | 32 |
| 40 and above | 40 / 48, or stays literal if it's layout geometry |

Pixel-perfect exceptions (for example `pt-[6px] pb-[8px]` optical alignment in Button) are allowed inside primitives only, with a comment.

---

## Appendix C — Primitive API sketches

```tsx
// Text
<Text variant="body" tone="muted" truncate>…</Text>
type TextProps = {
  variant?: "body-lg" | "body" | "body-sm" | "label" | "caption" | "micro" | "code";
  tone?: "default" | "muted" | "subtle" | "inverse" | "danger" | "success" | "warning";
  weight?: "regular" | "medium" | "semibold";
  truncate?: boolean;
  lineClamp?: 1 | 2 | 3;
  as?: "p" | "span" | "div" | "label";
};

// Heading
<Heading level={2}>Members</Heading>
<Heading level={3} as="h2">Visually smaller h2</Heading>

// Stack / Inline
<Stack gap="3" align="start">…</Stack>
<Inline gap="2" align="center" wrap>…</Inline>
type Space = "0" | "0.5" | "1" | "1.5" | "2" | "2.5" | "3" | "4" | "5" | "6" | "8" | "10";

// Card
<Card variant="raised" padding="lg">
  <Card.Header><Heading level={3}>Plan</Heading></Card.Header>
  <Card.Body>…</Card.Body>
  <Card.Footer>…</Card.Footer>
</Card>

// Field
<Field name="email" invalid={!!error}>
  <Field.Label>Email</Field.Label>
  <Input type="email" />
  <Field.Hint>We'll send the invite here.</Field.Hint>
  <Field.Error>{error}</Field.Error>
</Field>

// Alert
<Alert tone="warning" title="Credits running low" action={<Button size="sm">Top up</Button>} dismissible>
  You've used 90% of this month's credits.
</Alert>

// EmptyState
<EmptyState icon={<Icon as={FolderIcon} />} title="No files yet"
  description="Upload a file to start building your library." action={<Button>Upload</Button>} />

// Dialog
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent size="md">
    <DialogHeader>
      <DialogTitle>Invite people</DialogTitle>
      <DialogDescription>They'll get an email with a link.</DialogDescription>
    </DialogHeader>
    <DialogBody>…</DialogBody>
    <DialogFooter><Button variant="ghost">Cancel</Button><Button>Send</Button></DialogFooter>
  </DialogContent>
</Dialog>

// Menu
<Menu>
  <MenuTrigger asChild><IconButton icon={MoreIcon} label="More" /></MenuTrigger>
  <MenuContent align="end">
    <MenuItem icon={EditIcon} shortcut="⌘E">Rename</MenuItem>
    <MenuSeparator />
    <MenuItem destructive icon={TrashIcon}>Delete</MenuItem>
  </MenuContent>
</Menu>
```

---

## Appendix D — Definition of done for a primitive

A primitive is done when:

- [ ] It lives in `src/components/ui/<name>.tsx` and is exported from `ui/index.ts`.
- [ ] Styling uses `cva` variants and token-backed classes only; no hex, `rgba()` or off-scale values (documented optical exceptions allowed).
- [ ] It forwards refs, accepts `className` (merged with `cn()`), and supports `asChild` where it wraps a single element.
- [ ] Behaviour (focus, keyboard, ARIA) comes from Radix / Base UI, or is tested by hand if custom.
- [ ] It works in light and dark mode.
- [ ] It doesn't read stores directly inside hooks (React Compiler rule).
- [ ] It has a unit test covering variants and the accessible name / role.
- [ ] Its variants are covered by the unit test and visible on at least one screenshot-tested screen.
- [ ] At least one real screen uses it.
- [ ] Any older component it replaces is either deleted or marked `@deprecated` with a removal phase noted.
