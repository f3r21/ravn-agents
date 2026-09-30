---
area: "src-mocks"
title: "src/mocks"
paths: ["src/mocks/"]
tree_hash: "f4cc8aba3d00ec4b979e930c8a21ddd9682d8aa1"
built_at_sha: "ac7cb47c1e590616da040840cb26cb4e203d99f8"
built_at: "2026-09-30T05:28:33.367Z"
status: "ok"
summary: "The MSW (Mock Service Worker) fake of RAVN's GraphQL challenge API."
generator: "ravn-agents/onboarding 0.1.0"
---

# src/mocks

> Codebase map page, built at `ac7cb47c1e59`. It says where to look; confirm every claim against the cited code before relying on it.

## Summary
The MSW (Mock Service Worker) fake of RAVN's GraphQL challenge API. The same `handlers` serve the dev server when no API token is configured and the whole Vitest suite, so the client code under test is the real client code. `src/mocks/handlers.ts:10-24` The handlers delegate to a stateful in-memory `taskStore` seeded from factory-built fixtures, so the fake behaves like a server and not like a fixed list. `src/mocks/task-store.ts:10-20`

## Key files
- `src/mocks/handlers.ts:42` — the six operations (`Tasks`, `Users`, `Profile`, `CreateTask`, `UpdateTask`, `DeleteTask`). Open it to add or change a mocked GraphQL operation.
- `src/mocks/task-store.ts:21` — `TaskStore` class (singleton `taskStore` at line 150). Holds the filter semantics, create/update/delete logic and `reset()`.
- `src/mocks/task-fixtures.ts:11` — `makeUser`/`makeTask` factories plus `SEED_USERS` (4 users) and `SEED_TASKS` (7 tasks, at least one per status column). Tests import the factories directly.
- `src/mocks/server.ts:8` — Node `setupServer` used by tests; tests add per-case overrides with `server.use()`.
- `src/mocks/browser.ts:5` — browser `setupWorker`, lazily imported by the app bootstrap.
- `src/mocks/task-store.test.ts:18` — pins the fake's own filter, patch and reset behaviour.

## How it works
- Dev: `main.tsx` dynamically imports `./mocks/browser` and awaits `worker.start({ onUnhandledRequest: 'bypass' })` before rendering, only when `shouldStartMockWorker` finds no API config. `src/main.tsx:28-34` `src/lib/env.ts:134-136`
- Tests: `vitest.setup.ts` calls `server.listen({ onUnhandledRequest: 'error' })`, then after each test runs `server.resetHandlers()` and `taskStore.reset()`. `vitest.setup.ts:80-82` `vitest.setup.ts:99-105`
- Handlers match by GraphQL operation name, not URL, so they work against the mock host or RAVN's. `src/mocks/handlers.ts:22-23` `src/mocks/handlers.ts:43-49`
- A missing task on update/delete comes back as a GraphQL `errors` entry with `extensions.code: 'NOT_FOUND'`, not as an HTTP 404. `src/mocks/handlers.ts:35-40` `src/mocks/handlers.ts:57-75`
- `listTasks` treats absent or null filter fields as no-ops. `name` is a case-insensitive substring match, `tags` matches any tag, `ownerId` matches `creator` and `assigneeId` matches `assignee`. `src/mocks/task-store.ts:63-88`
- `createTask` assigns ids `mock-task-N`, sets the creator to `users[0]` (the `Profile` user) and prepends the new task to the list. `src/mocks/task-store.ts:90-105` `src/mocks/task-store.ts:44-46`
- `updateTask` is a patch: it applies only fields that are `!== undefined`, and `assigneeId: null` explicitly unassigns. `src/mocks/task-store.ts:107-138`

## Gotchas
- `dueDate` filtering compares only the calendar day (`slice(0, 10)`). The real API may do exact `DateTime` equality, so tests relying on it test an assumption, not a contract. `src/mocks/task-store.ts:58-61` `src/mocks/task-store.ts:83`
- The store is stateful. Any new test harness must call `taskStore.reset()`, or one test's created task leaks into later tests. `vitest.setup.ts:102-105`
- `reset()` makes only shallow copies, which is safe only because nothing mutates a task in place. Keep `updateTask` building replacements. `src/mocks/task-store.ts:30-38`
- Seed avatars deliberately point at the decommissioned `avatars.dicebear.com` host (three of the four users) to mirror live data. Do not set them to `null` until RAVN fixes its seed data (see `src/lib/decommissioned-avatar.ts`). `src/mocks/task-fixtures.ts:44-72`
- Seed creators must be ids from `SEED_USERS`, or the owner filter matches nothing. A test asserts every user owns at least one task. `src/mocks/task-fixtures.ts:35-39` `src/mocks/task-store.test.ts:80-84`
- The MSW browser chunk ships in the production bundle on purpose, so the app runs with no config. Do not guard the import with `import.meta.env.DEV`. `src/main.tsx:15-26` `vite.config.ts:147-153`
- Component tests run with `Date` faked to `2026-08-02T12:00:00.000Z`. Fixture due dates are rendered relative to that date. `vitest.setup.ts:33` `vitest.setup.ts:88`

## Generated facts

Produced by code from the git tree at the stamped SHA; not written by a model.

### Files (6 total, 1 tests)

- `src/mocks/browser.ts`
- `src/mocks/handlers.ts`
- `src/mocks/server.ts`
- `src/mocks/task-fixtures.ts`
- `src/mocks/task-store.ts`

### Entry points

- `src/mocks/server.ts`

### Exports (8)

- `worker` (const) `src/mocks/browser.ts:5`
- `handlers` (const) `src/mocks/handlers.ts:42`
- `server` (const) `src/mocks/server.ts:8`
- `makeUser` (function) `src/mocks/task-fixtures.ts:11`
- `makeTask` (function) `src/mocks/task-fixtures.ts:24`
- `SEED_USERS` (const) `src/mocks/task-fixtures.ts:56`
- `SEED_TASKS` (const) `src/mocks/task-fixtures.ts:75`
- `taskStore` (const) `src/mocks/task-store.ts:150`
