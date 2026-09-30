---
area: "api"
title: "api"
paths: ["api/"]
tree_hash: "fd955a83047e1315da2a7b484a2b62cd20e682c7"
built_at_sha: "ac7cb47c1e590616da040840cb26cb4e203d99f8"
built_at: "2026-09-30T05:28:33.367Z"
status: "ok"
summary: "`api/` is a single Vercel serverless function: the server-side GraphQL proxy that the deployed app posts to at `/api/graphql`."
generator: "ravn-agents/onboarding 0.1.0"
---

# api

> Codebase map page, built at `ac7cb47c1e59`. It says where to look; confirm every claim against the cited code before relying on it.

## Summary
`api/` is a single Vercel serverless function: the server-side GraphQL proxy that the deployed app posts to at `/api/graphql`. It attaches RAVN's `API_TOKEN` so the credential never ships in `dist/`, and it forwards only the six operations the app itself sends. `api/graphql.ts:18-55` `api/graphql.ts:186`

## Key files
- `api/graphql.ts:186` — the `POST` handler: validation, allowlist lookup, upstream `fetch` and error mapping. Open it for any deployed-API failure or when adding a GraphQL operation.
- `api/graphql.ts:126-138` — `ALLOWED_DOCUMENTS`, built from the codegen documents in `src/graphql/generated/graphql.js`.
- `api/graphql.test.ts:350-381` — derives the operations from the generated module, so a new operation fails the test until it is allowlisted.
- `api/tsconfig.json:1-11` — a separate TS project that gives this code `node` types (`process`) while keeping them out of `src/`.
- `src/lib/env.ts:87-98` — the client side: `readApiConfig` returns `proxied` mode for a same-origin `VITE_API_URL` and drops any token.

## How it works
- Checks run cheapest first: missing `API_TOKEN` gives 500, a non-JSON media type 415, a declared `content-length` over 16 KB 413, then the body is read and its length checked again, then JSON and query shape are validated (400). `api/graphql.ts:186-243`
- The query is matched by whitespace-collapsed text against the allowlist. The proxy sends its own copy of the document plus the caller's `variables`. `operationName` and `extensions` are dropped. `api/graphql.ts:245-271`
- The upstream call goes to `UPSTREAM_URL` with a `Bearer` token and `AbortSignal.timeout(10_000)`. A throw becomes 504. `api/graphql.ts:58` `api/graphql.ts:261-276`
- On a non-2xx upstream response the status is kept but the body is replaced, so `client.ts` can still narrow on 401/403. `api/graphql.ts:278-284`
- On success the upstream body goes back verbatim with status 200, including any GraphQL `errors` array. `api/graphql.ts:293-311`
- Every error is JSON `{ errors: [{ message }] }`, the shape `src/graphql/client.ts` already renders. `api/graphql.ts:163-168`

## Gotchas
- The generated import must keep its `.js` extension. The file is transpiled, not bundled, under `"type": "module"`, so an extensionless import is `ERR_MODULE_NOT_FOUND` at runtime, and neither Vite, Vitest nor tsc will catch it. `api/graphql.ts:8-16`
- The handler must be exported as a named `POST`, not as a default export. With a default export Vercel uses the Node `(req, res)` signature, ignores the returned `Response` and leaves requests hanging. The named export also makes the platform refuse every other method. `api/graphql.ts:170-186`
- Any change to a document's text (a comment, a comma, an extra field) changes its allowlist key, and the proxy refuses it. `api/graphql.ts:103-108`
- A disallowed operation returns 400, not 403, because `client.ts` treats 401/403 as a rejected token and stops retrying. `api/graphql.ts:246-253`
- The env var is `API_TOKEN` with no `VITE_` prefix on purpose: a prefix would inline it into the bundle. `api/graphql.ts:32-33`
- Null-body statuses from upstream (such as 304) are remapped to 502 so the `Response` constructor does not throw. `api/graphql.ts:150` `api/graphql.ts:165`
- Reading the upstream body is wrapped in its own `try`, because a stall mid-stream would otherwise escape as Vercel's opaque 500. `api/graphql.ts:286-298`

## Generated facts

Produced by code from the git tree at the stamped SHA; not written by a model.

### Files (3 total, 1 tests)

- `api/graphql.ts`
- `api/tsconfig.json`

### Exports (2)

- `UPSTREAM_URL` (const) `api/graphql.ts:58`
- `POST` (function) `api/graphql.ts:186`
