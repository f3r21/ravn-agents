---
area: "claude"
title: ".claude"
paths: [".claude/"]
tree_hash: "45575daf6b6269c63050e4fef0eec7aaf34ef634"
built_at_sha: "ac7cb47c1e590616da040840cb26cb4e203d99f8"
built_at: "2026-09-26T21:58:14.483Z"
status: "ok"
summary: "`.claude/` configures how Claude Code (and any agent session) behaves in this repository: hooks that enforce safety and formatting on every tool call, slash..."
generator: "ravn-agents/onboarding 0.1.0"
---

# .claude

> Codebase map page, built at `ac7cb47c1e59`. It says where to look; confirm every claim against the cited code before relying on it.

## Summary
`.claude/` configures how Claude Code (and any agent session) behaves in this repository: hooks
that enforce safety and formatting on every tool call, slash commands that encode the issue
workflow, and path-scoped rule files that extend `CLAUDE.md` with detail loaded only when a
matching file is open. `.claude/settings.json:1` wires the hooks and the permission lists;
`.claude/rules/claude-setup.md:1` is the one file that explains what the whole setup actually
enforces versus only appears to.

## Key files
- `.claude/settings.json:1` — enabled plugin, the MCP tool allow-list, the `Read()` deny-list
  (`package-lock.json`, `coverage/`, `dist/`, `node_modules/`), and the `PreToolUse`/`PostToolUse`
  hook wiring.
- `.claude/hooks/block-dangerous.sh:1` — `PreToolUse(Bash)` hook; parses the tool call as JSON on
  stdin and denies a recursive forced `rm` at `/`/`$HOME`, a plain `git push --force`, and a
  download piped into a shell.
- `.claude/hooks/format-file.sh:1` — `PostToolUse(Edit|Write)` hook; runs `eslint --fix` and
  `prettier --write` on the file just edited, read from `tool_input.file_path`.
- `.claude/commands/start-issue.md:1` and `.claude/commands/finish-issue.md:1` — the only copies of
  this project's issue-lifecycle rules: branch naming and cutting, the gate-before-work check, the
  handoff comment shape, and closing issues by hand.
- `.claude/commands/gate.md:1`, `.claude/commands/schema-check.md:1` — thin wrappers over
  `npm run gate` and `npm run schema:check`.
- `.claude/commands/rebase-stack.md:1` — describes a stacked-branch layout (`feat/01-project-setup`
  through `feat/08-readme-polish`) that no longer exists in this repo.
- `.claude/rules/claude-setup.md:1` — what the hooks, the deny list and the lane provisioner
  (`scripts/new-lane.sh`) actually enforce, and which layers only look like they do.
- `.claude/rules/*.md` (`structure.md`, `testing.md`, `backends.md`, `styling.md`, `ui-kit.md`,
  `a11y-structures.md`, `browser-floor.md`, `sabotage.md`, `bonus-points.md`) — path-scoped rule
  fragments, each with a YAML-frontmatter `paths:` list that says which files load it, e.g.
  `.claude/rules/backends.md:4-9` loads for `src/lib/env.ts` and `src/graphql/**`.

## How it works
- `format-file.sh` reads `.tool_input.file_path` from stdin JSON (there is no `$FILE_PATH`
  environment variable) and skips files outside `$CLAUDE_PROJECT_DIR` before invoking
  `eslint`/`prettier`, so an edit to a file outside this project is never reformatted with this
  repo's config. `.claude/hooks/format-file.sh:24-38`
- `block-dangerous.sh` denies a command by writing a `permissionDecision` JSON object to stdout,
  not by a non-zero exit — a bare `exit 1` from a `PreToolUse` hook is non-blocking and Claude Code
  runs the command anyway. `.claude/hooks/block-dangerous.sh:16-19` `.claude/hooks/block-dangerous.sh:33-44`
- The force-push guard deliberately excludes `--force-with-lease`/`--force-if-includes`, since every
  lane rebases and force-pushes with lease, and matches `git push` even with an intervening global
  option like `-C <path>` that defeats a literal `git push` substring match.
  `.claude/hooks/block-dangerous.sh:79-99`
- `permissions.deny` in `settings.json` only refuses a shell reader whose command shape it
  recognises (`grep`, `cat`, `ls`) — it does not stop `node -e` reads of the same path, and it does
  not reach the `Write` tool at all. `.claude/rules/claude-setup.md:55-71`
- `/start-issue` and `/finish-issue` carry process rules that exist nowhere else in the repo:
  deriving the base branch, refusing to extend a branch with an open PR, the handoff-comment
  contract, and closing issues by hand because the repo's default branch (`main`) differs from the
  branch every PR targets (`dev`), so `Closes #<n>` never auto-fires.
  `.claude/commands/start-issue.md:60-71` `.claude/commands/finish-issue.md:24-28` `.claude/commands/finish-issue.md:137-148`

## Gotchas
- Both hooks originally no-op'd for the repo's entire history: `format-file.sh` interpolated a
  `$FILE_PATH` Claude Code never sets, and `block-dangerous.sh` read `$1`, which a `PreToolUse` hook
  is never given — installed, running, exiting 0, and completely inert.
  `.claude/hooks/block-dangerous.sh:8-14`
- `.claude/rules/claude-setup.md` documents three separate layers that refuse a force push (the
  hook, a gitignored `settings.local.json` deny glob, and the GitHub ruleset), and the middle one
  drifts out of agreement with the hook because it lives outside the repository and cannot be fixed
  from a PR. `.claude/rules/claude-setup.md:25-47`
- `.claude/commands/rebase-stack.md` describes a stacked eight-branch layout that is stale; treat it
  as historical rather than current process. `.claude/commands/rebase-stack.md:1`
- `ravn-ui-kit` keeps its own, deliberately different copies of `start-issue.md`/`finish-issue.md`
  (different required check, base branch and release mechanism) — port a rule across by hand, never
  copy the file. `.claude/commands/start-issue.md:3-6` `.claude/commands/finish-issue.md:3-6`

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
