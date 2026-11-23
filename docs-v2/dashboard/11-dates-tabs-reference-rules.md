# Dashboard · Dates, tabs and the home board (reference, before 6D): rules

**Status:** Active · **Last updated:** 2026-11-24
**Source:** Figma `wRr8cpImqSXbIgk0XhNj7a`, page "Header Flow", section "Reference (before 6D) · Flow 4 + 5 + 7 ·
Board dates and comparison, tabs, home board" (node `20:8058`).

Read in full on 2026-11-24: 16 screens (4.1 – 4.6, 5.1 – 5.8, 7.1, 7.2) and their 16 notes; no layer
annotations, no option rows. Like `19:4157` (rules 10) it's a **reference drawn before 6D**: its "Built"
marks are the old prototype's, and later sections win where they redraw the same thing (the tabs: 01, 03;
the link and "your view": the Period row's P-5 as used in 09 SH-23).

---

## 1. What each screen maps to

| Screen | Where it lives now | Status |
|---|---|---|
| 4.1 The period menu | the header's period menu (02 BS-3), **DT-1** | Built; Last 60 days and Custom range added here |
| 4.2 A custom range | **DT-2 – DT-5** | Built here |
| 4.3 Comparison | the menu's "Compare to" (02) | ✅ Built |
| 4.4 Your view vs the board's dates | 09 SH-23 (P-5's Reset · Save for board), **DT-6** | Widened here to every date change |
| 4.5 Compared with last year | **DT-7** | Built here (wording; the dummy figures don't change, as drawn) |
| 4.6 A link opens on the sender's dates | 09 SH-21 – SH-23 | ✅ Built |
| 5.1 – 5.8 Tabs: menu, rename, duplicate, delete, restore, All boards, reorder | 01, 03 | ✅ Built (01 wins on the menu's contents) |
| 7.1 A board is shared with you | 09 SH-29 | ✅ Built (stand-in) |
| 7.2 Workspace default board (admin) | **DT-8 – DT-9** | Built here |

## 2. Dates (DT-1 – DT-7)

- **DT-1** The period menu offers **Today, Yesterday, Last 7, 30, 60 and 90 days, and Custom range…**
  (4.1; Yesterday stays from 02). Every card updates at once.
- **DT-2** **Custom range…** opens a panel under the period, right-aligned (640 × 380, white, 1 px
  `#E4E0DC`, 12 px radius, the popover shadow): **two months side by side**, Monday first, the month
  names (13 px Medium), weekday letters, day numbers.
- **DT-3** The first click sets the start, the second the end (an end before the start swaps them);
  until then, hovering previews the range. **The ends are dark rounded squares with white numbers; the
  days between are filled** (`#EFEBE7`). Days after today can't be picked. ‹ › move a month (**our call**:
  the reference draws no arrows; the range can reach back 12 months).
- **DT-4** The footer says **how long it is and what it's compared with**: "12 Oct – 9 Nov · 29 days,
  compared with the 29 days before" (or "with the same days last year"). **Cancel** (quiet) and
  **Apply** (dark; greyed until a range has both ends). Esc or a click outside close it.
- **DT-5** The trigger then reads the range ("12 Oct – 9 Nov"); the link, the stamp, downloads and the
  charts all follow it. Reopening Custom range starts on the range in use.
- **DT-6** **Changing dates changes only your view** (4.4): for everyone now, not only viewers and links.
  While your dates aren't the board's, **Reset** (back to the board's) and, for editors, **Save for
  board** sit beside the period (P-5's words; the reference's "This board opens on Last 7 days. Keep
  Last 30 days for this board · Back to Last 7 days" line is superseded). Nothing shows on the board's
  own dates. Your view is per board and lasts until you leave the dashboard (**our call**).
- **DT-7** **Same period last year** (4.5): what compares follows it: the full chart's legend reads
  "Same period last year", a day's readout "Last year · 9 Nov 2024", the metric window "on the same days
  last year" and its table "Last year". Stand-in: the dummy figures stay as they are (as drawn in 4.5).

## 3. The workspace's default board (DT-8 – DT-9)

- **DT-8** **Admins only**: More → **Default board for new members…** (the reference leaves where it
  lives to Dev; **our call**: the board menu, as its note offers) opens a small dialog (420 px):
  "**Default board for new members**", "New members start on this board. It never changes anyone's own
  tabs.", a select of the boards you can see (your tabs, then hidden ones), **Save** (dark).
- **DT-9** Save closes it with a toast "**New members start on Store overview**". Stand-in: kept in memory;
  members who aren't admins (`?role=member`) don't see the item.

---

## 4. Build status (2026-11-24)

Built: `period.ts` (custom range ids, names, comparison words), `CustomRange.tsx` (the two-month panel),
`DefaultBoardDialog.tsx`; the period menu gains Last 60 days and Custom range…; `Series.compare` carries
the comparison to the card's legend, the readout and the metric window; every date change is your view
(`link-view` store). Unit tests: `period.test.ts` (4). Checked live (Playwright, 1440 × 900) against 4.1,
4.2, 4.4, 4.5 and 7.2.

| Rule | Status | Note |
|---|---|---|
| DT-1 presets | ✅ | Today, Yesterday, 7, 30, 60, 90 days, Custom range… |
| DT-2 – DT-5 custom range | ✅ | Hover preview, swap, future days off, Esc closes; reopens on the range in use |
| DT-6 your view | ✅ | Reset · Save for board for everyone; your view is kept per board while you switch tabs |
| DT-7 last year | ✅ | "vs the same days last year", "Last year · 4 Nov 2024", "+11.7% vs last year" |
| DT-8 – DT-9 default board | ✅ | Admins only (`?role=member` hides it); toast "New members start on Growth" |

**Changed by this:** an editor's date pick no longer saves to the board by itself (02 TAB-7's "each board
keeps its own dates" still holds; Save for board keeps them).
