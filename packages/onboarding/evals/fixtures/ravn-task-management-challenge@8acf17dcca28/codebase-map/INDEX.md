---
built_at_sha: "8acf17dcca28036fa99cf09408e3646901d6add1"
built_at: "2026-09-30T05:30:09.780Z"
areas: 14
generator: "ravn-agents/onboarding 0.1.0"
---
# Codebase map

Built at `8acf17dcca28` on 2026-09-30 by ravn-agents/onboarding 0.1.0.
This map is a router, not a source of truth: it tells you which files to read. Confirm any
claim against the cited code, and prefer the code when the two disagree. It is never loaded
automatically; reach it through the `ask-codebase` skill. Refresh with `/ravn-agents:onboard --refresh`.

## Areas

| Area | Paths | What lives there | Page |
|---|---|---|---|
| api | `api/` | `api/` is one Vercel serverless function: a server-side GraphQL proxy at `/api/graphql` that holds RAVN's `API_TOKEN` so the browser bundle never carries it,... | [api](areas/api.md) |
| .claude | `.claude/` | `.claude/` is the Claude Code configuration for this repo. | [claude](areas/claude.md) |
| docs | `docs/` | Prose design notes plus README screenshots. | [docs](areas/docs.md) |
| e2e | `e2e/` | Playwright browser tests that run against a real Vercel deployment, never a local dev server. | [e2e](areas/e2e.md) |
| .github | `.github/` | GitHub configuration for the repository: three Actions workflows (CI, dependency review, and a Playwright E2E run against Vercel deployments), Dependabot con... | [github](areas/github.md) |
| Repository root | `*` `public/` | The repository root holds the build, lint, test, codegen and deploy configuration for a React 19 + Vite 8 task board (the RAVN challenge), plus `CLAUDE.md`,... | [root](areas/root.md) |
| scripts | `scripts/` | Standalone Node and Bash tooling that sits beside the app rather than inside it: a schema-drift check against the live GraphQL API, a post-build Tailwind `@s... | [scripts](areas/scripts.md) |
| src/app | `src/app/` | `src/app` is the application shell. | [src-app](areas/src-app.md) |
| src/features | `src/features/` | `src/features` holds the app's three product features. | [src-features](areas/src-features.md) |
| src/graphql | `src/graphql/` | `src/graphql/` is the app's GraphQL layer. | [src-graphql](areas/src-graphql.md) |
| src/lib | `src/lib/` | `src/lib` holds the app's small shared utilities, imported via `@/lib/...` by `src/graphql`, `src/features` and `src/ui`. | [src-lib](areas/src-lib.md) |
| src/mocks | `src/mocks/` | `src/mocks` is the MSW fake of the RAVN challenge GraphQL API. | [src-mocks](areas/src-mocks.md) |
| src/ui | `src/ui/` | `src/ui` holds the app's shared, feature-agnostic React building blocks: a loading/error/ready wrapper (`AsyncSection`), an empty-state panel, a render error... | [src-ui](areas/src-ui.md) |
| src (top level) | `src/*` `src/shared/` `src/styles/` `src/test/` | The top level of `src/` holds the app bootstrap (`main.tsx`), the env typings, the global Tailwind stylesheet, one shared hook and the test render helpers. | [src](areas/src.md) |

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
