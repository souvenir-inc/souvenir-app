# Dashboard · Share and export: rules

**Status:** Active · **Last updated:** 2026-11-23
**Source:** Figma `wRr8cpImqSXbIgk0XhNj7a`, page "Header Flow", section "Board flow · Share and export: Share
dialog, adding people, roles, removing, general access, link, Slack, locked numbers, the viewer's board,
downloads, 1024 px (in progress)" (node `167:27725`).

Read in full on 2026-11-23: 30 screens (S-1 … S-9c) and their 30 notes, 30 layer annotations and the two
"Options (Dev to pick)" rows (S-2, S-8). Styles as drawn (Share dialog `170:58396`, role menu `170:77629`,
Post to Slack `171:93748`, no-access page `170:85604`, Download dialog `174:57768`, board image `176:57095`).

**Pick** marks an option row: we build the designer's pick and list the other. **Our call** marks where
the Figma is silent; **Stand-in** what the dummy build fakes (there are no sharing, Slack or export
endpoints yet).

---

## 1. Who can do what (SH-1 – SH-3)

- **SH-1** Every board has **one owner**, the person who made it. Everyone it's shared with is an
  **editor** or a **viewer**, and gets the highest of their own role, their team's and the workspace's.
- **SH-2** | Action | Owner | Editor | Viewer |
  |---|---|---|---|
  | See the board, pick other dates for themselves, duplicate it, Copy link, download (only numbers they can see) | ✓ | ✓ | ✓ |
  | Open Share and see who has access | ✓ | read only | read only |
  | Post to Slack | ✓ | ✓ | — |
  | Change cards, keep new dates for the board, rename, version history | ✓ | ✓ | — |
  | Add people, change roles, remove people, change general access | ✓ | — | — |
  | Delete the board | ✓ | — | — |
  | Remove it from their own tabs | ✓ | ✓ | ✓ |
- **SH-3** **Metric access is separate** and set by an admin: a number someone can't see stays locked
  whatever their role. Edit rights never unlock a number.

## 2. The Share dialog (SH-4 – SH-9)

- **SH-4** + → **Share** (between Edit board and More, for everyone who can see the board) closes the dial
  and opens Share. **Pick: Option A, a centred dialog** (520 px, the board dimmed). Not built: Option B,
  a 400 px panel above the speed dial.
- **SH-5** **Share "Store overview"**, ×. Top: **Add people or teams** with the role (**Can view**) and
  **Invite** (greyed until someone is picked). **People with access**: the owner first ("Dev Shah (you)",
  email, **Owner**), then teams, then people by name. **General access** (a lock tile, **Only people
  added** · "Only the people above can open this board"). A line, then **Copy link**, **Post to Slack**
  and **Done** (dark).
- **SH-6** **Boards start private**: the first time, only the owner is listed.
- **SH-7** **Every change applies at once**: no Save. Done, ×, Esc or a click outside close it.
- **SH-8** **Opened by someone who isn't the owner** (**Pick: only the owner manages access**, Option A;
  not built: editors adding people): the same list without menus and without the add field, one line
  "**Only Dev Shah can change who has access.**", general access as text. Copy link works for everyone;
  **Post to Slack is for editors**, not viewers.
- **SH-9** **At 1024 px** the dialog keeps 520 px and stays centred; it's never taller than the window
  less 48 px top and bottom: past that **only the people list scrolls**, the add field and footer stay put.

## 3. Adding people (SH-10 – SH-14)

- **SH-10** Typing lists matches, **TEAMS first, then PEOPLE**, by name or email; only members of
  **Lumen & Co**. ↑ ↓ and Enter pick one; Esc closes the list. Someone who already has access shows
  their role and can't be picked twice.
- **SH-11** A pick becomes a **chip** in the field (avatar or team icon, name, ×); the field stays ready
  for the next name. Backspace in an empty field removes the last chip (**our call**).
- **SH-12** **One role beside the chips applies to all of them**; Invite turns dark. If someone picked
  **can't see a metric on this board**, a line says so before inviting: "Priya Nair can't see
  Contribution margin. It will show locked for them." Closing the dialog drops the chips.
- **SH-13** **Someone not in the workspace**: an email that isn't a member can't be added; Invite stays
  off and the list says "**anna@northwind.co isn't in Lumen & Co**" · "Boards can be shared with
  workspace members only." An **admin** gets **Invite to workspace** (Settings → Members, email filled
  in); anyone else reads "**Ask an admin to invite them.**" A name that matches nobody: "**No one at
  Lumen & Co matches 'Jordan'**".
- **SH-14** **Invite** adds them **at once**, under the owner (teams, then people), each with a role
  menu; a person who can't see a metric on the board keeps a line "🔒 Can't see Contribution margin".
  They're told in the app (SH-27) and by email (**stand-in**: not sent); the board waits in their All
  boards and never lands in their tabs uninvited.

## 4. Roles, removing, general access (SH-15 – SH-19)

- **SH-15** A role opens a menu: **Can view** ("Read every card, pick their own dates, download"), **Can
  edit** ("Also change cards and keep the board's dates"), a line, **Remove access** (red). A pick
  applies at once. The owner's row has no menu.
- **SH-16** A team's role covers everyone in it, unless someone's own role is higher.
- **SH-17** **Remove access** takes them off at once, no confirm; a line under the list says
  "**Priya Nair no longer has access.**" with **Undo**, until the dialog closes.
- **SH-18** **General access**: **Only people added** (the default) or **Everyone at Lumen & Co** with
  its own Can view / Can edit ("Anyone in the workspace can open this board"). People with a higher role
  of their own keep it. Nobody gets a toast and nobody's tabs change (**pick**).
- **SH-19** Switching back to Only people added **shows the count first** ("12 people lose access") in
  the menu, and applies when picked (**our call** on where the count shows).

## 5. The link (SH-20 – SH-24)

- **SH-20** **Copy link** puts the board's link on the clipboard; the button reads **Copied** with a check
  for 2 s, and a line says what it opens on: "**Opens on Last 30 days • Previous period, for people who
  can see this board.**"
- **SH-21** **The link opens on the dates you're looking at**, not the board's saved ones
  (`/dashboard?board=store-overview&period=30d`, plus `&compare=` when it isn't the previous period). A
  preset rolls (Last 30 days is the 30 days before the day it's opened).
- **SH-22** **Copying failed**: the link shows in a field above the footer, **already selected**, with a red
  line "**Couldn't copy the link. Press ⌘C to copy it.**" Copy link stays to try again. From More → Copy
  link: toast "**Link copied. It opens on Last 30 days.**"; its failure toast "Couldn't copy the link."
  offers **Show link**, which opens Share in this state. **Stand-in:** `?copy=fail`.
- **SH-23** **Opened from the link, with access**: the board opens **on the link's dates**, with **Reset**
  (back to the board's dates) and, for editors, **Save for board**, beside the period (the Period row's
  P-5, built here in its plain form). A board that isn't in your tabs is added as the last tab.
- **SH-24** **Opened from a link, without access**: instead of the board, a page: a lock tile, "**You
  don't have access to Q4 plan**", "Request access and Maya Patel, who owns it, will be told.",
  **Request access** (dark) and **Back to your boards** (your home board). No tab highlighted, no period,
  sync button or speed dial. Request access → "**Request sent**" with a check (**stand-in**, needs the
  back end). **Stand-in:** `?board=pricing-tests`.

## 6. Post to Slack (SH-25 – SH-28)

- **SH-25** **Post to Slack** swaps the dialog's contents (← back to the people list): **Channel** (`#
  growth`, the last one used picked first), **Preview** (the Souvenir app's message "Dev Shah shared
  **Store overview** · Last 7 days • Previous period", the board image with its stamp, **Open board**),
  "🔒 Contribution margin shows locked in Slack.", **Cancel** and **Post to #growth** (dark).
- **SH-26** **Restricted numbers are locked in the image for everyone**, whatever the poster can see: a
  channel mixes people with different access. **Stand-in:** Contribution margin is the restricted metric.
- **SH-27** **Slack isn't connected**: "**Connect Slack to post boards to a channel**" · "You'll pick the
  channel each time you post." and **Connect Slack**; once connected the step shows the channel picker.
  **Stand-in:** `?slack=off`; Connect takes 2 s, no Slack page.
- **SH-28** **Post** closes the dialog; toast "**Posted to #growth**" with **Open in Slack**, where board
  toasts go. A failed post keeps the dialog on this step with a red line "**Couldn't post to #growth. Try
  again.**" and Post stays. **Stand-in:** `?slack=fail` fails the first post; Open in Slack is a "not
  ready yet" toast.

## 7. The other side (SH-29 – SH-30)

- **SH-29** **Shared with you** (the Tabs row's T-8): a toast "**Maya Patel shared Q4 plan with you**" with
  **Add to tabs**; the board waits in All boards either way and never lands in tabs uninvited.
  **Stand-in:** `?shared=1` (Q4 plan starts out of your tabs).
- **SH-30** **A locked number**: the card keeps its name and size; a lock and "**No access**" where the
  number goes; no change, chart, health or dot; it doesn't open. Hover: "**No access to Contribution
  margin. Ask an admin for access.**" (an admin sets metric access, not the board's owner). Downloads and
  Slack images show it the same way.

## 8. Downloads (SH-31 – SH-37)

- **SH-31** **Pick: Option B, one Download dialog in More, for everyone** (owners, editors, viewers).
  More's "Download as image" becomes **Download…**. Option A's card settings buttons were added later (10 CS-9); Download in the metric
  window is not built.
- **SH-32** **Download "Store overview"**, ×. Two tiles: **Image** ("The board as it looks, as a PNG") and
  **Numbers** ("A spreadsheet, one row per day"). For Numbers, **Cards** in two columns, all ticked;
  **cards you can't see are listed, locked and unticked**. A line: "One sheet for Last 7 days • Previous
  period: a row per day, each card's figure with its comparison beside it." **Cancel**, **Download**
  (greyed with no card ticked).
- **SH-33** **Image**: the dialog closes and a toast "**Preparing image…**" with a spinner shows while the
  cards are drawn into a PNG at **twice the screen's sharpness**; the browser saves
  `store-overview-2025-11-08-to-2025-11-14.png` and the toast goes.
- **SH-34** **The image**: every card as it looks, on the board's background, and a strip under them with
  **the stamp**: "Store overview · Last 7 days • Previous period · Dev Shah · 14 Nov 2025". No header,
  tabs, banners, speed dial or edit handles; cards still loading are waited for. A metric you can't see
  is locked in the image too.
- **SH-35** **Image failed**: the toast turns into "**Couldn't download the image.**" with a red warning
  icon and **Try again**; it stays until dismissed or retried. **Stand-in:** `?download=fail` fails the
  first try (image or numbers).
- **SH-36** **Numbers**: Download reads "Preparing…" with a spinner, then the browser saves one CSV
  (`store-overview-….csv`; one card: `revenue-….csv`) and the dialog closes. **No success toast**: the
  file is the confirmation. On failure the dialog stays with "**Couldn't download the numbers. Try
  again.**" in red, and Download is the retry.
- **SH-37** **The spreadsheet**: a title row ("Store overview · Last 7 days · vs previous 7 days"),
  "Exported by Dev Shah on 14 November 2025", a blank row, then **Date**, each card, **Previous 7 days
  date**, each card's comparison ("Revenue, previous 7 days"), one row per day. **Exact figures**, never
  rounded to "k" (6812.4); rates in % with "(%)" in the header, multiples in x; UTF-8 with a byte-order
  mark. A locked card never reaches a file. No comparison → no comparison columns.

## 9. Our calls and stand-ins

- **SH-38** The dummy workspace is **Lumen & Co** (14 members). You are **Dev Shah** (admin). Members
  include Sam Lee, Priya Nair (can't see Contribution margin), Grace Kim, Greg Alvarez, Maya Patel;
  teams Growth team (4 people) and Finance team (3 people). Shares live in memory.
- **SH-39** Creative tests (a hidden board) is shared with you by Maya Patel **to edit**, so the editor's
  read-only Share can be seen; Q4 plan stays view only.
- **SH-40** Downloads use the dummy days (series.ts); the files' dates are the dummy today's
  (14 Nov 2025).

---

## 10. Build status (2026-11-23)

Built in `src/components/Dashboard/share/`: `share-model.ts` (workspace, matching, roles, link),
`share-store.ts` (shares and Slack, in memory), `ShareDialog.tsx`, `DownloadDialog.tsx`, `BoardSnapshot.tsx`
(the board as a picture, for the PNG and the Slack preview), `export.ts` (CSV, file names, stamp, PNG via
html2canvas), `NoAccess.tsx`, `link-view.ts` (a link's dates, the no-access page). Unit tests:
`share-export.test.ts` (14). Checked live (Playwright, 1440 × 900 and 1024 × 700) against the drawn frames.

| Rule | Status | Note |
|---|---|---|
| SH-1 – SH-3 roles | ✅ | Owner / editor / viewer from the board's access; metric access from the card states |
| SH-4 – SH-7 Share dialog | ✅ | 520 px; changes apply at once; Done, ×, Esc, outside close it |
| SH-8 not the owner | ✅ | Creative tests (edit): read only + Slack; Q4 plan (view): Copy link only |
| SH-9 at 1024 px | ✅ | Only the people list scrolls; menus may reach past the dialog's edge, as drawn in S-4a |
| SH-10 – SH-14 adding people | ✅ | Teams then people; ↑ ↓ Enter, Esc closes the list only; chips; Backspace removes the last chip; the "can't see" line before and after inviting |
| SH-13 outside the workspace | ✅ | Invite to workspace is a "not ready yet" toast (no Settings → Members with the email yet) |
| SH-15 – SH-19 roles, remove, general | ✅ | Remove has Undo until the dialog closes; "8 people lose access" shows in the menu |
| SH-20 – SH-22 the link | ✅ | Copied for 2 s, caption; `?copy=fail` shows the selected link; More → Copy link toasts, failure offers Show link |
| SH-23 link dates | ✅ | Reset · Save for board beside the period (the plain form of the Period row's P-5); viewers' date picks are their own |
| SH-24 no access | ✅ | `?board=pricing-tests`; Request access → Request sent (stand-in) |
| SH-25 – SH-28 Slack | ✅ | Preview is the board picture scaled, Contribution margin locked; `?slack=off`, `?slack=fail`; Open in Slack is a stand-in toast |
| SH-29 shared with you | ✅ | `?shared=1`; Add to tabs adds Q4 plan as the last tab and opens it (**our call**) |
| SH-30 locked number | ✅ | Hover: "No access to Net sales. Ask an admin for access." (was "Ask the board's owner") |
| SH-31 – SH-37 downloads | ✅ | Option B. PNG at 2×, stamp, no shimmer (cards drawn as loaded); CSV exact, BOM, (%) and (x); `?download=fail` |

**Not built:** Share Option B (panel above the dial); editors adding people (S-2a B); Download in the metric window
(S-8 Option A; the card settings' two downloads and the card image came in 10 CS-9);
emails; telling a removed person who has the board open; a role change ending someone's edit mode.

**Found and fixed while testing:** Esc in a role or general access menu closed the whole dialog; html2canvas
drew every line of text too low (Tailwind's preflight aligns images to the middle, and html2canvas measures
baselines with an image in the page, so the reset is applied to the page for the moment of the capture).
