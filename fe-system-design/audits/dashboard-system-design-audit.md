# Dashboard Feature: System Design Audit

> **Status (Nov 24 2026): Phase 1 done; Phase 2 items 1–3 and 5 done, item 4 partly.** Written against `ds-dev` at `ed147f36`.
>
> Done (Phase 1):
> 1. B1: cards measure the dates on screen (`viewing` in `DashboardScreen.tsx`); picking 30 days now refetches.
> 2. B2: CSV cells starting with `= + - @`, tab or CR get a leading `'` (`share/export.ts`); test added.
> 3. B3: a board whose layout doesn't parse is skipped with a warning; the others load (`board-store.ts`); test updated.
> 4. B4: a refused Sync clears its spinner. B5: one refused write no longer stops the rest; failures retry on the next save.
> 5. `dashboard/loading.tsx` and `dashboard/error.tsx` (sharing `DashboardStates.tsx` with the screen, so the skeleton lines up); an `ErrorBoundary` (region) around each card.
>
> Done (Phase 2):
> 1. Ticker: `useSyncState()` changes only on real sync changes; the board reads it with `useCoarseNow()` (5 min, paused while hidden). The 10 s clock (`useSyncSnapshot`) now reaches only the "N min ago" leaves, and skips hidden tabs.
> 2. Drag: the lifted copy moves by writing its style once a frame (`ghostRef`); no React state per pointer move; column count read once per drag.
> 3. Save: one write 800 ms after the last change, at once on `pagehide`, tab hidden or leaving the board (`use-dashboard.ts`). Live: a 60-step drag made 0 writes during the drag and 1 after (was one per slot change).
> 4. Partly: totals no longer wait for the catalog; `names` cached. Not done: `keepPreviousData` (stale numbers under new labels would mislead; the shimmer stays) and `startTransition` (view dates live in an external store, which transitions don't cover).
> 5. `lazy-dialogs.tsx`: 8 click-only dialogs and windows load through `next/dynamic`, prefetched when the browser is idle and mounted on first open.
>
> Second bug pass (Nov 24), each retested:
> - **Store's time zone:** "today" and every window follow the store's clock, not the viewer's (`wallClock`, `storeMidnight` in `period.ts`). Live: store in UTC+14, viewer in UTC-8, the requests end on the store's day.
> - **Exports:** the CSV has one row per day of the period (Today is 1 row, compared with the day before); multiples get "(x)"; file names keep any script and fall back to "board".
> - **Last year across 29 Feb:** it now compares the same number of days.
> - **Restore:** a restored board whose name was taken comes back as "Name 2".
> - **Drag:** a flick-drop lands at the release point; the settle timer is cleared by the next drag.
> - **Saves:**
>   - A refused save retries on its own: 5 s, then 10 s, up to a minute (live: fail, fail, ok).
>   - Leaving the board writes only when a change is waiting (live: 0 writes when nothing is waiting, 1 when a change is).
>   - A crashed card retries when its numbers reload.
> - **Open question:** a rate change shows as a relative % (2% → 3% reads "↑ 50%"); points or % is a design call.
>
> Checked live (dev server, warehouse API stood in by `page.route`, the test org has no store): board renders, 10 dialog chunks arrive after the board, Share opens, drag moves the board with 1 write, a 30-day pick sends 4 new measure requests, no page errors.

Scope: `app/(app)/dashboard/page.tsx`, `src/components/Dashboard/*` (screen, grid, cards, charts, tabs, share, sync, live data, dialogs), `src/lib/api/warehouse.ts` and `warehouse-schemas.ts`, the `AppLayout` dashboard branch, and the dashboard rules in `globals.css` and the `--dashboard-*` tokens. About 11,150 lines across ~67 files, including 13 test files.
Method: three parallel structural scans (principles 1–21, 22–45, 46–56) plus reading the main files. The top findings were checked by hand: the viewer-dates bug, save on every change, the 10 s ticker, CSV injection, and the missing route files and boundaries. No build, dev server or profiler was run, so sizes are line counts, not chunk bytes. Items marked (verify) need a closer look.
Scoring: 1 = applied, 0.5 = partial, 0 = absent, applicable principles only.

## Overall efficiency: ~56% (24.5 / 44 applicable principles)

| Folder | Applicable | Score | % |
|---|---|---|---|
| 1. Requirements and Rendering | 9 | 5.5 | 61% |
| 2. Architecture | 8 | 4.0 | 50% |
| 3. Component Patterns | 3 | 2.0 | 67% |
| 4. Data Model | 8 | 4.5 | 56% |
| 5. Interfaces and APIs | 5 | 3.5 | 70% |
| 6. Optimizations | 11 | 5.0 | 45% |

Not applicable: ISR, PWA, micro-frontends, monorepo, HOC, polymorphic components, Redux vs MobX, client storage (none used), pagination, BFF, tRPC, WebSocket.

**Is it well optimized? Not yet.** The base is sound: the logic lives in pure, tested modules; queries are scoped to the org; responses are checked with Zod; charts are hand-drawn SVG with no chart library; framer-motion uses `m` with LazyMotion; html2canvas is loaded on demand; resize is throttled to animation frames. But the parts that run all the time are not optimized:
- a 10 s timer re-renders the whole board
- drag re-renders the whole grid on every pointer move
- every change, even mid-drag, is saved to the server straight away
- every dialog ships in the first load

It also has one real bug (the date range a viewer picks never loads new numbers) and no error boundaries.

---

## 0. Bugs found during the audit

| # | Bug | Evidence | Fix |
|---|---|---|---|
| B1 | **The date range a viewer picks doesn't load new numbers.** Picking "Last 30 days" changes the labels, the period menu, the CSV and the image stamp, but the cards still show the board's saved period | `DashboardScreen.tsx:129` passes `open.period`/`open.compare` to `useLiveDashboard`; the viewer's `dates` (`:411-412`) only reach the labels | Pass `dates` into `useLiveDashboard` |
| B2 | **CSV formula injection.** Board and metric names are user-controlled; a name starting with `=`, `+`, `-` or `@` runs as a formula in Excel or Sheets | `share/export.ts:32` `cell()` only quotes `",\n` | Prefix such cells with `'` |
| B3 | **One malformed board fails the whole dashboard** ("Couldn't load your boards") | `live/board-store.ts:50` `layoutSchema.parse` per board | `safeParse`; skip or flag the bad board |
| B4 | **A failed sync can leave the spinner stuck** (verify the callers) | `sync/sync-store.ts:154-173`: `started` stays set when `syncConnection` rejects | Clear `started` in a `finally` |
| B5 | **A failed save loses the rest of the batch.** If one PUT throws mid-loop, the deletes after it are skipped | `live/board-store.ts:96-108` | Keep going per board; collect the failures |

## 1. Already applied well

| Principle | Evidence |
|---|---|
| CSR where it belongs (#2), static shell (#3, #9) | `page.tsx` reads no request data, so the route stays static; the board is deliberately a client island (drag, menus, warehouse reads from the browser) |
| One-way data flow (#13) | Props down, callbacks up; module stores read through `useSyncExternalStore` (`sync-store.ts:68`, `link-view.ts`), which is safe under React Compiler |
| Logic out of components | Pure, tested modules: `tabs/board-state.ts` (reducer), `grid-layout.ts`, `sync/sync-model.ts`, `live/metrics.ts`, `period.ts`, `templates.ts` |
| Normalisation (#31) | `state.boards` is a record keyed by id, with id arrays for tabs, hidden and deleted; metrics are looked up by id |
| Custom hooks (#40) | `useDashboard`, `useLiveDashboard`, `useBoardStatus`, `useCatalog`, `useSyncSnapshot` hide the plumbing |
| Query keys and policy (#38) | `queryKeys.warehouse.*` scoped by org; `signal` passed; `staleTime` set per kind of data; shared retry policy (no retry on 4xx, backoff with jitter, Retry-After) |
| Real-time polling (#36) | Board status polls every 5 s while syncing and every 60 s otherwise, paused in background tabs (React Query default) (`dashboard-data.tsx:141`); "today" rolls over at midnight |
| Auth (#42) | `apiFetch` refreshes once on 401, then signals that the session expired; the screen is keyed by warehouse and viewer |
| Runtime validation (#45) | Every warehouse response parsed with Zod (`warehouse.ts:44`); friendly Problem screens with Retry for every query |
| Tree shaking (#47) | Named lucide imports; framer-motion `m` under `LazyMotion` (`domMax`, needed for `layout`); no recharts, date-fns, moment or lodash |
| Images (#49) | Source logos are 16×16 SVGs; avatars are initials |
| Lazy heavy library (#46, #48) | html2canvas (4.1 MB in node_modules) is loaded with `await import` at export time (`share/export.ts:78`); `BoardSnapshot` only mounts while capturing |
| Resize throttling (#53) | Card resize pointermove is throttled to animation frames (`BoardGrid.tsx:284`) |
| Accessibility basics (#20) | Keyboard drag and resize with a live announcer (`BoardGrid.tsx:311, 357, 419`); tablist with `aria-selected` (`TabRow.tsx:224, 258`); openable cards have a spoken label with value and change (`MetricCard.tsx:92-97`) |
| Security basics (#21) | No `dangerouslySetInnerHTML` or `innerHTML`; html2canvas only captures our own DOM |
| Tokens (#16) | 161 `--dashboard-*` tokens with a dark block; dashboard CSS overrides are scoped (`body:has([data-dashboard-panel])`) and respect reduced motion |

## 2. Applied but needs improvement

| Principle | Gap | Fix |
|---|---|---|
| SSR / Hybrid / RSC (#1, #5, #6) | The `'use client'` boundary is the whole screen (`DashboardScreen.tsx:1`); nothing is server-rendered beyond an empty shell | Render the frame and header outline on the server; keep the board as the client island |
| Core Web Vitals (#8) | LCP waits on 3–4 gates in a row; the generic skeleton isn't sized like the saved layout, so CLS when the board appears (verify); INP risk from the 10 s ticker and drag (see §3) | Size the skeleton from the layout; fix §3 items 1–2 |
| Component architecture (#12, #22) | `DashboardScreen.tsx` is 942 lines with 23 `useState` and 10 `useEffect`. `Board` (`:118-900`) mixes data, URL sync, undo toasts, sync toasts, PNG/CSV export, drafts and layout measurement. Also `ShareDialog` 580 lines / 17 `useState`, `TabRow` 522 / 13, `ManageTabsDialog` 547 / 10 | Extract `useBoardUrlSync`, `useBoardExport`, `useDraftFlow`, `useSyncToasts` and a `DialogsHost` with one open-state reducer |
| Provider (#24) | A new `DashboardData`/`Metrics`/`Apps` is built every render (`dashboard-data.tsx:113-120`; the `Metrics` constructor maps the whole catalog), so all 12 `useDashboardData()` consumers re-render on every `Board` render. The `names` getter makes a new Set on each access (`:21`) | `useMemo` keyed on the query `data` references, period and today |
| Design system (#15) | Hand-built menus and listboxes (`ShareDialog.tsx:247, 295`, `MetricWindow.tsx:269`) and calendar grid (`CustomRange.tsx:67`) | Use the DS `DropdownMenu`, `Popover`/`Command` and `Calendar` |
| Style management (#16) | About 260 arbitrary `[Npx]` values (ShareDialog 56, MetricWindow 30, AddCardsDialog 22, ManageTabsDialog 21, MetricCard 20, CardSettings 17, Drafts 15); 1 hex colour in `DashboardScreen` (verify which line); 9 inline styles in ShareDialog, 1–3 in about 17 other files | Map to spacing and radius tokens; inline only for computed geometry |
| CI and tests (#18) | Logic is tested (13 files, 162 tests). No component, end-to-end or visual tests for the board | Testing Library tests for BoardGrid (keyboard drag), TabRow, ShareDialog; one Playwright flow |
| Accessibility (#20) | Chart SVGs are `aria-hidden` (`Bars.tsx:44`, `LineChart.tsx:110`); a card that can't be opened only gets `aria-label={metric.label}` (`MetricCard.tsx:94`), which hides its value and trend and overrides the content; hand-built `role="menu"` and calendar `role="grid"` need full arrow, Esc and focus handling (verify); a focusable `span tabIndex=0` with no role (`BoardHeader.tsx:94`) | Visually hidden summary per card; DS menus (#15); give the span a role or make it a button |
| Security (#21) | CSV injection (B2) | See B2 |
| Local state (#27) | Refs mirror state (`stateRef`, `toastCtx`); undo history lives in a ref, so it isn't reactive | Acceptable for a single editor once #30 and #33 are fixed |
| Module stores (#28) | `sync-store` and `link-view` are never reset on org switch, logout or unmount; `link-view` keeps `noAccess` and dates across visits; `dismissed` grows without limit (`sync-store.ts:182`); `link-view.ts:35` uses the live `snap` as its server snapshot | Reset both in `Loaded`'s cleanup or on org change; key `dismissed` by board; use a constant server snapshot |
| URL as state (#34) | `?board/period/compare` read once without validation (`DashboardScreen.tsx:173-182`, `link-view.ts:21-26`); the viewer's dates are never written to the URL, so a reload loses them | Parse with a Zod schema using `.catch(default)`; write `period`/`compare` when they differ from the board's own |
| Real-time (#36) | The 10 s sync ticker runs while the tab is hidden; board content is never refreshed (see #30) | Gate the ticker on `visibilityState`; refetch boards on focus |
| REST (#37) | Measuring is `POST /metrics`, the same path as the catalog `GET` | Back-end note only |
| React Query patterns (#38) | No `queryOptions` factories; no `keepPreviousData` on measures, so a period or board switch shimmers every card; the totals wait for the catalog though they don't need it (`dashboard-data.tsx:104`); `setDefaultBoard` uses a manual `setQueryData` (`DashboardScreen.tsx:264-273`); no mutation hooks for boards | `queryOptions`, `placeholderData: keepPreviousData`, drop the catalog gate on totals, `useMutation` for default-board and sync |
| API errors (#45) | B3; writes don't distinguish 403/409/422, so every failure shows the same "Couldn't save" toast | Map by status (403: lost edit access, 409: conflict, 422: invalid) |
| Code splitting / lazy / bundle (#46, #48, #52) | No `next/dynamic` anywhere in Dashboard. `DashboardScreen.tsx:14-49` statically imports about 2.7k lines of click-only UI: AddCardsDialog, ShareDialog, ManageTabsDialog, CardSettings, NewBoardLibrary, DownloadDialog, AskAIDialog, DefaultBoardDialog, ConfirmDialogs, MetricWindow, BoardSnapshot, NoAccess | `next/dynamic` each one (they already render their body only when open, so it's low risk); measure with `ANALYZE=true` first |
| Observability (#55) | Global Web Vitals reporter only; no dashboard page tag like `LibraryVitals`; no Mixpanel events in Dashboard; save failures only `console.error` | `DashboardVitals`; `trackFeature` for board actions; report save failures through `captureError` |
| Service worker (#10) | Offline bar only (`sync/OfflineBar`) | Fine unless offline viewing is wanted |

## 3. Applied wrongly

| # | What | Evidence | Fix |
|---|---|---|---|
| 1 | **A 10 s timer re-renders the whole board and every card**, even in a hidden tab | `sync-store.ts:60` `setInterval(() => set({}), 10_000)` writes a new `now` each time; `DashboardScreen.tsx:227` subscribes at the root; `cardView` (`:416-450`) reads `sync.now`, so it is a new function every tick; BoardGrid calls it per card (`BoardGrid.tsx:392`) and returns fresh objects, so every MetricCard and its SVG re-renders. The compiler can't help | Move the subscription into per-card leaves or a selector with stable per-app slices; only "hours since" needs `now`, so use an hourly clock; pause on `visibilitychange` |
| 2 | **Drag sets React state on every pointer move**, often 120 Hz or more, re-rendering the whole grid | `BoardGrid.tsx:217` `setDrag` with no animation-frame throttle (resize has one); the `cards.map` (`:342-414`) makes new closures and view objects per card; `placeSlot` reads `getBoundingClientRect`/`getComputedStyle` on every move (`:171-172`) | Drag ghost in its own component moved by `transform` through a ref in an animation frame; cache the grid rect and column count at drag start; a stable per-card view map |
| 3 | **Every state change is saved to the server straight away**, including drag and resize previews | `use-dashboard.ts:36-41` runs `store.save(state)` in a `useEffect` on every change; `setLayout` is the drag preview (`:338-339`). Identical boards are skipped and writes run one at a time, but one drag queues several PUTs. No flush on `pagehide` | Debounce about 800 ms; save previews only on drag/resize end; keep only the latest queued state; flush on `pagehide`/`visibilitychange` |
| 4 | **Server data copied into local state and never reconciled** | Boards query is a one-shot loader (`staleTime: Infinity, gcTime: 0`, `DashboardScreen.tsx:89-102`) feeding the reducer; `BoardStore.load` mutates `written`/`places` inside the `queryFn` (`board-store.ts:52-55`). Others' shares, edits and deletes never appear until reload, and the stale state then overwrites them | Treat the query as the base and the reducer as local changes over it; refetch on focus and rebase unchanged boards, or at least show "Updated by X, reload" |
| 5 | **Optimistic writes with no rollback and no conflict check** | A failure only shows a toast (`use-dashboard.ts:36-41`); full-document PUT with no version (`board-store.ts:96-101`, `warehouse.ts:144`), so the last write wins | Mark unsaved boards with Retry; send a version with `If-Match` and handle 409 with Reload or Overwrite (needs a back-end change) |
| 6 | **Hand-made loading instead of route files and Suspense** | No `loading.tsx`, `error.tsx` or `not-found.tsx` in `dashboard/`; 4 chained early returns (`DashboardScreen.tsx:71, 75, 114, 392`) | See §4 |

## 4. Missing

| Principle | What's missing | Fix |
|---|---|---|
| Streaming and route states (#7) | `dashboard/loading.tsx`, `dashboard/error.tsx`; any `<Suspense>` | Reuse the Skeleton in `loading.tsx`; an `error.tsx` with Retry |
| Error boundaries (#19) | No boundary anywhere in Dashboard; one card or chart that throws while rendering takes down the whole page through `(app)/error.tsx` | A boundary per card in BoardGrid ("Couldn't show this card"), around the chart in MetricWindow and around the dialogs host |
| Debounce (#53) | Save debounce and drag throttle (§3 items 2–3) | |
| useTransition (#54) | None in Dashboard. A period change (`setViewDates`, `DashboardScreen.tsx:694`) or tab switch re-renders the board at once and starts up to 5 measure queries (`dashboard-data.tsx:107-111`) | `startTransition` around period and tab changes, plus `keepPreviousData` |
| Performance budget (#56) | No budget script or CI check for any route; Phase 4 of `bundle-performance-fix-plan.md` was never built | A `/dashboard` first-load gzip ceiling once the dialogs are split |

Smaller items: the fab-room check (`DashboardScreen.tsx:147-170`) reads the layout of every card on each resize (O(cards)), so batch it in an animation frame and check only the bottom row. The chart hover reads `getBoundingClientRect` per move (`LineChart.tsx:101-105`, `Bars.tsx:35`), so cache it on `pointerenter`. `ShareDialog.tsx:98` reaches its own menus with `document.querySelector`; use refs.

---

## Plan to 100%

### Phase 1: bugs and safety (small, front-end only)
1. B1: measure with the viewer's dates.
2. B2: CSV formula injection.
3. B3: `safeParse` per board.
4. B4 and B5: clear sync `started` in a `finally`; keep saving the other boards when one PUT fails.
5. `dashboard/error.tsx`, `dashboard/loading.tsx`, and an error boundary per card, per chart and around the dialogs.

### Phase 2: the hot paths (performance)
1. 10 s ticker: move the subscription out of `Board` into the leaves, use an hourly clock for "hours since", pause when the tab is hidden.
2. Drag: ghost by `transform` in an animation frame, rect cached at start, stable per-card views.
3. Save: debounce, no mid-gesture saves, coalesce, flush on `pagehide`.
4. Memoise `DashboardData`/`Metrics`; `keepPreviousData` on measures; drop the catalog gate on totals; `startTransition` for period and tab.
5. `next/dynamic` for the 12 click-only dialogs; measure before and after with `ANALYZE=true`.

### Phase 3: data correctness and structure
1. Reconcile boards: refetch on focus, rebase unchanged boards, show "Updated by X".
2. Error mapping for writes (403, 409, 422); unsaved marker with Retry.
3. Reset module stores on org switch, logout and leaving; constant server snapshot; bound `dismissed`.
4. Validate URL params with Zod; write the viewer's dates to the URL.
5. Split `DashboardScreen` (hooks + `DialogsHost`), then `ShareDialog`, `TabRow` and `ManageTabsDialog`.
6. `queryOptions` factories; `useMutation` for default board and sync.

### Phase 4: polish, accessibility and guardrails
1. DS `DropdownMenu`, `Popover`/`Command` and `Calendar` in place of the hand-built ones; map the ~260 px values to tokens.
2. Text alternative per card and chart; fix the `aria-label` override and the role-less focusable span; axe and screen-reader pass.
3. Server-render the frame and header; size the skeleton from the layout (CLS).
4. `DashboardVitals`, Mixpanel `trackFeature` for board actions, and save failures through `captureError`.
5. Component and Playwright tests (keyboard drag, tabs, share, save failure); a `/dashboard` bundle budget in CI.

### Needs the back end
- A board version or ETag so concurrent edits get a 409 instead of last write wins (Phase 3 item 2 depends on it).
- See `docs-v2/tickets/2026-11-24/DASHBOARD_WAREHOUSE_BACKEND_TICKET.md` for the warehouse API issues.
