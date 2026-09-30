---
area: "src"
title: "src (top level)"
paths: ["src/*","src/shared/","src/styles/","src/test/"]
tree_hash: "67a5a1e215324b8b3c607e51be6ba2d8629b2441"
built_at_sha: "ac7cb47c1e590616da040840cb26cb4e203d99f8"
built_at: "2026-09-30T05:28:33.367Z"
status: "ok"
summary: "The top level of `src/` holds the browser bootstrap (`main.tsx`), which starts the MSW mock worker when needed and then mounts `<App />`."
generator: "ravn-agents/onboarding 0.1.0"
---

# src (top level)

> Codebase map page, built at `ac7cb47c1e59`. It says where to look; confirm every claim against the cited code before relying on it.

## Summary
The top level of `src/` holds the browser bootstrap (`main.tsx`), which starts the MSW mock worker when needed and then mounts `<App />`. It also holds the global Tailwind stylesheet, the typed Vite env declarations, one shared hook, and the test helpers that almost every test in `src/app`, `src/features` and `src/ui` renders through. Feature code lives in sibling areas such as `src/app`, `src/features`, `src/lib` and `src/mocks`. `src/main.tsx:28-64`

## Key files
- `src/main.tsx:28` — the entry point. It awaits `enableMockingIfNeeded` and then renders `App` inside `StrictMode`. Open it when the app does not mount or the mock worker does not start.
- `src/test/test-utils.tsx:16` — `createTestQueryClient`, `renderWithProviders` and `renderApp`, plus a re-export of `userEvent`. Open it before writing any component or route test.
- `src/test/ui-kit-smoke.test.tsx:79` — the smoke test for the installed `@ravn/ui-kit` package: its exports, its accessible rendering and its version pin.
- `src/shared/use-debounced-value.ts:15` — the generic `useDebouncedValue` hook. The board search uses it via `src/features/board/use-board-filters.ts:203`.
- `src/styles/base.css:10-12` — the app's only Tailwind entry. It imports the kit's `theme.css` tokens and sets the dark-only base styles.
- `src/vite-env.d.ts:3-25` — types for `VITE_API_URL` and `VITE_API_TOKEN`, with notes on the three URL shapes that `readApiConfig` in `lib/env.ts` handles.

## How it works
- At bootstrap, `shouldStartMockWorker(import.meta.env)` from `src/lib/env.ts:134` decides at runtime whether to dynamically import `./mocks/browser` and call `worker.start({ onUnhandledRequest: 'bypass' })`. `src/main.tsx:28-34`
- Rendering runs in `.finally()`, so a rejected `worker.start()` is only logged and the app still mounts. `src/main.tsx:54-64`
- `renderApp(initialPath)` mounts the real `routes` table in a `createMemoryRouter` inside `Providers`, and returns the `router` so tests can assert on the location. `window.location` is never touched. `src/test/test-utils.tsx:45-56`
- Each render helper builds a fresh `QueryClient` with retries off, `staleTime: 0` and no refetch on focus. One test's cached data therefore cannot hide a missing MSW handler in another. `src/test/test-utils.tsx:16-35`
- The smoke test uses `import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw' })` to find every kit component imported across the app. It fails if any of them is missing from the hand-kept `ASSERTED` set. `src/test/ui-kit-smoke.test.tsx:126-148`
- `useDebouncedValue` debounces the derived value, not the input's own state. The effect cleanup clears the timer, so each new value restarts the delay. `src/shared/use-debounced-value.ts:15-29`

## Gotchas
- Do not guard the MSW import with `import.meta.env.DEV`. The roughly 426 kB mock chunk is kept in the production build on purpose, so that `npm run build && npm run preview` works with no configuration. `src/main.tsx:15-26`
- When you import a new kit component in app code, add it to `ASSERTED` and add an `expect(typeof X)` line. Otherwise `asserts every kit component the app actually imports` fails. `src/test/ui-kit-smoke.test.tsx:28-43`
- The smoke test checks that the kit's installed `package.json` version equals the tag in the app's `@ravn/ui-kit` dependency, so a stale `node_modules` after a pin bump fails the test. `src/test/ui-kit-smoke.test.tsx:173-185`
- The focus ring sits in `@layer base` on purpose. Unlayered CSS would beat every Tailwind utility, and components could no longer override it. `src/styles/base.css:37-49`
- The `@source` line pointing at the kit's `dist` is required. Without it, Tailwind never generates the classes that the kit's compiled components use. `src/styles/base.css:1-12`
- Tests run with `TZ` set to `Pacific/Kiritimati`, and `VITE_API_URL` and `VITE_API_TOKEN` are forced to empty strings, so a developer's `.env` cannot switch tests off the mock backend. `vite.config.ts:217-246`
- `src/main.tsx`, `src/vite-env.d.ts` and `src/test/**` are excluded from coverage. `vite.config.ts:263-271`

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
