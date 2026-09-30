---
area: "src-mocks"
title: "src/mocks"
paths: ["src/mocks/"]
tree_hash: "f4cc8aba3d00ec4b979e930c8a21ddd9682d8aa1"
built_at_sha: "8acf17dcca28036fa99cf09408e3646901d6add1"
built_at: "2026-09-30T05:30:09.780Z"
status: "ok"
summary: "`src/mocks` is the MSW fake of the RAVN challenge GraphQL API."
generator: "ravn-agents/onboarding 0.1.0"
---

# src/mocks

> Codebase map page, built at `8acf17dcca28`. It says where to look; confirm every claim against the cited code before relying on it.

## Summary
`src/mocks` is the MSW fake of the RAVN challenge GraphQL API. The same handlers serve the dev server whenever no API token is set, and they also serve the whole Vitest suite, so the client code under test is the real client. `src/mocks/handlers.ts:10-24` Behind them sits a stateful in-memory `taskStore` that behaves like a server rather than a fixed fixture. `src/mocks/task-store.ts:10-20`

## Key files
- `src/mocks/handlers.ts:42` — `handlers`: one MSW resolver each for the `Tasks`, `Users` and `Profile` queries and the `CreateTask`, `UpdateTask` and `DeleteTask` mutations. Open this when you add or change a GraphQL operation.
- `src/mocks/task-store.ts:21` — `TaskStore`, the fake database: filtering, create, patch-style update and delete. Open it when a mocked response looks wrong.
- `src/mocks/task-fixtures.ts:11` — `makeUser`/`makeTask` factories plus `SEED_USERS` and `SEED_TASKS` (4 users, 7 tasks). Unit tests import these directly.
- `src/mocks/server.ts:8` — Node `setupServer` used by tests. Tests add per-case overrides with `server.use()`.
- `src/mocks/browser.ts:5` — Service Worker `setupWorker`, lazy-imported by the app bootstrap.
- `src/mocks/task-store.test.ts:4-17` — pins the fake's filter semantics. `search-filter.test.tsx` relies on them.

## How it works
- Dev mode: `enableMockingIfNeeded` dynamically imports `./mocks/browser` only when `shouldStartMockWorker(import.meta.env)` is true. It awaits `worker.start({ onUnhandledRequest: 'bypass' })` before the app renders. `src/main.tsx:28-34`
- Tests: `vitest.setup.ts` calls `server.listen({ onUnhandledRequest: 'error' })`. After each test it runs `server.resetHandlers()` and `taskStore.reset()`. `vitest.setup.ts:52-54` `vitest.setup.ts:65-73`
- Handlers match on the operation name, not the URL, so they also work against RAVN's host. A missing task comes back as a GraphQL `errors` entry with `extensions.code: 'NOT_FOUND'`, not as an HTTP 404. `src/mocks/handlers.ts:35-40` `src/mocks/handlers.ts:57-75`
- `listTasks` semantics: a null or absent field does not narrow; `name` is a case-insensitive substring match; `tags` matches any of the requested tags; `dueDate` compares only the date part. `src/mocks/task-store.ts:63-88`
- `createTask` assigns ids `mock-task-N`, prepends the new task, and always sets `creator` to `users[0]`, which is also what `profile()` returns. `src/mocks/task-store.ts:44-46` `src/mocks/task-store.ts:90-105`
- `reset()` rebuilds tasks and users as shallow copies of the seeds and restarts `nextId` at 1. `src/mocks/task-store.ts:30-38`

## Gotchas
- `updateTask` is a patch. Most fields are applied only when neither `undefined` nor `null`, but `assigneeId: null` explicitly unassigns the task. Only `undefined` means "absent" there. Merging this into a `!= null` check breaks unassigning. `src/mocks/task-store.ts:112-134`
- The `dueDate` filter is looser than the real API is likely to be. Tests that rely on it test an assumption, not a contract. `src/mocks/task-store.ts:58-61`
- The seed avatars deliberately point at the decommissioned `avatars.dicebear.com` host, and one user has `null`, to copy what the live API returns. Do not "clean them up" to `null`. They are tied to `src/lib/decommissioned-avatar.ts`. `src/mocks/task-fixtures.ts:44-72`
- `makeTask`'s default creator is `user-2` so that it exists in `SEED_USERS`. An earlier non-existent `user-0` made the owner filter match nothing. `src/mocks/task-fixtures.ts:35-39`
- The store is shared module state. Tests that mutate it depend on the `afterEach` `taskStore.reset()` in the setup file. `src/mocks/task-store.test.ts` also resets it in its own `beforeEach`. `vitest.setup.ts:70-73` `src/mocks/task-store.test.ts:18-20`
- The MSW browser chunk ships in the production bundle on purpose, so that `npm run preview` works with no token. Do not guard it with `import.meta.env.DEV`. `src/main.tsx:15-26`

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
