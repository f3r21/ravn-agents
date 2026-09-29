---
built_at_sha: "ac7cb47c1e590616da040840cb26cb4e203d99f8"
built_at: "2026-09-26T21:58:14.483Z"
areas: 14
generator: "ravn-agents/onboarding 0.1.0"
---
# Codebase map

Built at `ac7cb47c1e59` on 2026-09-26 by ravn-agents/onboarding 0.1.0.
This map is a router, not a source of truth: it tells you which files to read. Confirm any
claim against the cited code, and prefer the code when the two disagree. It is never loaded
automatically; reach it through the `ask-codebase` skill. Refresh with `/ravn-agents:onboard --refresh`.

## Areas

| Area | Paths | What lives there | Page |
|---|---|---|---|
| api | `api/` | `api/` is a single Vercel serverless function that proxies the app's GraphQL traffic to RAVN's shared backend, keeping the `API_TOKEN` credential server-side... | [api](areas/api.md) |
| .claude | `.claude/` | `.claude/` configures how Claude Code (and any agent session) behaves in this repository: hooks that enforce safety and formatting on every tool call, slash... | [claude](areas/claude.md) |
| docs | `docs/` | This is the repository's hand-written reference documentation — three long-form design-decision essays plus the screenshots README embeds — covering deployme... | [docs](areas/docs.md) |
| e2e | `e2e/` | This directory holds Playwright's config and a single spec file that drive a real, deployed instance of the app (a Vercel preview) rather than local dev, bec... | [e2e](areas/e2e.md) |
| .github | `.github/` | This area is the repository's GitHub configuration: CI/CD workflows, Dependabot policy, and PR/issue templates. | [github](areas/github.md) |
| Repository root | `*` `public/` | This is the repository root of a React 19 + TypeScript task-management dashboard (a RAVN take-home challenge) built with Vite, TanStack Query over GraphQL, a... | [root](areas/root.md) |
| scripts | `scripts/` | `scripts/` holds standalone Node and shell tools that support the repo but stay out of `npm run gate`: schema-drift and Tailwind-scan checks, figure-generati... | [scripts](areas/scripts.md) |
| src/app | `src/app/` | `src/app/` is the composition root: it wires the router, error/query providers, and the page-level components that combine features from `src/features/`. | [src-app](areas/src-app.md) |
| src/features | `src/features/` | `src/features` holds the app's three domain areas — `board`, `navigation`, `profile` — each a self-contained slice of hooks, mappers and components with no c... | [src-features](areas/src-features.md) |
| src/graphql | `src/graphql/` | `src/graphql` is the app's GraphQL transport and typed vocabulary: a hand-written `fetch`-based client, domain type aliases, and codegen output generated fro... | [src-graphql](areas/src-graphql.md) |
| src/lib | `src/lib/` | `src/lib/` holds small, dependency-light utilities shared across the app: date/time formatting for due dates, Tailwind class merging, env-var validation, exh... | [src-lib](areas/src-lib.md) |
| src/mocks | `src/mocks/` | `src/mocks` is an MSW-based fake GraphQL backend: it backs both the dev server (when no API token is configured) and the whole Vitest suite, so the client co... | [src-mocks](areas/src-mocks.md) |
| src/ui | `src/ui/` | `src/ui/` holds small, shared presentational components — a query status wrapper, an empty-state block, a class-based error boundary and a toast system — use... | [src-ui](areas/src-ui.md) |
| src (top level) | `src/*` `src/shared/` `src/styles/` `src/test/` | This is the top level of the source tree: the app's real entry point plus the handful of cross-cutting helpers (`src/shared/`, `src/test/`) and the global st... | [src](areas/src.md) |

## Entry points

- `index.html -> /src/main.tsx`
- `src/main.tsx`

## Commands (root package.json)

- `dev`: `vite` `package.json:19`
- `build`: `npm run typecheck && vite build` `package.json:20`
- `preview`: `vite preview` `package.json:21`
- `test`: `vitest run` `package.json:22`
- `test:watch`: `vitest` `package.json:23`
- `test:e2e`: `playwright test --config e2e/playwright.config.ts` `package.json:24`
- `coverage`: `vitest run --coverage` `package.json:25`
- `typecheck`: `tsc --noEmit && tsc --noEmit -p api && tsc --noEmit -p e2e` `package.json:26`
- `lint`: `eslint .` `package.json:27`
- `format`: `prettier --write .` `package.json:28`
- `format:check`: `prettier --check .` `package.json:29`
- `codegen`: `graphql-codegen` `package.json:30`
- `schema:check`: `node scripts/check-schema.mjs` `package.json:31`
- `css:canary`: `node scripts/check-source-canary.mjs` `package.json:32`
- `assertions`: `node scripts/count-assertions.mjs` `package.json:33`
- `comments`: `node scripts/count-comments.mjs` `package.json:34`
- `gate`: `npm run typecheck && npm run lint && npm run format:check && npm run coverage` `package.json:35`
