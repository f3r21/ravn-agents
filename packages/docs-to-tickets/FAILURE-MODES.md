# Failure modes: docs → tickets

Every failure the tool can hit, the behaviour chosen for it, and the source behind the choice.
The `id` is what the MCP server puts in `error.failure_mode` and what the eval report uses as
`failures[].category`. Source keys (`[n]`, `[V-x]`) point to
[`docs/research/docs-to-tickets.md`](../../docs/research/docs-to-tickets.md) § Sources.

Behaviours: **retry** (locally, bounded), **escalate** (stop and hand to a human with what was
done), **refuse** (do nothing and say why), **route** (continue, but label the issue
`needs-review`).

Every tool error has the same JSON body in its text block:
`{category, retryable, retry_after_s?, failure_mode, what_failed, what_was_done, next_step}`.
Categories are transient, validation, business and permission [V-3 §2.2]; the text block carries
them because it is what the model reads [5].

## Extraction

| id | Trigger | Behaviour | Source |
|---|---|---|---|
| `DT-EXTRACT-SCHEMA` | Output does not match the extraction schema on both attempts (subagent path; the API path is constrained by structured outputs) | Escalate: no tickets, raw output to the user. Never a third attempt | [12], [V-7] three-attempt item |
| `DT-SEMANTIC-INVALID` | Schema-valid output fails a code check: unknown or missing `source_refs`, uncovered requirement, ungrounded criterion, priority contradicting the brief, duplicate ticket, `other` without detail, unknown label | Retry once with the listed violations; what remains after the retry is attached to the ticket and **routes** it to `needs-review`. Never dropped silently | [12], [16], [V-5], design rule 6 |
| `DT-LOW-CONFIDENCE` | A field's confidence is below its calibrated threshold (`thresholds.json`) | Route. The decision is made in the server, not by the model | [28], [V-4 §5.5], decision 14 |
| `DT-EXTRACT-TRUNCATED` | `stop_reason: max_tokens` | Transient, retryable: retry with a larger budget or per-section extraction | [12] (UNVERIFIED wording) |
| `DT-EXTRACT-REFUSED` | `stop_reason: refusal` | Refuse: report, do not retry | [12] |
| `DT-EXTRACT-MISSED-REQ` | Eval only: an eval-split requirement no ticket cites | Counted as a miss in the headline recall | [34] Berry recall condition, [36] |

## Server input

| id | Trigger | Behaviour | Source |
|---|---|---|---|
| `DT-INPUT` | `repo` not `owner/name`, or empty `source_refs` (also enforced by the input schema) | Validation error, not retryable as-is | [6] |
| `DT-KEY-MISMATCH` | `idempotency_key` does not match `repo` + `source_refs` + title: the ticket was edited after planning | Refuse; next step is to re-run `plan` | design rule 13 |
| `DT-NO-STATE-DIR` | `CLAUDE_PLUGIN_DATA` is missing from the server's environment, so there is no place for the manifest | Refuse every tool call (business, not retryable); no GitHub call, nothing written. The server never falls back to its working directory, which Claude Code does not document for MCP servers | plugins reference, "Where each variable resolves" (checked 2026-09-26) |
| (dry-run) | `RAVN_TICKETS_LIVE` is not `1` | Not an error: returns the issue it would create, calls nothing on GitHub | CLAUDE.md "outward-facing actions default to dry-run" |

## GitHub

| id | Trigger | Behaviour | Source |
|---|---|---|---|
| `DT-GH-PRIMARY-RATE-LIMIT` | 403/429 with `x-ratelimit-remaining: 0` | Transient. Wait until `x-ratelimit-reset` locally if ≤ 60 s, else return `retry_after_s` so the agent waits or stops | [17] |
| `DT-GH-SECONDARY-RATE-LIMIT` | 403/429 with `retry-after` or a "secondary rate limit" message | Transient. Honour `retry-after`, else 60 s. Prevented in the first place: every mutative request goes through one queue at least 1 s apart | [17], [18], [19] |
| `DT-GH-SERVER` | 5xx | Transient, retry with a hard cap of 3 attempts, then escalate | [17], [18] "throw an error after a specific number of retries" |
| `DT-GH-NETWORK` | Timeout or dropped connection | Transient. Before retrying a create, list again: a POST that timed out may have landed | [19]; true of HTTP POST in general |
| `DT-GH-AUTH` | 401, or live mode without a token | Permission, escalate: the user must set the token | [19] |
| `DT-GH-PERMISSION` | 403/404 without rate-limit headers | Permission, escalate, never retry. Whether 404 hides a private repo is UNVERIFIED | [19] |
| `DT-GH-ISSUES-DISABLED` | 410 | Business, explain and stop. Meaning of 410 for this endpoint is UNVERIFIED | [19] |
| `DT-GH-VALIDATION` | 422 on create | Validation: fix the named field and call once more | [19] |
| `DT-LABEL-DROPPED` | Read-back after create shows `needs-review` missing (GitHub drops labels silently without push access) | Escalate. The issue exists; the manifest records `label_missing`; never reported as success | [19] |
| `DT-DUPLICATE` | An issue with the same body marker already exists (retried or resumed batch) | Not an error: `created: false, existing: #N`, skip and continue. Dedupe lists the token user's issues, never the search API | [19], [20] |
| `DT-PARTIAL-BATCH` | The batch stops midway (any escalation above, a crash, a closed session) | The manifest lists created, skipped, failed (with category) and not attempted; re-running resumes without duplicates | [V-4 §5.3, §5.4] |
| `DT-UNEXPECTED` | Anything unclassified | Business, not retryable: stop and report | [V-7] "explain and offer escalation instead of looping" |

## Known limits

- The idempotency key includes the title. If the user edits a title between two runs, the edited
  ticket gets a new key and could be created twice; the preview shows existing issues first.
- `review_reasons` come from the plan step through the agent. A model that dropped them would
  lose those reasons; confidence routing still happens in the server.
- The acceptance-criteria grounding check is lexical (shared content-word stems), so a faithful
  paraphrase with no shared terms is routed to review rather than rejected.
