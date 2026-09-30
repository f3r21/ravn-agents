---
area: "src-ui"
title: "src/ui"
paths: ["src/ui/"]
tree_hash: "c95e9e8565965582004016fb3c8ca61f1db4f065"
built_at_sha: "ac7cb47c1e590616da040840cb26cb4e203d99f8"
built_at: "2026-09-30T05:28:33.367Z"
status: "ok"
summary: "`src/ui/` holds the app's shared building blocks, used across features: a loading/error/ready wrapper for React Query results, an empty-state block, a render..."
generator: "ravn-agents/onboarding 0.1.0"
---

# src/ui

> Codebase map page, built at `ac7cb47c1e59`. It says where to look; confirm every claim against the cited code before relying on it.

## Summary
`src/ui/` holds the app's shared building blocks, used across features: a loading/error/ready wrapper for React Query results, an empty-state block, a render error boundary and the toast notification system. Visual primitives come from `@ravn/ui-kit` (`TextButton`, `CloseIcon`). This folder adds behaviour and accessibility wiring on top of them. `src/ui/async-section/async-section.tsx:61` `src/ui/toast/toast-context.tsx:130`

## Key files
- `src/ui/async-section/async-section.tsx:61` — `AsyncSection`, the loading / error / ready triad with its `sr-only` status region. `board-page.tsx`, `profile-page.tsx` and `my-task-page.tsx` all use it. Open it when you change how a page shows query state.
- `src/ui/empty-state/empty-state.tsx:26` — `EmptyState`, the dashed "nothing here" block with an optional `action`. `board-page.tsx`, `my-task-page.tsx` and `placeholder-page.tsx` use it.
- `src/ui/error-boundary/error-boundary.tsx:37` — `ErrorBoundary` class. It wraps the whole app in `src/app/app.tsx` and renders an `ErrorPage` fallback.
- `src/ui/toast/toast-context.tsx:130` — `ToastProvider`, which `src/app/providers.tsx` mounts. The same file defines the `useToast` hook (`src/ui/toast/toast-context.tsx:28`), which `src/features/board/use-board-actions.ts` uses to report mutation results.
- The three `*.test.tsx` files sit beside their components. `src/ui/async-section/async-section.test.tsx`, `src/ui/error-boundary/error-boundary.test.tsx` and `src/ui/toast/toast-context.test.tsx` are the tests. `EmptyState` has none. `src/ui/empty-state/empty-state.tsx:1`

## How it works
- `AsyncSection` gets React Query's `status`, plus a `hasData` flag. It renders the skeleton while pending, a full `role="alert"` error block when the query failed with no data, and `children` on success. `src/ui/async-section/async-section.tsx:84-123`
- A failed background refetch with `hasData` true counts as "stale". The component keeps the children on screen and adds a small alert with a retry button instead of replacing the page. `src/ui/async-section/async-section.tsx:78` `src/ui/async-section/async-section.tsx:94-106`
- Error text is the `ApiError` message when the error is an `ApiError` from `@/graphql/client`. Otherwise it is the caller's `errorFallback`. The retry button is hidden when `error.isUnauthenticated` is true. `src/ui/async-section/async-section.tsx:74-82`
- `ErrorBoundary.componentDidCatch` always calls `console.error` first, then the optional `onError` prop (the hook for a crash reporter). Nothing passes `onError` today. `src/ui/error-boundary/error-boundary.tsx:44-50` `src/ui/error-boundary/error-boundary.tsx:7-20`
- Toasts are built on `react-stately`'s `useToastState` (at most 4 visible) and `react-aria`'s `useToastRegion`/`useToast`. `show(tone, message)` adds a toast that closes itself after `TOAST_DURATION_MS` = 5000. `src/ui/toast/toast-context.tsx:37` `src/ui/toast/toast-context.tsx:131-153`
- `ToastRegion` is portalled to `document.body` and labelled "Alerts". It is only mounted while at least one toast is visible. `src/ui/toast/toast-context.tsx:109-128` `src/ui/toast/toast-context.tsx:160`

## Gotchas
- The `role="status"` live region in `AsyncSection` must stay mounted at all times, with only its text changing. A live region that mounts with its text already inside announces nothing. In the error state it is set to `''` on purpose, so the error is not announced twice. `src/ui/async-section/async-section.tsx:48-59` `src/ui/async-section/async-section.tsx:86-90`
- `EmptyState` is deliberately a labelled `role="group"`, not a live region. The page's `AsyncSection` status text is what announces "no tasks". `src/ui/empty-state/empty-state.tsx:17-24`
- `ErrorBoundary` has no `reset()`. To recover, the caller changes the boundary's `key` to remount it. `app.tsx` reloads the whole window instead. `src/ui/error-boundary/error-boundary.tsx:31-36`
- The toast region needs both the `useToastRegion` top-layer marker and the portal to `document.body`. Without both, React Aria's modal hiding pass hides toasts while a dialog is open, for example the delete confirmation. `src/ui/toast/toast-context.tsx:84-104`
- `closeButtonProps` from `useAriaToast` has to go through `useButton`. Spread directly onto a `<button>`, it gives a close button that does nothing. `src/ui/toast/toast-context.tsx:53-56`
- `useToast` throws outside a `ToastProvider`. `show` reads the toast state through a ref that an effect keeps up to date, so the context value stays stable and does not re-render every consumer. `src/ui/toast/toast-context.tsx:28-34` `src/ui/toast/toast-context.tsx:133-144`

## Generated facts

Produced by code from the git tree at the stamped SHA; not written by a model.

### Files (7 total, 3 tests)

- `src/ui/async-section/async-section.tsx`
- `src/ui/empty-state/empty-state.tsx`
- `src/ui/error-boundary/error-boundary.tsx`
- `src/ui/toast/toast-context.tsx`

### Exports (6)

- `AsyncSection` (function) `src/ui/async-section/async-section.tsx:61`
- `EmptyState` (function) `src/ui/empty-state/empty-state.tsx:26`
- `ErrorBoundary` (class) `src/ui/error-boundary/error-boundary.tsx:37`
- `ToastTone` (type) `src/ui/toast/toast-context.tsx:8`
- `useToast` (function) `src/ui/toast/toast-context.tsx:28`
- `ToastProvider` (function) `src/ui/toast/toast-context.tsx:130`
