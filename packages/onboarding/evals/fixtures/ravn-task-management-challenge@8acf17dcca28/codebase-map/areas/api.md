---
area: "api"
title: "api"
paths: ["api/"]
tree_hash: "fd955a83047e1315da2a7b484a2b62cd20e682c7"
built_at_sha: "8acf17dcca28036fa99cf09408e3646901d6add1"
built_at: "2026-09-30T05:30:09.780Z"
status: "ok"
summary: "`api/` is one Vercel serverless function: a server-side GraphQL proxy at `/api/graphql` that holds RAVN's `API_TOKEN` so the browser bundle never carries it,..."
generator: "ravn-agents/onboarding 0.1.0"
---

# api

> Codebase map page, built at `8acf17dcca28`. It says where to look; confirm every claim against the cited code before relying on it.

## Summary
`api/` is one Vercel serverless function: a server-side GraphQL proxy at `/api/graphql` that holds RAVN's `API_TOKEN` so the browser bundle never carries it, and forwards only the six GraphQL documents the app itself sends. The frontend reaches it when `VITE_API_URL` is a same-origin path, which puts `readApiConfig` into its `proxied` mode. `api/graphql.ts:186` `src/lib/env.ts:94-98`

## Key files
- `api/graphql.ts:186` — the `POST` handler and all proxy logic: request checks, the allowlist, the upstream call and error mapping. Open it to change what the deployed API accepts or forwards.
- `api/graphql.ts:126-138` — `ALLOWED_DOCUMENTS`, built from the codegen documents in `src/graphql/generated/graphql.js`. Adding an operation to the app means adding it here too.
- `api/graphql.test.ts:82` — Vitest suites for forwarding, refusals (line 239) and a per-document check that every allowed operation still forwards (line 350).
- `api/tsconfig.json:1-11` — a separate TS project so this code gets Node `process` typings without leaking them into `src/`; `npm run typecheck` builds both.
- `src/lib/env.ts:72-75` — the client-side half: the `proxied` config mode that sends no token.

## How it works
- The order of checks is: missing `API_TOKEN` gives 500, then a non-`application/json` media type gives 415, then a declared `content-length` over 16 KB gives 413, then the body is read, then the actual length is checked (413), then JSON parse and `query` shape (400). `api/graphql.ts:187-243`
- The caller's `query` has its whitespace collapsed and is looked up in `ALLOWED_DOCUMENTS`. The proxy then forwards its own copy of the document, never the caller's text, with only `variables` carried over. `api/graphql.ts:245-271`
- The upstream is `UPSTREAM_URL` (RAVN's Railway endpoint), called with `Bearer ${token}` and `AbortSignal.timeout(10_000)`. A fetch rejection becomes 504. `api/graphql.ts:58` `api/graphql.ts:261-276`
- On a non-2xx upstream reply, the proxy keeps the status but replaces the body with a generic message. A 2xx body is passed through verbatim with status 200, including GraphQL `errors` arrays. `api/graphql.ts:278-311`
- Every proxy-generated failure goes through `errorResponse` as `{ errors: [{ message }] }`, the shape `src/graphql/client.ts` already renders. `api/graphql.ts:163-168`

## Gotchas
- The import must end in `.js`: Vercel transpiles the file without bundling it, so an extensionless relative import breaks at runtime with `ERR_MODULE_NOT_FOUND`. Vite, Vitest and `tsc` do not catch this. `api/graphql.ts:8-16`
- The handler must stay a named `POST` export. A default export is treated as a Node `(req, res)` handler, its returned `Response` is ignored, and the request hangs. The named export also makes the platform refuse other HTTP methods. `api/graphql.ts:170-185`
- The token variable is `API_TOKEN` with no `VITE_` prefix on purpose: with the prefix, Vite would inline it into `dist/`. `api/graphql.ts:32-33`
- A document that is not on the allowlist gets 400, not 403, because `client.ts` treats 401/403 as a rejected credential and stops retrying. `api/graphql.ts:247-252`
- Matching normalises only whitespace. A comment, a comma or one extra field changes the key, so any edit to a client document fails until it matches the generated one. `api/graphql.ts:103-108`
- Upstream statuses that cannot carry a body (such as 304) are remapped to 502, because otherwise the `Response` constructor throws. `api/graphql.ts:150` `api/graphql.ts:165`
- The upstream body is read inside its own `try`, because a stream that stalls mid-read would otherwise escape as Vercel's opaque 500. `api/graphql.ts:293-298`
- The proxy has no rate limiting and no CORS headers, and variables are not validated: `DeleteTask` with any id still goes through. `api/graphql.ts:47-54`

## Generated facts

Produced by code from the git tree at the stamped SHA; not written by a model.

### Files (3 total, 1 tests)

- `api/graphql.ts`
- `api/tsconfig.json`

### Exports (2)

- `UPSTREAM_URL` (const) `api/graphql.ts:58`
- `POST` (function) `api/graphql.ts:186`
