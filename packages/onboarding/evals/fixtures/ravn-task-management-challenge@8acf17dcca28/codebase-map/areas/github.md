---
area: "github"
title: ".github"
paths: [".github/"]
tree_hash: "6785bebe08ddba33de2c6ffcf1407944324a4ece"
built_at_sha: "8acf17dcca28036fa99cf09408e3646901d6add1"
built_at: "2026-09-30T05:30:09.780Z"
status: "ok"
summary: "GitHub configuration for the repository: three Actions workflows (CI, dependency review, and a Playwright E2E run against Vercel deployments), Dependabot con..."
generator: "ravn-agents/onboarding 0.1.0"
---

# .github

> Codebase map page, built at `8acf17dcca28`. It says where to look; confirm every claim against the cited code before relying on it.

## Summary
GitHub configuration for the repository: three Actions workflows (CI, dependency review, and a Playwright E2E run against Vercel deployments), Dependabot config, and PR and issue templates written for cold-start sessions. CI delegates most of its work to `package.json` scripts, so read those scripts alongside the workflows. `.github/workflows/ci.yml:80` `package.json:35`

## Key files
- `.github/workflows/ci.yml:35` — the required `verify` job ("Typecheck, lint, format, test, build"). It runs `npm run gate`, the build, the CSS canary, the bundle budget and `npm audit`. Open it when a PR check fails or you are adding a CI step.
- `.github/workflows/e2e.yml:16-23` — Playwright smoke test against a deployed URL. It runs on `deployment_status` or on a manual `workflow_dispatch` with `deployment_url`.
- `.github/workflows/dependency-review.yml:48-54` — `actions/dependency-review-action@v5` with `fail-on-severity: high`. It runs on pull requests only.
- `.github/dependabot.yml:3-16` — weekly npm and github-actions updates, both targeting `dev`, with grouped PRs and ignore pins.
- `.github/pull_request_template.md:17-42` — PR body with a verification checklist and figure-with-command rules. It ends with an intentionally empty `## Second-session review:` heading.
- `.github/ISSUE_TEMPLATE/lane-task.md:31-55` — "Lane task" issue template. Its Figures table is required: every number must come with a command that re-derives it.

## How it works
- CI runs on pushes to `main`, on every pull request whatever its base (so stacked PRs are checked), and on manual dispatch. It cancels in-flight runs per ref and has a 15-minute timeout. `.github/workflows/ci.yml:3-42`
- CI takes the Node version from `.nvmrc`, installs with `npm ci`, then runs `gate` (typecheck, lint, format:check, coverage), `build` and `css:canary` (`scripts/check-source-canary.mjs`). The canary catches a broken Tailwind `@source` scan of the ui-kit `dist/`. `.github/workflows/ci.yml:65-96` `package.json:32`
- The bundle budget sets PER_FILE=250000 bytes per `dist/assets/*.js` (the MSW `browser-*` chunk is exempt) and FIRST_LOAD=620000 bytes. FIRST_LOAD is the total of the scripts named in `dist/index.html`. `.github/workflows/ci.yml:126-179`
- The E2E job serialises runs (`cancel-in-progress: false`) because the spec writes to the live board through the proxy. It installs only Chromium and passes the URL to `npm run test:e2e` as `E2E_BASE_URL`. `.github/workflows/e2e.yml:29-31` `.github/workflows/e2e.yml:58-91`
- There are two advisory checks, both at severity high. `npm audit` in CI checks the installed tree; dependency review checks what the PR diff adds, against GitHub's database. `.github/workflows/ci.yml:184` `.github/workflows/dependency-review.yml:36-54`

## Gotchas
- `workflow_dispatch` in CI and the `deployment_status` trigger in E2E only work once the file is on the default branch, `main`. Changes on `dev` have no effect there until they are promoted. `.github/workflows/ci.yml:17-19` `.github/workflows/e2e.yml:5-12`
- E2E must use `environment_url`, not `target_url`. On Vercel, `target_url` points to the build log. Inputs go through `env:` rather than inline `${{ }}` to avoid script injection. `.github/workflows/e2e.yml:62-83`
- The FIRST_LOAD loop checks each file and compares COUNTED with NAMED. Without that, `bash -e` would skip the rest of the loop on a missing asset and pass with a partial total. `.github/workflows/ci.yml:144-166`
- Dependabot's `target-branch: dev` stops dependency PRs from bypassing `dev`. The cost is that Dependabot security-update PRs never arrive; the audit and dependency review checks cover that gap. `.github/dependabot.yml:6-34`
- Dependabot ignores `react-router` (exact pin, re-check due 2026-11-05) and `@ravn/ui-kit` (git-tag pin, and the kit ships breaking changes on minor bumps). Upgrade both by hand. `.github/dependabot.yml:56-88`
- Action majors are not consistent. `ci.yml` uses `@v7`, but `e2e.yml` and `dependency-review.yml` use `@v4`. `e2e.yml` also hardcodes `node-version: 22` instead of reading `.nvmrc`. The "bump in lockstep" comment in dependency-review contradicts the float policy described in `ci.yml`. `.github/workflows/dependency-review.yml:32-34` `.github/workflows/e2e.yml:45-49` `.github/workflows/ci.yml:50-59`
- Only the CI `verify` job is a required status check. Dependency review reports but does not block unless the ruleset is changed. `.github/workflows/dependency-review.yml:23-27`
- Leave the PR template's last heading empty: tooling treats any content under it as evidence of a review. `.github/pull_request_template.md:49-58`

## Generated facts

Produced by code from the git tree at the stamped SHA; not written by a model.

### Files (6 total, 0 tests)

- `.github/ISSUE_TEMPLATE/lane-task.md`
- `.github/dependabot.yml`
- `.github/pull_request_template.md`
- `.github/workflows/ci.yml`
- `.github/workflows/dependency-review.yml`
- `.github/workflows/e2e.yml`
