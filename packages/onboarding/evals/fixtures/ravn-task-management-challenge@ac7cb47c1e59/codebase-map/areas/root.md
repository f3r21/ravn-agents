---
area: "root"
title: "Repository root"
paths: ["*","public/"]
tree_hash: "313620a324fb4c1eec44484ab7f6f96f25416006"
built_at_sha: "ac7cb47c1e590616da040840cb26cb4e203d99f8"
built_at: "2026-09-26T21:58:14.483Z"
status: "ok"
summary: "This is the repository root of a React 19 + TypeScript task-management dashboard (a RAVN take-home challenge) built with Vite, TanStack Query over GraphQL, a..."
generator: "ravn-agents/onboarding 0.1.0"
---

# Repository root

> Codebase map page, built at `ac7cb47c1e59`. It says where to look; confirm every claim against the cited code before relying on it.

## Summary
This is the repository root of a React 19 + TypeScript task-management dashboard (a RAVN
take-home challenge) built with Vite, TanStack Query over GraphQL, and the external
`@ravn/ui-kit` package. `index.html:24` boots `src/main.tsx`, and the files here configure the
build, lint, type, test and deploy toolchain the app under `src/` runs through. `package.json:2`

## Key files
- `package.json:1` — scripts (`dev`, `build`, `gate`, `codegen`, `schema:check`, ...), the
  runtime/dev dependency lists, and the `browserslist` array that both `vite.config.ts` and
  `eslint.config.js` derive their browser floor from.
- `vite.config.ts:106` — the app's Vite/Vitest config: derives `build.target` from
  `browserslist` (`vite.config.ts:43-104`), sets Rolldown `codeSplitting` groups for
  react/react-aria/query chunks (`vite.config.ts:131-138`), dedupes React/React Aria for a
  future local `@ravn/ui-kit` checkout (`vite.config.ts:195`), and configures the Vitest
  environment, `TZ: 'Pacific/Kiritimati'`, and 85% coverage thresholds (`vite.config.ts:197-291`).
- `eslint.config.js:203` — the flat ESLint config: type-checked TS rules, a generated
  `eslint-plugin-compat` browser-floor check plus a hand-built `no-restricted-properties` list
  for static Web APIs the plugin misses (`eslint.config.js:124-170`), and the layering rules
  that ban cross-feature imports and the generated GraphQL barrel (`eslint.config.js:264-387`).
- `codegen.ts:11` — GraphQL Code Generator config; reads the committed `schema.graphql` (not a
  live URL) and writes typed, string-mode documents into `src/graphql/generated/`.
- `CLAUDE.md:1` — process/invariant summary for agents: `gate` is the quality bar, generated
  types are the domain model, no barrels/test-ids/`any`, and `.claude/rules/` holds the rest.
- `vitest.setup.ts:33` — global test setup: fakes only `Date` at a fixed instant
  (`vitest.setup.ts:33-92`), fails any test that logs `console.error`/`console.warn`
  (`vitest.setup.ts:65-121`), and starts/reset the MSW `server` and `taskStore` around each test.
- `tsconfig.json:1` — strict compiler options, the `@/*` -> `src/*` path alias, and the
  `include` list that deliberately excludes `vite.config.ts` (`tsconfig.json:30-35`).
- `vercel.json:1` — deployment config: proxies `/api/graphql`, rewrites all non-`/api` routes to
  `index.html` for the SPA router, and sets `X-Content-Type-Options`/`Referrer-Policy` headers.
- `.corvusrc:1` — declares which onboarding skills apply to this repo and their weights.

## How it works
- `npm run build` runs `typecheck` before `vite build` (`package.json:20`), and `typecheck`
  itself type-checks the app, `api/`, and `e2e/` as three separate `tsc` projects
  (`package.json:26`); `npm run gate` chains typecheck, lint, format:check and coverage and is
  the bar CI enforces (`package.json:35`, `CLAUDE.md:10`).
- The browser floor is single-sourced from `browserslist` in `package.json:11-17` and converted
  independently by `vite.config.ts:67-104` (into `build.target`) and `eslint.config.js:32-59`
  (into MDN compat-data lookups), so the build's syntax floor and the lint's API floor cannot
  silently diverge.
- `codegen.ts:12` reads `schema.graphql` from disk to generate `src/graphql/generated/`; the
  package script `schema:check` (`package.json:31`) instead compares that committed schema
  against the live API to catch drift.
- ESLint bans importing `@/graphql/generated` directly (`eslint.config.js:172-199`) and bans
  `@/features/*` cross-imports outside `src/app/` and two named exemptions in
  `src/features/navigation/` (`eslint.config.js:264-387`), enforcing the layering CLAUDE.md
  describes in prose.
- Vitest is configured with `VITE_API_URL`/`VITE_API_TOKEN` pinned to empty strings and
  `TZ: Pacific/Kiritimati` so the suite always runs against the mock backend and is insulated
  from local-timezone due-date bugs (`vite.config.ts:217-246`).

## Gotchas
- `vite.config.ts` is intentionally excluded from `tsconfig.json`'s `include` because Vitest
  bundles its own copy of Vite, which otherwise produces a spurious `Plugin` type clash
  (`tsconfig.json:30-34`); `eslint.config.js:241` compensates by listing it under
  `allowDefaultProject` for typed linting.
- `no-restricted-imports` for the generated barrel uses `paths`, not `patterns`, because a
  gitignore-style `patterns` glob on a bare directory name matched every real
  `@/graphql/generated/graphql` import too (`eslint.config.js:172-199`).
- `vite.config.ts` build output deliberately does not exclude the MSW mock chunk from the
  250 kB `chunkSizeWarningLimit`; it is shipped on purpose and CI's bundle budget skips it by
  name instead (`vite.config.ts:142-153`).
- `vitest.setup.ts` fails a test that merely logs `console.error`/`console.warn`, and the
  gate is reinstalled every `beforeEach` (not once) because `restoreMocks` is not set, so a
  leaked `vi.spyOn` from one test would otherwise silently disable the gate for the rest of the
  file (`vitest.setup.ts:46-51`).
- `Closes #<n>` in a PR description has no effect here because GitHub only auto-closes issues
  on merge to the default branch, and `main` (not `dev`) is that branch (`CLAUDE.md:37-38`).

## Generated facts

Produced by code from the git tree at the stamped SHA; not written by a model.

### Files (23 total, 0 tests)

- `.corvusrc`
- `.env.example`
- `.gitignore`
- `.mcp.json`
- `.nvmrc`
- `.prettierignore`
- `.prettierrc.json`
- `.vercelignore`
- `CLAUDE.md`
- `LICENSE`
- `README.md`
- `codegen.ts`
- `eslint.config.js`
- `index.html`
- `package-lock.json`
- `package.json`
- `public/favicon.svg`
- `public/mockServiceWorker.js`
- `schema.graphql`
- `tsconfig.json`
- `vercel.json`
- `vite.config.ts`
- `vitest.setup.ts`

### Entry points

- `index.html -> /src/main.tsx`

### Package `package.json` (ravn-task-management-challenge)


Scripts:

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

Dependencies: `@internationalized/date@^3.12.3`, `@ravn/ui-kit@github:f3r21/ravn-ui-kit#v0.9.0`, `@tanstack/react-query@^5.101.4`, `clsx@^2.1.1`, `date-fns@^4.4.0`, `react@^19.2.0`, `react-aria@^3.51.0`, `react-dom@^19.2.0`, `react-router@8.3.0`, `react-stately@^3.49.0`, `tailwind-merge@^3.6.0`

Dev dependencies (29): @eslint/js, @graphql-codegen/cli, @graphql-codegen/client-preset, @mdn/browser-compat-data, @playwright/test, @tailwindcss/vite, @testing-library/dom, @testing-library/jest-dom, @testing-library/react, @testing-library/user-event, @types/node, @types/react, @types/react-dom, @vitejs/plugin-react, @vitest/coverage-v8, eslint, eslint-config-prettier, eslint-plugin-compat, eslint-plugin-react-hooks, globals, graphql, jsdom, msw, prettier, tailwindcss, typescript, typescript-eslint, vite, vitest

### Exports (3)

- `default` (default) `codegen.ts:51`
- `default` (default) `eslint.config.js:203`
- `default` (default) `vite.config.ts:106`
