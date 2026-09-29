---
area: "api"
title: "api"
paths: ["api/"]
tree_hash: "fd955a83047e1315da2a7b484a2b62cd20e682c7"
built_at_sha: "ac7cb47c1e590616da040840cb26cb4e203d99f8"
built_at: "2026-09-26T21:58:14.483Z"
status: "ok"
summary: "`api/` is a single Vercel serverless function that proxies the app's GraphQL traffic to RAVN's shared backend, keeping the `API_TOKEN` credential server-side..."
generator: "ravn-agents/onboarding 0.1.0"
---

# api

> Codebase map page, built at `ac7cb47c1e59`. It says where to look; confirm every claim against the cited code before relying on it.

## Summary
`api/` is a single Vercel serverless function that proxies the app's GraphQL traffic to RAVN's
shared backend, keeping the `API_TOKEN` credential server-side instead of in the browser bundle.
It is the deployed counterpart of `src/graphql/client.ts` and `src/lib/env.ts`'s "proxied" mode. `api/graphql.ts:27-30`

## Key files
- `api/graphql.ts:1` — the whole proxy: builds an allowlist of the app's six GraphQL documents at
  module load, then exports the `POST` handler that validates, matches, forwards and re-shapes
  errors. Open this first for anything about the deployed API surface.
- `api/graphql.test.ts:1` — exercises the handler directly as a `Request`/`Response` function with
  a stubbed `fetch`, including the allowlist, size limits, and upstream failure remapping.
- `api/tsconfig.json:1` — a separate TS project (not part of the root `include`) because this file
  needs Node globals (`process`) that must never leak into `src/`'s browser-only type checking.

## How it works
- `ALLOWED_DOCUMENTS` maps each of the app's six generated documents (`TasksDocument`,
  `UsersDocument`, `ProfileDocument`, `CreateTaskDocument`, `UpdateTaskDocument`,
  `DeleteTaskDocument`), keyed by whitespace-collapsed query text, to the proxy's own copy of that
  text; only a caller's document that matches one of these keys is ever forwarded. `api/graphql.ts:126-138`
- `POST` runs cheap-to-expensive checks in order: missing `API_TOKEN` (500), wrong content type
  (415), declared/actual body size over `MAX_BODY_BYTES` (413), invalid JSON or missing `query`
  (400), then the document-allowlist match (400 if no match). `api/graphql.ts:186-253`
- On a match, only the *proxy's own* document text and the caller's `variables` are sent upstream
  with `Authorization: Bearer <token>` and a 10s `AbortSignal.timeout`; the caller's raw query text
  is never forwarded. `api/graphql.ts:261-273`
- Upstream status codes are preserved (so `src/graphql/client.ts` can narrow on 401/403 to stop
  retrying), but non-2xx bodies are replaced with a generic message, while a 2xx body — including
  a GraphQL `errors` array — is forwarded verbatim so the UI can render real validation errors. `api/graphql.ts:278-311`
- `vercel.json` rewrites everything except `/api/*` to `index.html` and sets the build-time
  `VITE_API_URL` to `/api/graphql`, which `src/lib/env.ts`'s `readApiConfig` reads as same-origin
  "proxied" mode requiring no client-side token. `vercel.json:7-11`

## Gotchas
- The import from `../src/graphql/generated/graphql.js` must keep the `.js` extension even though
  the file is `.ts`: Vercel's Node builder transpiles rather than bundles this file, and Node's
  ESM resolution at runtime needs the extension that `tsc`/Vite/Vitest happily ignore locally. `api/graphql.ts:1-16`
- The handler must stay a named `export async function POST`, not a default export: Vercel treats
  a default export as Node's `(req, res)` handler and silently hangs the request until timeout,
  ignoring the returned `Response`. `api/graphql.ts:170-185`
- The allowlist is keyed by full document text, not `operationName`, because a client-supplied
  `operationName` can be attached to any query text (e.g. an introspection query named `Tasks`) and
  says nothing about what will execute. `api/graphql.ts:97-101`
- Some HTTP statuses (101/103/204/205/304) forbid a response body, so `errorResponse` remaps them
  to 502 while keeping the original status in the message text, to avoid the `Response` constructor
  throwing and turning a benign upstream oddity into an opaque platform 500. `api/graphql.ts:140-168`

## Generated facts

Produced by code from the git tree at the stamped SHA; not written by a model.

### Files (3 total, 1 tests)

- `api/graphql.ts`
- `api/tsconfig.json`

### Exports (2)

- `UPSTREAM_URL` (const) `api/graphql.ts:58`
- `POST` (function) `api/graphql.ts:186`
