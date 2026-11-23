# Dashboard · Front-end components (info + checks)

**Status:** Active · **Last updated:** 2026-11-23
**Source:** Figma `wRr8cpImqSXbIgk0XhNj7a`, page "Header Flow", section "Front-end components (measured
from localhost:3000 at 1440 × 900)" (node `15:829`): 98 local components every screen is built from.

Read in full on 2026-11-23: every component and variant, their descriptions and measured styles.
They were measured from the live app on 16 Nov, **before the 6D board screen**, so several are
superseded by later sections; this file says which, so nobody rebuilds an old part.

**Statuses:** **Matched**: the dashboard uses it and it matches (checked live). **Superseded**: a later
section draws it differently; follow that section. **Not built**: its feature isn't built yet.

---

## 1. Parts the dashboard uses (CP-1 – CP-9)

| ID | Component | Spec (as measured) | In code | Status |
|---|---|---|---|---|
| CP-1 | **Button** · primary / secondary / outline | 36 px, 10 px radius, 6 · 10 · 8 px padding, 14 px Medium. Primary: gradient `#524B47 → #26211E`, inner shadow, `#F7F2ED` text. Secondary: white, 1 px `#F5F2EF`, soft shadow, `#524B47`. Outline: white, `#524B47` | `@/components/ui` `Button` (default / outline) — the Add cards footer | Matched in size, radius, type and colours (36 px, 10 px, 14 px Medium); the design system's primary is a solid fill, not the measured gradient (app-wide, left as is) |
| CP-2 | **Toast** | 356 × 52, white, 1 px `#E4E0DC`, 12 px radius, 12 · 14 px padding; title 14 px Medium `#26211E`; action dark (`#26211E`, 6 px radius, 13 px Medium `#F7F2ED`), e.g. **"Removed Revenue" · Undo** | The global Sonner toaster, with a dashboard-scoped override in `globals.css` (the app's toaster rendered 12 px in, a `#EDEDED` ring, near-black text and a 4 px 12 px action) | Matched after the override (checked live: 12 · 14 px, `#E4E0DC` ring, `#26211E` title, 6 px 13 px `#26211E` Undo, outlined View). **"Removed {metric}" with Undo now also for edit mode's ×** (CP-10) |
| CP-3 | **Menu item** · default / selected / danger | 28 px, 6 px radius, 14 px Medium `#524B47`; selected `#F5F2EF`; danger `#9F2623`; optional 12 px sub-line `#756D67` | `@/components/Dropdown` items (tab, More, All boards menus) | Matched in type, colours, radius, hover and danger; rows are **32 px** (the design system's standard since the primitives work), not the measured 28 px (app-wide, left as is) |
| CP-4 | **Menu separator** | 1 px `#3B3632` at 15 %, 9 px tall | Dropdown separator | Matched (1 px rule) |
| CP-5 | **Menu section label** | 12 px Medium `#756D67`, 4 · 6 px padding, "All boards" | Dropdown section label | Superseded in part: the Tabs section draws it uppercase, 11 px ("ALL BOARDS", TAB-29); colour and weight match |
| CP-6 | **Dialog close** | 28 × 28, 8 px radius, 14 px × | `IconButton` ghost `size-7` (Manage tabs, metric window, Add cards) | Matched after a fix: the radius was 10 px, now 8 px |
| CP-7 | **Metric card / state** · past-cut, never-synced, unmeasurable, failed, removed, loading | "—" + "No data for today yet"; "No data yet" + Remove card; "No data"; "Couldn't load." + Try again; "This metric was removed."; the loading shape | `MetricCard` body states (05 CR-18 – CR-26) | Matched |
| CP-8 | **Icons** (16 / 14 / 12 px, stroke 1.5) | Lucide: plus, chevron, ellipsis, close, arrows, check, chevron-left, undo, redo, trash, download, image, search, loader, link, lock, building, users, hash, mail, sheet, send, wifi-off, plug, triangle-alert; rotate-cw-clock (the sync icon) | `lucide-react` (+ `RotateCwClockIcon` built from Lucide's path data) | Matched |
| CP-9 | **Logos** (16 px brand colour; Simple Icons for the mock apps) | Shopify, Meta, Google Ads, TikTok, Google Analytics, Pinterest, Stripe, PayPal, Zendesk, Reddit, HubSpot, Slack | `public/dashboard/sources/*` via `SourceLogo` / `SourceMark` | Matched (Slack's is for Post to Slack, not built) |

- **CP-10** **Removing a card in edit mode** (× or Delete) toasts **"Removed Revenue"** with **Undo**, as
  the Toast component draws; Undo (or ⌘Z) puts it back where it was. Remove card on an empty card
  while reading uses the same words (was "Revenue removed").

## 2. Superseded by later sections (follow those)

| Component | Measured (16 Nov) | Now |
|---|---|---|
| **Board tab** · default / active | 32 px pill, 14 px; active `#F5F2EF`, Medium black | Tabs section: dark pill segment in a track (01, 6D) |
| **Period trigger** | 28 px pill, "Last 7 days" 13 px + chevron | 6D: borderless "Last 7 days vs previous" (02) |
| **Freshness** | "Synced 16 Nov, 9:42 am" chip | Sync button with its dot and Data sources (04) |
| **Tab button / new board**, **Tab button / all boards** | 32 px buttons beside the tabs | New board in the speed dial / edit bar; All boards in More and "N more" (01, 02) |
| **Board tool / options**, **Icon button / share**, **Icon button / edit** | 32 px borderless icon buttons in the header | 6D floating actions: the speed dial's More, Share, Edit board (02) |
| **Metric card** · figure / side / chart | per-card "vs previous 7 days", caption "By week · the lighter bar is a week still filling in" | Round 3: one comparison for the page, the caption turned into a legend ("Week in progress"); six sizes (05) |
| **Edit / remove badge** | 22 px grey circle with a minus | 6D: 24 px white raised × in the card's corner (02 BS-18) |
| **Edit / resize arc** (and the 12 px corner one) | a 3 px corner arc at 35 % | 6D: two diagonal strokes in the corner (02 BS-19) |
| **Search field** | 460 × 36, white, 1 px `#F5F2EF`, soft shadow | Add cards' search: 752 × 40 with a 3 px soft ring (06 AC-3) |
| **Pick row** (with a description line) | name, description, On board | Add cards rows: names only, a checkbox, the app's logo (06 AC-5) |
| **App rail** | 48 px, `#F9F8F5`, 32 px items | The app's own sidebar (outside the dashboard) |

## 3. Not built yet

| Component | For |
|---|---|
| **Choice row** · default / selected ("Founder · Founder or CEO · Last 7 days") | The template library / New board chooser (Flow 1) |
| **Segmented** ("Number and trend · Weekly bars": 3 px track `#F5F2EF`, white "on" segment) | Card settings (Flow 2.9). The metric window's Chart / Table switch uses the same look |
| **Share / Avatar, Team tile, Access tiles (lock, building, mail), Person row** | The Share dialog (Flow 8) |
| **Cursors** (pointer, grab, grabbing, resize) | Drawn for the flows; the build uses CSS cursors (`cursor-pointer`, `cursor-grab`, `cursor-nwse-resize`) |

## 4. Checked live (2026-11-23)

Playwright at 1440 × 900 (`comp-live.mjs`): edit mode × and Delete toast "Removed Revenue" / "Removed CTR"
with Undo; Undo and ⌘Z put the card back in place; toast, menu item, section label, dialog close and
button measured against the specs above. Fixed while checking: the dashboard toast look (CP-2) and
the dialog close radius (CP-6).
