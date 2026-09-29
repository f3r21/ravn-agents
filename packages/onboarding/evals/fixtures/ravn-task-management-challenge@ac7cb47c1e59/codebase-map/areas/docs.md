---
area: "docs"
title: "docs"
paths: ["docs/"]
tree_hash: "4e26d3493b6418b51bed8933587a0b60cd2fdee1"
built_at_sha: "ac7cb47c1e590616da040840cb26cb4e203d99f8"
built_at: "2026-09-26T21:58:14.483Z"
status: "ok"
summary: "This is the repository's hand-written reference documentation — three long-form design-decision essays plus the screenshots README embeds — covering deployme..."
generator: "ravn-agents/onboarding 0.1.0"
---

# docs

> Codebase map page, built at `ac7cb47c1e59`. It says where to look; confirm every claim against the cited code before relying on it.

## Summary
This is the repository's hand-written reference documentation — three long-form design-decision
essays plus the screenshots README embeds — covering deployment architecture, why the design
system is a separate package, and the testing strategy. `README.md:255` links all three as
"Read more" pointers, so this is where the reasoning behind non-obvious choices lives rather
than in code comments. `docs/deployment.md:1`

## Key files
- `docs/deployment.md:1` — why a static SPA still needs the `api/graphql.ts` serverless proxy
  (keeping `API_TOKEN` out of the bundle), the mock/direct/proxied states of `readApiConfig`
  in `src/lib/env.ts`, and why there is deliberately no CSP.
- `docs/design-system.md:1` — why `@ravn/ui-kit` is a separate git-tag-pinned package rather
  than `src/ui/`, which components have migrated, and why `EmptyState`/toasts/icons stay
  app-owned on purpose.
- `docs/testing.md:1` — what `npm run gate` checks, what the coverage suite covers versus what
  it deliberately excludes, and the one end-to-end spec against a live deployment.
- `docs/screenshots/dashboard.jpg`, `create-task.jpg`, `empty-results.jpg`, `settings.jpg`,
  `list-view.jpg` — product screenshots embedded by `README.md:17` and `README.md:23`; not
  referenced from application code except a comment pointer in
  `src/lib/decommissioned-avatar.ts:21`.

## How it works
- `docs/deployment.md:15-26` documents the three states `readApiConfig` (`src/lib/env.ts`) can
  return — mock, direct, proxied — and why a URL without a token is treated as unconfigured
  rather than relaxed into working.
- `docs/deployment.md:48-51` explains why the proxy is exported as `POST` and not a default
  handler: Vercel treats a default export as Node's `(req, res) => void`, so the first deploy
  hung until timeout.
- `docs/design-system.md:71-84` explains the dependency is a git tag (not a branch or a
  vendored copy) so `package-lock.json` pins the resolved commit rather than re-resolving on
  every `npm ci`.
- `docs/testing.md:56-68` describes `e2e/deployed-proxy.spec.ts` as the only test that exercises
  `api/graphql.ts` as it actually runs, since nothing in the app imports that file directly.

## Gotchas
- No CSP and no `frame-ancestors` header is a deliberate trade, not an oversight: header rules
  only apply on a real deployment, never under `vite preview` or local dev, so a broken policy
  can't be caught before it ships. `docs/deployment.md:60-69`
- The design-system component/icon counts (49 components, 21 icons, "2 of 41" without stories)
  are meant to be re-derived from the installed package at whatever tag is pinned, not trusted
  from prose — the doc itself says an earlier version stayed wrong for three releases.
  `docs/design-system.md:13-27`
- Vitest pins `VITE_API_URL`/`VITE_API_TOKEN` empty in `vite.config.ts`'s `test.env` so the unit
  suite always hits the MSW mock regardless of a developer's local `.env`. `docs/testing.md:34-38`
- `E2E_BASE_URL` has no localhost default on purpose: a fallback to `npm run dev` would silently
  turn the deployment check into a flaky local duplicate that proves nothing. `docs/testing.md:64-68`

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
