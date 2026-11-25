# Feature System Design Audits

One audit per feature in `../features.md`, scored against the 56 principles in `../principles` (6 folders). Each report lists what is applied well, what needs improvement, what is applied wrongly, what is missing, an efficiency percentage, and a 4-phase plan to 100%.

Scoring: 1 = applied, 0.5 = partial, 0 = absent, applicable principles only. Scores come from a structural scan, not a line-by-line review; "(verify)" marks items needing a closer look.

| # | Feature | Report | Efficiency (Oct 14 → Nov 25) | Status |
|---|---|---|---|---|
| 1 | Chat | [chat-system-design-audit.md](./chat-system-design-audit.md) | ~56% → ~68% | Re-audited Nov 25; Phase 3 open (chat page 1127 lines, second composer) |
| 2 | Compare | [compare-system-design-audit.md](./compare-system-design-audit.md) | ~43% → n/a | OBSOLETE: modal deleted Oct 31; dev-only lab remains |
| 3 | Agents | [agents-system-design-audit.md](./agents-system-design-audit.md) | ~43% → ~72% | Re-audited Nov 25; list error state + stale overrides fixed |
| 4 | Projects | [projects-system-design-audit.md](./projects-system-design-audit.md) | ~42% → ~74% | Re-audited Nov 25; project chat page (821 lines) open |
| 5 | Templates | [templates-system-design-audit.md](./templates-system-design-audit.md) | ~63% → ~90% | Re-audited Nov 25; done except backend items |
| 6 | Schedules | [schedules-system-design-audit.md](./schedules-system-design-audit.md) | ~46% → ~84% | Re-audited Nov 25; non-cron edit guard fixed |
| 7 | Pinboard and Highlights | [pinboard-system-design-audit.md](./pinboard-system-design-audit.md) | ~47% | Skipped (hidden feature) |
| 8 | Global search | [global-search-system-design-audit.md](./global-search-system-design-audit.md) | ~40% → ~73% | Re-audited Nov 25; duplicate rows + Pins tab fixed |
| 9 | Connectors | [connectors-system-design-audit.md](./connectors-system-design-audit.md) | ~55% → ~79% | Re-audited Nov 25; two fetch-in-effects open |
| 10 | Slack | [slack-system-design-audit.md](./slack-system-design-audit.md) | ~44% | Skipped by request; Nov 25 high-level check, link allowlist fixed |
| 11 | AI Models view | [ai-models-system-design-audit.md](./ai-models-system-design-audit.md) | ~46% → ~72% | Re-audited Nov 25; one models fetch open |
| 12 | Auth | [auth-system-design-audit.md](./auth-system-design-audit.md) | ~59% → ~80% | Re-audited Nov 25; /api matcher gap fixed; D1–D3 open |
| 13 | Onboarding | [onboarding-system-design-audit.md](./onboarding-system-design-audit.md) | ~48% | Skipped by request; Nov 25 high-level check |
| 14 | Organizations | [organizations-system-design-audit.md](./organizations-system-design-audit.md) | ~42% → ~70% | Re-audited Nov 25; zod for usage/audit open |
| 15 | Settings | [settings-system-design-audit.md](./settings-system-design-audit.md) | ~43% → ~69% | Re-audited Nov 25; legacy stubs now server redirects |
| 16 | Credits and billing | [credits-billing-system-design-audit.md](./credits-billing-system-design-audit.md) | ~46% → ~72% | Re-audited Nov 25; https-only billing links; plan picker merge open |
| 17 | Analytics (dashboard and Mixpanel) | [analytics-system-design-audit.md](./analytics-system-design-audit.md) | ~49% → ~76% | Re-audited Nov 25; identity effect fixed; chart a11y open |
| 18 | Notifications | [notifications-system-design-audit.md](./notifications-system-design-audit.md) | ~57% | Skipped by request; Nov 25 high-level check |
| 19 | Prompt enhancement | [prompt-enhancement-system-design-audit.md](./prompt-enhancement-system-design-audit.md) | ~49% → ~75% | Re-audited Nov 25; focus management open |
| 20 | Personas and Share | [personas-share-system-design-audit.md](./personas-share-system-design-audit.md) | ~45% → ~70% | Re-audited Nov 25; upload limits enforced; chat-share page open |
| 21 | Internal and API routes | [internal-api-routes-system-design-audit.md](./internal-api-routes-system-design-audit.md) | ~54% → ~80% | Re-audited Nov 25; proxy path encoding fixed; D4–D5 open |
| 22 | Library | [library-system-design-audit.md](./library-system-design-audit.md) | ~78% → ~87% | Re-audited Nov 25 |
| 23 | Dashboard | [dashboard-system-design-audit.md](./dashboard-system-design-audit.md) | ~56% → ~69% | Re-audited Nov 25; link dates + store resets fixed |

All 21 feature areas in `features.md` are now audited, plus Library (added Oct 14). See the cross-cutting summary below.

Note: the Auth audit corrects an overstatement in earlier reports. The `/api/backend` proxy is not a token-hiding BFF: the access token lives in browser memory and the client adds the `Authorization` header. Read "BFF" credit in earlier audits as partial.

## Re-audit, Nov 25 2026

All audits were re-checked against `ds-dev` on Nov 25: [reaudit-2026-11-25.md](./reaudit-2026-11-25.md) has the scores, what was fixed that day (19 items, security first), and what is still open, split into safe front-end work, decisions and backend gaps. Scores now range from ~68% (Chat) to ~90% (Templates).

## Cross-cutting summary (refreshed Nov 25)

The Oct 14 summary listed nine recurring gaps. Where they stand now:

1. **Shared server-state layer: mostly done.** React Query is the norm (69 `useQuery`/`useInfiniteQuery` calls, 24 mutations, shared keys/policy/invalidation in `lib/query-*`). About 50 files still fetch inside `useEffect` (project chat page, plan pickers, notifications, all of Slack) and 20 `window` CustomEvents remain.
2. **God components: partly.** Every file named on Oct 14 was split. New ones over 1,000 lines: `ChatInput/index.tsx` (1383, a second composer), `Sidebar` (1312), `chat/page.tsx` (1127), `use-streaming-chat` (1003). Over 800: `settings/files` (902, placeholder), `DashboardScreen` (899), the project chat page (821), `QuestionCard` (810).
3. **Unvalidated API boundaries: partly.** Zod now covers projects, shares, models, automations, memory, prompts, billing links. Still none: `lib/api/chat.ts`, `teams.ts`, parts of `user.ts`, `persona-stream.ts`, org plan usage and audit, Slack link/disconnect.
4. **Auth and server exposure: mostly fixed.** The remaining items (D1, D3) and the Nov 25 fixes are tracked in the local security notes, not in this public repository.
5. **UI that is not real: fixed.** Placeholder settings pages are behind a preview flag; Analytics uses real usage data.
6. **Observability: partly.** Event coverage is enforced by a test, Web Vitals are reported. No error tracking yet (decision).
7. **Route-level files: partly.** 6 `error.tsx` + 2 group ones added Nov 25, 18 `loading.tsx`, 4 `not-found.tsx` including a branded root one. Missing `loading.tsx` for chats, souvenir-slack and some settings pages.
8. **Duplicate generations: partly.** The legacy agent editor and Compare are gone. Still two plan pickers, two onboarding flows, two composers, two markdown renderers, four share surfaces.
9. **Tests on pages: partly.** 2,638 unit tests pass (0 failing since Nov 25), but only 10 test files under `app/` and no browser suite in the repo. **No CI runs tsc, lint or tests on ds-dev** (decision).

## Bundle performance work

- Plan: [bundle-performance-fix-plan.md](./bundle-performance-fix-plan.md)
- Implemented and verified: [bundle-fix-test-report.md](./bundle-fix-test-report.md) (`/chat` JS 8,464 KB to 1,077 KB, 19 of 19 browser cases passing before and after)
