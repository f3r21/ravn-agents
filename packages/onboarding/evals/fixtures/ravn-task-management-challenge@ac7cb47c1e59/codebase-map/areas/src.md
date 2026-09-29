---
area: "src"
title: "src (top level)"
paths: ["src/*","src/shared/","src/styles/","src/test/"]
tree_hash: "67a5a1e215324b8b3c607e51be6ba2d8629b2441"
built_at_sha: "ac7cb47c1e590616da040840cb26cb4e203d99f8"
built_at: "2026-09-26T21:58:14.483Z"
status: "ok"
summary: "This is the top level of the source tree: the app's real entry point plus the handful of cross-cutting helpers (`src/shared/`, `src/test/`) and the global st..."
generator: "ravn-agents/onboarding 0.1.0"
---

# src (top level)

> Codebase map page, built at `ac7cb47c1e59`. It says where to look; confirm every claim against the cited code before relying on it.

## Summary
This is the top level of the source tree: the app's real entry point plus the handful of
cross-cutting helpers (`src/shared/`, `src/test/`) and the global stylesheet (`src/styles/`)
that every feature area depends on rather than owning itself. `src/main.tsx:1`

## Key files
- `src/main.tsx:1` — boots the app: conditionally starts the MSW mock worker via
  `shouldStartMockWorker` before mounting `<App />`, and mounts even if the worker rejects.
- `src/shared/use-debounced-value.ts:15` — `useDebouncedValue`, the only cross-feature hook
  outside `lib`/`features`; debounces a derived value while keeping the controlled input live.
- `src/test/test-utils.tsx:16` — `createTestQueryClient`, `renderWithProviders` and
  `renderApp`, the shared render harness every component/integration test in the repo builds on.
- `src/styles/base.css:1` — the app's Tailwind entry point; pulls in `@ravn/ui-kit/theme.css`
  and adds the `@source` scan path the kit's compiled classes need to be generated at all.
- `src/vite-env.d.ts:3` — types `import.meta.env.VITE_API_URL`/`VITE_API_TOKEN`, the two knobs
  `lib/env.ts`'s `readApiConfig` reads to pick mock vs. real vs. proxied GraphQL.

## How it works
- `main.tsx` gates mounting on `enableMockingIfNeeded`, which only starts the mock worker when
  `shouldStartMockWorker(import.meta.env)` is true, then always calls `createRoot(...).render`
  in a `.finally()` so a rejected worker start still lets the app mount. `src/main.tsx:28-64`
- The MSW worker import is dynamic (`await import('./mocks/browser')`) but not
  environment-gated at build time on purpose, so the mock chunk exists in production builds
  for reviewers running `npm run preview` without an API token. `src/main.tsx:15-33`
- `renderApp` in `test-utils.tsx` mounts the real `routes` table inside a `createMemoryRouter`
  and returns the router alongside the render result, so tests assert navigation through the
  actual route tree instead of a stand-in. `src/test/test-utils.tsx:45-56`
- `useDebouncedValue` is consumed by the board's search filter to delay the derived query value
  (`debouncedName`) without delaying what the input displays. `src/features/board/use-board-filters.ts:203`

## Gotchas
- Do not remove the dynamic `import('./mocks/browser')` from `main.tsx` or gate it with
  `import.meta.env.DEV`: doing so would statically strip the mock worker from the production
  bundle and break the "runs with no configuration" behaviour the README promises.
  `src/main.tsx:15-24`
- `enableMockingIfNeeded().catch(...).finally(...)` is deliberate, not accidental error
  swallowing: a bare `.then()` here previously meant a rejected mock start skipped `render()`
  entirely, producing a blank page with no error boundary. `src/main.tsx:41-57`
- `base.css`'s `@source "../../node_modules/@ravn/ui-kit/dist"` line is required, not
  incidental — without it Tailwind's default `node_modules` exclusion means classes the kit's
  compiled `dist/index.js` relies on are never generated. `src/styles/base.css:1-12`
- `VITE_API_URL` behaves as three states, not two: unset serves the mock, an absolute URL needs
  `VITE_API_TOKEN` or every query is rejected, and a same-origin path (the deployed shape) takes
  no token and drops one if given. `src/vite-env.d.ts:3-19`

## Generated facts

Produced by code from the git tree at the stamped SHA; not written by a model.

### Files (7 total, 2 tests)

- `src/main.tsx`
- `src/shared/use-debounced-value.ts`
- `src/styles/base.css`
- `src/test/test-utils.tsx`
- `src/vite-env.d.ts`

### Entry points

- `src/main.tsx`

### Exports (4)

- `useDebouncedValue` (function) `src/shared/use-debounced-value.ts:15`
- `createTestQueryClient` (function) `src/test/test-utils.tsx:16`
- `renderWithProviders` (function) `src/test/test-utils.tsx:33`
- `renderApp` (function) `src/test/test-utils.tsx:45`
