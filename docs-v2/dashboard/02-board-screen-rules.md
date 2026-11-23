# Dashboard · Board screen (6D): rules

**Status:** Active · **Last updated:** 2026-11-23
**Source:** Figma `wRr8cpImqSXbIgk0XhNj7a`, page "Header Flow", section "Board screen · 6D (final,
16 Nov): the board, + menu, data sources, edit mode, ⋯ menu, sync states" (node `73:20404`).

Read in full on 2026-11-23: all 5 screens (6D-1 … 6D-5), their 5 notes, and the text and styles of
every overlay (speed dial, Data sources, edit bar, edit-mode card, More menu). Cross-checked
against the later sections that start from these screens (Add cards, New board, Share and export,
Sync button, Tabs).

Rule IDs are `BS-…`. **Our call** marks where the Figma is silent. **Later** marks what another
section designs (§8).

---

## 1. Which design wins

- **BS-1** This section is "final, 16 Nov". The Tabs section (`136:20976`, 18–19 Nov) is newer and
  wins where they differ:
  - The board menu (More) keeps the Tabs section's items and icons: **Hide tab**, not "Remove from
    tabs"; hidden boards in All boards are grey with an eye-off, not "Not in your tabs".
- **BS-2** The **speed dial** stands. Every later section starts from it (Add cards A-1, New board
  N-1, Share S-1), so the + opens the dial, and More is the dial's last action. The Tabs section's
  "More (the + button)" is shorthand for this path.

## 2. The board at rest (6D-1)

- **BS-3** Boards on the left in the capsule (see `01-tabs-rules.md`). On the right: the period,
  borderless, with the comparison inside its menu; then the sync button.
- **BS-4** The board's actions are tucked into one dark **+** at the bottom right (a speed dial), in
  the margin beside the cards so it never covers a number. (Where the panel is too narrow for a
  margin, the cards get room to scroll clear of it: TAB-9 / the scroll rule in the build.)
- **BS-5** The dial **starts open on a new or nearly empty board**, while you set it up. **Our
  call:** "nearly empty" = 2 cards or fewer; it starts open each time such a board opens, and
  never in edit mode (the edit bar takes the corner).

## 3. The speed dial (6D-2)

- **BS-6** Clicking the + turns it into **×** and lifts the board's actions above it, each a round
  button (36 px, white, raised) with its name in a label beside it (white, 8 px radius, 13 px
  Medium), bottom to top ending at the top with:
  1. **Add cards** (plus) — edit mode with the card picker open
  2. **New board** (grid) — makes a board (the chooser is Later; see BS-20)
  3. **Edit board** (pencil) — edit mode
  4. **Share** (share) — the Share dialog (Later)
  5. **More** (⋯) — the board's menu (BS-9)

  Pitch 44 px (36 + 8 gap); 12 px between the last action and the ×; labels 8 px left of their
  buttons, centred on them.
- **BS-7** **Esc**, a click outside, or the **×** closes it. Picking an action closes the dial and
  does the action.
- **BS-8** What a person can do decides what the dial offers. Someone who can only **view** the
  board has no Add cards and no Edit board; New board, Share and More stay (Add cards A-1, New
  board N-1, Share S-1: "Share … for everyone who can see the board").

## 4. More, the board's menu (6D-5)

- **BS-9** More opens the board's menu **above the ×** (the dial's other actions fold away while
  it's open). Contents and rules: `01-tabs-rules.md` TAB-28, TAB-29, TAB-53 (BS-1).
- **BS-10** Closing the menu closes the dial too; the + is back.

## 5. Data sources (6D-3)

- **BS-11** *(Replaced by `04-sync-rules.md`, SY-1 – SY-12.)* The sync button opens **Data sources** under it (right edges aligned, 320 px wide).
  While it's open the button turns **white with a fine border** (`#D3CEC8`) and its icon goes
  near-black.
- **BS-12** Contents: heading **"Data sources"** with a count chip (the number of apps); one row per
  app this board's cards use (brand logo in colour, name, when it last synced, e.g. "2 min ago");
  a line; then **Refresh** (an outlined pill with the sync icon) on the left and the hover's words
  (**"Synced 3 min ago"**, the oldest app's time) on the right.
- **BS-13** **Refresh** syncs every app. **Our call:** while syncing the icon spins and the button
  reads "Refreshing…"; afterwards the times read "Just now".
- **BS-14** Hovering the sync button says the same words as the footer ("Synced 3 min ago").
- **BS-15** The **dot** on the sync button's top-right edge: **green** while every app is up to
  date, **amber** when one is behind, **red** when one failed (the full states are the Sync button
  section, Later). No dot on a board with no cards (TAB-8). The apps are those of **this** board
  only.
- **BS-16** A board with no cards: Data sources says there are no apps yet. **Our call** on the
  words: "No apps yet. Add a card to connect one."

## 6. Edit mode (6D-4)

- **BS-17** Edit board (or Add cards) puts the board in edit mode. The speed dial becomes a
  **floating bar in the same corner**: **+ Add cards**, **+ New board**, a thin divider, then
  **Done** (dark). Done leaves edit mode.
- **BS-18** Every card shows a **×** (24 px, white, raised, top right, in place of the source mark)
  and a **resize grip** (two diagonal strokes, bottom right). The tabs, the sync status and the
  period stay at the top.
- **BS-19** In edit mode cards **move** (drag) and **resize** (drag the grip): 1 × 1, 2 × 1 or 2 × 2
  cells (small, medium, large). × removes the card. **Our call:**
  - Cards move and resize only in edit mode; reading the board can't knock a card out of place.
  - The grip reads the **direction** of the drag, not where the pointer is, so every card can
    grow, including those in the right-hand column (they grow leftwards): sideways past half a
    column, either way, makes a 1-wide card 2 wide; left past half a column narrows a 2-wide
    card; down past half a row makes a card 2 tall (a small card becomes large, as there's no
    1 × 2 size); up past half a row shortens it. The grip's target is 28 px.
  - Keyboard: in edit mode each card is focusable; ⌥← / ⌥→ move it one place (as tabs, TAB-13);
    on the grip, → / ← widen or narrow it and ↓ / ↑ make it taller or shorter; Delete removes it.
  - Esc leaves edit mode (like Done) when nothing else is open.
  - Switching boards leaves edit mode, except a new board, which opens in it (TAB-36).
- **BS-20** **Add cards** opens the card picker (its own section: Later). **Stand-in until then:**
  a short list of metrics not on the board; picking one adds it as a small card at the end.
- **BS-21** **New board** in the bar or the dial makes an empty board at once (TAB-36): last tab,
  open, name field selected, in edit mode. The chooser (template, copy, Ask the AI) is Later.
- **BS-22** People who can only view a board never get edit mode (BS-8).

## 6b. Placing cards (edit mode)

Not drawn in this section; asked for on 2026-11-23 ("hover drop place indicators and replacing
existing card positions"). All **Our call**, built on BS-19.

- **BS-24** Press a card and drag (4 px before it counts, so a click stays a click). A copy of the
  card lifts (raised shadow, 2 % larger) and follows the pointer from where it was picked up. The
  card's own place becomes a **drop slot**: a dashed 2 px border in the drop-line blue
  (`--dashboard-drop-line`) on a faint blue fill (`--dashboard-drop-slot`), the card's size.
- **BS-25** The slot goes **where the card is being put**, and the cards it moves **slide into their
  new places** (the existing layout spring), so cards make room instead of being covered.
  - On the 4-column design grid: the **copy's top-left corner snaps to the nearest cell**
    (BS-29). Using the corner rather than the pointer makes big cards land where they look like
    they'll land.
  - On narrower panels (2 or 1 columns, where cards flow in reading order): of every place in the
    order, the one whose slot the grid would draw under the pointer, or nearest it. The slot only
    moves when another place is clearly better (12 px), and waits 140 ms after a move for the
    cards to settle, so it doesn't flicker.
- **BS-26** Let go: the copy glides into the slot (180 ms) and the card is there. **Esc** puts every
  card back where it was when the drag began. Grip and × presses never start a move.
- **BS-27** Near the panel's top or bottom edge (64 px) the panel scrolls, faster closer to the
  edge, and the slot keeps following.
- **BS-28** No dense packing: what you see is where the card lands.
- **BS-29** **Positions** (asked for 2026-11-23: "easier to move the bigger cards, not necessarily to
  the end; smaller ⇄ bigger must be easier"). Each card has its own cell on the 4-column design
  grid (column, row), so any card, of any size, can go anywhere:
  - The dragged card is put at the cell asked for (clamped into the 4 columns).
  - The other cards make room whichever of three ways **disturbs the board least**: (a) cards
    it doesn't cover stay put and the covered ones fill the first free spaces (usually the place
    the card left); (b) covered cards move straight down, then cards float up; (c) every other
    card repacks in reading order around it. Disturbance = how far the other cards move (cells)
    + 3 per hole above the last row + 2 per row the board grows; on a tie, the one that moves the
    others least.
  - Every preview is worked out from the layout the drag began with, so dragging back to where
    the card started puts the whole board back.
  - Examples (tests): the 2×2 Orders card to the bottom right, and the four small cards it lands
    on take its old place; a small card onto Orders' corner, and Orders steps down a row in its
    own columns; the Figma board is unchanged by repacking.
- **BS-30** A card dropped **exactly onto one card of the same size** swaps places with it, and
  nothing else moves: small ⇄ small and medium ⇄ medium are a clean exchange.
- **BS-31** Resizing keeps the card's top-left (moving it left if it would run past the edge) and
  packs the others around it; removing a card packs the board (no hole left); a new card goes in
  the first free space. The DOM and keyboard order is the reading order (top to bottom, left to
  right); ⌥← / ⌥→ moves a card one place in it and lays the board out again.
- Reading the board, nothing moves (BS-19).
- Code: `grid-layout.ts` (pure: positions, place, pack, resize, first fit; tests in
  `grid-layout.test.ts`), `card-placement.ts` (narrow panels and edge scroll), `BoardGrid.tsx`.
  Card changes are reducer actions on the board as it is now, never on a copy a long drag
  captured earlier.

## 7. Toasts

- **BS-23** Board toasts sit left of the speed dial, bottom-aligned with it (as built for the tabs).

## 8. Later (designed elsewhere)

- The card picker (Add cards section), the New-board chooser (New board section), the Share dialog
  (Share and export), every sync state and the amber/red banners (Sync button section), Download as
  image, Version history. Until they're built the dial's Share and those menu items say they
  aren't ready yet.

## 9. Build status (2026-11-23)

Built on dummy data and checked live at 1440 × 900 (Playwright), screen by screen against
6D-1 … 6D-5.

| Rules | Status | Where |
|---|---|---|
| BS-1, BS-2 (which design wins) | Applied: speed dial; More keeps the Tabs section's menu | `BoardActions.tsx` |
| BS-3, BS-4 | Built | `DashboardScreen.tsx`, `BoardHeader.tsx` |
| BS-5 (starts open on ≤ 2 cards) | Built; checked: 3 cards closed, 2 cards open | `SpeedDial startOpen` |
| BS-6 – BS-8 (dial, close, viewer) | Built; checked: 5 actions on a 44 px pitch; Esc, outside, × close; a viewer gets New board, Share, More | `SpeedDial` |
| BS-9, BS-10 (More) | Built; checked: dial folds away, × closes all | `SpeedDial`, `MoreMenuContent` |
| BS-11 – BS-16 (Data sources) | Built; checked: 320 px, right edges aligned, white + border while open, tooltip, Refresh, "No apps yet" | `SyncStatusButton` |
| BS-15 amber / red dots | Built in code (tokens `--dashboard-sync-behind`, `--dashboard-sync-failed`); dummy data is all fresh | `boardSyncStatus` |
| BS-17 – BS-19 (edit mode) | Built; checked: bar, × and grip on every card, grip drag and keys, ⌥→ moves one place, Delete, Esc, switching boards leaves it | `EditBar`, `BoardGrid`, `MetricCard` |
| BS-20 (Add cards) | Stand-in picker (metrics not on the board) | `EditBar` |
| BS-21 (New board) | Built: empty board, last tab, name field, edit mode | `DashboardScreen newBoard` |
| BS-22 (viewers never edit) | Built | `editing` in `DashboardScreen` |
| BS-23 (toasts) | Built (from the tabs work) | `globals.css` |

Changed from the earlier build because of these rules:
- The + no longer opens the board menu directly: it opens the dial, and More opens the menu.
- The card's ⋯ menu (size, move, remove) is gone. Reading the board shows only the number;
  moving, resizing and removing happen in edit mode (BS-19), with the keyboard paths above.
- A press on a card's grip or × never starts a card drag (cards start drags by hand, not from a
  native listener React can't stop).

### Final check (2026-11-23)

BS-23: in edit mode the wide edit bar takes the toast corner, so toasts sit above it, right-aligned
(`body:has([data-dashboard-editbar])` in `globals.css`); checked live, no overlap.
BS-6 reads "bottom to top", but the build follows the drawn frame (Add cards at the top of the dial,
More next to the ×): worth a quick design confirmation.
