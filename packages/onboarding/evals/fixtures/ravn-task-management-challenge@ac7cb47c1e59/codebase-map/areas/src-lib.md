---
area: "src-lib"
title: "src/lib"
paths: ["src/lib/"]
tree_hash: "f4658928adc60c5ac40fe812867dab5e26e673df"
built_at_sha: "ac7cb47c1e590616da040840cb26cb4e203d99f8"
built_at: "2026-09-26T21:58:14.483Z"
status: "ok"
summary: "`src/lib/` holds small, dependency-light utilities shared across the app: date/time formatting for due dates, Tailwind class merging, env-var validation, exh..."
generator: "ravn-agents/onboarding 0.1.0"
---

# src/lib

> Codebase map page, built at `ac7cb47c1e59`. It says where to look; confirm every claim against the cited code before relying on it.

## Summary
`src/lib/` holds small, dependency-light utilities shared across the app: date/time formatting for
due dates, Tailwind class merging, env-var validation, exhaustiveness helpers, and one workaround
for a dead avatar host. Nothing here holds React state except `use-current-day.ts`; everything
else is pure functions imported from `src/features/`, `src/graphql/` and `src/ui/`. `src/lib/env.ts:1`

## Key files
- `src/lib/env.ts:1` — the app's one read of `import.meta.env`, producing an `ApiConfig` discriminated
  union (`direct` with a token, `proxied` without one, or `undefined` for mock mode). Open this to
  understand how the client decides where to send requests and whether MSW starts. `src/lib/env.ts:18`
- `src/lib/due-date.ts:1` — all due-date math and formatting, deliberately reading dates in UTC
  rather than local time so a shared board shows the same "Today"/"overdue" to every viewer.
  `src/lib/due-date.ts:20-26`
- `src/lib/cn.ts:11` — `clsx` + `tailwind-merge` wrapper used anywhere a component accepts a
  `className` override.
- `src/lib/decommissioned-avatar.ts:51` — strips out avatar URLs pointing at a dead dicebear host so
  `Avatar` falls back to initials instead of a broken image.
- `src/lib/use-current-day.ts:24` — the only stateful hook in this area; returns a `Date` that only
  changes identity when the UTC calendar day rolls over, feeding the board's due-date badges.
- `src/lib/exhaustive.ts:19` — compiler-enforced coverage of a string union, used for status/tag/point
  lists generated from `schema.graphql`.
- `src/lib/assert-never.ts:11` — throw-on-`never` helper for exhaustive `switch` default arms.

## How it works
- `readApiConfig` treats a value as "proxied" (no token attached) only when the URL resolves to the
  same origin per `isSameOriginPath`, which parses the URL rather than pattern-matching the string
  so protocol-relative spellings like `/\host` are also caught. `src/lib/env.ts:52-62` `src/lib/env.ts:87-104`
- `shouldStartMockWorker` and `isUsingMockApi` both reduce to "does `readApiConfig` return
  `undefined`", so `main.tsx`'s decision to boot the MSW worker and the board's "mocked data" banner
  can never disagree. `src/lib/env.ts:116` `src/lib/env.ts:134-136`
- `dueDateTone`'s three tones (`overdue`, `soon`, `normal`) are named to match `@ravn/ui-kit`'s
  `DueDateUrgency` one-for-one, so `task-card/to-kit-props.ts` hands a tone straight to the kit
  instead of the app keeping its own colour table. `src/lib/due-date.ts:74-90`
- `useCurrentDay` polls every 60 seconds but only calls `setNow` when `toDateInputValue` (a UTC-day
  string) actually changes, so the returned `Date`'s identity is stable across re-renders and board
  cards memoised on it don't re-render every minute. `src/lib/use-current-day.ts:24-38`
- `formatUtcTimestamp` and `formatDueDate` both build display strings from `utcParts`, an
  `Intl.DateTimeFormat` with an explicit `timeZone: 'UTC'`, rather than reading a `Date`'s local
  getters into a new `Date` — the latter breaks across a DST transition. `src/lib/due-date.ts:28-58`

## Gotchas
- `avatarSrcUnlessDecommissioned` must use `new URL(...)` in a `try`/`catch`, not `URL.canParse`:
  `canParse` is above this project's browserslist floor and threw at runtime on real browsers
  before `eslint.config.js` started catching it statically. `src/lib/decommissioned-avatar.ts:58-77`
- Due dates and account timestamps (`createdAt`/`updatedAt`) are both rendered in UTC on purpose,
  even though the latter are instants — mixing UTC and local-zone dates on the same screen would be
  worse than a UTC label everywhere. `src/lib/due-date.ts:130-148`
- A whitespace-only `VITE_API_TOKEN` or `VITE_API_URL` is treated as unset by `readApiConfig`,
  because a half-filled `.env` (`VITE_API_TOKEN=`) is more common than a deliberate empty token.
  `src/lib/env.ts:84-93`

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
