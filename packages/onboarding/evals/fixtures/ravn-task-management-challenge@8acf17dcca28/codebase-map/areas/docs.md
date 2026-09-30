---
area: "docs"
title: "docs"
paths: ["docs/"]
tree_hash: "4e26d3493b6418b51bed8933587a0b60cd2fdee1"
built_at_sha: "8acf17dcca28036fa99cf09408e3646901d6add1"
built_at: "2026-09-30T05:30:09.780Z"
status: "ok"
summary: "Prose design notes plus README screenshots."
generator: "ravn-agents/onboarding 0.1.0"
---

# docs

> Codebase map page, built at `8acf17dcca28`. It says where to look; confirm every claim against the cited code before relying on it.

## Summary
Prose design notes plus README screenshots. There is no code here. Three Markdown files explain decisions that the code does not state: the Vercel proxy deployment, why the UI kit is a separate package, and what the test gate covers. `README.md` links to them from its docs list. `README.md:249-253` `docs/deployment.md:1`

## Key files
- `docs/deployment.md:6-13` — why `api/graphql.ts` exists (it keeps `API_TOKEN` out of the Vite bundle). Open it before you touch `api/graphql.ts`, `vercel.json` or `readApiConfig` in `src/lib/env.ts`.
- `docs/design-system.md:7-11` — the `@ravn/ui-kit` package: what the app consumes from it, what stays app-owned and why the dependency is a git tag. Open it before you change imports from `src/ui/` or the kit.
- `docs/testing.md:3-6` — what `npm run gate` and CI check, the test conventions, the one e2e spec and the browserslist lint.
- `docs/screenshots/dashboard.jpg` — one of five JPGs that `README.md` embeds (dashboard, create-task, empty-results, settings, list-view). `README.md:17-25`

## How it works
- The backend config has three modes: mock (no `VITE_API_URL`), direct (absolute URL plus token) and proxied (`/api/graphql`, no token). The deployment uses proxied. `docs/deployment.md:15-25`
- The proxy is exported as `POST`, not as a default handler. A default export hung every request on the first deploy. `docs/deployment.md:48-51`
- `vercel.json` rewrites routes to `index.html` for SPA routing but leaves `/api/` out. It pins `VITE_API_URL` and sets two headers. It deliberately sets no CSP. `docs/deployment.md:40-46` `docs/deployment.md:53-78`
- The kit is installed as `github:f3r21/ravn-ui-kit#<tag>`. `package-lock.json` records the commit, and the kit commits its own `dist/`. `docs/design-system.md:73-84`
- `EmptyState`, the toasts, the icons and `ErrorBoundary` stay app-owned on purpose. They are not waiting to be migrated. `docs/design-system.md:46-57`
- Tests always run against the MSW mock: `vite.config.ts` `test.env` sets the API env vars to empty, and MSW uses `onUnhandledRequest: 'error'`. `docs/testing.md:34-44`
- `e2e/deployed-proxy.spec.ts` is the only test that exercises `api/graphql.ts`. It needs `E2E_BASE_URL` and runs from `.github/workflows/e2e.yml`. `docs/testing.md:56-78`

## Gotchas
- The docs avoid stating counts and version tags on purpose, because such numbers kept going stale. Re-derive them with the commands given, for example `grep ui-kit package.json`, instead of writing a number into the prose. `docs/design-system.md:13-34` `docs/testing.md:8-9`
- Rule: when a kit component fails a test in this app, fix it in the kit. Do not weaken the test here. `docs/design-system.md:67-69`
- `board-render-cost.test.tsx` counts card avatars separately from header avatars, and it checks the count at mount first. If you merge the counts or drop that first check, the test can pass even when no cards render. `docs/testing.md:17-24`
- The `[Testing](#testing)` link in `deployment.md` points to an anchor that does not exist in that file. The content it means is in `docs/testing.md`. `docs/deployment.md:76-77`
- `.gitignore` anchors its ignore rules (`/*.png`, `/docs/superpowers/`) so they cannot hide `docs/screenshots/`, which must stay tracked. `.gitignore:72-97`

## Generated facts

Produced by code from the git tree at the stamped SHA; not written by a model.

### Files (8 total, 0 tests)

- `docs/deployment.md`
- `docs/design-system.md`
- `docs/screenshots/create-task.jpg`
- `docs/screenshots/dashboard.jpg`
- `docs/screenshots/empty-results.jpg`
- `docs/screenshots/list-view.jpg`
- `docs/screenshots/settings.jpg`
- `docs/testing.md`
