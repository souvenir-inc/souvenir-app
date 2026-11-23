# Dashboard · Read me first (info)

**Status:** Info · **Last updated:** 2026-11-23
**Source:** Figma `wRr8cpImqSXbIgk0XhNj7a`, page "Header Flow", frame "Read me first · Canvas flows for
review" (node `23:16669`). This file records that cover so the rules files (01 – 06) have their
context in one place. It sets no rules of its own.

---

## What the Figma file is

**Canvas: every PRD flow, end to end, at 1440 × 900.** Drawn 16 Nov from the live front end
(localhost:3000, measured at 1440 × 900): the same rail, panel, header, tabs, buttons, cards,
dialogs, menus and toasts, in Geist and the warm neutrals. **Numbers are made up.** Each screen has a
**yellow note** under it: what happens, whether it is built, and the pattern or PRD flow behind it.

## How to review it

1. Start with **Base screen**: the board as designed (6D, 16 Nov). Every new screen is copied from
   Base.
2. Then the four flow sections, left to right. **Each note's first line ends with its status.**
3. The parts (cards, buttons, menus, dialogs) are **local components** at the bottom of the page:
   one change there updates every screen.
4. **Open questions stay open:** OQ1 (boards in the Operator and the Brief) and OQ2 (a Diagnose
   board you can keep) are not drawn as decided.

## Status legend (on every note)

| Status | Means |
|---|---|
| **Built** | In the app today, drawn as it looks |
| **Built · proposed change** | Built, with a small addition suggested on the screen |
| **New (front end only)** | Not built; needs no back end |
| **New (needs the back end)** | Not built; waits on S21+ back-end asks |

"Built" here meant built in the app on 16 Nov, before this work. Where this repo stands now is in the
index below.

## Flow index, and where each stands in this repo (2026-11-23)

Rules files: [01 tabs](01-tabs-rules.md) · [02 board screen](02-board-screen-rules.md) ·
[03 Manage tabs](03-manage-tabs-rules.md) · [04 sync](04-sync-rules.md) ·
[05 cards while reading](05-cards-reading-rules.md) · [06 Add cards](06-add-cards-rules.md).
All of it runs on dummy data; nothing is wired to the back end yet.

### Flow 1 + 6 · Make a board: empty, template, copy, Ask the AI, first visit (13 screens)

| Screen | In this repo |
|---|---|
| 1.1 · The + menu: three ways up front | Built: the dial's New board opens the chooser (08 NB-1 – NB-6) |
| 1.1b · The + menu: templates up front | Not built (Option B; the designer picked A) |
| 1.2 · Template library: what goes in | Built (08 NB-7 – NB-9) |
| 1.3 · Template with an app not connected | Built (08 NB-10, NB-13) |
| 1.4 · Template with nothing to show yet | Built (08 NB-11) |
| 1.5 · Empty board: made at once, named in its tab | Built (08 NB-16) |
| 1.6 · The empty board | Built (08 NB-17 – NB-19) |
| 1.7 · New board: copy a board | Built (08 NB-14); Duplicate (01) stays in the tab menu |
| 1.8 · Board made: new tab on the template's dates | Built (08 NB-12) |
| 1.9 – 1.11 · Ask the AI: describe, drafting, the draft | Built with a keyword stand-in (08 NB-20 – NB-30) |
| 1.12 · First visit: building the starter boards | Built as a stand-in, ?visit=first (08 NB-31 – NB-33) |

### Flow 2 + 3 · Cards: add several, edit, move, resize, remove, card settings, states (13 screens)

| Screen | In this repo |
|---|---|
| 2.1 – 2.3 · Add cards, several picked, no match | Built (06) |
| 2.4 · New cards land at the end | Built (06 AC-16 – AC-18) |
| 2.5 · Edit mode | Built (02) |
| 2.6 · Moving a card | Built (02 BS-24 – BS-31) |
| 2.7 · Resizing a card | Built, six sizes (02, 05 CR-1) |
| 2.8 · Removed, with Undo | Built: "Removed Revenue" with Undo, from edit mode's ×, Delete, or Remove card while reading (07 CP-10) |
| 2.9 – 2.10 · Card settings, change the metric | Built in S-8's look (10 CS-1 – CS-9) |
| 2.11 · Card states | Built (05 CR-18 – CR-27) |
| 2.12 · A shared board, view only | Built (01, 02 BS-22) |
| 2.13 · Add a metric to a board from its own window | Built (06 AC-22 – AC-25) |

### Flow 4 + 5 + 7 · Board dates and comparison, tabs, home board (16 screens)

| Screen | In this repo |
|---|---|
| 4.1 · Dates: the period menu | Built (base board) |
| 4.2 · Dates: a custom range | Built (11 DT-2 – DT-5) |
| 4.3 · Comparison: period before or last year | Built in the period menu (base board) |
| 4.4 · Looking at other dates than the board's | Built in P-5's words, Reset · Save for board (11 DT-6) |
| 4.5 · Compared with the same period last year | Built: the wording follows; dummy figures as drawn (11 DT-7) |
| 4.6 · Opened from a link, on the sender's dates | Built (09 SH-21 – SH-23) |
| 5.1 – 5.8 · Tabs: menu, rename, duplicate, delete, restore, All boards, reorder | Built (01, 03) |
| 7.1 · A board is shared with you | Built: the Shared tag, avatar and menus (01, 03); the toast with Add to tabs as a stand-in, ?shared=1 (09 SH-29) |
| 7.2 · Workspace default board for new members (admin) | Built in More, admins only (11 DT-8 – DT-9) |

### Flow 8 + 9 + 10 · Share, save and undo, versions, export (13 screens)

| Screen | In this repo |
|---|---|
| 8.1 – 8.3 · Share: people, change or remove, post to Slack | Built in memory, no back end (09 SH-4 – SH-28) |
| 8.4 · A number you aren't cleared to see | Built as Locked (05 CR-23) |
| 8.5 · Deleting a shared board | Built in part: the delete confirm (01); naming who else loses it waits on sharing data |
| 9.1 · Undo and redo | Built: Undo on toasts and ⌘Z (01 TAB-14); no redo |
| 9.2 · A save that failed | Not built |
| 9.3 – 9.5 · Version history, a version restored, someone else changed the board | Not built ("isn't ready yet") |
| 10.1 – 10.3 · Export a card's numbers, the spreadsheet, the board as an image | Built as one Download dialog in More (09 SH-31 – SH-37, Option B) |

### Sections built from the "Header Flow" page

| Figma section | Node | Rules |
|---|---|---|
| Base board | `17:889` | 01 (base), 02 |
| Header · Tabs | `136:20976` | 01 |
| Board screen 6D | `73:20404` | 02 |
| Header · Tabs · Manage tabs | `415:64464` | 03 |
| Header · Sync button (final, 18 Nov) | `95:18703` | 04 |
| Board flow · Cards while reading | `167:27720` | 05 |
| Board flow · Add cards | `167:27723` | 06 |

## Review rounds (16 Nov): how the board screen got to 6D

- **Round 1** (your comments, 16 Nov morning): three header options (H1 – H3); the grid and its rules
  in "Canvas design logic"; the + opening a menu (1.1 three ways, 1.1b templates first); the New board
  library grouped by role, yours first, names only, Use template in a footer, an outline of the
  metrics with no figures; apps not connected as a call-out with the app's logo and Connect; the empty
  board made at once and named in its tab, offering Add cards and three templates; Ask the AI in its
  own small dialog from the + menu.
- **Round 2** (on H1): tabs centred at the top; Share and Edit as icon buttons; Add cards moved into
  edit mode. Four tab designs (T1 segmented, T2 underline, T3 dark pill, T4 large names). Edit mode:
  Add cards and Done replace the pencil.
- **Round 3** (a professional board screen): Edit beside Share; the + became New board in edit mode.
  Three whole-screen iterations: V1 Refined, V2 Ledger, V3 Focus. All three: one comparison for the
  page (no per-card "vs …"), a change chip or coloured change, real app logos, white cards, the chart
  caption turned into a legend.
- **Round 4** (V1 kept): V1 is the board screen; tabs 16 px from the top, no ⌄; the ⋯ menu holds All
  boards and Recently deleted. H1 – H3, T1 – T4, V2 and V3 moved to the "Dump" page.
- **Round 5** (a designer's four header directions): A "One line" (the designer's pick), B
  "Sentence", C "Capsule", D "Dock". All four: tabs first, no bordered comparison box, sync time quiet
  (amber when stale, red when a source fails), Edit and Share quiet, Add cards and New board in edit
  mode, softer cards (a ring instead of a border, coloured change with an arrow, grey logos, × inside
  the card in edit mode). Full spec in `canvas-header-design-options.md`.
- **Round 6** (tabs in the centre, a stronger active tab, Edit and Add visible): 6A "Capsule and
  dock", 6B "One line, centred", 6C "Tabs on top, tools in the dock"; and **6D "Floating actions"**:
  the actions float at the bottom right (⋯, Share, Edit, a dark +), the period at the top right, a sync
  status at the top left.
- **Final · 6D** (16 Nov): the board screen, beside Base: dark tab segment (from 6C), borderless period
  at the top right, the sync status (apps' logos in colour) at the top left, floating actions at the
  bottom right, plus 6D-5, the ⋯ menu. V1, round 5 and 6A – 6C moved to the Dump page, each row
  starting with a card: what it was, what you said, what carried into 6D. The header flows follow
  below 6D: the sync button first, then the tabs and the period.
  - Built here as 02's board screen. One difference since: the sync button sits at the top **right**,
    after the period (04 SY-1, the final sync section), not the top left.
