# Dashboard · Manage tabs: rules

**Status:** Active · **Last updated:** 2026-11-23
**Source:** Figma `wRr8cpImqSXbIgk0XhNj7a`, page "Header Flow", section "Header · Tabs · Manage
tabs (in progress)" (node `415:64464`).

Read in full on 2026-11-23: 5 flow cards, 15 screens and their 15 notes, the "Shared tag · states"
sheet, the `Tag / Shared` component description, and the 19 layer annotations (development,
interaction, visual and logic). Styles below are as drawn (dialog `389:61830`, drag `389:62113`,
Recently deleted `416:64320`, Hidden `445:65495`, rename field `402:63072`, empty field
`417:65432`, shared menu `402:65679`).

This file replaces §12 (MT-1 – MT-13) of `01-tabs-rules.md`; the IDs carry over, with more detail.
**Our call** marks where the Figma is silent.

---

## 1. The dialog (MT-1, MT-2)

- **MT-1** A dialog, **fixed 480 × 560, centred**. On windows under 624 px tall it keeps 32 px from
  the top and bottom. It keeps its size when you switch tabs.
  - Surface `#F9F8F5` (`--neutral-50`), 20 px radius, the modal shadow; 8 px side padding, 16 px top
    and bottom, 16 px between header, tabs, list and footer.
  - Header 28 px: **Manage tabs**, 16 px SemiBold `#26211E`; × (28 px box, 14 px icon) at the right.
  - The title, the tabs and the footer are **pinned**; the list fills the space between and
    **scrolls**, with fades at the top and bottom when there's more and the scrollbar showing
    where you are.
- **MT-2** Opens from: a tab's right-click → Manage tabs; the end of the “N more” list; More → All
  boards → Manage tabs (on Your tabs); More → Recently deleted (on Recently deleted).

## 2. The three tabs (MT-1)

- **MT-14** Inline and borderless: **Your tabs N · Hidden N · Recently deleted N**, 20 px apart,
  8 px in from the dialog's edge. Label 13 px Medium (`#26211E` open, `#756D67` not), count 12 px
  Regular `#8C847E`, 5 px after the label. A **2 px line** (`#26211E`, 1 px radius) the width of the
  label sits 6 px under the open tab; no line under the others, and **no rule across the strip**.
- **MT-15** A tab with nothing in it shows no count (Recently deleted with 0 reads "Recently
  deleted"). **Our call:** Hidden follows the same rule.
- **MT-16** **Our call:** ← / → move between the three tabs (role tablist), like the tab row.

## 3. Your tabs (MT-3 – MT-8)

- **MT-3** Boards in the **same order as the tab row**, then a **plain line after the last board
  that fits in the row** (`#E4E0DC`, 1 px, 8 px in from each side, 4 px above and below). The line
  moves with the window width.
- **Row** — 32 px high, 6 px radius, 8 px gap: **handle** (grip, 16 px) · **name** (14 px Medium
  `#524B47`, cut with “…”) · **“Shared” tag** when shared with you (MT-12) · **eye** and **⋯** (24 px
  buttons, 6 px radius, 16 px icons, 2 px apart, **always shown**).
  - The handle lines up with the title and the tab labels; ⋯ lines up with × and Save (measured on
    the drawn icons).
  - **Hover, or its ⋯ menu open:** the row tints, the tint running **8 px past both edges**.
  - **Keyboard:** Tab reaches the row; a **2 px blue ring** (`--focus-ring`), as on the tabs.
- **MT-4** **Drag a row by its handle.** The row stays in place at **40 %**; a **chip** follows the
  pointer (white, 1 px `#E4E0DC` border, 6 px radius, soft shadow, 32 px high, handle + name); a
  **blue line with a dot** (2 px, `--dashboard-drop-line`) shows where it lands. **Hidden boards
  don't drag.** **Our call:** no line when the drop wouldn't change the order; Esc cancels the drag;
  ⌥↑ / ⌥↓ on a focused row (or its handle) move it one place.
- **MT-5** **The eye** hides the board (it moves to Hidden, on Save). **⋯** opens the board's menu
  **right under ⋯** (aligned to its end): **Rename, Duplicate, Copy link | Hide tab, Delete board**
  (176 px). No Move items here: the handle moves rows. People who can't delete the board don't see
  Delete board. Hide tab moves the board to the Hidden tab.
- **MT-6** **Rename in place:** ⋯ → Rename, or **double-click the name**. The name becomes a field
  (white, 1 px `#D3CEC8` border, 6 px radius, 26 px high, 7 px in), the name **selected**. **Enter or
  clicking away keeps it**; **Esc cancels**. Max 40 characters (TAB-23).
  - **Empty name** (or only spaces) + Enter: the field stays open, its border turns **red**
    (`#9F2623`), and **“Add a board name”** (warning icon 14 px + 12 px Medium red) shows **inside
    the field, at its right**. Typing a name clears it. Esc or clicking away puts back the old
    name.
- **MT-7** **Save keeps changes; Cancel, Esc or × throws them away** — for **moving, hiding,
  showing and renaming**. The tab row behind changes only on Save. A name already in use saves
  with the next number (TAB-26).
- **MT-8** **Delete, Leave and Restore apply at once**, with a toast and Undo; **Undo on the toast
  reverses them, not Cancel**. The dialog stays open; Save or Cancel closes it.
  - **Delete board** opens the usual confirm (TAB-41) **over Manage tabs**; Cancel goes back to the
    list. Then the row and the tab go: the count drops, the next board moves up into the row (the
    line moves), and the toast **“Growth deleted”** has Undo, which puts it back in place.
    Recently deleted keeps it 30 days.
  - **Our call:** Duplicate and New board also apply at once (they make a board); a new board's
    row opens in rename.
- **MT-11** Footer: **New board** on the left (Your tabs only): white, 1 px `#E4E0DC` border,
  8 px radius, plus 16 px + 13 px Medium `#26211E`. **Cancel** (ghost, 13 px Medium `#524B47`) and
  **Save** (`#26211E`, 13 px Medium `#F7F2ED`), 8 px apart, on the right.
- **MT-13** The last board can't be deleted or hidden (greyed, as in the tab's menu).

## 4. Hidden (MT-9)

- **MT-9** Helper line: **info icon (14 px) + “Hidden boards don’t show in your tab row.”** (13 px
  Regular `#756D67`), 10 px above the rows. Rows like Your tabs **without the handle**, names in
  **grey** (`#8C847E`), cut with “…”, an **eye-off** (24 px) on the right, **no ⋯** (to rename or
  delete a hidden board, show it first). The eye-off shows the board again — it joins the **end of
  Your tabs** — **when you press Save**; Cancel keeps it hidden. New board isn't offered here.

## 5. Recently deleted (MT-10)

- **MT-10** Helper line: info icon + **“Boards you deleted stay here for 30 days.”** Only boards
  **you** deleted in the last 30 days, **newest first**. One line per row: **name** (14 px Medium
  `#524B47`, cut with “…”) · **“N days left”** (12 px Regular `#8C847E`) · a **borderless Restore**
  (restore icon 12 px + “Restore” 12 px Medium `#26211E`), its label ending on the right edge.
  **Restore** puts the board back as the **last tab** at once, with the cards and layout it had;
  toast **“Q3 review restored”** · Undo (back to Recently deleted). The dialog stays open. New
  board isn't offered here.

## 6. Shared with you (MT-12, MT-17, MT-18)

- **MT-12** **The “Shared” tag** (`Tag / Shared`): right after the name, **8 px** after it; **20 px
  high**, pill, **no border**; fill = the text colour at **7 %** (see-through, so it stays a step
  darker than a hovered row); people icon 12 px and “Shared” 12 px Medium, both mid grey
  `#6A625D`. **Muted** (Hidden list): fill 4 %, icon and text in the light grey of hidden names.
  Hovering it shows **“Shared by Maya Patel”**. Long names cut off before the tag, so **the tag
  always shows**. Only boards someone else shared with you get it (never your own; never in
  Recently deleted, which lists only yours). The tag moves with its row when dragged.
- **MT-17** A shared board's **⋯ menu** (200 px): **Duplicate, Copy link | Hide tab, Leave board**
  (red), then a line and the owner at the foot: a 16 px avatar and **“Shared by Maya Patel”** (12 px;
  the name Medium `#524B47`). No Rename or Delete board: only the owner does those.
- **MT-18** **Leave board** confirms (TAB-54) over Manage tabs; then the board leaves your tabs at
  once, the count drops, and the toast **“You left Q4 plan”** has Undo, which brings it back in
  place. After the toast goes, only the owner can share it again.
- **Later:** "When the board is shared, the delete confirm names who else loses it" needs who it's
  shared with, which the dummy data doesn't have.

## 7. Build status (2026-11-23)

Built in `src/components/Dashboard/tabs/ManageTabsDialog.tsx` (with `BoardMenus.tsx` for the ⋯
menus) and checked live at 1440 × 900 and 1280 × 560 (Playwright), screen by screen against the
Figma frames.

| Rules | Checked live |
|---|---|
| MT-1, MT-2 | 480 × 560, centred; opens from a tab's right-click; 560 px tall window → 32 px top and bottom, list scrolls with fades |
| MT-14 – MT-16 | counts (none at 0), 2 px line under the open tab only, ← / → between tabs |
| MT-3 | line after the 6 rows that fit; row tint 4 % running 8 px past both edges; 2 px blue ring on a focused row (kept after a ⌥ move) |
| Alignment | title 14 px, tabs 16 px, handle 11 px from the left; ⋯ 14, × 13, Save 16 px from the right |
| MT-4 | drag by the handle: row at 40 %, chip, blue line with dot; ⌥↑ / ⌥↓ |
| MT-5, MT-17 | ⋯ menus with exactly the drawn items; 176 px (own), 200 px (shared, owner at the foot) |
| MT-6 | double-click → field, name selected; empty → red border, "Add a board name" inside the field; Esc cancels only the rename |
| MT-7 | Save applies order, hiding, showing and names (a name in use → "Growth 2", with the TAB-26 toast); Cancel, Esc and × drop them |
| MT-8, MT-18 | Delete and Leave confirm over the dialog, apply at once with Undo; dialog stays open |
| MT-9 | Hidden: helper, grey rows, eye-off; shown boards join Your tabs on Save |
| MT-10 | Recently deleted: helper, one-line rows, borderless Restore; restore at once with Undo |
| MT-12 | Shared tag 20 px, 7 % see-through fill, muted in Hidden, tooltip names the owner |
| MT-13 | last tab: eye and Delete greyed |

Fixed while testing: Esc in a rename field closed the whole dialog (the dialog hears Esc first;
it now stands aside while a name field has focus); a keyboard move dropped focus and its ring.

Later: the delete confirm naming who else loses a shared board (needs sharing data).

### Final check (2026-11-23)

Rule-by-rule review of 01, 02 and 03 (104 IDs) against the code, then every live suite again. Fixed:
the "name in use" toast after Save now has **Rename** (TAB-26); Duplicate uses the name as shown in
the dialog, even if not saved yet; a cancelled pointer ends a row drag; the 2 px line under a tab is
the width of the label only (MT-14).
