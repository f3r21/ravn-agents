---
area: "src-ui"
title: "src/ui"
paths: ["src/ui/"]
tree_hash: "c95e9e8565965582004016fb3c8ca61f1db4f065"
built_at_sha: "8acf17dcca28036fa99cf09408e3646901d6add1"
built_at: "2026-09-30T05:30:09.780Z"
status: "ok"
summary: "`src/ui` holds the app's shared, feature-agnostic React building blocks: a loading/error/ready wrapper (`AsyncSection`), an empty-state panel, a render error..."
generator: "ravn-agents/onboarding 0.1.0"
---

# src/ui

> Codebase map page, built at `8acf17dcca28`. It says where to look; confirm every claim against the cited code before relying on it.

## Summary
`src/ui` holds the app's shared, feature-agnostic React building blocks: a loading/error/ready wrapper (`AsyncSection`), an empty-state panel, a render error boundary and a toast system built on React Aria. Feature pages under `src/features` and the app shell in `src/app` consume them. Visual primitives such as buttons and icons come from `@ravn/ui-kit`, not from here. `src/ui/async-section/async-section.tsx:61` `src/app/app.tsx:17`

## Key files
- `src/ui/async-section/async-section.tsx:61` — `AsyncSection`, which wraps a React Query result as pending skeleton, error block with retry, or children. Used by `BoardPage` and `ProfilePage` (`src/features/board/board-page.tsx:144`).
- `src/ui/toast/toast-context.tsx:130` — `ToastProvider` and `useToast` (`show(tone, message)`). Mounted in `src/app/providers.tsx:25` and used by `src/features/board/use-board-actions.ts:1`.
- `src/ui/error-boundary/error-boundary.tsx:37` — the class `ErrorBoundary`. It wraps the entire app above the router in `src/app/app.tsx:15-23`.
- `src/ui/empty-state/empty-state.tsx:26` — `EmptyState`, a labelled `role="group"` panel with title, description and action. Used by the board and `src/app/placeholder-page.tsx:1`.
- `src/ui/async-section/async-section.test.tsx:24`, `src/ui/toast/toast-context.test.tsx:35` and `src/ui/error-boundary/error-boundary.test.tsx:28` — colocated tests. Open them to see the intended behaviour for each state.

## How it works
- `AsyncSection` picks a branch from `status` plus `hasData`. With `status === 'error' && hasData` (a failed background refetch), it keeps the children and shows an inline alert. Only an error with no data swaps in the full error block. `src/ui/async-section/async-section.tsx:78-122`
- The error message is `error.message` only when the error is an `ApiError`. Anything else shows the caller's `errorFallback`. When `ApiError.isUnauthenticated` is set, the retry button is hidden. `src/ui/async-section/async-section.tsx:74-82`
- The toast API reads the react-stately `ToastState` through a ref, so the `useMemo` context value stays stable and consumers do not re-render. Toasts time out after `TOAST_DURATION_MS` = 5000, and at most 4 are visible at once. `src/ui/toast/toast-context.tsx:130-153` `src/ui/toast/toast-context.tsx:37`
- `ToastRegion` uses `useToastRegion` (labelled "Alerts") and portals to `document.body`, so toasts stay reachable while a React Aria modal hides the page. `src/ui/toast/toast-context.tsx:109-128`
- `ErrorBoundary.componentDidCatch` always logs to `console.error` first and then calls the optional `onError` prop. That prop is the hook for a crash reporter, and nothing is wired to it today. `src/ui/error-boundary/error-boundary.tsx:44-50`

## Gotchas
- `AsyncSection` renders its `role="status"` live region on every render and only changes its text. A live region that mounts with text already inside announces nothing, so keep the region and its labels in the same component. `src/ui/async-section/async-section.tsx:86-90`
- Callers must pass `hasData`. It defaults to `false`, and without it a failed refetch on window focus replaces a rendered board with "Could not load". `src/ui/async-section/async-section.tsx:26-35` `src/features/board/board-page.tsx:150`
- Children are passed as JSX, so they are evaluated even while the section is pending. Callers need safe defaults such as `NO_TASKS` for data that is still undefined. `src/features/board/board-page.tsx:35-42`
- `ErrorBoundary` has no `reset()`. To recover, change its `key` so React remounts it. The app-level fallback reloads the page instead. `src/ui/error-boundary/error-boundary.tsx:31-36` `src/app/app.tsx:17`
- `useToast` throws outside a `ToastProvider` instead of silently doing nothing. `src/ui/toast/toast-context.tsx:28-34`
- `EmptyState` is deliberately not a live region. The surrounding page's status region announces the empty result. `src/ui/empty-state/empty-state.tsx:17-24`
- The toast close button needs `useButton`. Spreading React Aria's `closeButtonProps` directly onto a `<button>` gives a button that does nothing. The region mounts only while toasts are visible, so screen-reader users never land on an empty landmark. `src/ui/toast/toast-context.tsx:53-56` `src/ui/toast/toast-context.tsx:158-160`

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
