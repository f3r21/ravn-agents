---
area: "claude"
title: ".claude"
paths: [".claude/"]
tree_hash: "45575daf6b6269c63050e4fef0eec7aaf34ef634"
built_at_sha: "ac7cb47c1e590616da040840cb26cb4e203d99f8"
built_at: "2026-09-30T05:28:33.367Z"
status: "ok"
summary: "`.claude/` is the Claude Code configuration for this repo: project settings with two shell hooks, five slash commands that hold the project's process rituals..."
generator: "ravn-agents/onboarding 0.1.0"
---

# .claude

> Codebase map page, built at `ac7cb47c1e59`. It says where to look; confirm every claim against the cited code before relying on it.

## Summary
`.claude/` is the Claude Code configuration for this repo: project settings with two shell hooks, five slash commands that hold the project's process rituals, and ten path-scoped rule files that load when you touch the code they govern. It contains no application code, but the hooks are exercised by `scripts/hooks.test.mjs` inside `npm run gate`, so breaking them fails the build. `.claude/settings.json:22-45` `CLAUDE.md:43-45`

## Key files
- `.claude/settings.json:1` — enables the `lane-orchestration` plugin, allow-lists some Playwright/DevTools MCP tools, denies reads of `package-lock.json`, `coverage/`, `dist/` and `node_modules/`, and wires both hooks.
- `.claude/hooks/block-dangerous.sh:1` — PreToolUse(Bash) guard that denies `rm -rf` on `/` or home, `--no-preserve-root`, plain force pushes and `curl|sh`. Open it before you change any of those regexes.
- `.claude/hooks/format-file.sh:1` — PostToolUse(Edit|Write) hook that runs ESLint `--fix` on JS/TS files and Prettier on every file after an edit.
- `.claude/rules/claude-setup.md:1` — explains what the hooks, deny list, ruleset and lane provisioner actually enforce and what they only appear to enforce. Read this first for anything under `.claude/` or `.github/`.
- `.claude/commands/start-issue.md:1` — `/start-issue`: blocker check, base derivation, open-PR stop, branch naming, and reading the issue with its comments.
- `.claude/commands/finish-issue.md:1` — `/finish-issue`: re-read comments, gate, commit, push/PR into `dev`, and the HANDOFF template (`.claude/commands/finish-issue.md:103-110`).
- `.claude/rules/testing.md:1`, `.claude/rules/backends.md:1`, `.claude/rules/structure.md:1`, `.claude/rules/ui-kit.md:1`, `.claude/rules/styling.md:1` — domain rules. Each has a `paths:` frontmatter that controls when it loads (for example, backends covers `src/graphql/**`, `src/mocks/**`, `api/**` and `.mcp.json`). `.claude/rules/backends.md:4-9`
- `.claude/commands/gate.md:1`, `.claude/commands/schema-check.md:1` — thin wrappers over `npm run gate` and `npm run schema:check` + `npm run codegen`.

## How it works
- Both hooks read the tool payload as JSON on stdin through a `node -e` snippet (`tool_input.command` / `tool_input.file_path`). They use `node` rather than `jq` because node is guaranteed by the engines field. `.claude/hooks/block-dangerous.sh:21-31` `.claude/hooks/format-file.sh:24-27`
- A denial is a `permissionDecision: "deny"` JSON object printed to stdout, followed by `exit 0`. If the payload cannot be parsed, the hook fails closed with a denial. `.claude/hooks/block-dangerous.sh:33-52`
- The force-push regex allows `--force-with-lease` and `--force-if-includes`, handles git global options such as `-C <path>` between `git` and `push`, and catches `+refspec`. `.claude/hooks/block-dangerous.sh:79-99`
- `format-file.sh` skips files outside `$CLAUDE_PROJECT_DIR` and uses `npx --no --` so it never downloads a missing binary. Lint failures it cannot fix are swallowed with `|| true`. `.claude/hooks/format-file.sh:36-59`
- `scripts/hooks.test.mjs` runs each hook the way Claude Code does (payload on stdin, empty argv). It lives in `scripts/` because Vitest does not collect tests from dotted directories. `scripts/hooks.test.mjs:7-30`
- `/start-issue` sets the base to `origin/dev` if it exists, otherwise the default branch. It stops on an open blocker or an open PR for the current branch, and cuts `<type>/<n>-<slug>` with `--no-track`. `.claude/commands/start-issue.md:11-33`

## Gotchas
- The original hooks read `$1` / `$FILE_PATH`, were inert for the repo's whole history, and still exited 0. Any `exit 1` is non-blocking and the command runs anyway. Keep the stdin + JSON-decision contract. `.claude/hooks/block-dangerous.sh:5-19`
- `FORCE_FLAG_END` deliberately excludes `-`. That is the only thing that separates `--force` from `--force-with-lease`, and every lane pushes with the lease form after rebasing. `.claude/hooks/block-dangerous.sh:81-89`
- The `permissions.deny` `Read()` rules are friction, not a boundary: `node -e` and the Write tool get past them. Two documented recipes rely on that on purpose. `.claude/rules/claude-setup.md:49-78`
- `.claude/settings.local.json` and `.claude/skills/` are gitignored, so the glob deny layer drifts between machines and a new worktree starts with neither. Use `scripts/new-lane.sh`. `.claude/rules/claude-setup.md:127-141`
- `/rebase-stack` describes an 8-branch stack that no longer exists. Do not follow it. `.claude/commands/rebase-stack.md:1` `.claude/rules/claude-setup.md:82-83`
- `/start-issue` and `/finish-issue` exist in a different form in `ravn-ui-kit` (different base branch and required check). Port rules between them by hand and never copy the file. `.claude/commands/start-issue.md:3-6`
- `Closes #<n>` does not close issues here because PRs target `dev`, not the default branch `main`. Close issues by hand after the merge. `.claude/commands/finish-issue.md:24-28`
- Several files cite `.claude/rules/figures.md`, but no such file exists in `.claude/rules/`. `scripts/count-comments.mjs:3`

## Generated facts

Produced by code from the git tree at the stamped SHA; not written by a model.

### Files (18 total, 0 tests)

- `.claude/commands/finish-issue.md`
- `.claude/commands/gate.md`
- `.claude/commands/rebase-stack.md`
- `.claude/commands/schema-check.md`
- `.claude/commands/start-issue.md`
- `.claude/hooks/block-dangerous.sh`
- `.claude/hooks/format-file.sh`
- `.claude/rules/a11y-structures.md`
- `.claude/rules/backends.md`
- `.claude/rules/bonus-points.md`
- `.claude/rules/browser-floor.md`
- `.claude/rules/claude-setup.md`
- `.claude/rules/sabotage.md`
- `.claude/rules/structure.md`
- `.claude/rules/styling.md`
- `.claude/rules/testing.md`
- `.claude/rules/ui-kit.md`
- `.claude/settings.json`
