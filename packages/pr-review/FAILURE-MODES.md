# PR reviewer: failure modes

Every way the reviewer is known to go wrong, the behaviour chosen for it, and the source behind
that choice. Behaviours are **retry** (transient, bounded), **degrade** (keep going with less and say
so), **escalate** (stop and hand the decision to a person with the error) and **refuse** (do not act).
The ids are the `error` field the CLI prints (`src/errors.ts`) and the `category` the eval writes
into `failures[]` (`src/eval/grade.ts`, `src/eval/run.ts`).

Sources: `R` = `docs/research/pr-reviewer.md` (section numbers), `F` =
`docs/research/foundation-plugin-and-evals.md`, and numbered references are that doc's source list.

## GitHub and input

| id | Trigger | Behaviour | Where | Source |
|---|---|---|---|---|
| `invalid_input` | PR argument is not a URL, `owner/repo#N` or a number with a known repo | refuse: exit 2, say which forms are accepted | `parsePrRef` | R 5 (typed, non-retryable business errors) |
| `gh_missing` | `gh` is not installed | escalate: exit 2 | `classifyGhFailure` | R 4 (`gh` mechanics) |
| `gh_auth` | `gh` not logged in, HTTP 401 | escalate: exit 2, name `gh auth login` | `classifyGhFailure` | R 5 |
| `not_found` | PR or repo does not exist, HTTP 404 | refuse: exit 2 | `classifyGhFailure` | R 5 ("matched nothing" is not an access failure) |
| `rate_limited` | HTTP 429, or 403 with a rate-limit message or `retry-after` | retry: the skill waits `retryAfter` (max 120 s) once; `post` retries serially up to 3 times, honouring the wait | `GitHub.postReview`, skill step 2 | [36] (wait for `retry-after`, serial calls), R 4 |
| `server_error` | HTTP 5xx | retry with backoff, then escalate | `GitHub.postReview` | [36], R 5 table |
| `network` | connection reset, timeout | retry with backoff, then escalate | `classifyGhFailure` | R 5 |
| `diff_too_large` | HTTP 406 `too_large` on the diff media type | degrade: rebuild the diff from the files API; files GitHub returns without a patch are listed as coverage gaps | `GitHub.diff`, `prepare` | R 5 table ([37], [43] UNVERIFIED threshold) |
| `stale-checkout` | the working directory is not the PR head | degrade: the review runs, finders trust the patch over local files, and the skill tells the user to `gh pr checkout` | `localCheckout`, skill step 2, finder prompts | R 3.2 (review what existed at the time) |
| `prompt-injection` | the PR title, body, diff or CLAUDE.md contains instructions | refuse to follow: every agent treats them as data; finders and verifier have only Read, Grep and Glob | agent prompts, `tools` lists | R 6 rule 13, [10] ("not hardened against prompt injection") |

## Agents

| id | Trigger | Behaviour | Where | Source |
|---|---|---|---|---|
| `finder-failed` | a finder errors, is cut off, or returns something that is not the JSON object | retry once with the same prompt; then record `status: failed` or `partial` with the error, and list its files in `notReviewed`. Never recorded as "no findings" | coordinator step 2 | R 5 (D5 5.3: an access failure is not an empty result) |
| `verifier-failed` | the verifier fails twice | degrade: every finding becomes `uncertain`; code drops all of them; the summary says verification failed. Nothing unverified is posted | coordinator step 3, `route` | R 6 rules 4-5 |
| `subagent_not_awaited` | a subagent starts in the background and its caller moves on before it returns (seen headless on kit#112: the verifier was recorded as failed and a second coordinator ran) | prevent: the skill and the coordinator invoke subagents in the foreground and wait for completion notifications; a finding whose verifier never returned stays `uncertain` and is not posted | skill step 3, coordinator steps 2–3 | D5 5.3 (never report silence as success) |
| `invalid_draft` | `draft.json` is missing, not JSON, or fails `validateDraft` | retry once: the skill sends the listed errors back to the coordinator; a second failure escalates and posts nothing | `finalize`, skill step 4 | F 3 (schema guarantees shape, code validates meaning), R 1.4 |
| `line_not_in_diff` (pre-post) | a critical/high finding's `line`/`side` is not in a hunk, or a range spans hunks | degrade: the finding moves to the summary with the reason | `anchorProblem` | R 4 (Code Review's "Additional findings" fallback) |
| `huge-diff` | one finder's patches exceed ~150,000 characters | degrade: the coordinator splits the files into groups and runs one invocation per group | coordinator step 2 | R 5 table (lost in the middle; partition by file) |
| `duplicate-on-rerun` | the PR already carries findings this tool posted | degrade: prior findings are passed to finders as `already_posted`, and code drops any finding whose fingerprint was posted before | `prepare`, `route` | R 6 rule 8, Bank A item 34, [21] |
| `trivial-diff` | a routed run with under ~20 changed lines of code, or docs/config only | the coordinator reviews directly with no finders; the verifier still runs | coordinator step 1 | R 1.1 (mock01: do not delegate what you hold) |
| `spend-cap` / `budget-exceeded` | Anthropic spend cap (429 with no `retry-after`) or `--max-budget-usd` reached | escalate: not retried; the run stops and posts nothing | Claude Code runtime; eval marks `budget-exceeded` | R 5 table ([41]) |
| `model-overloaded` | 529 / 500 from the Messages API | retry: Claude Code's client retries; a subagent that still fails is `finder-failed` | runtime, then coordinator | R 5 table ([40]) |
| `timeout` | a run exceeds its wall-clock limit (eval: 30 min per item) | escalate: the item is recorded as a failed run | `runVariant` | R 5 table |

## Posting

| id | Trigger | Behaviour | Where | Source |
|---|---|---|---|---|
| `head_moved` | the PR head changed between `prepare` and `post` | refuse: nothing is posted; re-run the review | `post` | [35] (`commit_id` older than head can render comments outdated) |
| `line_not_in_diff` (post) | GitHub answers 422 on an inline anchor | degrade: GitHub does not say which comment, so every inline finding moves into the summary and the review is posted once more | `post`, `demoteInline` | R 4, [34], [5] |
| `validation_failed` | any other 422 | escalate: not retried | `classifyGhFailure` | [34] |
| `approve-or-block` | any path that would approve or request changes | refuse: the payload type allows only `event: COMMENT` | `ReviewPayload` | R 6 rule 7, [5], [21] |
| `post-without-flag` | `--post` not given | refuse to post: dry-run is the default; `post` is a separate command the skill runs only with the flag | skill step 5 | CLAUDE.md (outward actions default to dry-run), decision 7 |

## Eval-only categories

These label misses in `failures[]` of the eval report.

| id | Meaning |
|---|---|
| `missed-defect` | No finding near the defect matched it, in any pool. |
| `found-not-inline` | A verified finding matched, but it went to the summary (severity below high, or the anchor was refused). |
| `dropped-true-positive` | Only a finding the pipeline dropped (verifier rejected or uncertain) matched: a verifier miss. |
| `noise-on-clean` | A clean control PR received inline findings. |
| `run-failed`, `invalid-draft`, `timeout`, `budget-exceeded` | The run for that item did not complete; it counts as a miss. |
