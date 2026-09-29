---
area: "src-mocks"
title: "src/mocks"
paths: ["src/mocks/"]
tree_hash: "f4cc8aba3d00ec4b979e930c8a21ddd9682d8aa1"
built_at_sha: "ac7cb47c1e590616da040840cb26cb4e203d99f8"
built_at: "2026-09-26T21:58:14.483Z"
status: "ok"
summary: "`src/mocks` is an MSW-based fake GraphQL backend: it backs both the dev server (when no API token is configured) and the whole Vitest suite, so the client co..."
generator: "ravn-agents/onboarding 0.1.0"
---

# src/mocks

> Codebase map page, built at `ac7cb47c1e59`. It says where to look; confirm every claim against the cited code before relying on it.

## Summary
`src/mocks` is an MSW-based fake GraphQL backend: it backs both the dev server (when no API token is configured) and the whole Vitest suite, so the client code under test is the real client code. `src/mocks/handlers.ts:13` It fits into the app the same way the real RAVN API would — pointing `VITE_API_URL`/`VITE_API_TOKEN` at the real endpoint bypasses it entirely. `src/mocks/handlers.ts:15`

## Key files
- `src/mocks/handlers.ts:42` — the `RequestHandler[]` array matching GraphQL operations (`Tasks`, `Users`, `Profile`, `CreateTask`, `UpdateTask`, `DeleteTask`) by operation name and delegating to `taskStore`.
- `src/mocks/task-store.ts:21` — the `TaskStore` class, an in-memory stand-in for the API database with `listTasks`, `createTask`, `updateTask`, `deleteTask`, and `reset()`.
- `src/mocks/task-fixtures.ts:11` — `makeUser`/`makeTask` factories plus `SEED_USERS`/`SEED_TASKS`, the seed data shared by handlers and tests.
- `src/mocks/server.ts:8` — `setupServer(...handlers)` for Node/Vitest, started in `vitest.setup.ts:81` and reset/closed there too.
- `src/mocks/browser.ts:5` — `setupWorker(...handlers)`, the Service Worker interceptor lazily imported by `src/main.tsx:32` only when mocking is enabled.
- `src/mocks/task-store.test.ts:1` — direct tests of `TaskStore` filter semantics, excluded from the coverage metric since it is a test double.

## How it works
- Handlers never return fixed data; they call into `taskStore` so a created task appears in a later `Tasks` query, filters narrow, and a delete removes — catching cache-invalidation bugs a static fixture would miss. `src/mocks/handlers.ts:42-75` `src/mocks/task-store.ts:63-88`
- `listTasks` implements filter semantics the schema itself does not document (absent/null does not narrow, `name` is a case-insensitive substring match, `tags` matches any overlap, `dueDate` compares only the calendar day). `src/mocks/task-store.ts:48-87`
- `updateTask` treats an input field as "present" when it is `!== undefined`, distinct from `!= null`, so `assigneeId: null` genuinely unassigns instead of being ignored as absent. `src/mocks/task-store.ts:112-135`
- `vitest.setup.ts` starts `server` once for the whole suite, then calls `server.resetHandlers()` and `taskStore.reset()` after every test so per-test `server.use()` overrides and created/updated tasks never leak into the next test. `vitest.setup.ts:99-102`
- `src/main.tsx` only imports `./mocks/browser` when `shouldStartMockWorker` says so, keeping the MSW worker out of the production bundle path. `src/main.tsx:28-33`

## Gotchas
- `SEED_USERS` deliberately gives three of four users a dead `dicebear.com` avatar URL (matching RAVN's real seed data) instead of `null`, so tests exercise the broken-avatar path production actually hits; see `src/lib/decommissioned-avatar.ts` for the companion workaround. `src/mocks/task-fixtures.ts:44-55`
- `makeTask`'s default `creator` used to be an id (`user-0`) absent from `SEED_USERS`, which made the owner filter match nothing for every picker option; it now defaults to a real seeded user (`user-2`). `src/mocks/task-fixtures.ts:35-39`
- `listTasks`'s `dueDate` filter compares only the date portion, so it is more permissive than a real API doing exact `DateTime` equality — tests relying on it pin the fake's behavior, not a server contract. `src/mocks/task-store.ts:58-61`

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
