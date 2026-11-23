# Dashboard · Sync: rules

**Status:** Active · **Last updated:** 2026-11-23
**Source:** Figma `wRr8cpImqSXbIgk0XhNj7a`, page "Header Flow", section "Header · Sync button (final,
18 Nov)" (node `95:18703`).

Read in full on 2026-11-23: 9 flow cards, 45 screens and their 45 notes, and the 46 layer
annotations. Styles below are as drawn (button states `75:21409`, banners `202:60604`, `115:20386`,
`115:20736`, Data sources `123:20833` / `101:19733`, error toast `287:60863`, offline bar
`204:59895`, back online `204:60082`, card dot `123:20368`, card shimmer `95:19181`).

This file replaces BS-11 – BS-16 of `02-board-screen-rules.md`. **Our call** marks where the Figma
is silent. **Stand-in** marks what the dummy build fakes until the back end exists.

---

## 1. Words

- **App**: a connected data source (Shopify, Meta Ads, …). A sync belongs to the **app**, not the
  board (SY-30).
- **This board's apps**: the apps its cards read. The dot, the hover, the list and the banners cover
  only those (e.g. no Google Ads on Store overview). Refresh still syncs every app in the workspace.
- **States of an app**: **up to date**; **syncing** (a spinner); **behind** (hasn't synced in over
  twice its usual interval: **over 2 hours** in the dummy data); **failed** (its last sync failed;
  numbers are from the last good sync); **first sync** (just connected, never synced).
- Times of day ("7:24 am") are in the viewer's own time zone.

## 2. The sync button (SY-1 – SY-4)

- **SY-1** Top right, after the period: a 32 px round button on the soft fill (`#F0ECE8`) with the
  rotate-cw-clock icon (16 px, stroke 1.5) and a **status dot** (10 px, 2 px ring in the panel
  colour) on its top-right edge. While Data sources is open it turns **white with a fine border**.
- **SY-2** **The dot shows the worst state of this board's apps: red › amber › spinner › green.**
  - **Red** (`#B42318`) an app failed; **amber** (`#B45309`) an app is behind; **green**
    (`#15803D`) every app is up to date.
  - **Syncing:** a spinner takes the icon's place and the dot goes away until it ends. **Red and
    amber beat syncing**: the button keeps its red dot while other apps sync.
  - **Grey** while offline (means "can't check now", not an app problem).
  - **No dot** on a board with no cards (it reads no apps).
  - **First syncs don't count**: the dot keeps the other apps' state, so it doesn't spin for hours.
- **SY-3** **Hover** (no click) says `state • time`:
  - "Up to date • Synced 3 min ago" (the **oldest** app's time, so the board never looks fresher
    than it is) · "Syncing…" · "Out of date • Data from 7:24 am" (the oldest of the apps behind) ·
    "Sync failed • Data from 9:42 am" · "Offline • Data from 10:24 am" · "No apps on this board yet".
- **SY-4** A click opens **Data sources** under it; Esc, a click outside or the button again closes
  it. It also opens on a board with no cards, and Refresh still works there.

## 3. Data sources (SY-5 – SY-12)

- **SY-5** White, 320 px, 12 px radius, the popover shadow, 6 px padding. Heading **"Data sources"**
  (12 px Medium `#524B47`) and a count chip (18 px, 11 px Medium) with the number of this board's
  apps.
- **SY-6** **Order: problems first** (failed, then behind, longest first), then the apps this board
  uses most (most cards). It shows **5 rows**, then **scrolls**, with a fade over the fifth row and a
  thin bar (3 px, `#D3CEC8`).
- **SY-7** A row (36 px, 8 px radius, 10 px in): **logo** (16 px, brand colour) · **name** (13 px) ·
  an **action button** right after the name when there is one (24 px round, soft fill, 14 px icon,
  with a tooltip) · the **status** on the right:

  | State | Status (12 px) | Action button |
  |---|---|---|
  | Up to date | "2 min ago" / "Just now", Regular `#756D67` | none |
  | Behind | "3 h ago", Medium amber | ⟳ "Sync Meta Ads now": syncs just that app |
  | Failed | ⚠ "Sync failed", Medium red | 🔌 "Reconnect Meta Ads" (admins only, SY-25) |
  | Syncing | spinner 12 px + "Syncing…" | none |
  | Syncing over 10 min | spinner + "Still syncing…" | none |
  | First sync | spinner + "First sync…" | none |

- **SY-8** **Footer**: a line, then **Refresh** (white pill, 32 px, hairline ring, 14 px icon +
  13 px Medium) on the left and a summary on the right (12 px):
  - "Synced 3 min ago" / "Synced just now" (Regular grey; the oldest app, first syncs left out)
  - "Syncing…" (Refresh running) · "Syncing 1 app…" (one app, or Refresh skipping some) ·
    "Syncing since 9:58 am" (a sync over 10 min)
  - "1 app behind" / "3 apps behind" (Medium amber) · "1 app failed" / "3 apps failed" (Medium red) ·
    "1 failed • 1 behind" (Medium red: the worst colour)
- **SY-9** **Refresh syncs every app in the workspace**, skipping apps that need reconnecting
  (they stay failed, with their red dots). While it runs: the button spins, each syncing row says
  "Syncing…", the numbers on cards that will change **shimmer**, the footer says "Syncing…", and
  **Refresh is greyed** (50 %) until it ends, so it can't be pressed twice.
- **SY-10** When it ends: each app reads "Just now", the footer "Synced just now", the green dot comes
  back and the cards redraw. **The list stays open** until you close it.
- **SY-11** **One minute between syncs**: right after a sync ends, Refresh (and Sync on rows and
  banners) is greyed for a minute; hovering Refresh says **"Synced just now • Refresh again in a
  minute"**.
- **SY-12** Only one sync at a time: while any app syncs, Refresh and every Sync are greyed.

## 4. Banners (SY-13 – SY-22)

- **SY-13** Banners sit **above the cards**, full width, 8 px apart, and push the cards down. 44 px,
  10 px radius, 1 px border, 14 px in on the left and 8 px on the right, 10 px gaps: **icon (14 px)
  · sentence (13 px; app names Medium) · action (icon 14 + 13 px Medium, in the banner's colour) ·
  × (28 px)**.
- **SY-14** **One banner per kind of problem, red above amber**, so never more than two problem
  banners. Apps with the same problem **share** one banner.
- **SY-15** **Failed** (bg `#FDEFED`, border `#F2CBC6`, ⚠ red): "**Meta Ads** sync failed. Showing
  data from 9:42 am." · action **Reconnect** (🔌, red).
- **SY-16** **Behind** (bg `#FDF4E7`, border `#F1D9B5`, ⟳ amber): "**Meta Ads** hasn't synced in 3
  hours. Some data may be out of date." · action **Sync** (⟳, amber). **Sync syncs only the apps that
  are behind**, never the ones up to date. Same label for one app or many.
- **SY-17** **More than one app**: two are named ("**Shopify & Meta Ads** haven't synced in over 2
  hours. …"); three or more name the one behind longest and count the rest ("**Meta Ads & 2 more
  apps** haven't synced in over 2 hours. …" / "**Meta Ads & 2 more apps** failed to sync. Showing
  their last synced data."). "2 more apps" is **underlined**; hovering it lists them ("Google Ads &
  TikTok Ads").
- **SY-18** **Syncing** (bg `#F5F2EF`, border `#E4E0DC`, spinner): after Sync on a banner or row,
  "Syncing **Meta Ads**. Cards using this app refresh when done."; over 10 min, "**Meta Ads** is taking
  longer than usual. Cards using this app refresh when done."; after Reconnect, "**Meta Ads**
  reconnected. Syncing the latest data." No action; × hides it (the sync carries on).
- **SY-19** **Synced** (bg `#EDF7F0`, border `#C9E7D3`, ⟳ green): "**Meta Ads** synced just now. Data
  is up to date." (after Reconnect: "**Meta Ads** reconnected and synced. Data is up to date."). It
  **hides after 4 s**, stays while hovered; × closes it sooner. The green dot and "Just now" keep the
  result. Refresh doesn't show syncing or synced banners (the button and list say it).
- **SY-20** **× on a problem banner hides it on this board until that app's state changes** (e.g.
  behind → failed brings the red banner back). The dots stay, and so does the hover.
- **SY-21** Banners **stay** while Data sources is open (under the list, so the cards don't jump)
  and **in edit mode** (so old numbers stay visible while you arrange them).
- **SY-22** **Narrow windows**: the action and × stay on the right; a long sentence wraps to two
  lines. At 1024 px both drawn banners fit on one line.

## 5. Cards (SY-23 – SY-24)

- **SY-23** **Any card that reads an app with a problem shows a dot** right after its label (7 px,
  1.5 px white ring), **red** for failed, **amber** for behind. Up to date: no dot.
- **SY-24** **Card numbers that will update shimmer** while their app syncs (the figure's text runs a
  light band). The banner, rows and footer show a small spinner and plain text instead. A newly
  connected app's cards show the **loading skeleton** until data arrives ("No data yet" only if the
  first sync fails).
  - *Reconciled with `05-cards-reading-rules.md` (2026-11-23):* the Cards row draws a first sync
    that's still running as "No data yet" (CR-22), and so does Add cards (A-5b). Built: "No data yet"
    from the start of a first sync (since 2026-11-23, 06). The Cards row also draws a syncing card with a
    spinner after its label instead of the shimmer (CR-27); this file's shimmer stays until design
    settles it.

## 6. Reconnect and people (SY-25 – SY-27)

- **SY-25** **Only admins reconnect apps.** For a member, the red banner has **no action**; its
  sentence ends "Only an admin can reconnect Meta Ads." (several: "…can reconnect them."). Only ×
  is left. In Data sources the plug is gone, and hovering "Sync failed" says **"Only admins can
  reconnect apps"**. Refresh still works for members.
- **SY-26** **Reconnect** (banner, plug, or error toast) opens the app on the **Connectors** page
  with its Reconnect dialog open; sign-in happens in the app's own window; then you're back on the
  board and **the app syncs at once** (grey banner "reconnected. Syncing the latest data." → green
  "reconnected and synced."). With several failed apps, Reconnect opens Connectors, where each has
  its own Reconnect.
  - **Stand-in:** the dummy build has no Connectors hand-off, so Reconnect goes straight to "back on
    the board, syncing". Later: Connectors as a modal over the board.
- **SY-27** Connecting an app starts its **first sync at once**; its row says "First sync…", its
  cards show the skeleton, and it isn't counted as behind or in the dot.

## 7. Syncs that don't go to plan (SY-28 – SY-32)

- **SY-28** **Failure with the list open**: the row turns to "Sync failed" (with its plug), the dot
  turns red and the red banner appears. **No toast**: the list already shows it.
- **SY-29** **Refresh fails with the list closed**: besides the red banner and dot, an **error
  toast**: "**Meta Ads** sync failed • Other apps synced" with **Reconnect** (dark, admins only) and
  ×. White, 1 px `#E7E2DC` border, 10 px radius, ⚠ 16 px red. It closes after **8 s** (stays while
  hovered), with ×, or on Reconnect. The banner stays until the app is fixed.
- **SY-30** **A sync carries on when you change boards.** Boards that read the app show its syncing
  banner and then its result. If the board you're on doesn't read it, a **toast says how it went**:
  "Meta Ads synced just now", or the error toast "**Meta Ads** sync failed • Data from 9:42 am" with
  Reconnect (because you started that sync).
- **SY-31** **Long syncs**: after 10 min the row says "Still syncing…", the footer "Syncing since
  9:58 am" and the banner that it's taking longer than usual. **After 1 h the attempt stops** and the
  app goes back to its last state (behind, with Sync); the back end retries.
- **SY-32** Refresh **skips** apps that need reconnecting: the others sync (spinners on their rows
  and cards, footer "Syncing 1 app…"), the failed app stays "Sync failed" with its plug and red dots,
  and the button keeps its red dot.

## 8. Offline (SY-33 – SY-34)

- **SY-33** **Offline**: a dark bar (36 px, `#26211E`) across the **top of the window, above the
  whole app**: wifi-off 14 px + "You're offline. Showing data from 10:24 am." (13 px `#F7F2ED`), then
  a spinner + "Reconnecting…" (`#C9C2BC`). **It can't be closed.** The sync button's dot turns
  **grey**; its hover says "Offline • Data from 10:24 am". **Nothing turns red**, the cards keep
  their numbers, and Refresh and Sync wait for the connection. The time is when the connection
  dropped.
- **SY-34** **Back online**: the bar turns **green** (`#15803D`) with a check and "You're back
  online." for **3 s**, then goes. The board fetches its numbers again and the dot returns to the
  apps' state.

## 9. Dummy data and scenarios (stand-in)

The sync engine is a front-end mock (`src/components/Dashboard/sync/`): a sync takes 2.5 s. The
workspace has 12 apps, Google Analytics and Zendesk **not connected** (06 §7), ShipStation on a long
first sync; **Founder overview** reads nine (SY-6), **Growth** reads only Shopify
(SY-30). Add `?sync=<scenario>` to `/dashboard` to start in a drawn state:

| `?sync=` | State |
|---|---|
| (none) | every app up to date |
| `behind` | Meta Ads behind 3 h |
| `behind2` | Shopify and Meta Ads behind |
| `behind3` | Meta Ads, Google Ads, TikTok Ads behind (Founder overview) |
| `failed` | Meta Ads failed |
| `failed3` | Meta Ads, Google Ads, TikTok Ads failed (Founder overview) |
| `both` | Meta Ads failed, Shopify behind |
| `slow` | Meta Ads syncing for 25 min |
| `first` | Meta Ads on its first sync |

`&fail=meta` makes the next sync of that app fail; `&role=member` views as a member. Offline uses
the browser's own online/offline events.

## 10. Build status (2026-11-23)

Built in `src/components/Dashboard/sync/` (`sync-model.ts` rules + 11 unit tests, `sync-store.ts`
dummy engine, `SyncButton.tsx`, `SyncBanners.tsx`, `sync-toasts.tsx`, `OfflineBar.tsx`), with the
card dot and shimmer in `MetricCard.tsx` and the bar placed in `AppLayout.tsx`. Checked live at
1440 × 900, 1024 × 768 and 700 px (Playwright), screen by screen against the Figma frames.

| Rules | Checked live |
|---|---|
| SY-1 – SY-4 | dot green / amber / red / grey, spinner while syncing, none on an empty board; every hover text; Esc closes |
| SY-5 – SY-8 | 320 px; rows and footers for every state; Founder overview: count 11, 5 rows then scroll (180 px), Shopify · Meta Ads · Google Ads · TikTok Ads · Google Analytics |
| SY-9 – SY-12 | Refresh: rows "Syncing…", 11 cards shimmer, greyed; "Just now", list stays open; cooldown tooltip |
| SY-13 – SY-22 | 44 px banners; red above amber; shared banners with "2 more apps" tooltip; grey → green → gone after 4 s; × keeps dots and survives board switches; kept in edit mode and under the list; 1024 / 700 px fit |
| SY-23 – SY-24 | dots on the app's cards only; shimmer on the syncing app's numbers; first sync shows skeletons |
| SY-25 – SY-27 | member: no Reconnect, no plug, "Only admins can reconnect apps"; Reconnect → "reconnected. Syncing…" → "reconnected and synced"; first sync keeps the dot green |
| SY-28 – SY-32 | toast only with the list closed (428 × 46, one line, 8 s, stays while hovered); toast on another board either way; "Still syncing…" + "Syncing since"; Refresh skips the failed app |
| SY-33 – SY-34 | bar 36 px above the whole app, grey dot, Refresh waits; green "You're back online." gone after 3 s |

Stand-ins: Reconnect skips the Connectors hand-off (SY-26); the engine and scenarios are dummy (§9).
Later: "No data yet" when a first sync fails; Connectors as a modal.
