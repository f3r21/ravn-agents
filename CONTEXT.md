# ravn-agents — CCAF concepts applied to RAVN tooling

Three working tools that apply the Claude Certified Architect – Foundations (CCAF) exam concepts
to everyday RAVN engineering work, each shipped with a live demo and one measured eval number.

## Glossary

- **CCAF domain** — one of the five exam areas: D1 agentic architecture & orchestration, D2 tool
  design & MCP integration, D3 Claude Code configuration & workflows, D4 prompt engineering &
  structured output, D5 context management & reliability.
- **Tool** — one of the three deliverables below. Not to be confused with an MCP/API *tool
  definition*, which is called a **tool definition** here.
- **The plugin** — the single Claude Code plugin that ships all three tools.
- **Eval** — a fixed set of real inputs with expected outcomes, producing one measured number per
  tool.
- **Failure mode** — a documented way a tool can go wrong, with the behaviour chosen for it
  (retry, escalate to a human, or refuse).

## Decisions

| # | Decision | Date |
|---|---|---|
| 1 | Users are RAVN engineers on client projects. | 2026-09-25 |
| 2 | The three tools: **PR reviewer**, **codebase onboarding**, **docs → tickets**. | 2026-09-25 |
| 3 | Depth over coverage: tools need not cover all five domains between them. | 2026-09-25 |
| 4 | Distribution: one Claude Code plugin (skills, subagents, hooks, MCP server). | 2026-09-25 |
| 5 | Demos and evals use RAVN-internal material only (`ravn-ui-kit`, `ravn-task-management-challenge`). No client data. | 2026-09-25 |
| 6 | Senior-level bar: end-to-end on real input + an eval with a measured number + documented failure modes and error handling. | 2026-09-25 |
| 7 | PR reviewer posts inline review comments on the PR via `gh`. | 2026-09-25 |
| 8 | PR reviewer eval replays historical PRs whose bug was fixed by a later PR (**recall**), plus clean control PRs (**precision / noise**). SZZ-derived labels, extended with issue-linked defects (SZZ alone missed fixes that were not fix-titled or only added lines), are checked by hand. Routing is compared against an "all finders" baseline. | 2026-09-25, rev. 2026-09-27 |
| 9 | Onboarding produces a persistent **codebase map** that works as a **router**: it says where to look, and every answer is confirmed by reading the cited code before replying. | 2026-09-25, rev. 2026-09-26 |
| 10 | Docs → tickets creates GitHub Issues through our own MCP server (tight tool definitions, structured errors) rather than GitHub's official MCP server; see `docs/adr/0001-own-github-issues-mcp-server.md`. | 2026-09-25 |
| 11 | PR reviewer: a **coordinator** reads the diff and decides which review subagents to run. Because Anthropic's own reviewers use a fixed finder set, the eval compares this against running all finders (decision 8). | 2026-09-25, rev. 2026-09-26 |
| 12 | Codebase map lives in the repo under `docs/codebase-map/` (`INDEX.md` under 200 lines, one page per area), stamped with the build SHA and a per-area tree hash. It is **never auto-loaded** (reached through a skill, not `@path` in CLAUDE.md). A `SessionStart` hook reporting staleness is mandatory; refresh is an explicit command that re-maps only stale areas. | 2026-09-25, rev. 2026-09-26 |
| 13 | Docs → tickets eval: input is the task-management challenge brief; ground truth is the brief's **39 checkboxes**, grouped as PRs #1–#8 grouped them. (The repo's 52 issues are post-delivery audit/CI/migration work, not brief tickets.) | 2026-09-25, rev. 2026-09-26 |
| 14 | Docs → tickets emits a confidence per field. The whole batch is previewed before anything is created. Items below a threshold are created as **open issues labelled `needs-review`** (GitHub Issues have no draft state), then read back to confirm the label stuck. The threshold is calibrated on a **separate split** from the one the eval reports on. | 2026-09-25, rev. 2026-09-26 |
| 15 | The three tools are built **in parallel** by separate agents/sessions; this session only sets up the minimum shared ground and delegates. No calendar schedule: plans are ordered by dependency, not dates. | 2026-09-25 |
| 16 | Stack: TypeScript (MCP server, eval harness, plugin code). | 2026-09-25 |
| 17 | PR reviewer precision: finders get explicit **category** criteria with examples (not severity thresholds) and report every finding with severity + confidence; a **verifier subagent** filters them; severity then only decides inline comment vs. the single summary comment. | 2026-09-25, rev. 2026-09-26 |
| 18 | Onboarding eval: **20+ questions** with reference answers and file:line evidence, answered with and without the map (paired). Measure accuracy, tokens, time and tool calls; report k/n with a Wilson 95% interval. Includes questions whose answer changed after the map was built. | 2026-09-25, rev. 2026-09-26 |
| 19 | Isolation: each tool is built in its own worktree/branch and merged into `main` through a reviewed pull request. | 2026-09-25 |
| 20 | Fixed before delegating: monorepo skeleton (`packages/pr-review`, `packages/onboarding`, `packages/docs-to-tickets`) with one plugin manifest, and one shared **eval report** JSON shape. | 2026-09-25 |
| 21 | Plugin name: `ravn-agents`. | 2026-09-25 |
| 22 | Models: **Opus 5.5 for every agent, extraction call and eval judge**, pinned by full model ID (`claude-opus-5-5`). Sonnet 5 survives only as a cost-comparison variant in the PR reviewer eval (Sonnet 5 finders and verifier). Fable 5.1 is not used: too expensive and not available to every engineer. Structured output uses **structured outputs / strict tools, never forced `tool_choice`** (Opus 5.5 returns 400). Nothing is pinned to Haiku 4.5 (retirement from 2026-10-15). Supersedes rules 7 and 9 of `docs/research/foundation-plugin-and-evals.md` §6. | 2026-09-25, rev. 2026-09-26 (twice) |
| 23 | Presentation: live demo of each tool on real repos + a one-page summary (problem → CCAF concept → eval number → adoption cost). | 2026-09-25 |
| 24 | Eval judges run on `claude-opus-5-5`, the same model as the tool they grade. The self-preference risk is accepted and bounded per tool: the PR reviewer judge only sees pairs that passed a line-overlap pre-filter against a known ground-truth defect; the onboarding judge grades against a written reference answer with cited evidence. Both are checked by human agreement on a sample of judge decisions. | 2026-09-26 |
| 25 | Docs → tickets has two extraction paths: in Claude Code the `ticket-extractor` subagent with ajv validation in code; in the eval the Messages API with structured outputs, sharing prompt, examples, schema and model. Accepted as is; the README states that the eval number measures the API path. | 2026-09-26 |

## Platform constraints

Verified in `docs/research/foundation-plugin-and-evals.md` unless noted. These bind every build agent.

- The plugin root is the repo root. Component paths start with `./` and stay inside it;
  files outside the root are not copied to the plugin cache.
- Plugin-shipped subagents ignore `hooks`, `mcpServers` and `permissionMode` frontmatter. Hooks and
  the MCP server are declared at plugin level; each agent's reach is limited by its `tools` field.
- Skill `allowed-tools` pre-approves tools, it does not restrict them.
- Posting reviews needs a `Bash(gh pr review *)` allow rule on the user's side (decision 7).
- npm workspaces with `package-lock.json` (the plugin cache skips pnpm/Yarn lockfiles). The MCP
  server and hook scripts are bundled to `dist/`.
- The shared eval report JSON Schema lives in `schemas/` (`evals/` is the default directory of
  `claude plugin eval`).
- GitHub issue creation has no idempotency key: dedupe on a body marker, create sequentially
  (≥ 1 s apart), keep a resumable manifest (`docs/research/docs-to-tickets.md`).
- Every eval number is reported as k/n with a Wilson 95% interval and a paired baseline.

## Known facts

- `ravn-ui-kit` has 85 PRs and `ravn-task-management-challenge` 120 (checked 2026-09-25). Both
  are on GitHub under `f3r21/`, so `gh` can read them.
- Issues: 52 in `ravn-task-management-challenge`, 74 in `ravn-ui-kit` (checked 2026-09-25).
- The challenge brief is copied to `packages/docs-to-tickets/evals/brief/` (Goal, Summary, General
  Requirements, Project Requirements, Resources); its UI-Kit (Figma exports) is left out.

## Research

Concepts, state of the art and sources live in `docs/research/`, one document per tool plus a
shared foundation. Read these before building; they replace anyone's memory of the exam.

- `docs/research/pr-reviewer.md`
- `docs/research/codebase-onboarding.md`
- `docs/research/docs-to-tickets.md`
- `docs/research/foundation-plugin-and-evals.md` (plugin packaging, eval report schema, CCAF concept index)
