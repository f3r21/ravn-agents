---
area: "github"
title: ".github"
paths: [".github/"]
tree_hash: "6785bebe08ddba33de2c6ffcf1407944324a4ece"
built_at_sha: "ac7cb47c1e590616da040840cb26cb4e203d99f8"
built_at: "2026-09-26T21:58:14.483Z"
status: "ok"
summary: "This area is the repository's GitHub configuration: CI/CD workflows, Dependabot policy, and PR/issue templates."
generator: "ravn-agents/onboarding 0.1.0"
---

# .github

> Codebase map page, built at `ac7cb47c1e59`. It says where to look; confirm every claim against the cited code before relying on it.

## Summary
This area is the repository's GitHub configuration: CI/CD workflows, Dependabot policy, and PR/issue templates. It enforces the quality gate, dependency hygiene and branch-promotion model (`dev` -> `main`) described elsewhere in the repo. `.github/workflows/ci.yml:1`

## Key files
- `.github/workflows/ci.yml:1` — main CI job (`verify`): runs `npm run gate`, `npm run build`, `npm run css:canary`, a bundle-size budget check, and `npm audit --audit-level=high`. Triggers on push to `main`, every pull request, and `workflow_dispatch`.
- `.github/workflows/e2e.yml:1` — E2E suite run against a live deployment URL, triggered by Vercel's `deployment_status` event (only works once this file is on the default branch) or manually via `workflow_dispatch`.
- `.github/workflows/dependency-review.yml:1` — pull-request-only check that fails if the diff introduces a dependency with a GitHub Advisory Database entry at `high` severity or above; not a required status check yet.
- `.github/dependabot.yml:1` — npm and github-actions update policy: targets `dev` (not the default `main`) to avoid bypassing branch promotion, groups related packages, and pins `react-router` and `@ravn/ui-kit` against automatic bumps.
- `.github/pull_request_template.md:1` — PR body template requiring a "How it was verified" section with reproducible figures and a second-session review comment.
- `.github/ISSUE_TEMPLATE/lane-task.md:1` — issue template for a "lane task" written for a reader with no prior context, requiring a Figures table with re-derivable commands.

## How it works
- `target-branch: dev` on both Dependabot blocks (npm and github-actions) exists specifically so dependency PRs cannot land on `main` without going through the same verified `dev` promotion as everything else; `graphql` 17 previously bypassed this exact way. `.github/dependabot.yml:5-13` `.github/dependabot.yml:97-104`
- Dependency vulnerability coverage is split across three mechanisms rather than one: Dependabot version-only updates (`.github/dependabot.yml:1`), `npm audit --audit-level=high` in CI for anything already installed (`.github/workflows/ci.yml:184`), and `dependency-review-action` in PRs for anything newly introduced (`.github/workflows/dependency-review.yml:48-54`), both audit checks matched to the same `high` severity threshold.
- `ci.yml`'s bundle-size budget step reads first-load bytes out of `dist/index.html` (entry + modulepreload) rather than summing `dist/assets`, so dynamically-imported chunks like the MSW `browser-*.js` runtime are excluded and don't get charged to every visitor. `.github/workflows/ci.yml:98-179`
- `e2e.yml` resolves its target URL from either `workflow_dispatch` input or the deployment event's `environment_url` (never `target_url`, which Vercel fills with a build-log link), and reads both through `env:` rather than direct `${{ }}` interpolation into the shell script to avoid script injection. `.github/workflows/e2e.yml:60-83`
- Action major versions in `ci.yml` (e.g. `actions/checkout@v7`) are deliberately allowed to float independently via Dependabot's `github-actions` ecosystem, while the Node version stays pinned via `.nvmrc` — a change from an earlier policy that aligned actions in lockstep with the sibling `ravn-ui-kit` repo and left both stale. `.github/workflows/ci.yml:44-68`

## Gotchas
- `dependency-review.yml` is not a required status check on the `dev`/`main` ruleset yet, so it currently reports without blocking merges; adding that is a separate ruleset change from this file. `.github/workflows/dependency-review.yml:23-26`
- The bundle-size budget's asset-summing loop guards `wc -c` failures explicitly because an unguarded arithmetic error under `bash -e` would abort only the inner loop, leave `TOTAL` as a partial sum, and pass a budget check that measured half the bundle — hence the `COUNTED` vs `NAMED` cross-check. `.github/workflows/ci.yml:140-166`
- `e2e.yml`'s `deployment_status` trigger only fires once this workflow file exists on the repository's default branch (GitHub's rule, not a setting); until `dev` is promoted to `main`, only the `workflow_dispatch` manual trigger works. `.github/workflows/e2e.yml:5-11`
- `react-router` and `@ravn/ui-kit` are excluded from Dependabot's npm updates on purpose (advisory-range pin, and a tag-pin the app controls) — bumping either requires a manual check of advisories or the kit's CHANGELOG, not an automated PR. `.github/dependabot.yml:56-88`

## Generated facts

Produced by code from the git tree at the stamped SHA; not written by a model.

### Files (6 total, 0 tests)

- `.github/ISSUE_TEMPLATE/lane-task.md`
- `.github/dependabot.yml`
- `.github/pull_request_template.md`
- `.github/workflows/ci.yml`
- `.github/workflows/dependency-review.yml`
- `.github/workflows/e2e.yml`
