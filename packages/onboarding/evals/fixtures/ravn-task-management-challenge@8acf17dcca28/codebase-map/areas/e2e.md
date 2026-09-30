---
area: "e2e"
title: "e2e"
paths: ["e2e/"]
tree_hash: "c7c822084faed468fe1950a437dcbdb7985580e2"
built_at_sha: "8acf17dcca28036fa99cf09408e3646901d6add1"
built_at: "2026-09-30T05:30:09.780Z"
status: "ok"
summary: "Playwright browser tests that run against a real Vercel deployment, never a local dev server."
generator: "ravn-agents/onboarding 0.1.0"
---

# e2e

> Codebase map page, built at `8acf17dcca28`. It says where to look; confirm every claim against the cited code before relying on it.

## Summary
Playwright browser tests that run against a real Vercel deployment, never a local dev server. They cover the two things the Vitest-plus-MSW suite over `src/` cannot reach: the `api/graphql.ts` proxy as deployed, and real browser layout (horizontal overflow), since jsdom has no layout. `e2e/deployed-proxy.spec.ts:3-27` `e2e/playwright.config.ts:3-13`

## Key files
- `e2e/deployed-proxy.spec.ts:124` — every test lives in this file: the create/filter/edit/delete smoke test through `/api/graphql`, then four layout guards (lines 260, 318, 400, 492). Open it to add or change a browser check.
- `e2e/playwright.config.ts:39-80` — the whole Playwright config: one worker, zero retries, 90s timeout, Chromium only, `github` reporter in CI. It throws if `E2E_BASE_URL` is unset.
- `e2e/tsconfig.json:11-31` — a separate TS project with `lib: ["ES2022"]`, `types: ["node"]` and no DOM lib. `npm run typecheck` builds it with `tsc --noEmit -p e2e` (`package.json:26`).
- `.github/workflows/e2e.yml:16-23` — CI entry point. It triggers on `deployment_status` or on `workflow_dispatch` with a `deployment_url` input, then runs `npm run test:e2e` with `E2E_BASE_URL` set (`.github/workflows/e2e.yml:89-91`).
- `package.json:24` — `test:e2e` runs `playwright test --config e2e/playwright.config.ts`.

## How it works
- The smoke test records the status of every response whose path is `/api/graphql`. Its last assertion requires at least one 200. That assertion is what fails on a mock-backed or broken deployment. `e2e/deployed-proxy.spec.ts:129-150` `e2e/deployed-proxy.spec.ts:212`
- Early on it asserts that the "Running on mocked data" banner is absent. That banner means `VITE_API_URL` never reached the build. `e2e/deployed-proxy.spec.ts:156-160`
- Each run tags its task with a unique `RUN_ID` (timestamp plus random suffix), so concurrent runs cannot collide and cleanup can find leftovers. `e2e/deployed-proxy.spec.ts:35-37`
- `test.afterEach` deletes any task containing `RUN_ID` by calling the proxy directly with GraphQL `tasks`/`deleteTask`, then queries again and logs whether the board is clean. `e2e/deployed-proxy.spec.ts:79-110` `e2e/deployed-proxy.spec.ts:215-240`
- The layout tests measure `scrollWidth - clientWidth` on the document and on the board's `[class*="overflow-x-auto"]` container at fixed viewports. Each includes a control assertion so it cannot pass vacuously. `e2e/deployed-proxy.spec.ts:274-296` `e2e/deployed-proxy.spec.ts:334-346`
- The loading-skeleton test holds any GraphQL request containing `Tasks` open for 8s with `page.route`. It checks that the skeleton is really on screen (status text `Loading tasks`, zero `h2`, something at least 1868px wide) before it measures overflow. `e2e/deployed-proxy.spec.ts:403-448`

## Gotchas
- There is no localhost fallback on purpose. Pointed at `npm run dev`, the selectors run but the final proxy assertion is meant to fail. `e2e/playwright.config.ts:15-37`
- The tests write to a shared live board (RAVN's). That is why the config uses `workers: 1` and `retries: 0`, and why the workflow queues runs instead of cancelling them. `e2e/playwright.config.ts:43-53` `.github/workflows/e2e.yml:29-31`
- `page.evaluate` bodies are passed as strings, not functions, because the tsconfig leaves out the DOM lib. Do not add `"DOM"` just to type a callback. `e2e/deployed-proxy.spec.ts:268-273` `e2e/tsconfig.json:2-6`
- Vitest excludes `e2e/**`, and eslint ignores `e2e/test-results`. Playwright alone owns this directory. `vite.config.ts:216` `eslint.config.js:215`
- The `deployment_status` trigger only fires once the workflow file is on the default branch. Before that, use `workflow_dispatch`. `.github/workflows/e2e.yml:5-15`
- The header comment says "one spec rather than a suite", but the file now also holds four layout tests that go through the same deployment. `e2e/deployed-proxy.spec.ts:23-26` `e2e/deployed-proxy.spec.ts:242-260`
- The width-growth test asserts `hiddenBy` is 0 only at 2400px, not 2200px. At 2200px there are only 4px of slack, which a classic 15px Linux scrollbar would use up. `e2e/deployed-proxy.spec.ts:469-476` `e2e/deployed-proxy.spec.ts:532`

## Generated facts

Produced by code from the git tree at the stamped SHA; not written by a model.

### Files (3 total, 1 tests)

- `e2e/playwright.config.ts`
- `e2e/tsconfig.json`

### Exports (1)

- `default` (default) `e2e/playwright.config.ts:39`
