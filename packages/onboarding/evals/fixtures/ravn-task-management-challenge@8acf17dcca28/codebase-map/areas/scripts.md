---
area: "scripts"
title: "scripts"
paths: ["scripts/"]
tree_hash: "3380e63af119e6426936ce3af66ba1ae533af680"
built_at_sha: "8acf17dcca28036fa99cf09408e3646901d6add1"
built_at: "2026-09-30T05:30:09.780Z"
status: "ok"
summary: "Standalone Node and Bash tooling that sits beside the app rather than inside it: a schema-drift check against the live GraphQL API, a post-build Tailwind `@s..."
generator: "ravn-agents/onboarding 0.1.0"
---

# scripts

> Codebase map page, built at `8acf17dcca28`. It says where to look; confirm every claim against the cited code before relying on it.

## Summary
Standalone Node and Bash tooling that sits beside the app rather than inside it: a schema-drift check against the live GraphQL API, a post-build Tailwind `@source` canary, two AST-based reporting scripts (type assertions, comment density), and a worktree provisioner for parallel "lanes". The `.mjs` scripts are wired as npm scripts, and the three `*.test.mjs` files are Vitest suites that `npm run gate` runs alongside `src/`. `package.json:31-35`

## Key files
- `scripts/check-schema.mjs:1` — `npm run schema:check`: introspects the live API and diffs it against the committed `schema.graphql`; open when codegen types or MSW handlers look wrong.
- `scripts/check-source-canary.mjs:1` — `npm run css:canary`: after `npm run build`, verifies the kit's utility classes reached `dist/assets/*.css`; run in CI at `.github/workflows/ci.yml:96`.
- `scripts/count-assertions.mjs:1` — `npm run assertions`: lists every `as` (except `as const`) and non-null `!` in shipped `src/`, backing figures quoted in `CLAUDE.md`.
- `scripts/count-comments.mjs:1` — `npm run comments`: comment/code line ratio plus block and attachment tables; flags `--blocks`, `--compare`, `--scopes`, `--all`, `--root`. `scripts/count-comments.mjs:87-93`
- `scripts/new-lane.sh:1` — `scripts/new-lane.sh <lane-name> [branch]`: creates a worktree under `../wt/<lane>` from `origin/dev`, runs `npm ci`, `corvus sync`, copies local files, runs the gate, and prints a checklist.
- `scripts/hooks.test.mjs:7-19` — drives the `.claude/hooks/*.sh` scripts the way Claude Code does (JSON on stdin) so an inert hook fails a test.
- `scripts/new-lane.test.mjs:6-20` — pins only the pre-flight guards of `new-lane.sh` (usage, base branch `dev`, bad lane names), never the side-effecting steps.
- `scripts/count-comments.test.mjs:7-22` — hazard corpus (strings, regexes, JsxText that look like comments) run through the real script via `--root` in a temp dir.

## How it works
- Schema check normalises both sides through `printSchema` so formatting and field order cannot cause a false diff; endpoint is `VITE_API_URL` or the production Railway URL, and introspection needs no token. `scripts/check-schema.mjs:16-17` `scripts/check-schema.mjs:36-44`
- The CSS canary computes its candidates: classes emitted in built CSS, present in `node_modules/@ravn/ui-kit/dist`, and absent from every `git ls-files` file; fewer than `MINIMUM = 25` fails. `scripts/check-source-canary.mjs:107-134` `scripts/check-source-canary.mjs:64`
- Both counters parse with the TypeScript compiler API (`ts.createSourceFile`, `ScriptKind.TSX`) and share the same `EXCLUDED` regex: tests, `src/test/`, `src/graphql/generated/`. `scripts/count-assertions.mjs:31` `scripts/count-comments.mjs:79`
- `count-comments.mjs` finds comments via leading and trailing trivia plus empty `JsxExpression` nodes, then scores each line char-by-char as blank/comment/code; `--compare` diffs against the naive `classifyByLinePrefix`. `scripts/count-comments.mjs:183-230` `scripts/count-comments.mjs:289-297`
- `new-lane.sh` resolves the main checkout through `git rev-parse --git-common-dir`, so it works from inside another worktree, and refuses to nest a worktree inside the repo. `scripts/new-lane.sh:71-89`
- The lane copies `.claude/settings.local.json` and `.env` only, then reads back skills, MCP enablement/shadowing, token presence and gate status; exit code is the gate's. `scripts/new-lane.sh:130-138` `scripts/new-lane.sh:172-200` `scripts/new-lane.sh:271`

## Gotchas
- Never name an example class from the kit in any tracked file (including comments or docs): Tailwind scans the whole repo, so a named class drops out of the canary's candidate set for good. `scripts/check-source-canary.mjs:47-48`
- `schema:check` is deliberately not in `gate` because it needs network access; `assertions` and `comments` only report and exit 0 unless the scan finds no files. `scripts/check-schema.mjs:6-9` `scripts/count-assertions.mjs:92-98`
- `BASE_BRANCH='dev'` differs from the ui-kit's copy of this script (`main`); a test pins it through the usage text. `scripts/new-lane.sh:38-42` `scripts/new-lane.test.mjs:49-50`
- Test files here are `.mjs` and use `process.cwd()`, not `import.meta.url`: Vitest runs them under jsdom where `import.meta.url` is http, `tsconfig.json` covers only `src`, and coverage includes `src/**` alone. `scripts/hooks.test.mjs:16-24` `vite.config.ts:253`
- Deleting a guard in `new-lane.sh` makes `new-lane.test.mjs` create real worktrees and branches, because the tests rely on the guards exiting first. `scripts/new-lane.test.mjs:15-20`
- `count-comments.test.mjs` fixtures must not end in `.test.tsx`, or the exclusion regex skips them and every assertion passes against zero. `scripts/count-comments.test.mjs:33-36`
- `.env.local` and `.vercel/` are intentionally not copied into lanes (short-lived OIDC token); run `vercel link && vercel env pull` there instead. `scripts/new-lane.sh:126-129`

## Generated facts

Produced by code from the git tree at the stamped SHA; not written by a model.

### Files (8 total, 3 tests)

- `scripts/check-schema.mjs`
- `scripts/check-source-canary.mjs`
- `scripts/count-assertions.mjs`
- `scripts/count-comments.mjs`
- `scripts/new-lane.sh`
