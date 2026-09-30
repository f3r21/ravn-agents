---
area: "scripts"
title: "scripts"
paths: ["scripts/"]
tree_hash: "3380e63af119e6426936ce3af66ba1ae533af680"
built_at_sha: "ac7cb47c1e590616da040840cb26cb4e203d99f8"
built_at: "2026-09-30T05:28:33.367Z"
status: "ok"
summary: "`scripts/` holds the repository's standalone Node and Bash tooling."
generator: "ravn-agents/onboarding 0.1.0"
---

# scripts

> Codebase map page, built at `ac7cb47c1e59`. It says where to look; confirm every claim against the cited code before relying on it.

## Summary
`scripts/` holds the repository's standalone Node and Bash tooling. It covers a schema drift check, a Tailwind `@source` canary that runs in CI, two AST-based reporting counters behind figures quoted in `CLAUDE.md`, and a worktree ("lane") provisioner. It also holds three Vitest suites that live here because Vitest does not collect from dotted directories. Everything except `new-lane.sh` is wired up as an npm script. `package.json:31-34` `scripts/hooks.test.mjs:16-19`

## Key files
- `scripts/check-schema.mjs:1` — runs an introspection query against the live API (`VITE_API_URL` or the Railway default) and diffs it against the committed `schema.graphql`. Open it when codegen types look wrong. `npm run schema:check`.
- `scripts/check-source-canary.mjs:1` — checks that Tailwind still scans `node_modules/@ravn/ui-kit/dist`. It must run after `npm run build`. `npm run css:canary`, which runs in CI at `.github/workflows/ci.yml:96`.
- `scripts/count-assertions.mjs:1` — lists every `as` (except `as const`) and every non-null `!` in shipped `src/`, using the TypeScript AST. `npm run assertions`.
- `scripts/count-comments.mjs:1` — reports the comment/code line ratio plus kind and attachment tables. Flags are `--blocks`, `--compare`, `--scopes`, `--all` and `--root`. `npm run comments`.
- `scripts/new-lane.sh:1` — `scripts/new-lane.sh <lane-name> [branch]` creates a git worktree under a sibling `wt/` directory. It runs `npm ci`, `corvus sync` and copies `.env` and `settings.local.json`, then runs the gate and prints a checklist.
- `scripts/hooks.test.mjs:1` — drives each `.claude/hooks/*.sh` script with a JSON payload on stdin, the way Claude Code does, so a hook that does nothing fails a test.
- `scripts/new-lane.test.mjs:1` — pins only the pre-flight guards of `new-lane.sh`: usage text, the `dev` base branch and lane-name validation.
- `scripts/count-comments.test.mjs:1` — runs the real `count-comments.mjs` over a hazard corpus in a temp directory, passed in through `--root`.

## How it works
- `check-schema.mjs` prints both sides through `printSchema` after parsing them. Formatting, field order and comments therefore cannot cause a false diff. The check needs no token. `scripts/check-schema.mjs:36-44`
- The canary never names its sentinel classes. It takes the class selectors emitted in `dist/assets/*.css`, keeps the ones that also appear in the kit's `dist/`, and drops any that appear in a file listed by `git ls-files`. It fails if fewer than `MINIMUM = 25` are left. The header measures 190 on a healthy build and 8 with `@source` removed. `scripts/check-source-canary.mjs:33-45` `scripts/check-source-canary.mjs:64` `scripts/check-source-canary.mjs:110-133`
- Both counters share the same `EXCLUDED` regex: `*.test.ts(x)`, `src/test/` and `src/graphql/generated/`. Both exit 1 only when the scan finds zero files. `scripts/count-assertions.mjs:31` `scripts/count-comments.mjs:79` `scripts/count-comments.mjs:390-396`
- `count-comments.mjs` finds comments with leading and trailing trivia queries. It treats an empty `JsxExpression` as a comment and rejects trailing ranges that start inside `JsxText`. It then classifies each line character by character. `scripts/count-comments.mjs:183-230` `scripts/count-comments.mjs:308-333`
- `--compare` runs the old line-prefix reader, `classifyByLinePrefix`, against the parser and prints where they disagree. `--scopes` prints the ratio for every file set it has been quoted under. `scripts/count-comments.mjs:289-297` `scripts/count-comments.mjs:410-416` `scripts/count-comments.mjs:536-574`
- `new-lane.sh` resolves the main checkout through `git rev-parse --git-common-dir`, so running it from inside another worktree does not nest paths. It cuts the branch `int/<lane>` from `origin/dev`. `scripts/new-lane.sh:42` `scripts/new-lane.sh:55` `scripts/new-lane.sh:71-78`
- The lane checklist reads values back from the new worktree. It flags MCP servers that a local-scope entry in `~/.claude.json` shadows, and it reports only whether `VITE_API_TOKEN` is present, never the token. The script's exit status is the gate's. `scripts/new-lane.sh:172-200` `scripts/new-lane.sh:206-215` `scripts/new-lane.sh:271`

## Gotchas
- Do not name an example Tailwind class anywhere in a tracked file, including comments. Once a class is named, Tailwind generates it from that text, so it drops out of the canary's candidate set. `scripts/check-source-canary.mjs:47-48`
- Do not raise or lower `MINIMUM` to make a failing canary pass. Measure the healthy and broken counts again first. `scripts/check-source-canary.mjs:57-64`
- `schema:check` is deliberately left out of `gate` because it needs network access. The two counters only report and are not gated either. `scripts/check-schema.mjs:6-9` `scripts/count-assertions.mjs:21-23` `package.json:35`
- The test files are `.mjs` and use `process.cwd()`, not `import.meta.url`, because they run in jsdom, where `import.meta.url` is an http URL. They add nothing to coverage, which only counts `src/**`. `scripts/new-lane.test.mjs:22-27`
- Fixtures for `count-comments.test.mjs` must not end in `.test.tsx`. The script excludes that suffix, so every assertion would read zero and the test would pass without checking anything. `scripts/count-comments.test.mjs:30-41`
- `BASE_BRANCH='dev'` is the line most likely to be wrong in a copy from the ui-kit's version of the script, which uses `main`. A test pins it through the usage text. `scripts/new-lane.sh:38-42` `scripts/new-lane.test.mjs:44-50`
- `new-lane.sh` refuses lane names that contain `/` or start with `.`, and it refuses targets inside the repository. A worktree nested in the repo gets picked up by Vitest, ESLint and Prettier. If you remove these guards, the guard tests start creating real worktrees. `scripts/new-lane.sh:60-63` `scripts/new-lane.sh:80-89` `scripts/new-lane.test.mjs:15-20`
- `new-lane.sh` deliberately does not copy `.env.local` or `.vercel/`. They hold a short-lived Vercel OIDC token that would be stale by the time the lane used it; run `vercel link && vercel env pull` in the lane instead. `scripts/new-lane.sh:126-138`

## Generated facts

Produced by code from the git tree at the stamped SHA; not written by a model.

### Files (8 total, 3 tests)

- `scripts/check-schema.mjs`
- `scripts/check-source-canary.mjs`
- `scripts/count-assertions.mjs`
- `scripts/count-comments.mjs`
- `scripts/new-lane.sh`
