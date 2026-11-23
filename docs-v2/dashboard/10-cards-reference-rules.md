# Dashboard · Cards (reference, before 6D): rules

**Status:** Active · **Last updated:** 2026-11-23
**Source:** Figma `wRr8cpImqSXbIgk0XhNj7a`, page "Header Flow", section "Reference (before 6D) · Flow 2 + 3 ·
Cards: add several, edit, move, resize, remove, card settings, states" (node `19:4157`).

Read in full on 2026-11-23: 13 screens (2.1 … 2.13) and their 13 notes; the section has no layer
annotations and no option rows. It's a **reference drawn before the 6D board screen**: its "Built" marks
are the old prototype's. Most screens have since been redrawn in later sections, which win (00 §
"review rounds"). The one part nothing later replaces is **card settings** (2.9, 2.10); the Share
section's S-8 (`174:56384`) redraws its sheet after 6D, so we build S-8's look with 2.9 – 2.10's rules.

---

## 1. What each screen maps to

| Screen | Where it lives now | Status |
|---|---|---|
| 2.1 – 2.3 Add cards: catalog, several picked, no match | 06 AC-3 – AC-15 (Add cards section, grouped by role) | ✅ Built; superseded look |
| 2.4 New cards land at the end, sized to suit | 06 AC-16 – AC-18 | ✅ Built |
| 2.5 Edit mode | 02 BS-17 – BS-22 | ✅ Built. Not built: **a long press on a card starts edit mode** and **a press on the empty grid ends it** (6D starts edit mode from Edit board only) |
| 2.6 Moving a card | 02 BS-24 – BS-29 | ✅ Built (keyboard: ⌥← ⌥→, 02) |
| 2.7 Resizing from any side, the size name on the slot | 02 BS-19, 05 CR-1 | ✅ Built from the corner grip; size names are announced, not drawn on the slot (6D draws a grip, not sides) |
| 2.8 Remove, with Undo | 02 BS-18, 07 (Toast) | ✅ Built ("Removed Revenue", Undo, ⌘Z). From card settings: CS-8 |
| **2.9 Card settings** | **this doc, CS-1 – CS-9** | Built in this loop |
| **2.10 Change the metric** | **this doc, CS-4 – CS-5** | Built in this loop |
| 2.11 Card states | 05 CR-18 – CR-29 | ✅ Built; "a metric removed from the catalog" is 05's `?cards=removed` |
| 2.12 A shared board, view only | 01 TAB-50 – TAB-53, 02 BS-22, 09 SH-2 | ✅ Built |
| 2.13 Add to a board from the metric window | 06 AC-22 – AC-25 | ✅ Built |

## 2. Card settings (CS-1 – CS-9)

- **CS-1** **In edit mode, a click on a card opens its settings** (a press that doesn't move; a drag still
  moves it). **Enter** on a focused card does the same. Reading mode is unchanged: a click opens the
  metric window (05 CR-7). Viewers never get settings (no edit mode).
- **CS-2** A small dialog (**S-8's look**: white, 12 px radius, ~460 px): the **metric's name** (16 px
  SemiBold) and ×. Then **Metric**: a field with the metric's name and **Change**. Then **Chart**: a
  segmented switch **Trend · Weekly bars**. Then the actions, each a white outlined button with an icon:
  **Duplicate**, **Download numbers**, **Download image**, **Remove**. They wrap; under 760 px they stack.
- **CS-3** **The board decides the dates; the target lives with the metric**: neither is set here. Every
  change applies at once; ×, Esc or a click outside close it.
- **CS-4** **Change** opens a search of the catalog in place of the field (the cursor in it), with
  **Keep this metric** to put the field back. Matches show the name and its group (the app, "Custom
  metrics"); the current metric has a check. ↑ ↓ Enter pick; Esc goes back to the field (**our call**).
  Metrics the store can't measure, or whose app isn't connected, are listed faded and can't be picked
  (06 AC-8's rule, **our call** here).
- **CS-5** **Picking another metric keeps the card's size and place.** A chart the new metric doesn't
  suit goes back to Trend. The dialog stays open on the new metric (**our call**), and ⌘Z undoes the swap.
- **CS-6** **A card's chart follows its size unless its settings say otherwise** (since 2026-11-24,
  CS-12): Trend or Weekly bars, for every metric (a rate's bars show each week's figure). A card's
  chart is its own: two copies of Orders can differ. (Replaces "weekly bars for sums and counts only".)
- **CS-7** **Duplicate** adds a copy at the end at the same size and chart, ringed (06 AC-17), with a
  toast "**Duplicated Revenue**" and Undo; the dialog closes (**our call**).
- **CS-8** **Remove** takes the card off at once and closes the dialog; toast "**Removed Revenue**" with
  Undo (as the ×, 07).
- **CS-9** **Downloads** (09 SH-31's Option A half, kept beside the Download dialog in More):
  **Download numbers** reads "Preparing…" with a spinner, and Download image waits, then the browser
  saves `revenue-2025-11-08-to-2025-11-14.csv` (09 SH-37's sheet, one card). **Download image** saves
  the card as it looks with the stamp under it, `revenue-….png` (S-9b). No success toast. A failure shows
  one red line under the buttons, "**Couldn't download the numbers. Try again.**" or "**Couldn't download
  the image.**" A **locked card has no Download numbers** (S-8a); its image shows the lock.
  **Stand-in:** `?download=fail`.

---

## 3. Build status (2026-11-24)

Built: `CardSettings.tsx` (the sheet, the catalog search, the chart switch, the actions and the card
image), `BoardCard.chart` (a card's own chart), `CardView.bars` (the card reads it), `BoardGrid`'s
`onOpenSettings` (a press that doesn't move, or Enter, in edit mode), `BoardSnapshot`'s `columns` (a card
image at the card's width). Swaps and chart changes are one `set-cards` step, so ⌘Z undoes them. Unit
tests: `card-settings.test.ts` (2). Checked live (Playwright, 1440 and 700 px wide) against S-8 and 2.10.

| Rule | Status | Note |
|---|---|---|
| CS-1 opens from edit mode | ✅ | A drag doesn't open it; reading mode still opens the metric window; Enter on a focused card |
| CS-2 the sheet | ✅ | 460 px, S-8's look |
| CS-3 applies at once | ✅ | ×, Esc, outside close it; edit mode stays on |
| CS-4 Change | ✅ | Search with the cursor in it; Keep this metric; Esc goes back to the field |
| CS-5 swap keeps size and place | ✅ | A metric already on the board gets its own card ("refund-rate#2"); ⌘Z undoes |
| CS-6 weekly bars for sums and counts | ✅ | Greyed with a tooltip for rates and multiples |
| CS-7 Duplicate | ✅ | At the end, ringed, keeps the chart; "Duplicated Revenue" + Undo |
| CS-8 Remove | ✅ | "Removed CTR" + Undo |
| CS-9 downloads | ✅ | One-card CSV; card PNG with the stamp; locked card has no Download numbers; `?download=fail` |

**Not built (reference only, superseded by 6D):** a long press starting edit mode, a press on the empty
grid ending it, resizing from any side, size names drawn on the resize slot.

---

## 4. Edit marks and resizing, 1 : 1 with 2.5 and 2.7 (2026-11-24, CS-10 – CS-14)

Asked for on 2026-11-24: the reference's resize arc and remove badge, sizes that decide the chart, a
landing area while resizing as when moving, and a smooth resize. These **replace 6D's × (top right) and
diagonal grip** (02 BS-18).

- **CS-10** **Remove badge** ("Edit / remove badge", `19:5119`): 22 px circle, 7 px outside the card's
  top-left corner, `#E4E0DC` with a 1 px `#D3CEC8` ring and a 0 2 6 −1 shadow, an 8 px minus 1.46 px in
  ink. A click removes the card with Undo ("Removed CTR"). It grows a little on hover.
- **CS-11** **Resize arc** ("Edit / resize arc", `19:5122`): a 3 px round-ended quarter arc in ink at 35 %
  (60 % on hover or focus) hugging the bottom-right corner; its 34 px box reaches 4 px past the corner and
  is the hit area (cursor ↘). Redrawn for this board's 12 px corner (the reference draws 16 px). Arrow
  keys resize as before. Hidden on the narrow layout.
- **CS-12** **The size decides the chart**: Small and Small tall show the number; **Wide and Full width
  draw the line**; **Medium (2 × 2) and Large (4 × 2) draw weekly bars** (2.5: Orders 2 × 2 with bars,
  Revenue 2 × 1 with its line). All six sizes stay. Card settings can switch any card (CS-6).
- **CS-13** **While resizing** (2.7, `19:5600`): the card's frame follows the pointer freely (white, 1 px ink
  outline, 0 10 24 shadow, updated once a frame), its content at the size it will snap to; **its place on
  the board shows the landing slot** ("landing slot · Medium", `19:6006`: dashed 1 px `#9C938B` 6 · 5,
  3 % ink fill, the size's name on a dark 22 px pill 26 px above its top-left: Small, Small tall, Wide,
  Medium, Full width, Large), and the other cards make way, as when moving a card.
- **CS-14** **Release** glides the frame into its slot (180 ms); **Esc** puts the card back at the size it
  had. Built: `EditChrome.tsx` (badge, arc, slot), `BoardGrid` (the free frame), `barsBySize`.

**Changed by this:** big cards no longer draw the full line chart with the target line by default
(05 CR-3, CR-10's full chart): set the card to Trend in its settings to get it back.
