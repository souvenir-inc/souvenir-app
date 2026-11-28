# Dashboard · New board: rules

**Status:** Active · **Last updated:** 2026-11-23
**Source:** Figma `wRr8cpImqSXbIgk0XhNj7a`, page "Header Flow", section "Board flow · New board: chooser,
template library, apps not connected, empty board, Ask the AI, copy, first visit (in progress)"
(node `167:27724`).

Read in full on 2026-11-23: 30 screens and their 30 notes (N-1 … N-11b), 45 layer annotations and the
three "Options (Dev to pick)" rows. Styles as drawn (chooser `170:36729`, library `170:41837`,
call-out `170:51126`, waiting card `170:63204`, empty board's templates `170:72881`, Ask the AI
`170:73483`, draft screens `170:79963`, `171:89377`, `170:80353`, first visit `171:92740`).

**Pick** marks an option row: we build the designer's pick and list the other. **Our call** marks
where the Figma is silent; **Stand-in** what the dummy build fakes.

---

## 1. Ways in (NB-1 – NB-3)

- **NB-1** **+ → New board** opens the **chooser** (NB-4). The dial's other items fold away and the ×
  stays; the chooser opens above the ×, right-aligned, where More's menu opens. **Anyone who can open
  the dashboard can make a board**, a viewer of the open board too: a new board is theirs and private.
- **NB-2** **In edit mode**, the edit bar's New board opens the same chooser above the bar,
  right-aligned; the segment shows pressed while it's open. Esc or a click outside closes it and
  leaves you in edit mode.
- **NB-3** More → All boards → New board opens the chooser too (**our call**: one way to make a board).

## 2. The chooser (NB-4 – NB-6)

- **NB-4** **Pick: Option A, three ways up front.** White, 1 px `#D3CEC8`, 12 px radius, the popover
  shadow, 12 px in. "**What do you want to start with?**" (14 px SemiBold), then **three equal cards**:
  **Template**, **Ask the AI**, **Empty board** (8 px radius tiles with a small drawing on `#F5F2EF`,
  an icon and a 14 px Medium label), a line, and **Copy a board ›**. Not built: Option B (three
  templates first, then rows).
- **NB-5** Hover or focus: the card takes the soft fill and a darker border (`#A39A93`). **← →** move
  across the cards, **↓** goes to Copy a board, **Enter** picks, **Esc** closes the chooser and the dial.
- **NB-6** Template → the library (NB-7). Ask the AI → describe (NB-20). Empty board → made at once
  (NB-16). Copy a board → the library on Your boards (NB-14).

## 3. The template library (NB-7 – NB-15)

- **NB-7** A dialog over the board, **1080 × 760**, "New board" (16 px SemiBold), ×. **Left** (248 px,
  `#F2EEEA`): templates grouped **YOUR ROLE** (Founder or CEO) · **OTHER ROLES** (Head of e-commerce,
  Growth or ads lead, Ops lead, Finance or fractional CFO, Agency) · **YOUR BOARDS** · **SHARED WITH
  YOU**; names only, a template icon or a board icon; the selected row white with a fine border. ↑ ↓
  move; Enter uses the selected one.
- **NB-8** **Right**: the selected item's name (18 px SemiBold) and **the dates it opens on**, drawn
  like the board's own period (calendar icon, "Last 7 days • Previous period"). Then **the outline of
  what goes in, no figures**: each card at its size (4 columns, 84 px rows, 12 px gaps), its metric's
  name (14 px Medium), the logos of the apps it reads, and a grey bar where the number will sit.
- **NB-9** **Only cards this store can fill are drawn**: a metric it can't measure is **left out
  quietly** (the same template can hold different numbers of cards in different stores).
- **NB-10** **Apps not connected**: a **call-out** above the outline: "2 of these 6 cards need apps you
  haven't connected" (one: "1 of these 6 cards needs an app…"; all: "Every card in this template needs
  an app you haven't connected"), then one row per app: logo tile, "Google Analytics · 2 cards",
  **Connect** (outlined). Their cards are drawn **faded and dashed** with the app's logo. Connect →
  "Connecting…" with a spinner; then a green check and "**Connected**" (the row stays until the dialog
  closes; the title counts what's left). Stand-in: Connect works as in Add cards (06 AC-9).
- **NB-11** **Use template** (footer, Enter) makes the board. **Greyed when no card can show
  anything**, with the tooltip "Connect an app to use this template".
- **NB-12** **The board lands as the last tab, open**, named after the template ("Founder"; "Founder 2"
  if taken), **on the template's dates**, to read (not in edit mode). Cards fill in as on a board
  switch. Toast "**Founder board added**" with **Undo** (removes it outright and opens the board you
  were on).
- **NB-13** **Pick: Option B, cards wait for their app.** A card whose app isn't connected is made
  anyway: dashed (`#C9C2BC`), `#F9F8F5`, grey title, the app's logo, and "**Connect Google Analytics**"
  (plug). It fills by itself once the app has synced. Not built: Option A (left out).
- **NB-14** **Copy a board**: the library opens on **Your boards** with the open board selected; the
  outline is the board's real layout and its dates; **Make a copy** adds a **private** copy ("Store
  overview copy") **as the last tab**, on the original's dates, same cards in the same places, with an
  Undo toast ("Store overview copy added"). Boards shared with you can be copied too.
- **NB-15** Cancel, × or Esc make nothing.

## 4. The empty board (NB-16 – NB-19)

- **NB-16** **Empty board** makes the board at once, no form: the last tab, open, "**Untitled board**"
  selected in its tab ready to type, **in edit mode**. No toast. (As built, 01 / 02.)
- **NB-17** **Never a dead end**: "This board has no cards yet.", **Add cards** (the edit bar's
  segment look), and under it "**Or start from a template**" with **three templates for your role**
  (the same tiles as the chooser) and **All templates ›** (opens the library).
- **NB-18** **Picking one fills this board** instead of making another: its cards, its dates; **the
  board keeps a name you typed**, an untouched "Untitled board" takes the template's name. You stay in
  edit mode. Toast "**Filled from the Founder template**" with Undo (empties it again).
- **NB-19** Add cards hands over to the Add cards picker (06).

## 5. Ask the AI (NB-20 – NB-30)

- **NB-20** A small dialog (**640 px**): "**Describe the board you want**", one box (white, 1 px
  `#D3CEC8`, 12 px radius, 120 px) with **Make a draft** inside it (greyed until there's text), three
  **examples** as chips (an example fills the box, it doesn't send), a line, and "**Drafts from**" with
  the connected apps' logos. Enter sends, Shift+Enter adds a line; Esc or × make nothing. **One draft
  at a time**: with a draft open, Ask the AI goes to it.
- **NB-21** **Make a draft** closes the dialog and **a draft tab opens at once** at the end of the tabs,
  with a **sparkle** and "**Drafting…**". A line under the tabs quotes the request ("Drafting a board
  for “…”…" with a spinner); placeholder cards shimmer. **Pick: Option B, the draft bar**: the speed
  dial becomes a bar in its corner: "Drafting…" and **Stop**. Nothing is saved. Not built: Option A
  (a bar over the cards).
- **NB-22** **The draft**: the tab takes the AI's name ("Paid ads, every morning"), still with the
  sparkle; the line says "**Draft, not saved** · From “…”"; the cards show **real numbers on the
  dates the AI picked** (Today vs last year). The bar holds "**Change something…**" (a box), **Edit**,
  **Discard** and **Keep board** (dark).
- **NB-23** **Measurable only**: anything the store can't measure is left out and **named on the line**
  ("· Left out: Sessions, which this store can't measure yet"). Never an empty or made-up card.
- **NB-24** **Change something…** + Enter redrafts: the cards shimmer again and the new draft replaces
  this one.
- **NB-25** **Edit** puts the draft in edit mode (the edit bar; Done comes back to the draft bar).
- **NB-26** **Keep board** saves it as a **private board you own**, on the AI's dates: the sparkle and
  the line go, the bar turns back into the speed dial, toast "**Paid ads, every morning saved**" with
  Undo (turns it back into a draft).
- **NB-27** **Discard** (and Stop while drafting) removes the tab and opens the board you were on; no
  confirm; toast "**Draft discarded**" with Undo. Nothing goes to Recently deleted.
- **NB-28** **The draft failed**: the tab stays ("Draft"); the cards area says "**The draft didn't come
  through**" / "Try again in a moment. Nothing was saved." with **Try again** and **Change request**;
  the bar keeps only Discard. Stand-in: `?ai=fail` fails the first try.
- **NB-29** **Nothing can be measured**: no empty draft; "**Nothing in this request can be measured for
  this store yet**" and why ("Email revenue and open rate need an email app, and none is connected."),
  with **Change request** and **Connect an app**.
- **NB-30** The draft stays while you look at other boards; leaving the dashboard or reloading drops it,
  and the browser asks first.
- **Stand-in:** the "AI" is a keyword drafter (ads, margin, check-in, store; "morning"/"today" → Today;
  "last year" → vs last year; sessions and email are named as not measurable). It takes 2.5 s.

## 6. First visit (NB-31 – NB-33)

- **NB-31** The first time someone opens the dashboard, Canvas checks what this store can measure:
  meanwhile a **placeholder tab capsule and plain card skeletons**, no names or numbers; the speed dial
  waits (greyed).
- **NB-32** Then **the starters appear together** and Store overview opens with its numbers. No toast,
  no tour. With Shopify and Meta Ads: **Store overview, Growth, Ads, Contribution margin**.
- **NB-33** **Only Shopify**: **Store overview and Growth**, from Shopify metrics alone (Store
  overview's ad cards swapped for Shopify ones). Stand-in: `?visit=first`, and `&store=shopify-only`.

## 7. Our calls

- **NB-34** A board made from New board (template, copy, draft) is **private, yours**, and lands as the
  last tab (T-5). Duplicate from a tab's menu still lands right after the original (01).
- **NB-35** Toasts follow BS-23 (left of the +, or above the edit bar in edit mode).

---

## 8. Build status (2026-11-23)

Built in `src/components/Dashboard`: `NewBoardChooser.tsx`, `NewBoardLibrary.tsx`, `EmptyBoard.tsx`,
`Drafts.tsx` (describe dialog, draft line, draft bar, failed / nothing-measurable body), `templates.ts`,
`first-visit.ts`; hook helpers `addBoard`, `copyBoard`, `fillBoard`, `discardDraft`, `change`, `apply`;
reducer actions `update-board`, `replace`; card body `needs-app`. Unit tests: `new-board.test.ts` (16).
Checked live (Playwright, 1440 × 900) against the drawn frames.

| Rule | Status | Note |
|---|---|---|
| NB-1 – NB-3 ways in | ✅ | Dial's New board folds the items and keeps the ×; edit bar segment shows pressed; More → All boards → New board opens the chooser |
| NB-4 – NB-6 chooser | ✅ | 526 px; ← → wrap, ↓ to Copy a board, ↑ back; Esc closes chooser and dial, focus back on the + |
| NB-7, NB-8 library | ✅ | 1080 × 760; Your role / Other roles / Your boards / Shared with you; ↑ ↓ Enter; outline 4 cols, 84 px rows |
| NB-9 left out quietly | ✅ | Head of e-commerce draws 5 of 6 (Gross margin isn't measured) |
| NB-10 call-out | ✅ | Connect → Connecting… → Connected; row stays; when none are left the title reads "Every card in this template can show now" (**our call**, the Figma doesn't draw it) |
| NB-11 Use template greyed | ✅ | Wrapped so the tooltip shows on the disabled button |
| NB-12 lands last, open, to read | ✅ | "Founder board added" + Undo opens the board you were on |
| NB-13 waiting cards (Option B) | ✅ | Dashed, grey title, "Connect Zendesk" → Connecting… → No data yet (first sync) |
| NB-14 copy | ✅ | Opens on the open board (a draft open → your first board); "Store overview copy added" + Undo |
| NB-15 cancel | ✅ | |
| NB-16 – NB-19 empty board | ✅ | Three tiles + All templates (the library then **fills** this board, our call); Undo empties it again |
| NB-20 describe | ✅ | Examples fill, don't send; Enter / Shift+Enter; "Drafts from" lists connected apps |
| NB-21 – NB-23 drafting, draft | ✅ | Skeletons while drafting; Today vs last year; "Left out: Sessions…" |
| NB-24 Change something | ✅ | Stand-in: a change naming a topic replaces it, otherwise it's added to the request |
| NB-25 Edit | ✅ | Done returns to the draft bar |
| NB-26 Keep board | ✅ | "… saved" + Undo (back to a draft) |
| NB-27 Discard / Stop | ✅ | "Draft discarded" + Undo; not in Recently deleted |
| NB-28 failed | ✅ | `?ai=fail`; bar keeps only Discard |
| NB-29 nothing measurable | ✅ | Connect an app is a "not ready yet" toast (no connect flow without an app named) |
| NB-30 leave / reload | ✅ | beforeunload prompt while a draft exists |
| NB-31 – NB-33 first visit | ✅ | `?visit=first` (4 starters), `&store=shopify-only` (Store overview, Growth; ad cards swapped) |

**Known gaps:** ⌘Z past a discarded draft's Undo brings the board back without its draft bar (the
toast's Undo restores both). The drafter is keywords, not an AI. The stand-in drafter found and fixed:
"Email revenue" no longer picks the store check-in on the word "revenue".
