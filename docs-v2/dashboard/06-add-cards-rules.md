# Dashboard · Add cards: rules

**Status:** Active · **Last updated:** 2026-11-23
**Source:** Figma `wRr8cpImqSXbIgk0XhNj7a`, page "Header Flow", section "Board flow · Add cards: two
ways in, the picker (by role or one list), search, no match, several at once, On board, No data, apps
not connected (Connect), landing with Undo, Add to board, 1024 px (in progress)" (node `167:27723`).

Read in full on 2026-11-23: 21 screens and their 21 notes (A-1 … A-7c, A-2·B), the parts sheet
(`170:37928`: checkbox, metric row, rail item, app call-out) and 41 layer annotations. Styles are as
drawn (picker `170:45414`, row `170:38052`, rail item `170:38065`, call-out `170:38124`, Add to board
menu `170:81325`, toast `170:81563`, new card ring `170:74239`).

**Pick** marks an option row: we build the designer's own pick and keep the other listed.
**Our call** marks where the Figma is silent; **Stand-in** what the dummy build fakes.

---

## 1. Ways in (AC-1 – AC-2)

- **AC-1** **While reading**: the speed dial's first action, **Add cards**. A click closes the dial
  and opens the picker over the board. Viewers don't have it.
- **AC-2** **While editing**: the edit bar's **Add cards** opens the same picker; edit mode stays on
  underneath, so the cards land with their × and handle. (Later: an empty board's Add cards, Change
  metric in card settings.)

## 2. The picker (AC-3 – AC-12)

- **AC-3** A dialog **800 × 690** (16 px radius, `#F9F8F5`, the modal shadow): **Add cards** (16 px
  SemiBold) and × (28 px); a **search field** (752 × 40, white, 1 px `#E4E0DC`, 10 px radius, a 3 px
  soft ring) **with the cursor in it**; a **rail** (232 px, `#F2EEEA`, 12 px radius) and the **list**
  (520 px) side by side; a line, then the **footer**: what's picked on the left, **Cancel** and **Add
  cards** on the right.
- **AC-4** **Pick: Option A, grouped by role** (the template library's rail): **YOUR ROLE** (Founder or
  CEO, selected on open) · **OTHER ROLES** (Head of e-commerce, Growth or ads lead, Ops lead, Finance or
  fractional CFO, Agency) · **BROWSE** (All metrics, Custom metrics). Headings 11 px SemiBold, 0.6 px
  tracking, `#756D67`. A rail item: 36 px, 16 px icon, 14 px; selected: white, 1 px border, Medium.
  Not built: Option B (one plain A–Z list).
- **AC-5** **A row** (36 px, 8 px radius, 10 px in, 10 px gaps): **checkbox** (16 px, 4 px radius,
  1.25 px `#C9C2BB`; ticked: `#26211E` with a white ✓) · the **app's logo** (two for a blended metric,
  Σ for a custom one) · the **name** (14 px, cut with "…", full on hover) · a **tag** on the right
  (11 px Medium pill). **No descriptions.** A click anywhere on the row ticks it; a ticked row is
  **white with a border** and its name Medium. ↑ ↓ move (focused row `#F2EEEA`), **Space** ticks,
  **Enter** adds.
- **AC-6** **On board**: already on this board; **still pickable** (it adds a second card).
- **AC-7** **No data**: this store can't measure it. Faded (45 %), **no checkbox**, can't be picked.
- **AC-8** **An app that isn't connected**: a **call-out** at the end of the list (white, 1 px border,
  10 px radius, 56 px): the logo on a 32 px tile, the app's name and "Not connected · 2 metrics need
  it", and **Connect** (plug, outlined). Its metrics sit under it, faded, no checkbox. One call-out per
  missing app.
- **AC-9** **Connect** (AC-8): "Connecting…" with a spinner and "Finish signing in, in the window that
  opened"; the picker stays open with its picks. Then **"Connected · first sync running"** (green, a
  check) and its metrics can be picked, tagged **No data yet**; or **"Connection failed"** (red, a
  warning) with **Try again**, its metrics still faded, the picks kept. Closing the sign-in window
  without finishing puts Connect back.
  - **Stand-in:** no sign-in window; Connect connects after 2.5 s (`?connect=fail` fails once).
- **AC-10** **All metrics**: every metric grouped by app (Shopify, Meta Ads, the other apps, the
  blended ones "SHOPIFY + META ADS", **CUSTOM METRICS**), A–Z inside each group, then **APPS NOT
  CONNECTED**. **Custom metrics**: the ones made in the Metric library, with Σ.
- **AC-11** **Footer**: nothing picked → **Add cards** greyed. Then "**3 picked** · Clear" (14 px
  Medium + 14 px grey link) and **Add card** / **Add 3 cards**. Picking one that's on the board adds
  a line: "Revenue is already on this board" (two or more: "Revenue and Orders are already on this
  board"). **Clear** unticks everything. Picks stay when the search is cleared or another role is
  opened.
- **AC-12** **Esc, ×, Cancel or a click outside** close it without adding. Esc clears a search first.

## 3. Search (AC-13 – AC-15)

- **AC-13** Typing **searches every metric**, whatever the rail shows; the rail loses its highlight.
  It matches the **name**, **short forms** (AOV, ROAS, MER, CTR, CPA, CPC, CPM), the **app** ("meta")
  and **words in the definition**. Results are **grouped by app** with the **matched letters bold**;
  apps not connected last, under their call-out. The field's × clears it and puts back the role.
- **AC-14** Search finds **No data** metrics (faded) and **custom** ones (Σ, pickable).
- **AC-15** **No match**: "No metrics match “cogs”." and **Clear search** (outlined button). Picks
  made before stay.

## 4. Landing (AC-16 – AC-21)

- **AC-16** **The cards land at the end**, in the order picked, **each at a size that suits it**:
  sums and counts **6 × 1** (the number and its trend), rates and multiples **3 × 1** (the number).
- **AC-17** **The board scrolls just enough** to show them, the first one first; **each has a soft
  ring for 2 s** (1.5 px `#8A817B` plus a 4 px halo), then it fades. Reduced motion: no smooth scroll,
  no fade.
- **AC-18** A toast: **"Added 3 cards"** (one: **"Added MER"**) with **Undo**, for 6 s. Undo takes off
  exactly those cards; ⌘Z does the same.
- **AC-19** **Pick: Option A** — added from the dial, the board **stays in reading mode**. Added from
  the edit bar, edit mode stays on.
- **AC-20** Saving is silent (D11). A card from a just-connected app reads **"No data yet"** with Remove
  card until its first sync finishes (CR-22).
- **AC-21** The new cards follow the board's period and load like any card.

## 5. Add to board, from a metric's window (AC-22 – AC-26)

- **AC-22** The metric window's header has **Add to board** (+, white, 36 px) left of ×. Its menu
  (260 px, the popover shadow): "Your boards", then **your tabs, in tab order, only boards you can
  edit**, each with the board icon; a board that already has it says **Already on it** and can still
  be picked.
- **AC-23** Picking a board adds the card **at the end of it, sized by the same rule** (AC-16); the
  menu closes and **the window stays open**.
- **AC-24** Toast: **"Added Orders to Growth"** with **View** (outlined) and **Undo** (dark), for 6 s.
  **View** closes the window and opens that board **on its own dates**, scrolled to the new card with
  the 2 s ring. **Undo** takes it off again. **Our call:** added to the board you're on, the toast has
  Undo only, and closing the window shows the card with the ring.
- **AC-25** **Couldn't add**: "Couldn't add Orders to Growth." with a warning and **Try again**. Nothing
  changes; the window stays open. Stand-in: `?add=fail` fails the next add once.
- **AC-26** **Our call:** a metric can't be added to a board you can only view (it isn't listed).

## 6. Narrow windows (AC-27)

- **AC-27** At 1024 px the picker keeps its layout, **720 px wide with a 184 px rail**; rows stay on one
  line, long names end in "…" with the full name on hover.

## 7. Dummy catalog (stand-in)

The catalog is every metric in the dummy data plus catalog-only ones from the drawings (Cancellation
rate, Revenue per customer, Gross margin — no data —, Reach, Frequency, Platform conversion rate,
Gross sales, Items per order). **Google Analytics** (Sessions, Conversion rate) and **Zendesk** (Tickets
created, First response time) aren't connected, as drawn; Founder overview now reads nine apps.
Contribution margin is the custom metric (Σ).

## 8. Build status (2026-11-23)

Built in `AddCardsDialog.tsx` (picker), `catalog.ts` (roles, short forms, groups, landing size),
`sync/sync-store.ts` (connections, Connect), `tabs/board-state.ts` (`add-cards`, second-copy ids
"revenue#2"), `grid-layout.ts` (`fitAtEnd`), `BoardGrid.tsx` (the 2 s ring, scroll into view) and
`MetricWindow.tsx` (Add to board). The edit bar's stand-in dropdown is gone. 97 unit tests. Checked
live at 1440 and 1024 px (Playwright).

| Rules | Checked live |
|---|---|
| AC-1 – AC-2 | dial's Add cards closes the dial and opens the picker; the edit bar's opens it with edit mode on |
| AC-3 – AC-8 | 800 × 690, cursor in search, Founder or CEO selected, drawn rows in order, On board tags, Gross margin faded "No data", Google Analytics call-out with Connect, its metrics faded; Add cards greyed |
| AC-9 | Connecting… → Connected · first sync running, Sessions pickable "No data yet"; `?connect=fail` → Connection failed + Try again, picks kept |
| AC-11 – AC-15 | "1 picked · Clear", "Add card", "Add 3 cards", "Revenue is already on this board"; ↓ and Space; search "rate" groups SHOPIFY / META ADS / APPS NOT CONNECTED with bold letters; rail loses its highlight; no match + Clear search; Esc clears the search, then closes |
| AC-16 – AC-20 | 4 cards at the end in the order picked (3 × 1, 6 × 1, 3 × 1, 6 × 1), all scrolled into view, 2 s ring, "Added 4 cards" Undo (and Undo puts the board back), reading mode stays; Sessions reads "No data yet"; from the edit bar "Added MER" and edit mode stays with the grip |
| AC-22 – AC-25 | Add to board lists the editable tabs (not Q4 plan) with "Already on it"; Growth → "Added Orders to Growth" View · Undo, window stays; View opens Growth on Last 30 days with the new 6 × 1 card ringed in view; the open board → Undo only, ring after closing; `?add=fail` → "Couldn't add Orders to Growth." Try again |
| AC-27 | 1024 px: 720 px picker, 184 px rail |

Differences: the search field also gets the app's blue search-focus ring (globals.css
`[data-search-active]`), on top of the drawn soft ring. Later: Option B (one plain list), the empty
board's Add cards, Change metric, a real sign-in window for Connect.
