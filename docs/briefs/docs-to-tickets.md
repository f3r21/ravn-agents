# Brief: docs → tickets (`packages/docs-to-tickets`)

> Historical brief. Model IDs below were superseded on 2026-09-26: every agent now runs on
> `claude-opus-5-5` (CONTEXT.md decision 22).

Research doc: `docs/research/docs-to-tickets.md`. ADR: `docs/adr/0001-own-github-issues-mcp-server.md`.
Decisions: 10, 13, 14, 22 (revised 2026-09-26).

## What to build
- MCP server (stdio, official TypeScript SDK + Zod), bundled to `dist/server.js` (the manifest
  already points there). Two tool definitions: `github_issue_create`, `github_issue_list_created`,
  plus a resource listing issues it created. Errors return `isError` with a typed JSON body.
  Idempotency via a body marker, sequential creation ≥ 1 s apart, resumable manifest, label
  read-back. Refuses to create anything unless enabled explicitly (env flag) — dry-run default.
- Skill `docs-to-tickets`: extraction agent (`claude-sonnet-5`, structured outputs / strict tools,
  3 few-shot examples) → code validation of every ticket (schema-valid is not correct) →
  per-field confidence → preview of the whole batch → create; below threshold → `needs-review`.
- Threshold calibrated on a calibration split, never on the eval split.

## Eval
Input: the challenge brief (`packages/docs-to-tickets/evals/brief/`). Ground truth: its
39 checkboxes, grouped as PRs #1–#8 of `f3r21/ravn-task-management-challenge` grouped them.
Headline metric: requirement coverage recall; secondary: per-field accuracy and share routed to
`needs-review`. Baseline: single-pass extraction.

## Demo target
Brief → previewed batch in dry-run; live creation only into a sandbox repo created for the demo.
