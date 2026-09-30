---
area: "claude"
title: ".claude"
paths: [".claude/"]
tree_hash: "aa1eba74db7062946a180756607138e26437b1fd"
built_at_sha: "8acf17dcca28036fa99cf09408e3646901d6add1"
built_at: "2026-09-30T05:30:09.780Z"
status: "ok"
summary: "`.claude/` is the Claude Code configuration for this repo."
generator: "ravn-agents/onboarding 0.1.0"
---

# .claude

> Codebase map page, built at `8acf17dcca28`. It says where to look; confirm every claim against the cited code before relying on it.

## Summary
`.claude/` is the Claude Code configuration for this repo. It holds project settings with two shell hooks, five slash commands for the issue/PR lane workflow, and five rule documents that agents follow. None of it ships in the app. `scripts/hooks.test.mjs` is the only test that runs the hooks. `.claude/settings.json:19-42` `scripts/hooks.test.mjs:7-14`

## Key files
- `.claude/settings.json:1` — permission allow list (Playwright and Chrome DevTools MCP tools), a `deny` list for reading lockfile, `coverage`, `dist` and `node_modules`, and the hook wiring. Open it to change which tools agents may use.
- `.claude/hooks/block-dangerous.sh:1` — PreToolUse(Bash) guard that refuses dangerous `rm -rf`, plain force pushes, `--no-preserve-root` and curl/wget piped into a shell.
- `.claude/hooks/format-file.sh:1` — PostToolUse(Edit|Write) hook that runs ESLint `--fix` and Prettier on the edited file.
- `.claude/commands/start-issue.md:1` — `/start-issue <n>`: checks blockers, derives the base branch, cuts `<type>/<n>-<slug>`, runs the gate first, and reads the issue body plus comments.
- `.claude/commands/finish-issue.md:1` — `/finish-issue <n>`: gate, conventional commits, PR into `dev`, CI sabotage proof, a HANDOFF comment in a fixed shape, then closing the issue by hand.
- `.claude/rules/figures.md:1` — every number written down must come with the command that re-derives it. Also covers pipe exit status and positive controls.
- `.claude/rules/ui-kit.md:1` — how `@ravn/ui-kit` is pinned by git tag and verified, and why kit defects are fixed in the kit.
- `.claude/rules/graphql-api.md:1`, `.claude/rules/code-review.md:1`, `.claude/rules/bonus-points.md:1` — data-layer limits (React Query plus a hand-written fetch, a fixed set of operations), review hygiene (no `any`, no barrel files), and the five challenge bonus goals.

## How it works
- Both hooks get their input as JSON on stdin and parse it with `node -e` using `process.getBuiltinModule`, not `jq`. They do not use argv or env vars. `.claude/hooks/block-dangerous.sh:5-31` `.claude/hooks/format-file.sh:24-27`
- `block-dangerous.sh` refuses by printing a `permissionDecision: "deny"` JSON on stdout and exiting 0. A bare non-zero exit would not block the command. `.claude/hooks/block-dangerous.sh:16-19` `.claude/hooks/block-dangerous.sh:33-44`
- Force-push detection tolerates git global options such as `-C <path>`. It matches `--force`, `-f` and `+refspec`, but deliberately not `--force-with-lease`. `.claude/hooks/block-dangerous.sh:79-99`
- `format-file.sh` skips files outside `$CLAUDE_PROJECT_DIR`. It runs ESLint only on JS/TS extensions, runs Prettier with `--ignore-unknown`, and calls both through `npx --no --`. `.claude/hooks/format-file.sh:36-59`
- `/start-issue` probes `origin/dev` first and falls back to the default branch, so lane branches come from `dev` and not `main`. It cuts them with `--no-track` so `lane-status.py` can tell a branch that was never pushed. `.claude/commands/start-issue.md:20-31` `.claude/commands/start-issue.md:83-89`
- `/gate`, `/schema-check` and `/rebase-stack` are one-line prompts around `npm run gate` and `npm run schema:check`. `.claude/commands/gate.md:1` `.claude/commands/schema-check.md:1` `.claude/commands/rebase-stack.md:1`

## Gotchas
- A hook that does nothing still exits 0, so both hooks were inert for months: they read `$1` and `$FILE_PATH`, which do not exist. If you edit either hook, run `scripts/hooks.test.mjs`. `.claude/hooks/block-dangerous.sh:8-14` `scripts/hooks.test.mjs:27-37`
- `block-dangerous.sh` fails closed: if it cannot parse the payload, it denies the command. `.claude/hooks/block-dangerous.sh:48-52`
- `FORCE_FLAG_END` must never accept `-`. That exclusion is the only thing that keeps `--force-with-lease` allowed. `.claude/hooks/block-dangerous.sh:81-89`
- A coarse `permissions.deny` glob such as `Bash(git push --force*)` once blocked a legitimate `--force-with-lease` push, with no way for the agent to approve it. Check the deny globs against the hook regex when you change either. `.claude/commands/finish-issue.md:37-44` `.claude/commands/finish-issue.md:93-98`
- `Closes #n` never closes anything here, because PRs target `dev` and the default branch is `main`. Issues are closed by hand after the merge. `.claude/commands/finish-issue.md:137-148`
- The `Read(./node_modules/**)` deny matches the tool, not the file, so `node -e` can still read kit types and the lockfile. The rules treat this as deliberate friction, not a security boundary. `.claude/rules/ui-kit.md:65-71`
- `start-issue.md` and `finish-issue.md` differ on purpose from their copies in `ravn-ui-kit`. Port rules by hand and never copy the file. `.claude/commands/start-issue.md:3-6`

## Generated facts

Produced by code from the git tree at the stamped SHA; not written by a model.

### Files (13 total, 0 tests)

- `.claude/commands/finish-issue.md`
- `.claude/commands/gate.md`
- `.claude/commands/rebase-stack.md`
- `.claude/commands/schema-check.md`
- `.claude/commands/start-issue.md`
- `.claude/hooks/block-dangerous.sh`
- `.claude/hooks/format-file.sh`
- `.claude/rules/bonus-points.md`
- `.claude/rules/code-review.md`
- `.claude/rules/figures.md`
- `.claude/rules/graphql-api.md`
- `.claude/rules/ui-kit.md`
- `.claude/settings.json`
