# Codebase onboarding (`ravn-agents`)

Builds a **codebase map** in a repository's `docs/codebase-map/` and uses it as a router: a new
engineer (or an agent) asks a question, the map says which files to read, and the answer is
confirmed against those files before it is given, with `file:line` evidence.

- `/ravn-agents:onboard` builds the map. `/ravn-agents:onboard --refresh` re-maps only the areas
  that changed.
- `/ravn-agents:ask-codebase <question>` answers through the map. Claude may also pick it on its
  own for "where / how / why" questions about the repository.
- A `SessionStart` hook reports stale areas into Claude's context. It never blocks and never
  refreshes.
- The map is never auto-loaded: nothing is `@`-imported into CLAUDE.md.

## What the map is

```
docs/codebase-map/
├── INDEX.md          # < 200 lines: one row per area, build SHA, entry points, commands
├── areas/<slug>.md   # one page per area: prose (validated) + generated facts
└── .gitignore        # keeps .build/ (plan, facts, drafts) out of git
```

Two layers, per the research doc's design rules:

| Layer | Written by | Contents | Checked by |
|---|---|---|---|
| Generated | `dist/map-cli.js` (TypeScript, no model) | Area split, file lists, exports with `file:line`, package scripts with lines, entry points, per-area content hash | Correct by construction |
| Prose | `area-mapper` subagents (Opus 5.5), one per area, in parallel | Summary, key files, how it works, gotchas, every claim with `path:line` | `assemble` rejects a draft with an uncited claim, a cited path absent at the stamped SHA or a line past the end of the file |

Every page's frontmatter carries `built_at_sha` and `tree_hash` (sha1 over the area's
`<blob> <path>` entries from `git ls-tree -r`). A rejected area is written as `status: missing`
with its reason and only the generated facts, and INDEX.md marks it **Not covered**.

Areas are derived from the file tree by code: each top-level directory is an area, a directory
with more than 50 files is split into its subdirectories (up to depth 3), and root files plus
directories with fewer than 3 files fold into a remainder area. `ravn-task-management-challenge`
yields 14 areas.

## Install and use

The plugin is the repository root (see the root README / `CONTEXT.md`):

```bash
claude plugin marketplace add f3r21/ravn-agents   # or a local clone's path
claude plugin install ravn-agents@ravn-labs
```

In the target repository, with a clean working tree:

```
/ravn-agents:onboard
/ravn-agents:ask-codebase How does a search in the board reach the API?
```

Review and commit `docs/codebase-map/` yourself. After new commits, the next session starts with
a line like:

```
codebase-map: 1 of 14 areas stale: src-app (files in the area changed) (built at ac7cb47,
HEAD dad23fe). Treat those pages as possibly wrong and confirm against the code. To re-map only
these areas, run /ravn-agents:onboard --refresh.
```

The CLI is usable on its own (it is what the skills call):

```bash
node packages/onboarding/dist/map-cli.js status     # staleness vs HEAD; exit 1 when stale
node packages/onboarding/dist/map-cli.js validate   # re-check every citation (for CI)
node packages/onboarding/dist/map-cli.js plan [--refresh] | assemble
```

## Demo (real run, 2026-09-26)

Map built headlessly for `ravn-task-management-challenge` at `ac7cb47`:

```bash
cd <clone of ravn-task-management-challenge>
claude -p "/ravn-agents:onboard" --plugin-dir <repo root> --model claude-opus-5-5 \
  --allowedTools "Bash(node *)" Agent Read Grep Glob Write
```

- 14 areas, 14 mapped, 0 not covered; INDEX.md 56 lines. The validator rejected 3 first drafts
  (a line past the end of `CLAUDE.md`, a path missing its directory, three uncited claims); the
  single retry fixed each.
- 185 s wall, $2.44 ($0.52 Opus coordinator, $1.92 Sonnet mappers), 234 tool calls.
- The result is kept as a reviewable fixture:
  `evals/fixtures/ravn-task-management-challenge@ac7cb47c1e59/codebase-map/`.
- This run and its fixture were built with `claude-sonnet-5` mappers, before the mappers moved to
  `claude-opus-5-5`. At Opus 5.5 list price ($4/$20 per MTok, twice Sonnet 5) the mapper share
  roughly doubles, so the same build is estimated at about $4.40.

## CCAF concepts applied

Numbers refer to the concept index in
[`docs/research/foundation-plugin-and-evals.md` §5](../../docs/research/foundation-plugin-and-evals.md#5-ccaf-concept-index).

| # | Concept | Here |
|---|---|---|
| 3 | Explicit context passing to subagents | Each mapper gets its area, facts path and draft path as structured text; it inherits nothing |
| 4 | Parallel subagent spawning | All mappers are spawned in one message |
| 5 | Programmatic enforcement over prompts | Citation validator, budgets, dirty-tree refusal are code |
| 7 | Hooks | `SessionStart` staleness report via `additionalContext`, never blocking |
| 8 | Prompt chaining | Per-area mapping, then a deterministic integration step (`assemble`, INDEX.md) |
| 9 | Fresh session with a summary | The map is the persisted summary a later session starts from |
| 12 | Scoped tools per agent | `area-mapper` has Read, Grep, Glob, Write only |
| 16 | Built-in Grep / Glob / Read | Answers confirm by reading the cited lines |
| 19 | Skills | `onboard` (user-invoked only) and `ask-codebase` (progressive disclosure: index, then at most two pages) |
| 26 | Isolating verbose discovery | Mappers read ~160 files in their own contexts and return one line each |
| 34 | Trimming what enters context | INDEX.md under 200 lines; pages load on demand |
| 35 | Escalation criteria | Stale, not covered and conflicting pages are named, not hidden (FAILURE-MODES.md) |
| 37 | Scratchpad / manifest for large codebases | The map and its per-area stamps; refresh re-maps only stale areas |
| 39 | Provenance | Every claim carries `file:line`; every page and answer carries the map SHA |

## Eval

Frozen set: 25 questions about `ravn-task-management-challenge` at `ac7cb47`
(`evals/items.json`): where 2, what 5, how 6, why 3, config 3, stale 4 (map built at `8acf17d`,
asked at `ac7cb47`), unanswerable 2. 15 are graded by code, 10 by a `claude-opus-5-5` judge with
`evals/rubric.md`; the answering model is also `claude-opus-5-5`. Paired: each question runs with the
map (plugin + `ask-codebase`) and as plain Claude Code in a clone without the map.
A full run first builds the stale map at `8acf17d`; with Opus mappers that build is estimated at
about $4.40 (the Sonnet-mapper build of this repository's map above cost $2.44).

```bash
npm run eval -w packages/onboarding -- check --target <clone>                 # free
npm run eval -w packages/onboarding -- run   --target <clone> --items Q02,Q12   # smoke
npm run eval -w packages/onboarding -- run   --target <clone>                   # full, paid
npm run eval -w packages/onboarding -- report --results <dir> --human evals/human-grades.json
```

Results: the full run has not been done yet (it is paid; the maintainer's call). Smoke run on 2 items
(Q02 code-graded, Q12 judge-graded), `partial: true`, report at `evals/results/2026-09-26-5410f93-1790460627030/report.json`
(results are gitignored):

| | With map | Plain Claude Code |
|---|---|---|
| Correct | 2 of 2 (Wilson 95%: 0.34 to 1.00) | 2 of 2 |
| Median input tokens per answer | 121,497 | 121,350 |
| Median wall seconds | 20.2 | 18.2 |
| Median tool calls | 7.5 | 7 |
| Median cost per answer | $0.22 | $0.15 |

Two items cannot distinguish the conditions; the smoke run only proves the harness end to end
(clones, plugin loading, both graders, report validation). Judge agreement with human grades is
not measured until the 10 judge items are hand-graded (`evals/human-grades.json`).

Failure modes and their ids: [FAILURE-MODES.md](FAILURE-MODES.md).

## Development

```bash
npm test                                  # from the repo root
npm run build -w packages/onboarding      # rebuilds dist/ (committed; the plugin cache runs no build)
```
