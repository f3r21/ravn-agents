---
area: "src-ui"
title: "src/ui"
paths: ["src/ui/"]
tree_hash: "c95e9e8565965582004016fb3c8ca61f1db4f065"
built_at_sha: "ac7cb47c1e590616da040840cb26cb4e203d99f8"
built_at: "2026-09-26T21:58:14.483Z"
status: "ok"
summary: "`src/ui/` holds small, shared presentational components — a query status wrapper, an empty-state block, a class-based error boundary and a toast system — use..."
generator: "ravn-agents/onboarding 0.1.0"
---

# src/ui

> Codebase map page, built at `ac7cb47c1e59`. It says where to look; confirm every claim against the cited code before relying on it.

## Summary
`src/ui/` holds small, shared presentational components — a query status wrapper, an empty-state block, a class-based error boundary and a toast system — used by `src/features/*` pages instead of each page re-implementing loading/error/empty UI on its own. `src/app/app.tsx:2` and `src/app/app.tsx:17` wire `ErrorBoundary` around the whole router.

## Key files
- `src/ui/async-section/async-section.tsx:61` — `AsyncSection`, the loading/error/success wrapper around a React Query result; open it when a page needs to show a skeleton, an error block or a stale-data-plus-retry banner.
- `src/ui/toast/toast-context.tsx:130` — `ToastProvider` plus the `useToast()` hook (`src/ui/toast/toast-context.tsx:28`); open it to see how notifications are queued and rendered as a portal.
- `src/ui/error-boundary/error-boundary.tsx:37` — `ErrorBoundary` class component; open it when wiring a fallback UI for render-time crashes.
- `src/ui/empty-state/empty-state.tsx:26` — `EmptyState`, a labelled placeholder block for "no results" with an optional action.

## How it works
- `AsyncSection` derives `isStale` from `status === 'error' && hasData` so a background refetch failure (React Query's `refetchOnWindowFocus`) shows a dismissable notice over existing content instead of replacing it with the full error block; when the error is an unauthenticated `ApiError`, the retry button is omitted since retrying a rejected token cannot succeed. `src/ui/async-section/async-section.tsx:74-118`
- The live region and the copy it announces are kept in the same component (`AsyncSection`) rather than split across files, because a live region only reports *changes* to its own contents — a region that mounted with its text already inside would announce nothing. `src/ui/async-section/async-section.tsx:48-59`
- `ToastRegion` is portalled to `document.body` and marked via React Aria's `useToastRegion`, because React Aria's modal-hiding pass walks out from `document.body` hiding whole subtrees; a toast region nested under the page rather than a sibling of an open modal would be hidden exactly when a modal is open. `src/ui/toast/toast-context.tsx:83-108`
- `ToastProvider`'s `show` function reads state through a ref (`stateRef`) synced in a `useEffect`, so the `ToastApi` object handed to consumers via `useMemo` stays referentially stable across renders. `src/ui/toast/toast-context.tsx:141-153`
- `ErrorBoundary` has no `reset()` method by design; the doc comment says recovery is the caller's job via a `key` remount, but the one caller in this app instead reloads the whole page from its fallback. `src/ui/error-boundary/error-boundary.tsx:31-35`

## Gotchas
- `EmptyState` intentionally does not use `role="status"` — it mounts with its text already present, so a live region there would announce nothing; a separate status region elsewhere is what should report emptiness. `src/ui/empty-state/empty-state.tsx:17-21`
- `ErrorBoundary.componentDidCatch` logs to `console.error` unconditionally before calling the optional `onError` prop, so a misconfigured crash reporter cannot swallow the only other record of the failure. `src/ui/error-boundary/error-boundary.tsx:44-49`
- In the error branch, `AsyncSection`'s live region renders the empty string rather than the error text, because the error block itself carries `role="alert"` and would otherwise be announced twice. `src/ui/async-section/async-section.tsx:88-90`

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
