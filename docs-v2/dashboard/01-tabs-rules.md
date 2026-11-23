# Dashboard · Board tabs: rules

**Status:** Active · **Last updated:** 2026-11-23
**Source:** Figma `wRr8cpImqSXbIgk0XhNj7a`, page "Header Flow":
- Section "Header · Tabs (in progress)" (node `136:20976`): 14 flow cards, 45 screens and their notes
- Section "Header · Tabs · Manage tabs (in progress)" (node `415:64464`): 5 flow cards, 15 screens

Read in full on 2026-11-23: every flow card, every screen note, the "Tabs · every state" sheet, and
the text of every menu, dialog, toast, tooltip and error drawn in both sections.

Each rule has an ID (`TAB-…`, `MT-…`). The code and tests cite these IDs. Where the Figma is
silent, the rule says **Our call**, so it can be checked with design later. Rules marked
**Later** are drawn but need the backend or another section; §12 lists them.

---

## 1. Words

| Word | Meaning |
|---|---|
| **Board** | A saved dashboard: its cards, their sizes and places, and its own dates. |
| **Tab** | A board that is in *your tabs* (the row at the top left). |
| **Your tabs** | Your boards, in your order. The order is yours only. |
| **Home board** | The first tab. The dashboard opens on it. |
| **Open board** | The board on screen: the dark segment. |
| **Hidden** | Out of your tabs but still yours, listed in All boards and in Manage tabs → Hidden. |
| **Recently deleted** | Boards you deleted in the last 30 days. Only the owner deletes. |
| **More** | The board-options menu behind the round + button at the bottom right. |
| **“N more”** | The count at the end of the tab row for tabs that don't fit. |

## 2. The tab row (Happy flow · Switch boards)

- **TAB-1** Your boards sit in one grey capsule (`#EFEBE7`) at the top left, in your order. The open
  board is the dark segment (gradient `#524B47 → #26211E`, name `#F7F2ED`).
- **TAB-2** The first tab is your home board; the dashboard opens on it.
- **TAB-3** Segments are 32 px high, as wide as the name plus 14 px each side, never wider than
  220 px. Names are 14 px Medium. The whole segment is the click target.
- **TAB-4** The row never scrolls sideways (see §4 for what happens when tabs don't fit).
- **TAB-9** **No overflow-x anywhere on the dashboard**, at any window width, sidebar open or
  collapsed: the tab row folds into “N more”, segments cut names short in a very tight row, a
  growing rename field folds the tabs after it away (TAB-22), the period and sync drop below the
  tabs only when the panel is too narrow for both, and the grid drops 4 → 2 → 1 columns. Nothing,
  not even a card mid-drag, may widen the scroll area. **Our call** on the wrap and the clip.
- **TAB-5** States (from the "every state" sheet):

  | State | Look | Behaviour |
  |---|---|---|
  | Default | Grey name `#6A625D` straight on the capsule | — |
  | Hover | Fill one step darker `#E5E0DA`, name near-black | Tooltip only if the name is cut short (TAB-40) |
  | Pressed | Fill `#DCD6CF` while held | The board opens **on release** |
  | Keyboard focus | 2 px blue ring `#0D6EB2` | Only when moving with the keyboard; nothing opens until Enter or Space |
  | Open | Dark segment, white name | Clicking it again does nothing; double-click renames |
  | Open + keyboard focus | The same ring around the dark segment | — |
  | Renaming | White, 1 px border `#D3CEC8`, name selected | TAB-20 |
  | Being dragged | Lifted: white with a soft shadow | TAB-30 |

- **TAB-6** Clicking a tab opens that board **at once**: the dark segment moves, the board's cards
  appear in their places with their names, and a soft shimmer sits where each figure and chart goes
  while the numbers load; then the numbers fade in card by card.
- **TAB-7** Each board has **its own dates**. Switching boards switches the period menu to that
  board's saved period and comparison (e.g. Growth: Last 30 days). Changing the period changes it
  for the open board only.
- **TAB-8** The sync button's dot covers only the open board's apps. A board with no cards has no
  dot.

## 3. Keyboard (Other flow · Keyboard)

- **TAB-10** Tab moves into the row and lands on the **open** board (one tab stop for the row).
- **TAB-11** ← / → move the focus ring along the tabs (and onto “N more”). Enter or Space opens
  the focused tab. Moving focus alone never opens a board (manual activation).
- **TAB-12** The ring shows only when using the keyboard, never on click.
- **TAB-13** ⌥← / ⌥→ (Alt + arrows) move the focused tab one place; focus stays on it.
- **TAB-14** ⌘Z / Ctrl+Z undoes the last tab action (rename, duplicate, new board, hide, show,
  delete, restore, leave, reorder), except while typing in a field. **Our call:** one shared undo
  history for these actions; toast Undo buttons take the same step.

## 4. Too many tabs (Other flow · Too many tabs; Edge case · One board, many boards)

- **TAB-15** At most **6** tabs show. The rest fold into a count, “N more”, at the end of the row.
- **TAB-16** Fewer show when the row has less room (narrow window, sidebar open): as many as fit
  while leaving room for the count, the period menu and the sync button. At 1024 px that is 4.
  The period and sync button keep their place at the top right.
- **TAB-17** The open board is **always on show**. If it sits past the visible tabs, it takes the
  last visible place, and the board that was there moves into the list. The count stays the
  same, and **your saved order does not change** (display only).
- **TAB-18** “N more” opens a short list of the boards past the visible ones, in your order, then a
  line and **Manage tabs**. While the list is open the count is white with a fine border. Picking a
  board opens it (TAB-17 puts it on show). Esc closes the list.
- **TAB-19** With one board, the capsule holds just that board, still the dark segment.

## 5. Rename (Other flow · Rename and right-click; Edge cases · Long names, Two boards one name)

- **TAB-20** Double-click the **open** tab, or More → Rename, or the tab's right-click → Rename,
  and the tab becomes a field: white, fine border, the whole name selected so typing replaces it.
  Renaming a tab that isn't open from its right-click menu renames it in place without opening it.
  **Our call.**
- **TAB-21** Enter, or clicking anywhere else, keeps the new name. Esc puts the old name back.
- **TAB-22** The field shows the **whole** name, however long, and the tabs to its right move along
  to make room. After saving, the tab is cut back to 220 px with “…”.
- **TAB-23** Names are at most **40** characters (the field stops there). Leading/trailing spaces
  are trimmed. **Our call** (trim).
- **TAB-24** Empty name: Enter with nothing, or only spaces, keeps the field open, the border turns
  red, and **“Add a board name”** shows under the tab (red text with a warning icon). Typing clears
  the error. Esc or clicking away puts back the old name.
- **TAB-25** The rename saves straight away with no message (only a failed save says anything).
  The tab grows or shrinks to fit. ⌘Z undoes it.
- **TAB-26** A name already in use isn't blocked and nothing warns while typing. It saves with the
  next free number: a second “Growth” saves as **“Growth 2”**, and a toast says
  **“Saved as Growth 2 • Growth is already in use”** with **Rename** (reopens the field). The same
  numbering applies to new boards (“Untitled board 2”) and copies. Names compare without regard to
  case. **Our call** (case).

## 6. Menus

- **TAB-27** Right-clicking a tab opens **that tab's menu** under the tab, without opening the
  board. Items, with icons, in groups:
  1. Rename · Duplicate · Copy link
  2. Move left (⌥←) · Move right (⌥→) · Manage tabs
  3. Hide tab · **Delete board** (red)

  Each does what its More item does. Move left is greyed on the first tab, Move right on the last.
- **TAB-28** **More** (the + button) is the open board's menu. Items, with icons, in groups:
  1. All boards ›  ·  Recently deleted (N) — only when there is something to restore
  2. Rename · Duplicate · Copy link · Download as image · Version history
  3. Hide tab · Start over
  4. **Delete board** (red)

  While open, the + turns into ×.
- **TAB-29** **All boards ›** opens a submenu headed “ALL BOARDS”: every board you can see, in your
  order, then hidden ones in grey with an eye-off icon; then a line, **New board** and
  **Manage tabs**. Clicking a board opens it.

## 7. Reorder (Other flow · Reorder)

- **TAB-30** Press a tab and drag it along the row. The tabs **stay put**. The dragged tab's place
  dims to 40 % and a copy (white, soft shadow, not tilted) follows the pointer.
- **TAB-31** A **2 px blue line with a dot** marks the gap where the tab will land. No line when
  the drop wouldn't change the order.
- **TAB-32** On drop the tabs glide into the new order (150 ms). The new order saves at once, for
  you only. Dragging a board to the front makes it your home board. Esc cancels the drag.
- **TAB-33** Holding a dragged tab over “N more” for **half a second** opens the list; the blue
  line then moves between list rows. Dropping there puts the tab at that place in your order; a
  tab from the list moves up so the row stays full.
- **TAB-34** Move left / Move right (menu) and ⌥← / ⌥→ move a tab one place; greyed at either end.
  Manage tabs, in the same menu group, opens the full list.
- **TAB-35** A press becomes a drag only after the pointer moves a few pixels, so a click still
  opens the tab. **Our call** (4 px).

## 8. New board and duplicate

- **TAB-36** **New board** (All boards submenu, Manage tabs) makes an empty board at once as
  **“Untitled board”**: it lands as the **last** tab, opens, and its name field is open with the name
  selected to type over. Its sync button has no dot until it has a card. (The chooser of ways to make
  a board and edit mode with Add cards are other sections: **Later**.)
- **TAB-37** **Duplicate** puts “<name> copy” **right after the original** and opens it, with the
  same cards, sizes and saved dates. The copy is yours (owner, editable) even if the original was
  view only, and isn't shared. ⌘Z removes it.

## 9. Hide, delete, restore

- **TAB-38** **Hide tab** takes a board out of your tabs without deleting it. Nothing about the board
  changes; no one else is affected. If it was open, the board **to its left** opens (to its right
  when it was first). Toast: **“Growth hidden from your tabs”** · Undo.
- **TAB-39** A hidden board stays in **All boards** (grey name, eye-off) and in Manage tabs → Hidden.
  Clicking its eye-off (tooltip **“Show tab”**) or its name puts it back as your **last** tab and
  opens it. Toast: **“Growth is back in your tabs”** · Undo.
- **TAB-41** **Delete board** is for the owner only and asks first:
  - Title **“Delete Growth?”**
  - Body **“This removes the board’s cards and layout for everyone with access. Your data and
    connected apps aren’t affected. This board can be restored from ‘Recently deleted’ for 30 days.”**
  - **Cancel** · **Delete board** (red). Cancel, Esc or × keeps it.
- **TAB-42** After delete the tab goes (for everyone it was shared with), the board to its left
  opens (right when first). Toast **“Growth deleted”** · Undo, which brings it straight back in place.
- **TAB-43** Recently deleted keeps a board for **30 days**, then it's gone for good. More →
  **Recently deleted (N)** (shown only when N > 0) opens Manage tabs on its Recently deleted tab.
- **TAB-44** **Restore** puts the board back as the **last** tab with its cards and layout. Toast
  **“Growth restored”** · Undo (sends it back to Recently deleted).
- **TAB-45** **The last board can't go:** with one tab, Hide tab and Delete board are greyed in
  every menu. You can never be left with no board or no tab.

## 10. Long names (Edge case)

- **TAB-40** A tab is never wider than 220 px; a longer name ends in “…”, and hovering shows the
  whole name in a tooltip under the tab. Names that fit get no tooltip.

## 11. Shared boards (Other flow · Shared boards; Manage tabs · Shared with you)

- **TAB-50** A board shared with you **by name** joins your tabs right away as the last tab, without
  opening. Toast **“Maya Patel shared Q4 plan with you”** · Open (and an email: **Later**).
- **TAB-51** A shared tab looks like any other. When open, the sharer's avatar sits left of the
  dates; hovering it says **“Shared by Maya Patel”**.
- **TAB-52** A shared board's menus (right-click and Manage tabs ⋯) drop **Rename** and **Delete
  board** (owner only) and add **Leave board** (red), with the sharer's avatar and **“Shared by Maya
  Patel”** at the bottom. Right-click: Duplicate · Copy link · Move left · Move right · Manage tabs ·
  Hide tab · Leave board.
- **TAB-53** On a board you can only **view**, More keeps All boards, Recently deleted, Duplicate,
  Copy link, Download as image and Hide tab. Nothing that changes the board is offered (no Rename,
  Version history, Start over, Delete). Cards can't be moved, resized or removed. **Our call**
  (cards follow the same rule).
- **TAB-54** **Leave board** asks first: **“Leave Q4 plan?”** · **“Q4 plan leaves your tabs and All
  boards, and you lose access. Maya Patel and everyone else keep the board. To get Q4 plan back, ask
  Maya Patel to share again.”** · Cancel · **Leave board**. Then toast **“You left Q4 plan”** · Undo.
- **TAB-55** When someone else deletes a board you have open (or you lose access), the tab closes
  for you too, the tab to its left opens, and a toast says **“Maya Patel deleted Q4 plan”**. (Needs
  a live event from the backend: **Later**; the reducer handles it.)

## 12. Manage tabs (section `415:64464`)

> **Superseded by `03-manage-tabs-rules.md`** (2026-11-23), which reads the whole section and
> carries these IDs over with full detail. Kept here as a summary.

- **MT-1** A dialog, fixed **480 × 560**, centred (on windows under 624 px tall it keeps 32 px top
  and bottom). Title **Manage tabs**, ×, three borderless inline tabs with counts: **Your tabs N ·
  Hidden N · Recently deleted N**. The list scrolls between the pinned header and footer, with
  fades at the top and bottom when there's more.
- **MT-2** Opens from: a tab's right-click → Manage tabs, the end of the “N more” list, All boards →
  Manage tabs, and More → Recently deleted (on that tab).
- **MT-3** **Your tabs**: boards in tab-row order. A plain line after the last board that fits in
  the row. Each row: drag handle · name (+ “Shared” tag) · eye · ⋯.
- **MT-4** Drag a row by its handle: a blue line shows where it lands and a small chip follows the
  pointer. Hidden rows don't drag.
- **MT-5** The eye hides a board (it moves to Hidden). ⋯ opens the board's menu: Rename,
  Duplicate, Copy link, Hide tab, Delete board (shared: Duplicate, Copy link, Hide tab, Leave board +
  “Shared by …”). No Move items here: the handle moves rows.
- **MT-6** Rename in place: ⋯ → Rename or double-click the name; the name becomes a field, selected.
  Enter keeps, Esc cancels. Empty name: red border and **“Add a board name”** at the right of the
  field.
- **MT-7** **Save keeps changes; Cancel drops them** — for order, hide/show and rename. The tab row
  behind changes only on Save.
- **MT-8** These happen **at once**, with a toast and Undo, and the dialog stays open: **Delete**
  (after the usual confirm over the dialog), **Leave**, **Restore**. **Our call:** Duplicate and
  New board also happen at once, because they create a board; a new board then shows its rename
  field in the list.
- **MT-9** **Hidden**: note “Hidden boards don’t show in your tab row.” Rows without the handle, names
  grey, eye-off on the right, **no ⋯**. The eye-off shows the board again (joins the end of Your
  tabs) on Save.
- **MT-10** **Recently deleted**: note (info icon) “Boards you deleted stay here for 30 days.” Only
  boards you deleted, newest first. One line per row: name · “N days left” · borderless
  **Restore**. Restore happens at once (TAB-44); the dialog stays open.
- **MT-11** **New board** (outlined button, bottom left) on Your tabs only; Cancel and Save
  (dark) bottom right.
- **MT-12** **“Shared” tag**: right after the name, a flat, borderless grey pill with a people icon.
  Hovering it says “Shared by Maya Patel”. Greys out with the name in Hidden. Long names cut off
  before the tag, so the tag always shows.
- **MT-13** The last board can't be deleted or hidden here either (greyed).

## 13. Copy link, links and other items

- **TAB-60** **Copy link** copies a link to the board (`/dashboard?board=<id>`). Toast “Link copied”.
  **Our call** (the toast wording isn't drawn).
- **TAB-61** Opening `/dashboard?board=<id>` for one of your tabs opens that board. **Our call.**
- **TAB-62** **Later** (drawn, needs backend or other sections): a board from an *open link* opens in
  its own browser tab with **Add to your tabs** (“Black Friday plan added to your tabs” · Undo);
  new members' first visit (role board with a sparkle; toast “6 boards are shared with you” · See
  all); emails; Download as image; Version history; the New-board chooser; edit mode / Add cards.
- **TAB-63** **Start over** puts the open board's cards back to how the board started. **Our call**
  until its own section is drawn.

## 14. What this build stores

Dummy data, in memory, for the session. No backend endpoints exist for boards yet, so nothing
survives a reload. The state shape (boards, your tab order, hidden, recently deleted, open board)
is the contract a backend will need; see `src/components/Dashboard/tabs/`.

## 15. Build status (2026-11-23)

Built on dummy data in `src/components/Dashboard/tabs/` and checked live (Playwright, 1440 and
1024 wide) and by unit tests (`tabs/board-state.test.ts`, 21 tests on the rules marked †).

| Area | Rules | Status |
|---|---|---|
| Tab row, states, switching, per-board dates, sync dot | TAB-1 – TAB-8 | Built. TAB-7 † |
| Keyboard | TAB-10 – TAB-14 | Built |
| "N more", open board always on show | TAB-15 – TAB-19 | Built. TAB-15 – TAB-17 † |
| Rename, empty name, 40 chars, "Growth 2" | TAB-20 – TAB-26 | Built. TAB-23, TAB-26 † |
| Right-click menu, More, All boards | TAB-27 – TAB-29 | Built |
| Drag, drop line, drag into "N more", Move left/right | TAB-30 – TAB-35 | Built. TAB-31, TAB-34 † |
| New board, Duplicate | TAB-36, TAB-37 | Built (the New-board chooser and edit mode are other sections) |
| Hide/show, delete/restore, last board | TAB-38 – TAB-45 | Built. TAB-38, TAB-39, TAB-41 – TAB-45 † |
| Shared boards: tag, avatar, menus, view only, Leave | TAB-50 – TAB-54 | Built (one dummy shared board: Q4 plan, Maya Patel, view) |
| Shared with you live, deleted by someone else | TAB-50, TAB-55 | Reducer ready (`remove-board`, `add-board`); needs backend events |
| Manage tabs | MT-1 – MT-13 | Built. MT-7 † |
| Copy link, `?board=` | TAB-60, TAB-61 | Built |
| Links in a new browser tab, new members, emails, Download as image, Version history | TAB-62 | Later; the two menu items show "isn't ready yet" |

Notes from the build:
- At 1024 px with the sidebar collapsed the row shows 5 tabs, not the 4 drawn: the rule is "as many
  as fit" (TAB-16), and our period menu is narrower than the two-part Period/Comparison header in
  those screens (that header belongs to the Period filter section, 136:20977).
- The app's toaster is global (bottom right). On the dashboard, toasts move left of the + button,
  as drawn, so they never cover it (`globals.css`, `[data-dashboard-panel]`).
- Nothing is saved: a reload starts from the dummy boards again.

### Rules audit (2026-11-23, second pass)

Every rule above was checked against the code. Fixed in this pass:
- TAB-45: **Leave board** is greyed on your only tab, and the reducer refuses to remove the last
  tab. Delete and Leave check owner/shared and the last tab before acting, so no false toast.
- TAB-45, MT-13: a Manage tabs Save can't empty your tabs or put a board in both lists.
- TAB-4, TAB-22: the row fits the tabs it actually shows (a wide open board swapped into the last
  place folds one more tab away), and a tab being renamed stays on show with its field measured
  at the whole name, so the row never runs wider than its space.
- TAB-2: the dashboard opens on whatever your first tab is, not a fixed board.
- Leaving a hidden shared board: Undo brings it back hidden, not as a tab.
- TAB-9: checked live at 1440, 1280, 1100, 1024, 900, 768, 600, 414 and 375 px, sidebar open and
  collapsed (0 px overflow in all 18), plus a 40-character rename, the “N more” list open and a
  card dragged past the edge. Unit tests: 26.

### Final check (2026-11-23)

Fixed and checked live: Tab back into the row lands on the open board (TAB-10); ⌥→ on the row's last
tab keeps it on show with focus (TAB-13); double-clicking a tab that wasn't open only opens it
(TAB-20); the submenu header reads "ALL BOARDS" (TAB-29); the sharer's avatar is the same violet in
the header and the menu; duplicating a 40-character name keeps " copy" (TAB-23). Still open by
design: TAB-16 (5 tabs at 1024, recorded above), TAB-50/55/62 (need backend).
