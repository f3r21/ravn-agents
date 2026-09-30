---
built_at_sha: "ac7cb47c1e590616da040840cb26cb4e203d99f8"
built_at: "2026-09-30T05:28:33.367Z"
areas: 14
generator: "ravn-agents/onboarding 0.1.0"
---
# Codebase map

Built at `ac7cb47c1e59` on 2026-09-30 by ravn-agents/onboarding 0.1.0.
This map is a router, not a source of truth: it tells you which files to read. Confirm any
claim against the cited code, and prefer the code when the two disagree. It is never loaded
automatically; reach it through the `ask-codebase` skill. Refresh with `/ravn-agents:onboard --refresh`.

## Areas

| Area | Paths | What lives there | Page |
|---|---|---|---|
| api | `api/` | `api/` is a single Vercel serverless function: the server-side GraphQL proxy that the deployed app posts to at `/api/graphql`. | [api](areas/api.md) |
| .claude | `.claude/` | `.claude/` is the Claude Code configuration for this repo: project settings with two shell hooks, five slash commands that hold the project's process rituals... | [claude](areas/claude.md) |
| docs | `docs/` | Prose design notes plus README screenshots. | [docs](areas/docs.md) |
| e2e | `e2e/` | Playwright tests that drive a real deployment (a Vercel URL), not the dev server. | [e2e](areas/e2e.md) |
| .github | `.github/` | GitHub configuration for the repository: three Actions workflows (CI gate, dependency review, post-deploy E2E), Dependabot settings, and the PR and issue tem... | [github](areas/github.md) |
| Repository root | `*` `public/` | The repository root holds the toolchain and deployment config for a React 19 + Vite task board that uses TanStack Query over the RAVN GraphQL API. | [root](areas/root.md) |
| scripts | `scripts/` | `scripts/` holds the repository's standalone Node and Bash tooling. | [scripts](areas/scripts.md) |
| src/app | `src/app/` | `src/app/` is the composition layer of the React SPA. | [src-app](areas/src-app.md) |
| src/features | `src/features/` | `src/features` holds the app's three feature slices. | [src-features](areas/src-features.md) |
| src/graphql | `src/graphql/` | The app's GraphQL layer. | [src-graphql](areas/src-graphql.md) |
| src/lib | `src/lib/` | `src/lib` holds the app's small shared helpers with no feature ownership: env/API-mode resolution, UTC due-date maths and formatting, compile-time exhaustive... | [src-lib](areas/src-lib.md) |
| src/mocks | `src/mocks/` | The MSW (Mock Service Worker) fake of RAVN's GraphQL challenge API. | [src-mocks](areas/src-mocks.md) |
| src/ui | `src/ui/` | `src/ui/` holds the app's shared building blocks, used across features: a loading/error/ready wrapper for React Query results, an empty-state block, a render... | [src-ui](areas/src-ui.md) |
| src (top level) | `src/*` `src/shared/` `src/styles/` `src/test/` | The top level of `src/` holds the browser bootstrap (`main.tsx`), which starts the MSW mock worker when needed and then mounts `<App />`. | [src](areas/src.md) |

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
