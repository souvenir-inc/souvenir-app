# Dashboard · Cards while reading: rules

**Status:** Active · **Last updated:** 2026-11-23
**Source:** Figma `wRr8cpImqSXbIgk0XhNj7a`, page "Header Flow", section "Board flow · Cards while
reading: sizes, hover, chart readout, metric window, card states, Needs attention, narrow windows
(in progress)" (node `167:27720`).

Read in full on 2026-11-23: 30 screens and their 30 notes (C-0 … C-7b), 86 layer annotations, and
the five "Options (Dev to pick)" rows. Styles below are as drawn (sizes `170:40175`, every state
`170:89060`, readouts `170:66889` / `170:67143` / `170:67441` / `170:67698`, metric window
`170:75690`, Needs attention pill `173:54812` and list `173:55163`, hover `170:53869`, focus ring
`170:54867`).

**Our call** marks where the Figma is silent. **Pick** marks an option row: we build the
designer's own pick ("my pick" in the annotation) and keep the others listed.

---

## 1. Sizes (CR-1 – CR-4)

- **CR-1** The board is a **12-column grid**; a card takes one of **six sizes** (width × rows):

  | Size | Grid | What it shows |
  |---|---|---|
  | Small | 3 × 1 (288 × 156) | the number and its change |
  | Small, tall | 3 × 2 (288 × 328) | the number at the top, its line below (256 × 168) |
  | Wide | 6 × 1 (592 × 156) | the number, its line beside it (right half, 88 px high) |
  | Medium | 6 × 2 (592 × 328) | the number and the **full chart** |
  | Full width | 12 × 1 (1200 × 156) | the number, a wide line (from 320 px to the right edge) |
  | Large | 12 × 2 (1200 × 328) | the full chart, with its **legend** top right |

- **CR-2** **A sum or count can show by week** (Orders): weekly bars instead of a line. At 6 × 1
  the bars are compact (no axis); at 6 × 2 and 12 × 2 they're the full weekly chart with "Week in
  progress" top right. The lighter bar is the week still filling in.
- **CR-3** **The full chart** (D9): round ticks on the right (`$0` … `$10k`), dashed gridlines, the
  period before **dashed and grey**, a soft area under this period, a **dot per day** (up to about
  45 days), the **latest value labelled** at the end (11 px Medium), dates under it.
- **CR-4** **The line beside or under a number** (sparkline): the same days with the period before
  faint behind it; **no axes**. Sizes change only in edit mode.

## 2. Reading a card (CR-5 – CR-9)

- **CR-5** **Every card answers for the header's period** (D7). The app logo sits top right (grey,
  14 px); a card reading two apps (MER: Shopify and Meta Ads) shows **both** logos.
- **CR-6** **Hover** (C-2, **Pick: Option A, lift only**): the card's edge darkens one step and a
  soft shadow lifts it (`0 0 0 1px` at 16 %, `0 8px 20px -10px` at 16 %); the pointer is a hand
  anywhere on the card, header included. Nothing moves and nothing new appears.
  Not built: B (a ↗ beside the logo), C (the title turns dark with a ›).
- **CR-7** **A click anywhere on a card, or Enter / Space, opens its metric window** (C-4). While
  reading nothing on a card can be moved or edited.
- **CR-8** **Keyboard** (C-2c): Tab goes tabs → period → sync button → the cards in board order →
  the +. The card in focus has a **2 px blue ring, 4 px outside the card** (radius 16). Screen
  readers hear "Platform ROAS, 2.6x, up 3.0%. Open". Esc closes the window and the ring is back on
  the same card.
- **CR-9** **Titles that don't fit** are cut with "…" and shown in full on hover (C-7).

## 3. The chart readout (CR-10 – CR-14)

- **CR-10** Moving along a **full chart** shows **one day at a time**: a hairline (`#C9C4BF`) marks
  the day and a ring sits on the line; a white readout (10 px radius, hairline ring, soft shadow,
  8 × 10 px padding, 12 px text) says:
  - the day ("Thu 13 Nov"), muted;
  - a dark dot + the date ("13 Nov") and its **exact** value ("52", "$7,412.30"), Medium;
  - a grey dot + "Previous period · 6 Nov" and its value, muted;
  - under a line, the change, **green or red by which way is good** for the metric ("+15.6% vs
    previous period").
  It follows the pointer day by day and goes when the pointer leaves the chart. **It opens right
  of the pointer and flips left in the right half**, so it never leaves the card or covers the
  dot. On touch, press and hold.
- **CR-11** **Weekly bars** (C-3a): the readout is per week and the hovered week gets a soft band
  (`#F5F2EF`). A finished week: "Week of 3 Nov", "Mon 3 – Sun 9 Nov" · 160. The week in progress:
  "Week of 10 Nov (so far)", "Mon 10 – Fri 14 Nov" · 84, against **the same days of the week
  before** ("Mon 3 – Fri 7 Nov" · 79) and "+6.3% on the same days" (the proposed readout).
- **CR-12** **Sparklines answer too** (C-3b, **Pick: Option B**): the same readout without the
  change line (the card's number carries it): day, value, previous period.
- **CR-13** **With a target** (C-3c): the chart draws the target as a **dashed line labelled at its
  left** ("Target 46"); each day's dot is **green when met, red when missed**; the readout adds
  "Target 46 · Missed" / "Met". The change line still compares with the period before.
- **CR-14** **Past the app's last sync** (C-3d): on a custom range the days after the last sync stay
  in the chart, **empty, never zero**; the readout for such a day says "No data yet". *Later:*
  needs the custom range of the Period row.

## 4. The metric window (CR-15 – CR-17)

- **CR-15** A dialog (760 px, 16 px radius, the modal shadow) **drawn as it is today** (the
  Scorecards' MetricModal, which this front-end doesn't have, so it's built from the drawing):
  - header (white, line under it): the **name** (15 px Medium), the **period** (12 px muted), the
    **number** (44 px) with its change and "vs the previous 7 days"; × top right (28 px).
  - tabs **Trend · Target · Definition · Sources · Other related** (13 px; 2 px line under the open
    one). **Trend opens first**, with the same days as the board.
  - Trend: "Up 8% on the previous 7 days" (15 px), a **Chart | Table** switch, a legend with each
    period's total ("Last 7 days 312 · Previous 7 days 289") and **Set a target**, then the full
    chart (704 × 264).
- **CR-16** **Esc, × or a click outside closes it; focus returns to the card** and the board
  doesn't move.
- **CR-17** **Our call** for the tabs not drawn: Table lists the days; Target says there's none yet
  with Set a target (not built: "isn't ready yet"); Definition describes the metric; Sources lists
  its apps with when each last synced; Other related lists the board's other cards from the same
  app. *Proposed in the annotations, not built:* dates in the period line, the card's sync dot in
  the window, ‹ › to step through the board.

## 5. Card states (CR-18 – CR-27)

- **CR-18** **One body state per card**, in this order: **loading, removed, locked, no data yet,
  couldn't load, no data**, then **the numbers** with whatever applies on top (a dot, "No
  comparison", a health pill). Empty states don't open the metric window (proposed, built).
- **CR-19** **Loading** (C-1): the title and logo show at once; the number (112 × 28, 6 px radius)
  and the chart shimmer **in their own shapes**, so nothing jumps. Cards that share dates fill in
  together.
- **CR-20** **Couldn't load** (C-1a): "Couldn't load." and an underlined **Try again** where the
  number goes (13 px); the title and logo stay. Try again asks for this card only: it shimmers, then
  shows its numbers. Everyone sees it, viewers too. If the card had numbers before, they stay.
- **CR-21** **The board couldn't load** (C-1b): the cards' place shows "Couldn't load this board."
  with a **Try again** button (white, 1 px `#D3CEC8`, 8 px radius, 32 px). The header keeps working.
- **CR-22** **No data yet** (C-5): its app's first sync is still running. **No data**: no connected
  app records it. **This metric was removed.**: gone from the catalog. Each with an underlined
  **Remove card** for people who can edit (the one edit while reading; it removes with Undo). A
  viewer sees the line only. No dot before a first sync. An app without a logo shows a **letter
  tile**.
- **CR-23** **Locked** (C-5c, **Pick: Option A**): a lock (14 px) and "No access" (13 px grey) where
  the number goes; no number, change, line, pill or dot. Hover: "Ask the board's owner for access".
  It doesn't open the window. Not built: Option B (Request access → Requested).
- **CR-24** **No comparison** (C-5a): when the period before is mostly empty the change reads "No
  comparison" (12 px grey) and the chart draws no line from the period before. **Three days or
  fewer**: every value is labelled and the period before is faint dots. **Under two days**: "Not
  enough days with data to show a trend" where the chart would be.
- **CR-25** **App behind or failed** (C-5b): the dot after the label (see SY-23); **hovering it says
  which app and how old its numbers are**: "Meta Ads sync failed · numbers from 9:42 am", "Shopify
  hasn't synced in 3 hours · numbers from 11:04 am". A card reading two apps shows the worse dot and
  names both.
- **CR-26** **Today, nothing yet** (C-5f): on Today, a card whose app hasn't synced today reads "—"
  (grey) and "No data yet" ("No data for today yet" on wider cards), with its dot and no change or
  pill.
- **CR-27** **Today still filling in** (C-5d) — **Pick: Option A** (today's build: solid to the
  end); Option B (the last day dotted, "51 so far") is listed only. **Conflict noted:** C-1 and C-5g
  draw a syncing card with a spinner after its label; the final Sync section (SY-24) shimmers the
  numbers. We keep SY-24 until design settles it.

## 6. Health (CR-28 – CR-30)

- **CR-28** **One quiet row under the number** (C-5e): a pill (24 px, 12 px radius, 6 px dot, 12 px
  text). **With a target**: "On track" (green, neutral pill) or "Off target −12%" (red pill); wider
  cards add the target ("Target $55k"). **Without one**, the benchmark: "Below healthy" / "Above
  healthy" (amber text on a neutral pill), "Red flag" (red pill). **Healthy shows nothing.**
- **CR-29** **One pill at most**: a target beats the benchmark. No pill on an empty, locked or "—"
  card. Judged on the card's own number for the header's period.
- **CR-30** The same verdicts feed Needs attention.

## 7. Needs attention (CR-31 – CR-34)

- **CR-31** **Pick: Option B, one pill in the header** before the period: a 7 px dot (**red** when
  any flagged metric is red, else amber), "**4 need attention**" (13 px Medium) and a chevron. It
  counts flagged metrics **across every board**. **Not shown when nothing is flagged** (no "all
  good"). Not built: A (a row of chips above the cards), C (dots on the tabs).
- **CR-32** A click opens the **list** under it (360 px, white, 1 px `#D3CEC8`, 12 px radius,
  `0 12px 24px -8px` at 16 %): heading "Needs attention" + count chip; rows **red first, then
  amber**: dot · the metric (13 px Medium) · "Store overview · Red flag" (its boards and why, 12 px
  grey) · its value. Hover tints the row (`#F5F2EF`). **7 rows, then it scrolls** with a fade.
- **CR-33** A click on a row **opens that metric's window** without leaving the board; Esc or a
  click outside closes the list.
- **CR-34** **Narrow** (C-7b): the pill shortens to "● 4" so the tabs keep their room; hover says
  "4 need attention"; the list opens the same way.

## 8. Narrow windows (CR-35 – CR-36)

- **CR-35** **From 1100 px up** the grid keeps its 12 columns; they get narrower and every card
  keeps its size and place; numbers and charts scale.
- **CR-36** **Under 1100 px** small cards (3-wide) take half a row, 6- and 12-wide cards the whole
  row; heights stay; same order, a later small card fills a gap beside an earlier one. Edit mode's
  resize handles hide. Under 640 px every card is full width. (Measured on the board's own width:
  1100 px of window is about 960 px of board.)

## 9. Dummy data and scenarios (stand-in)

Every metric gets daily values for the period (mock today: **Fri 14 Nov**) and the same days of the
period before; targets and benchmarks give the Figma's verdicts (Average order value on track,
Revenue off target −12%, Discount rate red flag, CTR below healthy, Cost per click above healthy).
Contribution margin keeps Shipping cost (ShipStation, first sync), Return label cost (no data) and
MER (two apps). `?cards=<scenario>` on `/dashboard`:

| `?cards=` | State |
|---|---|
| `cardfail` | Ad spend couldn't load (Try again works) |
| `boardfail` | the board couldn't load (Try again works) |
| `locked` | Net sales and Refund rate locked |
| `removed` | Discount rate's metric removed from the catalog |
| `newmeta` | Meta Ads connected on 12 Nov (few days, no comparison) |
| `manyflags` | nine flagged metrics (the list scrolls) |

With `?sync=yesterday` (Meta Ads last synced yesterday) and the period on **Today**, Meta Ads
cards read "—" (CR-26).

## 10. Build status (2026-11-23)

Built in `MetricCard.tsx` (six sizes, every body state, health pill, dot tooltip, the card as a
button), `chart/` (SVG full chart, sparkline and weekly bars with one readout; the Recharts
versions are gone), `series.ts` (dummy days), `card-states.ts` (precedence, health, `?cards=`),
`MetricWindow.tsx`, `NeedsAttention.tsx`, with the grid in `grid-layout.ts` / `card-placement.ts` /
`BoardGrid.tsx`. 88 unit tests. Checked live at 1440, 1280 and 1024 px (Playwright).

| Rules | Checked live |
|---|---|
| CR-1 – CR-4 | Growth: New customers 1200 × 328 with legend, four 288 × 328 cards with the line below; Orders bars; 6 × 2 full chart with 4 dates, 12 × 2 with 7; grip keys step small → small, tall → medium → large → full width → wide → small |
| CR-6 – CR-9 | hover darkens the edge and lifts the card, hand pointer; Tab ring 2 px blue 4 px outside; Enter and click open; Esc returns focus to the card; label "Revenue, $48.2k, up 12.4%. Open" |
| CR-10 – CR-13 | day readout (flips left in the right half); week in progress "Week of 10 Nov (so far) · 84 · 79 · +6.3% on the same days"; finished week; sparkline readout without change; target line, met / missed dots, "Target 46 · Met" |
| CR-15 – CR-17 | window 760 × 760, five tabs, Chart / Table (7 rows), Sources, Other related; Esc closes |
| CR-18 – CR-26 | Contribution margin: Shipping cost "No data yet" (letter tile), Return label cost "No data", Remove card with Undo, MER two logos, empty cards don't open; couldn't load + Try again; board couldn't load + Try again; locked "No access" with its hover; removed; Ads on `newmeta`: three labelled days, "No comparison"; Today with `?sync=yesterday`: "—" and "No data yet"; dot hovers name the app and the time |
| CR-28 – CR-34 | pills On track / Off target −12% + Target $55k / Red flag / Below healthy; "4 need attention" red; list 360 px, red first, rows open the window; `manyflags`: 9, scrolls; 1024: "● 4" |
| CR-35 – CR-36 | 1280: 4 columns; 1024: 2 columns, small cards half a row, wide ones the whole row, gaps filled; no sideways scroll at any width |

Open with design: CR-27's syncing card (spinner vs shimmer). The first-sync conflict is settled by
Add cards (A-5b): "No data yet" from the start. Later: Option rows B/C,
CR-14 (custom range), the window's proposed dates, sync dot and ‹ › stepping.
