---
area: "src"
title: "src (top level)"
paths: ["src/*","src/shared/","src/styles/","src/test/"]
tree_hash: "67a5a1e215324b8b3c607e51be6ba2d8629b2441"
built_at_sha: "8acf17dcca28036fa99cf09408e3646901d6add1"
built_at: "2026-09-30T05:30:09.780Z"
status: "ok"
summary: "The top level of `src/` holds the app bootstrap (`main.tsx`), the env typings, the global Tailwind stylesheet, one shared hook and the test render helpers."
generator: "ravn-agents/onboarding 0.1.0"
---

# src (top level)

> Codebase map page, built at `8acf17dcca28`. It says where to look; confirm every claim against the cited code before relying on it.

## Summary
The top level of `src/` holds the app bootstrap (`main.tsx`), the env typings, the global Tailwind stylesheet, one shared hook and the test render helpers. Most feature code lives elsewhere (`src/app`, `src/features`, `src/lib`, `src/mocks`, `src/ui`); these files are the glue that starts the app and that every test renders through. `src/main.tsx:54-64`

## Key files
- `src/main.tsx:28` — entry point: starts the MSW worker when needed, then mounts `<App />` in `StrictMode` on `#root`. Open it when you are debugging startup, a blank page, or mock-vs-real API mode.
- `src/vite-env.d.ts:3` — types `VITE_API_URL` and `VITE_API_TOKEN`. The comments explain the three API modes: absolute URL plus token, same-origin proxy path, and mock.
- `src/styles/base.css:10-12` — the app's Tailwind entry. It imports `@ravn/ui-kit/theme.css` and scans the kit's `dist` with `@source`, sets dark `color-scheme`, and applies body typography tokens.
- `src/shared/use-debounced-value.ts:15` — the generic `useDebouncedValue` hook. It is used for the board name search in `src/features/board/use-board-filters.ts:203`.
- `src/test/test-utils.tsx:33` — `renderWithProviders` for component tests and `renderApp` (`src/test/test-utils.tsx:45`) for route-level tests. It also re-exports `userEvent`.

## How it works
- Bootstrap is ordered: `enableMockingIfNeeded` awaits `worker.start` before the first render, so no request fires before MSW intercepts it. `src/main.tsx:28-34`
- Whether to mock is decided by `shouldStartMockWorker(import.meta.env)` from `lib/env`, not re-derived in this file. This keeps the bootstrap and the API client in agreement. `src/main.tsx:4` `src/main.tsx:29`
- A failed worker start is logged and the render still happens in `.finally`, so the app always mounts. `src/main.tsx:54-64`
- Tests get a fresh `QueryClient` per call, with retries off, `staleTime: 0` and no refetch on window focus. `src/test/test-utils.tsx:16-23`
- `renderApp` mounts the real `routes` table in a `createMemoryRouter` inside `Providers` and returns the `router`, so tests can assert on navigation. `src/test/test-utils.tsx:45-56`
- `useDebouncedValue` debounces the derived value, not the input's own state. The effect cleanup clears the timer, so each new value restarts the wait. `src/shared/use-debounced-value.ts:18-26`

## Gotchas
- The MSW runtime (about a 426 kB chunk) is in the production bundle on purpose. Do not guard it with `import.meta.env.DEV`: the app must run unconfigured under `npm run build && npm run preview`. `src/main.tsx:15-26`
- Keep `.catch(...).finally(render)`. A bare `.then` once left a blank page whenever the service worker failed, for example in an insecure context or a Firefox private window. `src/main.tsx:41-53`
- A same-origin `VITE_API_URL` (the deployed `/api/graphql`) never falls back to the mock, and any `VITE_API_TOKEN` set with it is dropped. Only `readApiConfig` in `lib/env.ts` reads these vars. `src/vite-env.d.ts:4-18`
- Removing the `@source` line silently stops Tailwind generating the classes that the ui-kit's compiled components use, because `node_modules` is not scanned by default. `src/styles/base.css:1-12`
- The global `:focus-visible` ring sits in `@layer base` so that Tailwind utilities can still override it; unlayered CSS would win over every layered rule. `src/styles/base.css:37-49`
- `src/test/**`, `main.tsx` and `vite-env.d.ts` are excluded from coverage by name in `vite.config.ts`. `vite.config.ts:263-271`

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
