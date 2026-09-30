---
area: "github"
title: ".github"
paths: [".github/"]
tree_hash: "6785bebe08ddba33de2c6ffcf1407944324a4ece"
built_at_sha: "ac7cb47c1e590616da040840cb26cb4e203d99f8"
built_at: "2026-09-30T05:28:33.367Z"
status: "ok"
summary: "GitHub configuration for the repository: three Actions workflows (CI gate, dependency review, post-deploy E2E), Dependabot settings, and the PR and issue tem..."
generator: "ravn-agents/onboarding 0.1.0"
---

# .github

> Codebase map page, built at `ac7cb47c1e59`. It says where to look; confirm every claim against the cited code before relying on it.

## Summary
GitHub configuration for the repository: three Actions workflows (CI gate, dependency review, post-deploy E2E), Dependabot settings, and the PR and issue templates. The workflows mostly call `package.json` scripts (`gate`, `build`, `css:canary`, `test:e2e`), so the real check logic lives in those scripts; the YAML files are about triggers, permissions and budgets. `.github/workflows/ci.yml:34-37` `package.json:35`

## Key files
- `.github/workflows/ci.yml:35` — job `verify` ("Typecheck, lint, format, test, build"), the only required status check. Open it when CI fails or when you change the bundle budget.
- `.github/workflows/e2e.yml:16-23` — Playwright smoke test against a Vercel deployment. It runs on `deployment_status` or manually through `workflow_dispatch` with a `deployment_url`.
- `.github/workflows/dependency-review.yml:48-54` — `actions/dependency-review-action@v5` on pull requests, `fail-on-severity: high`.
- `.github/dependabot.yml:4-16` — weekly npm and github-actions updates, both opened against `dev`, with grouping and ignore rules.
- `.github/pull_request_template.md:58` — PR body sections, ending in the empty "Second-session review:" heading.
- `.github/ISSUE_TEMPLATE/lane-task.md:1-9` — "Lane task" issue template, written for a session that starts with no context. It has a required Figures table.

## How it works
- CI runs on pushes to `main`, on every pull request whatever its base branch, and on manual dispatch. It runs `npm ci`, then `npm run gate` (typecheck, lint, format:check, coverage), `npm run build`, `npm run css:canary`, the bundle budget and `npm audit --audit-level=high`, in that order. `.github/workflows/ci.yml:3-20` `.github/workflows/ci.yml:73-96` `.github/workflows/ci.yml:184`
- The bundle budget has two limits. `PER_FILE=250000` applies to each `dist/assets/*.js` except the MSW `browser-*` chunk. `FIRST_LOAD=620000` applies to the scripts named in `dist/index.html`. The step also fails if the total is zero or if some named assets were not counted. `.github/workflows/ci.yml:126-179`
- `css:canary` (`scripts/check-source-canary.mjs`) runs after a real build. It catches a broken Tailwind `@source` scan of the ui-kit `dist/`, which no jsdom test can see. `.github/workflows/ci.yml:87-96` `package.json:32`
- E2E: the job runs only on `workflow_dispatch` or when the deployment state is `success`. It reads the URL from `inputs.deployment_url` or `deployment_status.environment_url` and passes it to `npm run test:e2e` as `E2E_BASE_URL`. `.github/workflows/e2e.yml:41` `.github/workflows/e2e.yml:60-91` `package.json:24`
- Dependabot groups npm updates into `react`, `react-aria` and `dev-tooling`. It ignores `react-router` (pinned because of advisories, re-check by 2026-11-05) and `@ravn/ui-kit` (git-tag pin whose minor versions break). `.github/dependabot.yml:35-88`
- Every workflow sets `permissions: contents: read`. CI and dependency review cancel an in-progress run when a newer one starts. `.github/workflows/ci.yml:24-32` `.github/workflows/dependency-review.yml:10-20`

## Gotchas
- `workflow_dispatch` in CI and `deployment_status` in E2E only work once the file is on the default branch `main`. While a change exists only on `dev`, automatic E2E never runs. `.github/workflows/ci.yml:17-20` `.github/workflows/e2e.yml:5-15`
- E2E concurrency queues runs and never cancels them (`cancel-in-progress: false`), because the spec writes to RAVN's live board through the proxy. A cancelled run would leave its task behind. `.github/workflows/e2e.yml:25-31`
- Pass deployment URLs through `env:`, never by interpolating `${{ }}` into the script, to avoid script injection. Use `environment_url`, not `target_url`: Vercel puts the build log in `target_url`. `.github/workflows/e2e.yml:62-83`
- The action versions are inconsistent. `ci.yml` uses `checkout@v7`/`setup-node@v7` and reads Node from `.nvmrc`. `e2e.yml` uses `@v4` with a hard-coded `node-version: 22`. The "bump in lockstep" comment in `dependency-review.yml` contradicts the policy in `ci.yml`. `.github/workflows/ci.yml:59-67` `.github/workflows/e2e.yml:45-50` `.github/workflows/dependency-review.yml:32-34`
- `target-branch: dev` keeps dependency PRs off `main`, but it also means Dependabot security PRs never arrive. `npm audit` and dependency review cover that gap instead. `.github/dependabot.yml:6-34`
- Only `Typecheck, lint, format, test, build` is a required check in the ruleset. Dependency review reports but does not block merges. `.github/workflows/dependency-review.yml:23-26`
- Leave the PR template's final heading empty and keep it last. Tools decide whether a PR was reviewed by checking for content under that heading. `.github/pull_request_template.md:44-58`
- Raising a bundle limit is a deliberate decision, not a fix. When sizes drop, lower both numbers. `.github/workflows/ci.yml:125`

## Generated facts

Produced by code from the git tree at the stamped SHA; not written by a model.

### Files (6 total, 0 tests)

- `.github/ISSUE_TEMPLATE/lane-task.md`
- `.github/dependabot.yml`
- `.github/pull_request_template.md`
- `.github/workflows/ci.yml`
- `.github/workflows/dependency-review.yml`
- `.github/workflows/e2e.yml`
