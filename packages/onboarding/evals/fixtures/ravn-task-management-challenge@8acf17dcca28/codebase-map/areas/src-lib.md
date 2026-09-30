---
area: "src-lib"
title: "src/lib"
paths: ["src/lib/"]
tree_hash: "f4658928adc60c5ac40fe812867dab5e26e673df"
built_at_sha: "8acf17dcca28036fa99cf09408e3646901d6add1"
built_at: "2026-09-30T05:30:09.780Z"
status: "ok"
summary: "`src/lib` holds the app's small shared utilities, imported via `@/lib/...` by `src/graphql`, `src/features` and `src/ui`."
generator: "ravn-agents/onboarding 0.1.0"
---

# src/lib

> Codebase map page, built at `8acf17dcca28`. It says where to look; confirm every claim against the cited code before relying on it.

## Summary
`src/lib` holds the app's small shared utilities, imported via `@/lib/...` by `src/graphql`, `src/features` and `src/ui`. They cover validated environment config (mock, direct or proxied API), UTC-based due-date logic, a guard for a dead avatar host, and compile-time exhaustiveness helpers for GraphQL-generated unions. `src/lib/env.ts:87` `src/lib/due-date.ts:81`

## Key files
- `src/lib/env.ts:18` is the only place that reads `import.meta.env`. It produces the `ApiConfig` union plus `apiConfig`, `apiUrl`, `isUsingMockApi` and `shouldStartMockWorker`. Open it when API or MSW selection behaves unexpectedly.
- `src/lib/due-date.ts:61` holds `daysUntilDue`, `dueDateTone`, `formatDueDate`, `parseApiDate`, `toDateInputValue` and `formatUtcTimestamp`. All of them work in UTC.
- `src/lib/use-current-day.ts:24` is the `useCurrentDay` hook. It gives the board a `now` that changes only when the UTC day rolls over.
- `src/lib/decommissioned-avatar.ts:51` is `avatarSrcUnlessDecommissioned`. It drops `avatars.dicebear.com` URLs so `Avatar` shows initials instead.
- `src/lib/exhaustive.ts:19` is `exhaustiveList<Union>()(...)`. It builds arrays that the compiler checks cover every union member. `src/features/board/task-types.ts:1` uses it.
- `src/lib/assert-never.ts:11` is `assertNever` for the `default` arm of a switch. It also throws at runtime.
- `src/lib/cn.ts:11` is `cn`, which combines clsx and tailwind-merge so a caller's `className` overrides the component's own classes.

## How it works
- `readApiConfig` returns one of three states. With no URL it returns `undefined`, which means mock. A URL that starts with `/` and resolves to the same origin gives `proxied` with no token. An absolute URL gives `direct`, but only when a token is also set; without one it falls back to mock. `src/lib/env.ts:87-104`
- `isSameOriginPath` resolves the URL against `https://same-origin.invalid` instead of matching the string. This catches spellings such as `/\host` and tab or newline variants that are really protocol-relative. `src/lib/env.ts:52-62`
- `src/graphql/client.ts:78` adds `Authorization: Bearer` only when `apiConfig.mode === 'direct'` and sends to `apiUrl`. In mock mode that is `MOCK_API_URL` (`https://mock.local/graphql`), which MSW intercepts. `src/lib/env.ts:146-148`
- `src/main.tsx:29` calls `shouldStartMockWorker(import.meta.env)`. `BoardPage` shows its mock-data banner from `isUsingMockApi`. Both come from the same predicate. `src/lib/env.ts:116-136`
- In `dueDateTone`, a date in the past is `overdue`, today or tomorrow is `soon`, and anything later is `normal`. These names match `@ravn/ui-kit`'s `DueDateUrgency`, and `src/features/board/task-card/to-kit-props.ts:3` passes them to the kit unchanged. `src/lib/due-date.ts:81-90`
- `formatDueDate` and `formatUtcTimestamp` take their date parts from an `Intl.DateTimeFormat` with `timeZone: 'UTC'`. They never build a local `Date` from UTC getters. `src/lib/due-date.ts:42-58`
- `useCurrentDay` checks once a minute and returns the same `Date` object until `toDateInputValue` shows a new UTC day. `src/lib/use-current-day.ts:27-36`

## Gotchas
- Due dates arrive as midnight-UTC `DateTime`s. Reading them in local time moves them a day, so a task due tomorrow shows "Yesterday" in red west of Greenwich. Keep all due-date math in UTC. `src/lib/due-date.ts:5-19`
- `parseApiDate` returns `undefined` rather than an `Invalid Date`. Callers have to handle the missing case themselves. `src/lib/due-date.ts:118-121`
- The object identity returned by `useCurrentDay` matters. Card props are memoised on it, so returning a fresh `Date` on every tick would re-render the whole board. `src/lib/use-current-day.ts:14-18`
- Do not use `URL.canParse` in the avatar guard. It is newer than the `browserslist` floor and once took down the board. `eslint.config.js` now reports it as a lint error. `src/lib/decommissioned-avatar.ts:58-77`
- An `onError` fallback cannot catch the dead avatar host. It returns 410 with a valid SVG body, so the image fires `load`. The header and profile page still call the guard at each call site. `src/lib/decommissioned-avatar.ts:9-14` `src/features/navigation/app-header.tsx:5`
- In proxied mode a stray `VITE_API_TOKEN` is dropped on purpose. Any `VITE_` value ends up in `dist/`, and the real token is held server-side by `api/graphql.ts`. `src/lib/env.ts:72-75` `src/lib/env.ts:95-98`
- `apiConfig` is computed once when the module loads. Tests that stub env need to call `readApiConfig` or `shouldStartMockWorker` directly, or re-import the module. `src/lib/env.ts:106` `src/graphql/client.test.ts:130`

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
