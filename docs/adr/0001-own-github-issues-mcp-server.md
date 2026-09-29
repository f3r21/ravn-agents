# 0001 — Our own GitHub Issues MCP server instead of GitHub's official one

- Status: accepted
- Date: 2026-09-26
- Decision: CONTEXT.md #10

## Context

Docs → tickets has to create GitHub Issues. GitHub ships an official MCP server with issue tools,
and the CCAF exam prefers existing servers for standard integrations
(`docs/research/docs-to-tickets.md`). Building our own needs a reason beyond "it shows D2".

## Decision

Ship a local stdio MCP server inside the plugin, exposing two narrow tool definitions
(`github_issue_create`, `github_issue_list_created`) and a resource listing the issues it created.

## Reasons

1. **Idempotency.** GitHub's create-issue call has no idempotency key. Our server dedupes on a body
   marker and keeps a resumable manifest, so a retried or interrupted batch never duplicates issues.
2. **Review routing in code, not in the prompt.** The `needs-review` rule (decision 14) and the
   label read-back live in the server, where the model cannot skip them.
3. **Error taxonomy.** Errors return as `isError` results with a typed JSON body (retryable vs.
   terminal, e.g. secondary rate limit vs. missing push access dropping labels), so the agent
   escalates instead of retrying blindly.
4. **Narrow surface.** Two tool definitions instead of the official server's full toolset keeps
   tool selection reliable.

## Consequences

- We own maintenance of the server and its GitHub API handling.
- If the official server gains idempotent creation and narrow tool scoping, revisit this ADR.
