# scripts/

Node scripts used by the front-end. None of them run in the browser or in production requests.

| Script | npm entry | What it does | When to run |
|---|---|---|---|
| `load-secrets.mjs` | `npm run load-secrets` (runs before `dev`, `build`, `start`) | Reads `.env.local` for the AWS bootstrap, fetches the app secrets from AWS Secrets Manager and writes `.env.development.local`. | Automatic. Needs AWS credentials. |
| `perf-bundle.mjs` | `npm run perf:bundle`, `npm run perf:bundle:check` | Bundle-size report from a finished `next build` (reads `.next/` only); `--check` fails when a page exceeds its budget. | After a build; `:check` in CI. |
| `generate-llm-icons.mjs` | `npm run generate:llm-icons` | Writes `src/lib/llm-icons.generated.ts` with only the provider logos the app renders (the icon package ships ~9.5 MB). | When a model provider is added. |
| `generate-dark-theme.mjs` | — (`node scripts/generate-dark-theme.mjs`) | Generates `src/styles/tokens/theme.css` (dark theme) from the tokens; additive only. `theme.test.tsx` checks the output is in sync. | After changing design tokens. |
| `theme-legacy-colors.mjs` | — (data module) | The hard-coded colours that must follow the theme; read by the dark-theme generator and the migration below. | Edit when a legacy colour is found. |
| `migrate-inline-colors.mjs` | — (one-off) | Reviewable migration that points inline colours at theme tokens without changing light-theme pixels. | One-off; kept for reference. |
| `split-openapi.mjs` | — (`node scripts/split-openapi.mjs`) | Splits `docs/openapi/openapi.yaml` into per-tag files in `docs/openapi/api_yaml/`. | After refreshing the backend OpenAPI spec. |
| `sse-probe.mjs` | — (`node scripts/sse-probe.mjs`) | Calls the backend `/chats/create` with a JWT and prints every SSE event as it arrives. | Debugging streaming. Needs a token; never commit one. |
| `ds-scan.mjs` | `npm run ds:scan`, `npm run ds:check` | Design-system scan: share of style values that use tokens and of UI that uses primitives (`--top=<counter>` lists the worst files). `ds:check` fails when a hardcoded count rises above `ds-baseline.json`; `ds:check -- --update` lowers the baseline. See `docs/design-system-primitives-plan.md`. | `ds:check` before pushing UI changes; `--update` after a clean-up lands. |
| `ds-baseline.json` | — (data) | The ratchet baseline for `ds:check`. Only ever lowered. | Updated by `ds:check -- --update`. |
| `ds-screenshots.mjs` | `npm run ds:screens` | Screenshots key screens in light and dark against a running dev server (logs in with `ADMIN_*` from `.env.local`) and diffs them with the baseline in `.ds-screens/` (git-ignored). `-- --update` saves a new baseline; `-- --only=a,b` limits screens. | Before and after each design-system change. Local only. |
| `codemods/tokens-exact.mjs` | — (`node scripts/codemods/tokens-exact.mjs <paths> [--dry] [--snap]`) | Replaces literal gap / padding / margin / radius / font-size / line-height / font-weight values with the token of exactly the same value, inside `style={{}}`, `CSSProperties` objects and CSS modules. `--snap` also rounds off-scale values to the nearest step (plan Appendix B). | Pass 1 (exact, no visual change) and pass 2 (`--snap`, then a screenshot review) of each Phase 6 area. |
| `codemods/shadows-exact.mjs` | — (`node scripts/codemods/shadows-exact.mjs <paths> [--dry]`) | Points hand-written `box-shadow`s at tokens with the same light value: whole value or single layer → `--shadow-*`; ring-layer colour → palette primitive. Blur colours are never swapped. Same skip list and `// ds-keep` as `tokens-exact`. | Shadow pass; light pixels don't change. |
| `codemods/areas.mjs` | — (`node scripts/codemods/areas.mjs <area|all> [--snap] [--dry]`, `--list`) | Maps each Phase 6 feature area to its folders and screenshot screens and runs `tokens-exact.mjs` on one area. | Running the token passes feature by feature. |

Conventions: scripts are ESM (`.mjs`), read the repo from `import.meta.dirname`, and never write outside the repo. A script that needs secrets reads them from the environment.
