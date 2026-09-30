---
area: "root"
title: "Repository root"
paths: ["*","public/"]
tree_hash: "54b526314d3c7b97207da62bca630143bfc9e025"
built_at_sha: "8acf17dcca28036fa99cf09408e3646901d6add1"
built_at: "2026-09-30T05:30:09.780Z"
status: "ok"
summary: "The repository root holds the build, lint, test, codegen and deploy configuration for a React 19 + Vite 8 task board (the RAVN challenge), plus `CLAUDE.md`,..."
generator: "ravn-agents/onboarding 0.1.0"
---

# Repository root

> Codebase map page, built at `8acf17dcca28`. It says where to look; confirm every claim against the cited code before relying on it.

## Summary
The repository root holds the build, lint, test, codegen and deploy configuration for a React 19 + Vite 8 task board (the RAVN challenge), plus `CLAUDE.md`, the agent guide that explains the architecture and past traps. `public/` contains only the favicon and MSW's generated service worker. App code starts at `src/main.tsx`, loaded from `index.html:24`; the scripts in `package.json:18-36` connect the pieces, and `gate` is the local quality bar. `package.json:35`

## Key files
- `CLAUDE.md:51` — the architecture guide: two backends on one code path, the UI kit dependency, the data path, lint-enforced layering and the traps already paid for. Read this before changing anything.
- `package.json:11-17` — the `browserslist` floor. It is the single source that both `vite.config.ts` and `eslint.config.js` read. `package.json:44` pins `@ravn/ui-kit` to a git tag.
- `vite.config.ts:106` — Vite config plus the whole Vitest config: build target, Rolldown chunk groups, `dedupe`, test env pins and coverage thresholds.
- `eslint.config.js:203` — flat config. It holds the no-`any` rules, the cross-feature import ban, the generated-barrel ban and the browser-compat rules.
- `vitest.setup.ts:52-89` — global test harness: MSW server with `onUnhandledRequest: 'error'`, `taskStore.reset()` after each test, and a gate that fails any test that logs.
- `codegen.ts:11-49` — graphql-codegen reads the committed `schema.graphql` and writes `src/graphql/generated/` using the `client` preset.
- `vercel.json:1-21` — Vercel build: forces proxied mode (`VITE_API_URL=/api/graphql`, empty token), adds an SPA rewrite that excludes `api/`, and sets security headers.
- `.mcp.json:15-24` — the `graphql` MCP server sources `.env` inside its own `sh -c` process, so the token never enters your shell.

## How it works
- The browser floor is declared once and derived twice. `readDeclaredBrowserFloor` turns each `<browser> >= <version>` entry into an esbuild `build.target`, and `readBrowserFloor` maps the same entries to MDN names for the lint. `vite.config.ts:67-104` `eslint.config.js:32-59`
- Browser compat is enforced by `compat/compat` plus a `no-restricted-properties` list generated from `@mdn/browser-compat-data` static members, because the plugin misses `URL.canParse`. `eslint.config.js:124-170` `eslint.config.js:437-444`
- Layering is lint-enforced. `src/**` may not import `@/features/*`, `src/app/**` is exempt, and `src/features/navigation/**` may import only `use-board-filters` and `use-profile`. `eslint.config.js:296-387`
- Tests run in jsdom with `TZ=Pacific/Kiritimati` and empty `VITE_API_URL`/`VITE_API_TOKEN`, so the suite always uses the mock backend whatever a local `.env` holds. `vite.config.ts:217-246`
- Coverage covers `src/**` only, excludes mocks, generated code and bootstrap files, and requires 85% on all four metrics. `vite.config.ts:247-290`
- The production bundle splits `react`, `react-aria` and `@tanstack` into separate chunks. The UI kit deliberately stays in the app chunk, and the chunk warning limit of 250 matches the CI budget. `vite.config.ts:118-153`
- Operations are sent as `TypedDocumentString` (`documentMode: 'string'`), so `graphql` is not shipped to users. `DateTime` is mapped to `string`. `codegen.ts:30-45`
- `.env.example` points at the live API. When either value is missing the app falls back to MSW, whose worker is `public/mockServiceWorker.js`, and `package.json` registers `public` as the worker directory. `.env.example:1-10` `package.json:37-41`

## Gotchas
- `coverage.exclude` replaces Vitest's defaults instead of merging with them. Dropping the `...coverageConfigDefaults.exclude` spread counts test files as source and inflates coverage. `vite.config.ts:255-259`
- `e2e/**` and `.worktrees/**` must stay in the Vitest exclude list. Otherwise Vitest collects the Playwright spec or a nested worktree's tests. `vite.config.ts:202-216`
- When `.vercelignore` exists, Vercel uses it instead of `.gitignore`, so it must list `.env` itself. Without that entry a CLI deploy once inlined the token into the bundle. `.vercelignore:1-14`
- `tsconfig.json` deliberately leaves out `vite.config.ts` to avoid a clash between duplicate Vite `Plugin` types. ESLint lists it under `allowDefaultProject` instead. `tsconfig.json:30-35` `eslint.config.js:240-242`
- The test console gate is reinstalled in `beforeEach` because `restoreMocks` is off. To opt out deliberately, a test mocks `console.error` with `vi.spyOn`. `vitest.setup.ts:18-31`
- The generated barrel is banned through `paths`, not `patterns`. A `patterns` glob would also match every legitimate `@/graphql/generated/graphql` import. `eslint.config.js:182-199`
- `public/mockServiceWorker.js` is generated by `msw init` (version 2.15.0), so do not edit it. ESLint and Prettier both ignore it. `public/mockServiceWorker.js:1-10` `.prettierignore:7`
- The `preconnect` host in `index.html` is hardcoded and does not follow `VITE_API_URL`. Update it by hand if the API endpoint moves. `index.html:8-19`

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

Dependencies: `@internationalized/date@^3.12.3`, `@ravn/ui-kit@github:f3r21/ravn-ui-kit#v0.8.0`, `@tanstack/react-query@^5.101.4`, `clsx@^2.1.1`, `date-fns@^4.4.0`, `react@^19.2.0`, `react-aria@^3.51.0`, `react-dom@^19.2.0`, `react-router@8.3.0`, `react-stately@^3.49.0`, `tailwind-merge@^3.6.0`

Dev dependencies (29): @eslint/js, @graphql-codegen/cli, @graphql-codegen/client-preset, @mdn/browser-compat-data, @playwright/test, @tailwindcss/vite, @testing-library/dom, @testing-library/jest-dom, @testing-library/react, @testing-library/user-event, @types/node, @types/react, @types/react-dom, @vitejs/plugin-react, @vitest/coverage-v8, eslint, eslint-config-prettier, eslint-plugin-compat, eslint-plugin-react-hooks, globals, graphql, jsdom, msw, prettier, tailwindcss, typescript, typescript-eslint, vite, vitest

### Exports (3)

- `default` (default) `codegen.ts:51`
- `default` (default) `eslint.config.js:203`
- `default` (default) `vite.config.ts:106`
