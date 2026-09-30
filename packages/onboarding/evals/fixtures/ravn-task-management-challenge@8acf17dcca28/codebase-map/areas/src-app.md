---
area: "src-app"
title: "src/app"
paths: ["src/app/"]
tree_hash: "ea89106975aa19a6231dd8ae043dc8059ea8dc7d"
built_at_sha: "8acf17dcca28036fa99cf09408e3646901d6add1"
built_at: "2026-09-30T05:30:09.780Z"
status: "ok"
summary: "`src/app` is the application shell."
generator: "ravn-agents/onboarding 0.1.0"
---

# src/app

> Codebase map page, built at `8acf17dcca28`. It says where to look; confirm every claim against the cited code before relying on it.

## Summary
`src/app` is the application shell. It holds the root `App` component that `src/main.tsx` mounts, the provider stack (TanStack Query and toasts), the flat route table, the layout chrome and the page-level fallbacks (error, not-found, placeholder). Feature pages come from `src/features/*`, and this area only wires them together. `src/app/app.tsx:15-23` `src/main.tsx:3`

## Key files
- `src/app/app.tsx:15` — `App`: top-level `ErrorBoundary`, then `Providers`, then `RouterProvider` over a browser router built from `routes`. Open it to change app bootstrapping.
- `src/app/routes.tsx:21` — `routes`, the whole URL table as a plain `RouteObject[]`: `/` (board), `/settings` (profile), the sidebar placeholders and `*`. Open it to add a page.
- `src/app/providers.tsx:20` — `Providers`, every React context in one place. Tests use it too, through an injected `queryClient`.
- `src/app/query-client.ts:11` — `createQueryClient`: defaults for query retry, stale time and refetch-on-focus. Mutations never retry.
- `src/app/app-layout.tsx:44` — `AppLayout`: `AppSidebar` plus `AppHeader` around the route content, stacked below `md` and side by side above it.
- `src/app/error-page.tsx:8` — `ErrorPage`: the route `errorElement` and the root boundary fallback. The retry button appears only when `onRetry` is passed.
- `src/app/not-found-page.tsx:3` — the catch-all page, which renders without the shell and links back to `/`.
- `src/app/placeholder-page.tsx:22` — the "Nothing here yet" page for sidebar items that have no feature behind them.

## How it works
- Order at startup: the error boundary wraps the providers, and the providers wrap the router, so a crash anywhere below shows `ErrorPage`, whose retry reloads the page. `src/app/app.tsx:7-21`
- Routes are flat. Each route wraps its own element in `<AppLayout>` and has an `errorElement`. There is no parent layout route with an `<Outlet />`. `src/app/routes.tsx:16-38`
- Placeholder routes come from `NAV_ITEMS` entries flagged `isPlaceholder` (`/calendar`, `/team`, `/messages`), so a sidebar item and its route cannot drift apart. `src/app/routes.tsx:46-54` `src/features/navigation/app-sidebar.tsx:41-43`
- The query client is created once per `Providers` mount with a `useState` initialiser. A prop can override it, and tests use that to supply their own. `src/app/providers.tsx:20-27`
- Query defaults: `ApiError.isUnauthenticated` errors are never retried and other errors are retried up to 2 times. `staleTime` is 30s and `refetchOnWindowFocus` is on because the board is shared. `src/app/query-client.ts:17-27`
- Tests mount the real `routes` in a memory router through `renderApp`, and `routes.test.tsx` covers route matching for real. `src/test/test-utils.tsx:45-56` `src/app/routes.test.tsx:5-53`

## Gotchas
- Do not turn the routes into a nested layout route. The not-found page must render without the shell, because chrome around it would imply the app is fine. `src/app/routes.tsx:16-19` `src/app/routes.test.tsx:29-37`
- Keep `PlaceholderPage` separate from `NotFoundPage`. Tests use the "does not exist" heading as the signal for a bad URL, and a nav item must not show it. `src/app/placeholder-page.tsx:16-20` `src/app/routes.test.tsx:18-27`
- The error boundary sits above the router on purpose. Inside a layout route it would not remount on navigation, so a caught error would stick. `src/app/app.tsx:9-14`
- Mutations must not retry (`retry: false`), because a failed create may already have been applied on the server. `src/app/query-client.ts:29-33`
- `AppLayout` deliberately has no `max-w` width cap, on either the layout or the header. The long comment explains why. Do not add one back. `src/app/app-layout.tsx:17-42`
- The test query client (`createTestQueryClient`) uses different defaults from `createQueryClient`: no retry, `staleTime` 0, no refetch on focus. Tests therefore do not cover the production retry policy through `renderApp`. `src/test/test-utils.tsx:16-23`

## Generated facts

Produced by code from the git tree at the stamped SHA; not written by a model.

### Files (11 total, 3 tests)

- `src/app/app-layout.tsx`
- `src/app/app.tsx`
- `src/app/error-page.tsx`
- `src/app/not-found-page.tsx`
- `src/app/placeholder-page.tsx`
- `src/app/providers.tsx`
- `src/app/query-client.ts`
- `src/app/routes.tsx`

### Entry points

- `src/app/app.tsx`

### Exports (8)

- `AppLayout` (function) `src/app/app-layout.tsx:44`
- `App` (function) `src/app/app.tsx:15`
- `ErrorPage` (function) `src/app/error-page.tsx:8`
- `NotFoundPage` (function) `src/app/not-found-page.tsx:3`
- `PlaceholderPage` (function) `src/app/placeholder-page.tsx:22`
- `Providers` (function) `src/app/providers.tsx:20`
- `createQueryClient` (function) `src/app/query-client.ts:11`
- `routes` (const) `src/app/routes.tsx:21`
