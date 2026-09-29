# docs → tickets

Turns a requirements brief into GitHub issues. Each ticket cites the requirement ids it covers,
every ticket is checked in code before anything is created, the whole batch is previewed once,
and tickets below a calibrated confidence threshold are created with a `needs-review` label.

Part of the `ravn-agents` plugin. Decisions: CONTEXT.md 10, 13, 14, 22.
Research: [`docs/research/docs-to-tickets.md`](../../docs/research/docs-to-tickets.md).
Why a custom MCP server: [ADR 0001](../../docs/adr/0001-own-github-issues-mcp-server.md).

## How it works

```
brief (.md file or folder)
  │  CLI requirements        deterministic ids: header.2, update.5, bonus-points.3 ...
  ▼
ticket-extractor agent      claude-opus-5-5, 3 few-shot examples (1:1, merge, split/skip),
  │                          per-field confidence (source_refs, type, priority, acceptance_criteria)
  ▼
CLI plan                    schema check + semantic checks (refs resolve, full coverage or explicit
  │                          exclusion, grounded criteria, priority, duplicates, labels)
  │                          → one targeted retry → idempotency keys → routing → preview
  ▼
user confirms the batch once
  ▼
MCP server `tickets`        github_issue_create per ticket: dedupe by body marker, ≥ 1 s spacing,
                             bounded retries, needs-review decided in code, label read-back,
                             resumable manifest. Dry-run unless RAVN_TICKETS_LIVE=1.
```

| Piece | Path |
|---|---|
| Skill (entry point) | `skills/docs-to-tickets/SKILL.md` → `/ravn-agents:docs-to-tickets <brief> <owner/repo>` |
| Extraction agent | `agents/ticket-extractor.md` (its body is also the API-path system prompt) |
| MCP server | `src/server.ts` → `dist/server.js`; logic in `src/issue-service.ts` |
| CLI | `src/cli.ts` → `dist/cli.js` (`requirements`, `plan`, `extract`) |
| Thresholds | `thresholds.json` (uncalibrated default until a calibration run replaces it) |
| Eval | `evals/` (`items.json`, `rubric.md`, `run.ts`) |
| Failure modes | [`FAILURE-MODES.md`](FAILURE-MODES.md) |

### MCP surface

- `github_issue_create`: one planned ticket → one issue, idempotently. Returns `created`,
  `existing` for a duplicate, or `isError` with `{category, retryable, retry_after_s,
  failure_mode, what_failed, what_was_done, next_step}`.
- `github_issue_list_created`: issues this tool created in a repo, plus the manifest summary.
- Resource `ravn-tickets://{owner}/{repo}/created`: the same catalog, for clients that read
  resources.

### Configuration (MCP server environment)

| Variable | Default | Meaning |
|---|---|---|
| `RAVN_TICKETS_LIVE` | unset | Exactly `1` enables creating issues. Anything else is dry-run. |
| `GITHUB_TOKEN` | plugin option `github_token` | Needs issues:write; labels also need push access. |
| `CLAUDE_PLUGIN_DATA` | set by Claude Code for plugin MCP servers | Manifests live in `${CLAUDE_PLUGIN_DATA}/tickets/<owner>__<repo>/manifest.json`. If it is missing, every tool call fails with `DT-NO-STATE-DIR`; the server never falls back to its working directory, which is not documented. |
| `RAVN_TICKETS_THRESHOLDS` | `thresholds.json` in this package | Calibrated routing thresholds. |

## Usage

```sh
# In Claude Code, with the plugin installed:
/ravn-agents:docs-to-tickets path/to/brief owner/sandbox-repo

# The deterministic steps on their own, on the challenge brief. --state-dir is required and must
# end in <owner>__<repo>; the skill passes "${CLAUDE_PLUGIN_DATA}/tickets/<owner>__<repo>" so the
# plan step and the MCP server share one manifest.
node packages/docs-to-tickets/src/cli.ts requirements packages/docs-to-tickets/evals/brief
node packages/docs-to-tickets/src/cli.ts plan --brief packages/docs-to-tickets/evals/brief \
  --tickets <tickets.json> --repo owner/sandbox-repo --state-dir /tmp/ravn-data/tickets/owner__sandbox-repo
```

Live creation: point the skill at a sandbox repository first, then start Claude Code with
`RAVN_TICKETS_LIVE=1` in the MCP server's environment.

## CCAF concepts applied

Numbers refer to the concept index in
[`docs/research/foundation-plugin-and-evals.md` § 5](../../docs/research/foundation-plugin-and-evals.md#5-ccaf-concept-index).

| # | Concept | Where |
|---|---|---|
| 5 | Programmatic enforcement over prompts | review routing, key check and label read-back live in the server |
| 6 | Structured human handoff | `needs-review` issues carry their reasons; errors carry what was done and the next step |
| 10 | Tool descriptions and splitting | two narrow tool definitions with multi-sentence descriptions |
| 11 | Structured tool errors | one typed error body with category and `retryable` |
| 13 | `tool_choice` | not forced: structured outputs on the API path (forced tool use returns 400 on Opus 5.5) |
| 14 | MCP server scope and env expansion | plugin `mcpServers` with `${user_config.github_token}` |
| 15 | Resources vs tools | created-issue catalog exposed as a resource; creation as a tool |
| 28, 29 | Explicit criteria, few-shot | granularity rules plus three examples from a non-eval document |
| 30–32 | Structured output, nullable + "other", semantic validation and retry | `ticket-schema.ts`, `validate.ts`, one targeted retry |
| 35, 38 | Escalation criteria, calibrated field-level confidence | per-field thresholds fitted on a separate calibration split |
| 36, 37 | Error propagation, manifests | partial batches reported as created / skipped / failed / not attempted |
| 39 | Provenance | every ticket cites requirement ids and quotes their text |

## Eval

Headline: **requirement coverage recall** on the eval split of the brief's 39 checkboxes (26
items; 13 more calibrate the thresholds). Secondary: per-field accuracy (grouping, type,
priority) and the share routed to `needs-review`. Baseline: single-pass extraction, paired.
Details in [`evals/rubric.md`](evals/rubric.md).

Inside Claude Code the extraction runs as the `ticket-extractor` subagent, with ajv validation in
code. The eval measures the Messages API path with structured outputs, using the same prompt,
examples, schema and model (`claude-opus-5-5`). The two paths are accepted as they are (CONTEXT.md
decision 25); the eval number is evidence for the API path.

```sh
node packages/docs-to-tickets/evals/run.ts --extractor fixture --limit 2   # harness smoke, no API
node packages/docs-to-tickets/evals/run.ts                                  # full run, calls the API
```

| Run | Recall (eval split) | Wilson 95% | Baseline | Needs review |
|---|---|---|---|---|
| _pending full run_ | – | – | – | – |

## Development

`npm test` · `npm run typecheck` · `npm run build -w packages/docs-to-tickets` (bundles
`dist/server.js` and `dist/cli.js`) · `claude plugin validate .`
