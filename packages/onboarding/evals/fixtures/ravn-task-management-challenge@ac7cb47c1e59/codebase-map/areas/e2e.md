---
area: "e2e"
title: "e2e"
paths: ["e2e/"]
tree_hash: "c7c822084faed468fe1950a437dcbdb7985580e2"
built_at_sha: "ac7cb47c1e590616da040840cb26cb4e203d99f8"
built_at: "2026-09-30T05:28:33.367Z"
status: "ok"
summary: "Playwright tests that drive a real deployment (a Vercel URL), not the dev server."
generator: "ravn-agents/onboarding 0.1.0"
---

# e2e

> Codebase map page, built at `ac7cb47c1e59`. It says where to look; confirm every claim against the cited code before relying on it.

## Summary
Playwright tests that drive a real deployment (a Vercel URL), not the dev server. They cover the two things the Vitest/MSW suite over `src/` cannot reach: the `api/graphql.ts` proxy running on Vercel, and real browser layout (horizontal scroll of the board and list views). `e2e/deployed-proxy.spec.ts:3-27` `e2e/playwright.config.ts:15-37`

## Key files
- `e2e/playwright.config.ts:39` — the whole Playwright config: requires `E2E_BASE_URL`, runs one Chromium project with one worker and no retries. Open it to change timeouts, reporters or the browser.
- `e2e/deployed-proxy.spec.ts:124` — the CRUD smoke test (create, filter, edit, delete through the UI) that must see a 200 from `/api/graphql`.
- `e2e/deployed-proxy.spec.ts:260` — layout regression tests: page must not scroll sideways (board, list view, loading skeleton) and wider windows must show more board (`:318`, `:400`, `:492`).
- `e2e/tsconfig.json:11-31` — separate Node-only TS project (no DOM lib, `types: ["node"]`), built by `npm run typecheck` via `tsc -p e2e`. `package.json:26`
- `.github/workflows/e2e.yml:16-23` — CI runs it on Vercel `deployment_status` success or manual `workflow_dispatch` with a URL.

## How it works
- `npm run test:e2e` runs `playwright test --config e2e/playwright.config.ts`; CI passes the deployment's `environment_url` as `E2E_BASE_URL`. `package.json:24` `.github/workflows/e2e.yml:60-91`
- The CRUD test records every response whose pathname is `/api/graphql` and captures the `createTask` id from the app's own response; the final assertion requires at least one 200. `e2e/deployed-proxy.spec.ts:129-150` `e2e/deployed-proxy.spec.ts:212`
- It also asserts the "Running on mocked data" banner is absent, catching a build where `VITE_API_URL` never arrived and MSW serves seeded data. `e2e/deployed-proxy.spec.ts:156-160`
- Each run tags tasks with a unique `RUN_ID`; `afterEach` lists all tasks via the proxy, filters by `RUN_ID` locally, deletes leftovers, then re-queries and logs whether the board is clean. `e2e/deployed-proxy.spec.ts:35-37` `e2e/deployed-proxy.spec.ts:79-110` `e2e/deployed-proxy.spec.ts:215-240`
- Layout tests measure `scrollWidth - clientWidth` via `page.evaluate` string bodies and include controls (planted wide element, table count, min 1868px skeleton width) so a zero reading is not vacuous. `e2e/deployed-proxy.spec.ts:334-346` `e2e/deployed-proxy.spec.ts:438-448`
- The loading-board test holds any `**/graphql` request whose body contains `Tasks` for 8s, then waits for the `role="status"` region to read `Loading tasks`. `e2e/deployed-proxy.spec.ts:403-418`

## Gotchas
- There is no localhost fallback: the config throws if `E2E_BASE_URL` is unset, and against a local server the final proxy assertion is designed to fail. `e2e/playwright.config.ts:25-37`
- Tests write to RAVN's shared live board, so `workers: 1`, `retries: 0`, and CI concurrency queues rather than cancels runs. `e2e/playwright.config.ts:43-53` `.github/workflows/e2e.yml:25-31`
- `page.evaluate` bodies are strings on purpose, because the tsconfig excludes the DOM lib; adding a typed arrow function would need `lib: DOM` and hide that the code runs remotely. `e2e/deployed-proxy.spec.ts:268-273` `e2e/tsconfig.json:2-6`
- Vitest excludes `e2e/**`, so spec files here never run in `npm test`. `vite.config.ts:210-216`
- Selectors depend on UI accessible names (`Task options for <name>`, `Search tasks`, named `alertdialog` because toasts are also alertdialogs); renaming them in `src/` breaks this spec. `e2e/deployed-proxy.spec.ts:119-122` `e2e/deployed-proxy.spec.ts:195-198`
- The `deployment_status` trigger only fires when the workflow file is on the default branch. `.github/workflows/e2e.yml:5-15`
- The 2400px width assertion leaves slack for Linux CI's 15px scrollbar; do not lower it to 2200. `e2e/deployed-proxy.spec.ts:469-476`

## Generated facts

Produced by code from the git tree at the stamped SHA; not written by a model.

### Files (3 total, 1 tests)

- `e2e/playwright.config.ts`
- `e2e/tsconfig.json`

### Exports (1)

- `default` (default) `e2e/playwright.config.ts:39`
