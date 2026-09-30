---
area: "src-graphql"
title: "src/graphql"
paths: ["src/graphql/"]
tree_hash: "28e29b82a19042985c540dc5665c7657b72edbc4"
built_at_sha: "ac7cb47c1e590616da040840cb26cb4e203d99f8"
built_at: "2026-09-30T05:28:33.367Z"
status: "ok"
summary: "The app's GraphQL layer."
generator: "ravn-agents/onboarding 0.1.0"
---

# src/graphql

> Codebase map page, built at `ac7cb47c1e59`. It says where to look; confirm every claim against the cited code before relying on it.

## Summary
The app's GraphQL layer. It holds the hand-written operations, the codegen output typed against the committed `schema.graphql`, and a small `fetch`-based transport (`request`) that the React Query hooks in `features/board` and `features/profile` call. It has no GraphQL client library, because React Query owns caching. `src/graphql/client.ts:4-17` `src/graphql/client.ts:64`

## Key files
- `src/graphql/operations/tasks.graphql:1` — the only operations file: fragments `TaskFields` and `UserFields`, queries `Tasks`, `Users`, `Profile`, and mutations `CreateTask`, `UpdateTask`, `DeleteTask`. Edit this file when a screen needs a new field or operation.
- `src/graphql/client.ts:64` — `request(document, variables)`, the single transport function. `ApiError` at `src/graphql/client.ts:40` is the one error type the UI renders.
- `src/graphql/domain.ts:31-33` — domain aliases (`Task`, `User`, `Status`, `TaskTag`, `PointEstimate`, `UserType`) over the generated types. `mocks/`, `features/profile` and `app/` import these.
- `src/graphql/generated/graphql.ts:112` — generated: the `TypedDocumentString` class plus the `*Document` constants (e.g. `TasksDocument` at `src/graphql/generated/graphql.ts:167`) and the input/result types. Do not hand-edit; run `npm run codegen` (`package.json:30`).
- `codegen.ts:11-49` — codegen config (outside this dir). It reads `./schema.graphql` and `src/**/*.graphql` and writes to `src/graphql/generated/`.
- `src/graphql/client.test.ts:8` — tests for `request`: error mapping, wire format, and headers in direct vs proxied mode (`src/graphql/client.test.ts:120`).
- `src/graphql/graphql-stays-out-of-the-bundle.test.ts:46-57` — an architectural test that fails if any file under `src/` imports the `graphql` package.

## How it works
- Feature hooks call `request(XDocument, { input })`, e.g. `use-tasks.ts` with `TasksDocument`. The phantom type parameters on `TypedDocumentString` tie the variables and the result to the document at compile time. `src/graphql/client.ts:55-67`
- Codegen runs with `documentMode: 'string'`, so each document is already query text and is sent as `String(document)` with no `print()`. `codegen.ts:45` `src/graphql/client.ts:85`
- Auth depends on `apiConfig.mode` from `@/lib/env`. In `direct` mode a `Bearer` token header is added. In `proxied` mode no header is sent and the server holds the credential. `src/graphql/client.ts:78`
- Error handling runs in this order: a network throw means "Could not reach the server"; then 401/403 means unauthenticated; then a JSON parse failure; then the first `errors[]` entry (the code `UNAUTHENTICATED` is flagged); then a non-OK status; then null `data`. `src/graphql/client.ts:87-127`
- `ApiError.isUnauthenticated` has two consumers. The query client's `retry` stops retrying on it, and `AsyncSection` hides its retry button. `src/app/query-client.ts:17-22` `src/graphql/client.ts:41`
- `fragmentMasking: false` makes fragment types plain object shapes, so `Task = TaskFieldsFragment` includes nested `assignee`/`creator` users. `codegen.ts:24` `src/graphql/generated/graphql.ts:70`
- `DateTime` is mapped to `string`, so dates arrive as ISO strings. `codegen.ts:30`

## Gotchas
- Never import `graphql` (or any subpath of it) in `src/`. The package is a devDependency only for `scripts/check-schema.mjs`, and the regex test enforces the rule; the bundle byte budget alone would not reliably catch it. `src/graphql/graphql-stays-out-of-the-bundle.test.ts:24-32`
- GraphQL errors are checked before `response.ok` because they carry a message worth showing. Reordering these checks changes the error text users see. `src/graphql/client.ts:113-123`
- The auth message changes by mode. Proxied deploys must not tell visitors to check a `.env`. `src/graphql/client.ts:27-30`
- `apiUrl` is always a real URL. Without a token it points at the MSW mock host, so tests exercise the same code path as production. `src/graphql/client.ts:14-16`
- Column/tag orderings (`BOARD_STATUSES`, `ALL_TAGS`) intentionally live in `features/board/task-types.ts`, not in `domain.ts`. `src/graphql/domain.ts:25-29`
- `generated/gql.ts` and `generated/index.ts` are client-preset leftovers. The app imports `@/graphql/generated/graphql` directly, not the `graphql()` helper. `src/graphql/generated/gql.ts:30-32`

## Generated facts

Produced by code from the git tree at the stamped SHA; not written by a model.

### Files (8 total, 2 tests)

- `src/graphql/client.ts`
- `src/graphql/domain.ts`
- `src/graphql/generated/gql.ts`
- `src/graphql/generated/graphql.ts`
- `src/graphql/generated/index.ts`
- `src/graphql/operations/tasks.graphql`

### Entry points

- `src/graphql/generated/index.ts`

### Exports (38)

- `ApiError` (class) `src/graphql/client.ts:40`
- `request` (function) `src/graphql/client.ts:64`
- `Task` (type) `src/graphql/domain.ts:32`
- `User` (type) `src/graphql/domain.ts:33`
- `graphql` (function) `src/graphql/generated/gql.ts:27`
- `graphql` (function) `src/graphql/generated/gql.ts:30`
- `Incremental` (type) `src/graphql/generated/graphql.ts:5`
- `CreateTaskInput` (type) `src/graphql/generated/graphql.ts:7`
- `DeleteTaskInput` (type) `src/graphql/generated/graphql.ts:16`
- `FilterTaskInput` (type) `src/graphql/generated/graphql.ts:20`
- `PointEstimate` (type) `src/graphql/generated/graphql.ts:31`
- `Status` (type) `src/graphql/generated/graphql.ts:39`
- `TaskTag` (type) `src/graphql/generated/graphql.ts:47`
- `UpdateTaskInput` (type) `src/graphql/generated/graphql.ts:54`
- `UserType` (type) `src/graphql/generated/graphql.ts:66`
- `TaskFieldsFragment` (type) `src/graphql/generated/graphql.ts:70`
- `UserFieldsFragment` (type) `src/graphql/generated/graphql.ts:72`
- `TasksQueryVariables` (type) `src/graphql/generated/graphql.ts:74`
- `TasksQuery` (type) `src/graphql/generated/graphql.ts:79`
- `UsersQueryVariables` (type) `src/graphql/generated/graphql.ts:81`
- `UsersQuery` (type) `src/graphql/generated/graphql.ts:84`
- `ProfileQueryVariables` (type) `src/graphql/generated/graphql.ts:86`
- `ProfileQuery` (type) `src/graphql/generated/graphql.ts:89`
- `CreateTaskMutationVariables` (type) `src/graphql/generated/graphql.ts:91`
- `CreateTaskMutation` (type) `src/graphql/generated/graphql.ts:96`
- `UpdateTaskMutationVariables` (type) `src/graphql/generated/graphql.ts:98`
- `UpdateTaskMutation` (type) `src/graphql/generated/graphql.ts:103`
- `DeleteTaskMutationVariables` (type) `src/graphql/generated/graphql.ts:105`
- `DeleteTaskMutation` (type) `src/graphql/generated/graphql.ts:110`
- `TypedDocumentString` (class) `src/graphql/generated/graphql.ts:112`
- `UserFieldsFragmentDoc` (const) `src/graphql/generated/graphql.ts:130`
- `TaskFieldsFragmentDoc` (const) `src/graphql/generated/graphql.ts:141`
- `TasksDocument` (const) `src/graphql/generated/graphql.ts:167`
- `UsersDocument` (const) `src/graphql/generated/graphql.ts:198`
- `ProfileDocument` (const) `src/graphql/generated/graphql.ts:213`
- `CreateTaskDocument` (const) `src/graphql/generated/graphql.ts:228`
- `UpdateTaskDocument` (const) `src/graphql/generated/graphql.ts:259`
- `DeleteTaskDocument` (const) `src/graphql/generated/graphql.ts:290`
