---
area: "src-app"
title: "src/app"
paths: ["src/app/"]
tree_hash: "8baae0cd29b366f20ada59aa36fca4fdcf2f246d"
built_at_sha: "ac7cb47c1e590616da040840cb26cb4e203d99f8"
built_at: "2026-09-30T05:28:33.367Z"
status: "ok"
summary: "`src/app/` is the composition layer of the React SPA."
generator: "ravn-agents/onboarding 0.1.0"
---

# src/app

> Codebase map page, built at `ac7cb47c1e59`. It says where to look; confirm every claim against the cited code before relying on it.

## Summary
`src/app/` is the composition layer of the React SPA. It holds the root `App` (error boundary, providers, browser router), the route table, the page shell, and the pages that combine more than one feature. `src/main.tsx` mounts `App`, and the test harness in `src/test/test-utils.tsx` reuses `Providers` and `routes` directly. `src/app/app.tsx:15-23` `src/main.tsx:59-63` `src/test/test-utils.tsx:6-7`

## Key files
- `src/app/app.tsx:15` — `App`: an `ErrorBoundary` wrapped around `Providers` and `RouterProvider`. Open it to change top-level wiring.
- `src/app/routes.tsx:22` — `routes`, the `RouteObject[]` table (`/`, `/settings`, `/my-task`, the sidebar placeholders, and `*`). Open it to add or rename a page.
- `src/app/providers.tsx:20` — `Providers`: `QueryClientProvider` plus `ToastProvider`. Add any new global context here.
- `src/app/query-client.ts:11` — `createQueryClient`, the TanStack Query defaults for retry, staleTime and focus refetch.
- `src/app/app-layout.tsx:44` — `AppLayout`, the shell with `AppSidebar` and `AppHeader` around the page content.
- `src/app/my-task-page.tsx:125` — `MyTaskPage`: the signed-in user's tasks, built from board and profile features.
- `src/app/error-page.tsx:8`, `src/app/not-found-page.tsx:3`, `src/app/placeholder-page.tsx:22` — the fallback pages: a route or boundary error, an unknown URL, and a nav item that has no page yet.
- `src/app/routes.test.tsx:1`, `src/app/my-task-page.test.tsx:1`, `src/app/query-client.test.ts:1`, `src/app/error-page.test.tsx:1` — the tests for this area.

## How it works
- Startup: `main.tsx` starts the MSW worker if needed, then renders `<App />` in `StrictMode` whether or not the worker started. `App` builds a single module-level `createBrowserRouter(routes)`. `src/main.tsx:54-64` `src/app/app.tsx:7`
- Every route is flat. Each one wraps its element in its own `<AppLayout>` and sets `errorElement: <ErrorPage />`. None of them is a child of a layout route with an `<Outlet />`. `src/app/routes.tsx:22-69`
- Placeholder routes are built from `NAV_ITEMS.filter(item => item.isPlaceholder)` in the sidebar module (`/calendar`, `/team`, `/messages`). To add a sample page, add a nav item; do not add a route. `src/app/routes.tsx:56-64` `src/features/navigation/app-sidebar.tsx:38-43`
- Query defaults: queries retry at most twice and never retry on an `ApiError` with `isUnauthenticated`. `staleTime` is 30s and data refetches when the window regains focus. Mutations never retry because a retry could create a duplicate task. `src/app/query-client.ts:17-32`
- `Providers` keeps the client in `useState(() => queryClient ?? createQueryClient())`. The client survives re-renders, and tests can pass in their own client. `src/app/providers.tsx:20-27`
- Tests mount the real `routes` in a `createMemoryRouter` through `renderApp`, with a client that has retries off. `src/test/test-utils.tsx:45-56` `src/test/test-utils.tsx:16-23`
- `MyTaskPage` loads the profile first. It renders `MyTaskList` only after `profile.id` exists, and that list calls `useTasks({ assigneeId })` and reuses the board's `useBoardDialogs` and `useBoardActions` for edit and delete. `src/app/my-task-page.tsx:125-153` `src/app/my-task-page.tsx:37-47`

## Gotchas
- Filter "my tasks" by `assigneeId`, never `ownerId`. `ownerId` matches the task's creator, and every seeded task has the same creator, so it returns the whole board. `src/app/my-task-page.tsx:21-30`
- Do not call `useTasks` before the profile has loaded. With `assigneeId: undefined` it fetches the unfiltered list and briefly shows the whole board under the "My task" heading. `src/app/my-task-page.tsx:31-35`
- `src/app/` is the only layer allowed to import from several features. The lint rule blocks cross-feature imports, which is why `MyTaskPage` lives here and not in `features/`. `src/app/my-task-page.tsx:120-123`
- The error boundary sits above the router on purpose, and its retry reloads the page. Inside a layout route, a caught error would stay on screen across navigation. `src/app/app.tsx:9-17`
- `NotFoundPage` renders without `AppLayout`, and `routes.test.tsx` pins its heading as the signal for a bad URL. Placeholder nav items must use `PlaceholderPage`, not `NotFoundPage`. `src/app/routes.tsx:65-68` `src/app/placeholder-page.tsx:16-20`
- `AppLayout` has no `max-w` cap on purpose, on the shell or the header. A cap starves the board of width on wide screens. `src/app/app-layout.tsx:17-42`
- Keep `NO_USERS` and `NO_TASKS` as module-level empty arrays. A fresh `[]` on each render breaks `TaskFormDialog`'s memoised assignee options. `src/app/my-task-page.tsx:16-19`

## Generated facts

Produced by code from the git tree at the stamped SHA; not written by a model.

### Files (13 total, 4 tests)

- `src/app/app-layout.tsx`
- `src/app/app.tsx`
- `src/app/error-page.tsx`
- `src/app/my-task-page.tsx`
- `src/app/not-found-page.tsx`
- `src/app/placeholder-page.tsx`
- `src/app/providers.tsx`
- `src/app/query-client.ts`
- `src/app/routes.tsx`

### Entry points

- `src/app/app.tsx`

### Exports (9)

- `AppLayout` (function) `src/app/app-layout.tsx:44`
- `App` (function) `src/app/app.tsx:15`
- `ErrorPage` (function) `src/app/error-page.tsx:8`
- `MyTaskPage` (function) `src/app/my-task-page.tsx:125`
- `NotFoundPage` (function) `src/app/not-found-page.tsx:3`
- `PlaceholderPage` (function) `src/app/placeholder-page.tsx:22`
- `Providers` (function) `src/app/providers.tsx:20`
- `createQueryClient` (function) `src/app/query-client.ts:11`
- `routes` (const) `src/app/routes.tsx:22`
