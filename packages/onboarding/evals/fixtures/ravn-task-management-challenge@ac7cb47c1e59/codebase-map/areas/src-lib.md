---
area: "src-lib"
title: "src/lib"
paths: ["src/lib/"]
tree_hash: "f4658928adc60c5ac40fe812867dab5e26e673df"
built_at_sha: "ac7cb47c1e590616da040840cb26cb4e203d99f8"
built_at: "2026-09-30T05:28:33.367Z"
status: "ok"
summary: "`src/lib` holds the app's small shared helpers with no feature ownership: env/API-mode resolution, UTC due-date maths and formatting, compile-time exhaustive..."
generator: "ravn-agents/onboarding 0.1.0"
---

# src/lib

> Codebase map page, built at `ac7cb47c1e59`. It says where to look; confirm every claim against the cited code before relying on it.

## Summary
`src/lib` holds the app's small shared helpers with no feature ownership: env/API-mode resolution, UTC due-date maths and formatting, compile-time exhaustiveness helpers, the Tailwind `cn` class joiner, a day-rollover React hook and a dead-avatar-host filter. Features under `src/features`, `src/ui`, `src/graphql/client.ts` and `src/main.tsx` import them through the `@/lib/...` alias. `src/lib/env.ts:87` `src/lib/due-date.ts:61`

## Key files
- `src/lib/env.ts:18` — `ApiConfig` union and `readApiConfig`; open when changing how `VITE_API_URL`/`VITE_API_TOKEN` pick mock, direct or proxied mode. Consumed by `src/graphql/client.ts`, `src/main.tsx` and `BoardPage`'s mock banner.
- `src/lib/due-date.ts:81` — `dueDateTone`, `formatDueDate`, `parseApiDate`, `toDateInputValue`, `formatUtcTimestamp`; open for any due-date badge text, colour tier or date-input value.
- `src/lib/use-current-day.ts:24` — `useCurrentDay` hook giving board and My Tasks pages a `now` that changes only on UTC day rollover.
- `src/lib/decommissioned-avatar.ts:51` — `avatarSrcUnlessDecommissioned`, used by `task-card/to-kit-props.ts`, `app-header.tsx` and `profile-page.tsx` so dead dicebear URLs fall back to initials.
- `src/lib/exhaustive.ts:19` — `exhaustiveList<Union>()([...])`, used in `features/board/task-types.ts` to prove status/tag/estimate lists cover the generated GraphQL unions.
- `src/lib/assert-never.ts:11` — `assertNever` for `switch` default arms; throws at runtime too.
- `src/lib/cn.ts:11` — `cn` = `twMerge(clsx(...))`, used by UI components that accept `className`.
- Each module except `exhaustive.ts` has a sibling `*.test.ts` (for example `src/lib/env.test.ts:1`).

## How it works
- `readApiConfig` returns `undefined` (mock) when the URL is empty; `proxied` when the URL is a same-origin path (token dropped); `direct` only when an absolute URL comes with a non-blank token. `src/lib/env.ts:87-104`
- Same-origin is decided by resolving against the reserved host `https://same-origin.invalid`, plus a leading-`/` requirement, so `//host`, `/\host` and control-character spellings are all rejected. `src/lib/env.ts:28` `src/lib/env.ts:52-62`
- `isUsingMockApi` and `shouldStartMockWorker` are both derived from the absence of a config, and `apiUrl` falls back to `MOCK_API_URL` (`https://mock.local/graphql`), which only the MSW worker answers. `src/lib/env.ts:116` `src/lib/env.ts:134-148`
- Due dates are compared as UTC day numbers: `daysUntilDue` subtracts `utcDayNumber`s, and `dueDateTone` maps <0 to `overdue`, 0-1 to `soon`, and anything later to `normal`. `src/lib/due-date.ts:22-26` `src/lib/due-date.ts:81-90`
- Formatting goes through a single `Intl.DateTimeFormat('en-GB', { timeZone: 'UTC' })` and reassembles the parts by hand to produce the "6 July, 2020" design format and "... at HH:MM UTC" timestamps. `src/lib/due-date.ts:42-58` `src/lib/due-date.ts:96-148`
- `useCurrentDay` polls every 60 s and keeps the same `Date` object unless `toDateInputValue` (the UTC day) changed. `src/lib/use-current-day.ts:25-38`

## Gotchas
- Do not gate the MSW worker on `VITE_API_URL` alone: `.env.example` ships a URL with a blank token, and that combination once left requests aimed at the unresolvable mock host. Use `shouldStartMockWorker`. `src/lib/env.ts:118-136`
- `ApiConfig` is a discriminated union on purpose; only the `direct` member has `token`, so proxied mode cannot send `Bearer undefined`. Keep the token off the proxied shape, because any `VITE_` value ends up in `dist/`. `src/lib/env.ts:10-19` `src/lib/env.ts:72-75`
- Never read due dates in local time: API values sit at midnight UTC, and local reads shift them a day (for example, "Yesterday" in red for a task due tomorrow). Do not build `new Date(y, m, d, H, M)` from UTC getters either, because that breaks across DST gaps. `src/lib/due-date.ts:5-19` `src/lib/due-date.ts:28-41`
- `DueDateTone` names must stay identical to `@ravn/ui-kit`'s `DueDateUrgency`; the kit owns the colour table. `src/lib/due-date.ts:73-79`
- `useCurrentDay`'s returned object identity is load-bearing: card props are memoised on it, so returning a fresh `Date` each tick re-renders the whole board. `src/lib/use-current-day.ts:14-18`
- `avatarSrcUnlessDecommissioned` uses `try { new URL() }` instead of `URL.canParse`, which is above the browserslist floor and once crashed the board. An `onError` fallback cannot work because the dead host returns a valid SVG with a 410. `src/lib/decommissioned-avatar.ts:9-14` `src/lib/decommissioned-avatar.ts:58-77`
- `parseApiDate` returns `undefined` rather than an `Invalid Date`, so callers must handle a missing date explicitly. `src/lib/due-date.ts:111-121`

## Generated facts

Produced by code from the git tree at the stamped SHA; not written by a model.

### Files (13 total, 6 tests)

- `src/lib/assert-never.ts`
- `src/lib/cn.ts`
- `src/lib/decommissioned-avatar.ts`
- `src/lib/due-date.ts`
- `src/lib/env.ts`
- `src/lib/exhaustive.ts`
- `src/lib/use-current-day.ts`

### Exports (19)

- `assertNever` (function) `src/lib/assert-never.ts:11`
- `cn` (function) `src/lib/cn.ts:11`
- `avatarSrcUnlessDecommissioned` (function) `src/lib/decommissioned-avatar.ts:51`
- `DueDateTone` (type) `src/lib/due-date.ts:3`
- `daysUntilDue` (function) `src/lib/due-date.ts:61`
- `dueDateTone` (function) `src/lib/due-date.ts:81`
- `formatDueDate` (function) `src/lib/due-date.ts:96`
- `parseApiDate` (function) `src/lib/due-date.ts:118`
- `toDateInputValue` (function) `src/lib/due-date.ts:124`
- `formatUtcTimestamp` (function) `src/lib/due-date.ts:141`
- `ApiConfig` (type) `src/lib/env.ts:18`
- `readApiConfig` (function) `src/lib/env.ts:87`
- `apiConfig` (const) `src/lib/env.ts:106`
- `isUsingMockApi` (const) `src/lib/env.ts:116`
- `shouldStartMockWorker` (function) `src/lib/env.ts:134`
- `MOCK_API_URL` (const) `src/lib/env.ts:146`
- `apiUrl` (const) `src/lib/env.ts:148`
- `exhaustiveList` (function) `src/lib/exhaustive.ts:19`
- `useCurrentDay` (function) `src/lib/use-current-day.ts:24`
