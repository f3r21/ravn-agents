---
area: "docs"
title: "docs"
paths: ["docs/"]
tree_hash: "4e26d3493b6418b51bed8933587a0b60cd2fdee1"
built_at_sha: "ac7cb47c1e590616da040840cb26cb4e203d99f8"
built_at: "2026-09-30T05:28:33.367Z"
status: "ok"
summary: "Prose design notes plus README screenshots."
generator: "ravn-agents/onboarding 0.1.0"
---

# docs

> Codebase map page, built at `ac7cb47c1e59`. It says where to look; confirm every claim against the cited code before relying on it.

## Summary
Prose design notes plus README screenshots. There is no code here. The three Markdown files explain the decisions behind deployment, the `@ravn/ui-kit` dependency and the test strategy, and `README.md` links to each one. `README.md:255-259` `docs/deployment.md:1`

## Key files
- `docs/deployment.md:1` — Vercel hosting, why the `api/graphql.ts` proxy exists, the mock/direct/proxied config matrix, the `vercel.json` rewrites and headers, and why there is no CSP. Open it before you touch env config or the proxy.
- `docs/design-system.md:1` — why the UI components live in the separate `@ravn/ui-kit` repo, which components stay app-owned, and why the dependency is pinned to a git tag.
- `docs/testing.md:1` — what `npm run gate` and CI check, test conventions, the single e2e spec and the lessons from jsdom compared with a real browser.
- `docs/screenshots/dashboard.jpg` — embedded in `README.md:17`. The other four JPGs are embedded in the gallery table at `README.md:23-25`.

## How it works
- The token never reaches the browser. `api/graphql.ts` reads `API_TOKEN`, which has no `VITE_` prefix, and the app posts to `/api/graphql` on its own origin. `docs/deployment.md:6-13`
- `readApiConfig` in `src/lib/env.ts` has three states: mock (no URL), direct (absolute URL plus token) and proxied (`/api/graphql`, no token). `docs/deployment.md:15-25`
- `vercel.json` pins `VITE_API_URL` and rewrites non-static, non-`/api/` paths to `index.html` so that `createBrowserRouter` routes work on a direct hit. `docs/deployment.md:40-46`
- `@ravn/ui-kit` is installed as `github:f3r21/ravn-ui-kit#<tag>`. Its committed `dist/` is installed without a rebuild, and `package-lock.json` records the resolved commit. `docs/design-system.md:71-84`
- `EmptyState`, the toast system, the icon set and `ErrorBoundary` are app-owned by design. They are not pending migrations. `docs/design-system.md:46-57`
- Tests always run against the MSW mock because `vite.config.ts` `test.env` pins the API vars to empty. MSW uses `onUnhandledRequest: 'error'`. `docs/testing.md:34-49`
- `e2e/deployed-proxy.spec.ts` is the only test that exercises `api/graphql.ts`. It needs `E2E_BASE_URL` and is run by `.github/workflows/e2e.yml` after each deployment. `docs/testing.md:56-78`

## Gotchas
- The proxy must be exported as `POST`, not as a default export. Vercel treats a default export as a Node `(req, res)` handler, so every request hung. `docs/deployment.md:48-51`
- When a kit component fails an assertion in this app, the fix belongs in the kit, not in a weakened test. `docs/design-system.md:67-69`
- The docs quote no counts or version tags on purpose, because stale numbers kept creeping in. Re-derive them from `package.json` or `npm test`. `docs/design-system.md:73-77` `docs/testing.md:8-9`
- `board-render-cost.test.tsx` checks the board's memoisation: a search keystroke must re-render zero cards. `docs/testing.md:17-24`
- `.gitignore` anchors `/docs/superpowers/` and `/*.png` so that the tracked `docs/screenshots/` images are never ignored. `.gitignore:94-97`
- `npm run lint` checks API usage against `browserslist`. It was added after `URL.canParse` broke older browsers while every test passed. `docs/testing.md:87-94`

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
