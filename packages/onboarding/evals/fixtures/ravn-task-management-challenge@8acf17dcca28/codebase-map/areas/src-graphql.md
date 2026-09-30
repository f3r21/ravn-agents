---
area: "src-graphql"
title: "src/graphql"
paths: ["src/graphql/"]
tree_hash: "28e29b82a19042985c540dc5665c7657b72edbc4"
built_at_sha: "8acf17dcca28036fa99cf09408e3646901d6add1"
built_at: "2026-09-30T05:30:09.780Z"
status: "ok"
summary: "`src/graphql/` is the app's GraphQL layer."
generator: "ravn-agents/onboarding 0.1.0"
---

# src/graphql

> Codebase map page, built at `8acf17dcca28`. It says where to look; confirm every claim against the cited code before relying on it.

## Summary
`src/graphql/` is the app's GraphQL layer. It holds a hand-written `fetch` transport (`request`, `ApiError`), domain type aliases, the one `.graphql` operations file, and the codegen output in `generated/`. `generated/` is produced by `npm run codegen` from `codegen.ts` and should not be edited by hand. Feature hooks under `src/features/` and the MSW mocks under `src/mocks/` import from here. `src/graphql/client.ts:64` `codegen.ts:11-49`

## Key files
- `src/graphql/client.ts:64` — `request(document, variables)`, the only transport; open it when you debug request headers, auth, or how errors are shaped.
- `src/graphql/client.ts:40` — `ApiError` with `isUnauthenticated`; `src/app/query-client.ts:18` reads that flag to stop retrying.
- `src/graphql/operations/tasks.graphql:1-62` — every operation: fragments `TaskFields`/`UserFields`, queries `Tasks`, `Users`, `Profile`, and mutations `CreateTask`, `UpdateTask`, `DeleteTask`. To add or change an operation, edit this file and re-run codegen.
- `src/graphql/domain.ts:31-33` — `Task`, `User` and enum aliases over the generated fragment types; `@/graphql/domain` is the canonical import path for these.
- `src/graphql/generated/graphql.ts:112` — generated `TypedDocumentString` class plus `*Document` constants such as `TasksDocument` at `src/graphql/generated/graphql.ts:167`. Generated code; do not edit.
- `codegen.ts:12-45` — codegen config: `schema.graphql` read from the committed file, `fragmentMasking: false`, `DateTime` mapped to `string`, `documentMode: 'string'`.
- `src/graphql/client.test.ts:120` — tests for error mapping and for what reaches the network in `direct` and `proxied` modes.
- `src/graphql/graphql-stays-out-of-the-bundle.test.ts:46-57` — fails if any file under `src/` imports the `graphql` package.

## How it works
- Callers pass a generated document and its variables, for example `request(TasksDocument, { input })`. The phantom types on `TypedDocumentString` type both the variables and the result, so a mismatch is a compile error. `src/graphql/client.ts:55-67` `src/features/board/use-tasks.ts:2-3`
- The request body is `String(document)`, the operation text itself. `print()` is never called, so the `graphql` package stays out of the bundle. `src/graphql/client.ts:80-85` `codegen.ts:31-45`
- An `Authorization: Bearer` header is added only when `apiConfig.mode === 'direct'`. In `proxied` mode the server holds the token and no header is sent. `src/graphql/client.ts:74-78`
- The client checks responses in this order: a network throw gives "Could not reach the server"; 401 or 403 gives an unauthenticated `ApiError`; a JSON parse failure reports the status code; `errors[0]` (with `UNAUTHENTICATED` detection) is checked before `response.ok`; missing `data` raises "returned no data". `src/graphql/client.ts:87-129`
- The auth message depends on the mode. A proxied deploy never tells the visitor to check `.env`. `src/graphql/client.ts:27-30` `src/graphql/client.test.ts:169-180`
- When no API token is configured, the URL points at the mock host that MSW intercepts, so tests exercise the same code path as production. `src/graphql/client.ts:14-16` `src/graphql/client.test.ts:9-13`

## Gotchas
- Do not add `import ... from 'graphql'` anywhere in `src/`. A test enforces this rule. Without it, only the CI byte budget would catch the regression. `src/graphql/graphql-stays-out-of-the-bundle.test.ts:9-22`
- If you switch codegen back to `documentNode`, the client would post a serialised AST. A wire-format test catches this, but the MSW `graphql.query` handlers alone would not. `src/graphql/client.test.ts:63-82`
- `generated/gql.ts` keys its `graphql()` map on the entire contents of `tasks.graphql` as one string. The app imports the `*Document` constants directly and never calls `graphql()`. `src/graphql/generated/gql.ts:17-31`
- UI orderings such as `BOARD_STATUSES` deliberately live in `features/board/task-types.ts`, not in `domain.ts`, because they are board policy and not API vocabulary. `src/graphql/domain.ts:25-29`
- Schema changes go through the committed `schema.graphql`, not the live API. `scripts/check-schema.mjs` (`npm run schema:check`) compares against the live API. `codegen.ts:3-12` `package.json:30-31`

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
