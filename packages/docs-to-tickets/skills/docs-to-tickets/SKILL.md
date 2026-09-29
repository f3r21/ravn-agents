---
name: docs-to-tickets
description: Turns a requirements brief (a Markdown file or folder) into GitHub issues, one reviewable unit of work each, citing the brief's requirement ids. Validates every ticket in code, previews the whole batch, and routes low-confidence tickets to a needs-review label. Use when the user wants tickets, issues or a backlog created from a spec, brief, PRD or requirements doc.
argument-hint: <brief-path> <owner/repo>
allowed-tools: Read, Glob, mcp__plugin_ravn-agents_tickets__github_issue_list_created
---

# Docs to tickets

Inputs: `$ARGUMENTS` is `<brief-path> <owner/repo>`. If either is missing, ask for it and stop.

`CLI` below means `node "${CLAUDE_PLUGIN_ROOT}/packages/docs-to-tickets/dist/cli.js"`.
`WORK` means `.ravn-tickets/<owner>__<repo>` in the current project; create it with `mkdir -p`.
`STATE` means `"${CLAUDE_PLUGIN_DATA}/tickets/<owner>__<repo>"`, the directory where the MCP server
keeps this repo's batch manifest. Pass it to `plan` exactly like this so both write one manifest.

The MCP server is dry-run unless the user started it with `RAVN_TICKETS_LIVE=1`. In dry-run,
`github_issue_create` returns the issue it would create and calls nothing on GitHub. Say which
mode is active once you see the first result.

## 1. Requirements and what already exists

1. Run `CLI requirements <brief-path> > WORK/requirements.md`. Every line is `- <id> [section]: text`.
   These ids are the only valid `source_refs`.
2. Call `github_issue_list_created` with the repo. If it reports failed or not-attempted entries
   from an earlier batch, tell the user; re-running the same batch is safe because created issues
   are skipped by idempotency key. If it returns an error, report it and stop: an access failure
   is not an empty repository.

## 2. Extract

Spawn the `ticket-extractor` agent with: the brief path, `WORK/requirements.md`, and the output
path `WORK/tickets.json`. Ask it to write the JSON there.

## 3. Validate in code (one retry at most)

Run `CLI plan --brief <brief-path> --tickets WORK/tickets.json --repo <owner/repo> --state-dir STATE`.

- Exit 0: go to step 4.
- Exit 2 (violations) or 3 (schema): send the stderr text to `ticket-extractor` once, asking it
  to rewrite `WORK/tickets.json`, then run `plan` again. Do not retry a second time. After the
  retry, exit 2 is acceptable: the remaining findings are attached to their tickets and route them
  to `needs-review`. A second exit 3 means stop and show the user the errors.

## 4. Preview and one confirmation

Show the user the preview `plan` printed, unchanged: every ticket, its source ids, its route
(`auto` or `needs-review`) and why. Ask once whether to create the whole batch. Create nothing
before the user confirms. If the user wants changes, edit `WORK/tickets.json` and go back to step 3.

## 5. Create, one ticket at a time

Read `WORK/tickets.plan.json`. For each object in `create`, in order, call `github_issue_create`
with exactly those arguments. Do not edit titles, bodies, refs or keys: the server rejects a key
that no longer matches its ticket.

- `created: true`: continue.
- `created: false` with `existing`: already created earlier; continue.
- `isError`: read `error.next_step` and follow it.
  - `retryable: true`: wait `retry_after_s` (use `sleep`), then call again once with the same
    arguments. If it fails again, stop the batch.
  - `retryable: false`: stop the batch. Never retry it.
  - `DT-LABEL-DROPPED`: the issue exists without its review label. Stop and tell the user.

## 6. Report

Call `github_issue_list_created` and report: created (with links), skipped as duplicates, failed
(with category and failure mode), not attempted, and every issue labelled `needs-review` with its
reasons. On a stopped batch, say that running the skill again resumes it without duplicates.
