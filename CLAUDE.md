# ravn-agents

A Claude Code plugin (`ravn-agents`) with three tools that apply the CCAF exam concepts to RAVN
engineering work. The repo root is both the plugin root and the marketplace root.

## Read before changing anything

1. `CONTEXT.md` — glossary, numbered decisions, platform constraints. Decisions are binding; if one
   looks wrong, say so instead of working around it.
2. `docs/research/foundation-plugin-and-evals.md` — plugin layout, models, eval method.
3. The research doc for the tool you are working on, in `docs/research/`.

## Layout

- `.claude-plugin/` — `plugin.json`, `marketplace.json`. Tool branches only append to `agents`.
- `schemas/eval-report.schema.json` — the contract every eval writes. Do not fork it.
- `packages/eval-core/` — `wilson()` and `validateReport()`; use them, do not reimplement.
- `packages/<tool>/` — one tool each: `skills/`, `agents/`, `src/`, `evals/`, `dist/` (committed).

## Workflow

- `main` only changes through pull requests. Branch as `tool/<name>`, `feat/<topic>` or
  `fix/<topic>`; the other contributor reviews and merges.
- Commit subjects follow Conventional Commits, scoped by package: `fix(pr-review): ...`.
- A PR that changes `src/` also rebuilds and commits that package's `dist/`.

## Rules

- English for code, comments, docs and commit messages. No sign of AI assistance anywhere.
- The human in the session runs every state-changing command: `git commit/add/push`,
  `npm install`, anything that posts to GitHub or creates issues, and full paid eval runs. Agents
  may run `npm test`, `npm run typecheck` and read-only `git`/`gh`. When a dependency is missing,
  name the exact `npm install -w <pkg> <dep>` command and stop.
- Exception, cloud sessions (Claude Code on the web): they may commit, push `claude/*` branches and
  open pull requests. They never merge, never run evals and never create issues (decision 27).
- Outward-facing actions default to dry-run: the PR reviewer prints instead of posting, the MCP
  server refuses to create issues unless explicitly enabled.
- Pin models by full ID: `claude-opus-5-5` everywhere (decision 22). No forced `tool_choice`.
- `npm test` · `npm run typecheck` · `claude plugin validate .`
