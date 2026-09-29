---
area: "scripts"
title: "scripts"
paths: ["scripts/"]
tree_hash: "3380e63af119e6426936ce3af66ba1ae533af680"
built_at_sha: "ac7cb47c1e590616da040840cb26cb4e203d99f8"
built_at: "2026-09-26T21:58:14.483Z"
status: "ok"
summary: "`scripts/` holds standalone Node and shell tools that support the repo but stay out of `npm run gate`: schema-drift and Tailwind-scan checks, figure-generati..."
generator: "ravn-agents/onboarding 0.1.0"
---

# scripts

> Codebase map page, built at `ac7cb47c1e59`. It says where to look; confirm every claim against the cited code before relying on it.

## Summary
`scripts/` holds standalone Node and shell tools that support the repo but stay out of `npm run gate`: schema-drift and Tailwind-scan checks, figure-generating scanners for `CLAUDE.md`, and the worktree provisioner. `scripts/new-lane.sh:1` and `scripts/count-comments.mjs:1` are the two largest; three `.test.mjs` files pin behavior that unit tests elsewhere cannot reach.

## Key files
- `scripts/new-lane.sh:1` — provisions a git worktree lane (`scripts/new-lane.sh <lane-name> [branch]`). Open this when a lane starts subtly broken (missing skills, wrong MCP scope, missing `.env`, or a red gate misattributed to a first change).
- `scripts/check-schema.mjs:1` — introspects the live GraphQL API and diffs it against the committed `schema.graphql`; run via `npm run schema:check`, deliberately not part of the gate because it needs network access (`scripts/check-schema.mjs:6-9`).
- `scripts/check-source-canary.mjs:1` — fails after `npm run build` if Tailwind's `@source` scan of `@ravn/ui-kit/dist` stops generating the kit's utility classes; run via `npm run css:canary`.
- `scripts/count-assertions.mjs:1` — parses `src/` with the TypeScript compiler API to count `as` and non-null `!` assertions, backing a figure quoted in `CLAUDE.md`; run via `npm run assertions`.
- `scripts/count-comments.mjs:1` — parses `src/` to compute the comment-to-code ratio and where comments attach (exported decl, member, JSX, etc.); run via `npm run comments`, with `--blocks`, `--compare`, `--scopes`, `--all` flags.
- `scripts/new-lane.test.mjs:1`, `scripts/hooks.test.mjs:1`, `scripts/count-comments.test.mjs` — Vitest specs that live in `scripts/` (not `src/`) so they are excluded from the `src/**`-only coverage and `tsconfig.json` scope; they are `.mjs` because Vitest does not collect dotted directories.

## How it works
- `count-assertions.mjs` and `count-comments.mjs` both build a real TypeScript AST (`ts.createSourceFile`) rather than grep, because prose containing the word "as" or comment-like text inside JSX braces defeats line/text matching; both exclude `*.test.tsx`, `src/test/`, and `src/graphql/generated/` by the same `EXCLUDED` regex (`scripts/count-assertions.mjs:31`, `scripts/count-comments.mjs:79`).
- `check-source-canary.mjs` computes its candidate class list instead of hardcoding sentinel classes: it takes classes emitted into the built CSS, keeps those also present in the kit's `dist/`, and drops any that appear in a tracked file via `git ls-files`, because naming an example class anywhere tracked would make Tailwind generate it independently of the `@source` scan (`scripts/check-source-canary.mjs:33-45`, `scripts/check-source-canary.mjs:110-123`).
- `new-lane.sh` resolves the main checkout via `git rev-parse --git-common-dir` rather than a relative path, because running it from inside an existing worktree would otherwise nest the new lane inside `wt/wt/<lane>` (`scripts/new-lane.sh:65-73`).
- `new-lane.sh` copies `.claude/settings.local.json` and `.env` into the new worktree, but deliberately not `.env.local` or `.vercel/` (stale OIDC token), and its checklist re-reads values from the provisioned worktree (skills count, MCP shadowing, gate exit status) rather than restating intent (`scripts/new-lane.sh:118-138`, `scripts/new-lane.sh:145-149`).
- `count-comments.mjs --root <dir>` lets `count-comments.test.mjs` point the real script at a fixture corpus instead of adding hazard files under `src/`, which would ship dead code and move the real figures (`scripts/count-comments.mjs:81-88`).

## Gotchas
- `new-lane.sh` hardcodes `BASE_BRANCH='dev'` and calls out that the upstream kit's copy says `main` — the single most likely thing wrong in a copy-paste, pinned by a test (`scripts/new-lane.sh:38-42`).
- A worktree created under `wt/` nested inside the repo gets collected by Vitest, ESLint and Prettier, and its tests resolve `@` to the outer `src/`; the script refuses to create one there rather than relying on ignore files (`scripts/new-lane.sh:80-89`).
- An MCP server declared in tracked `.mcp.json` can be silently shadowed by a same-named entry in the user's local-scope `~/.claude.json`, with the local one winning; `new-lane.sh` detects and reports this but does not fix it, since removing a human's local config is not the provisioner's call (`scripts/new-lane.sh:153-168`).
- `check-source-canary.mjs` must run after `npm run build`, not as part of `gate`, because `gate` runs in jsdom which never evaluates a stylesheet (`scripts/check-source-canary.mjs:10-13`).

## Generated facts

Produced by code from the git tree at the stamped SHA; not written by a model.

### Files (8 total, 3 tests)

- `scripts/check-schema.mjs`
- `scripts/check-source-canary.mjs`
- `scripts/count-assertions.mjs`
- `scripts/count-comments.mjs`
- `scripts/new-lane.sh`
