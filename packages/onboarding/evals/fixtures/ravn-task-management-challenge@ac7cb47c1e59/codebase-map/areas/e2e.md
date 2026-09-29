---
area: "e2e"
title: "e2e"
paths: ["e2e/"]
tree_hash: "c7c822084faed468fe1950a437dcbdb7985580e2"
built_at_sha: "ac7cb47c1e590616da040840cb26cb4e203d99f8"
built_at: "2026-09-26T21:58:14.483Z"
status: "ok"
summary: "This directory holds Playwright's config and a single spec file that drive a real, deployed instance of the app (a Vercel preview) rather than local dev, bec..."
generator: "ravn-agents/onboarding 0.1.0"
---

# e2e

> Codebase map page, built at `ac7cb47c1e59`. It says where to look; confirm every claim against the cited code before relying on it.

## Summary
This directory holds Playwright's config and a single spec file that drive a real, deployed
instance of the app (a Vercel preview) rather than local dev, because `api/graphql.ts` is a
serverless function no Vitest run can load — the app only reaches it over HTTP. It is invoked via
`npm run test:e2e`, defined as `playwright test --config e2e/playwright.config.ts` `package.json:24`.

## Key files
- `e2e/playwright.config.ts:39` — the whole Playwright config: requires `E2E_BASE_URL` (throws
  otherwise, `e2e/playwright.config.ts:31-37`), runs one worker with no retries and a 90s timeout
  against one browser project.
- `e2e/deployed-proxy.spec.ts:124` — the main spec: creates, filters, edits and deletes a task
  through the UI against a live deployment, then asserts the app actually hit `/api/graphql` and
  got a 200 back (`e2e/deployed-proxy.spec.ts:212`).
- `e2e/deployed-proxy.spec.ts:260`, `e2e/deployed-proxy.spec.ts:318`, `e2e/deployed-proxy.spec.ts:400`,
  `e2e/deployed-proxy.spec.ts:492` — four browser-only layout regression tests for horizontal page
  scroll, checked at the loaded board, the list view at narrow widths, the loading skeleton and
  wide viewports respectively.
- `e2e/tsconfig.json:11` — its own TS project (Node lib, no DOM), separate from the root and
  `api/` configs, so a spec that references `document` fails to typecheck instead of compiling and
  breaking only at runtime `e2e/tsconfig.json:1-6`.

## How it works
- `E2E_BASE_URL` must point at a deployment; there is no localhost fallback, because MSW would
  answer requests locally and the run would pass without ever exercising the real proxy
  `e2e/playwright.config.ts:15-37`.
- Tests run with `fullyParallel: false` and `workers: 1` because they mutate the same live board
  through the shared API `e2e/playwright.config.ts:43-47`.
- `deployed-proxy.spec.ts` listens on `page.on('response', ...)` to capture every response from
  `/api/graphql` and only counts `200`s at the end, so a retried transient 5xx does not fail the
  run `e2e/deployed-proxy.spec.ts:129-150` `e2e/deployed-proxy.spec.ts:207-212`.
- `test.afterEach` deletes any task tagged with the run's unique `RUN_ID` and logs (never throws)
  whether cleanup succeeded, so a failed run doesn't also fail the report or silently leave a task
  on a board RAVN can see `e2e/deployed-proxy.spec.ts:215-240`.
- Because `e2e/tsconfig.json` excludes DOM lib types, in-page assertions are written as string
  bodies passed to `page.evaluate`, not typed arrow functions, e.g.
  `e2e/deployed-proxy.spec.ts:274-287` and `e2e/deployed-proxy.spec.ts:425-435`.

## Gotchas
- Running this suite against local `npm run dev` is expected to fail at the final assertion on
  purpose: dev serves from MSW, never touches `/api/graphql`, so the "did the proxy answer" check
  is unsatisfiable locally `e2e/playwright.config.ts:18-29`.
- The layout tests each add a positive control before asserting a zero, because a zero-overflow
  result from a page that never rendered the thing under test is not evidence; see the "vacuous"
  discussion and the `widest >= 1868` check `e2e/deployed-proxy.spec.ts:376-394` `e2e/deployed-proxy.spec.ts:443-446`.
- `deployed-proxy.spec.ts` deliberately stays a single spec rather than a suite: every extra flow
  would duplicate coverage the 26 Vitest files already provide, at the cost of a live API's latency
  and more writes to a shared board `e2e/deployed-proxy.spec.ts:3-26`.

## Generated facts

Produced by code from the git tree at the stamped SHA; not written by a model.

### Files (3 total, 1 tests)

- `e2e/playwright.config.ts`
- `e2e/tsconfig.json`

### Exports (1)

- `default` (default) `e2e/playwright.config.ts:39`
