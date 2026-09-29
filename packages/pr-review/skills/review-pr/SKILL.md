---
name: review-pr
description: Reviews a GitHub pull request with a coordinator, category finders (correctness, security, tests, repo conventions) and a verifier, then prints the review. Posts it as one COMMENT review only when --post is given. Use when asked to review a PR by URL, owner/repo#N or number.
argument-hint: <pr-url | owner/repo#N | number> [--post] [--all-finders] [--subagent-model <model-id>] [--run-dir <dir>]
disable-model-invocation: true
allowed-tools: Bash(node */packages/pr-review/dist/cli.js *), Agent, Read
---

# Review a pull request

Arguments: `$ARGUMENTS`

The CLI below is `node "${CLAUDE_PLUGIN_ROOT}/packages/pr-review/dist/cli.js"`; call it `CLI`.
It prints errors to stderr as one JSON line (`error`, `retryable`, `retryAfter`, `message`) and
exits 0 (ok), 2 (terminal), 3 (invalid draft) or 4 (retryable).

Default is a dry run: print the review, post nothing. Post only when `--post` is in the arguments.

## 1. Parse the arguments

- The PR reference is the first argument that is not a flag. If it is a bare number, add
  `--repo owner/name` only if the user named the repository; otherwise the CLI uses the current
  checkout's repository.
- `MODE` is `all-finders` if `--all-finders` is present, else `routed`.
- `SUBAGENT_MODEL` is the value after `--subagent-model`, else `default`. It overrides the model of
  every finder and the verifier (the eval uses it for a cost comparison).
- If `--run-dir <dir>` is given, pass `--out <dir>` to `prepare` (the eval harness uses this).

## 2. Prepare

Run `CLI prepare <pr> [--repo owner/name] [--out <dir>]`. It prints JSON with `runDir`, `headSha`,
`reviewedFiles`, `changedLines` and `localCheckout`.

- Exit 4: wait `retryAfter` seconds (at most 120) and run it once more. If it fails again, stop and
  report the error.
- Exit 2: stop and report the error with its `message`. For `diff_too_large`, say that GitHub would
  not render the diff and the review was not run.
- `reviewedFiles` is 0: stop and say every changed file was excluded (lockfiles, build output,
  binaries); nothing to review.

`CHECKOUT` is `yes` when `localCheckout.atHead` is true. Otherwise it is `no`, and tell the user
once: code outside the diff will be read from the current checkout, which is not the PR head; run
`gh pr checkout <n>` (or `git fetch origin pull/<n>/head:pr-<n>` if its branch was deleted) first for a
more accurate review.

## 3. Coordinate

Invoke the `ravn-agents:pr-coordinator` agent with this prompt, filled in. It starts with no
context from this session, so pass everything it needs:

```
Review a pull request.
RUN_DIR=<runDir>
MODE=<routed|all-finders>
SUBAGENT_MODEL=<model id or default>
CHECKOUT=<yes|no>
PR=<owner/repo#number> at <headSha>
Read RUN_DIR/context.json and RUN_DIR/files/*.diff, run the review as your instructions describe,
and write RUN_DIR/draft.json.
```

Invoke it once, in the foreground (`run_in_background: false`), and wait for it to finish (its
result, or its completion notification if it still runs in the background) before step 4. Do not
start a second coordinator while the first is running. Do not poll for `draft.json`: the file can exist while the coordinator
is still writing or repairing it.

Do not review the PR yourself and do not add findings. The coordinator, its finders and the
verifier do the review in fresh contexts, which also keeps a review independent of any session that
wrote the code.

## 4. Finalize

Run `CLI finalize <runDir>`.

- Exit 3: stderr lists what is wrong with `draft.json`. Continue the same coordinator (SendMessage
  to it, or invoke it again with the same prompt plus the errors) and ask it to fix only
  `draft.json`. Run finalize once more. If it fails again, stop, post nothing, and show the errors.
- Exit 0: print stdout to the user verbatim. It is exactly the review that would be posted, then
  the findings held back and why.

## 5. Post (only with --post)

Without `--post`, end with: "Dry run: nothing was posted. Re-run with --post to post this review."

With `--post`, run `CLI post <runDir>`. It checks the PR head has not moved, sends one review with
`event: COMMENT` (never approve or request changes), retries rate limits itself, and moves inline
comments into the summary if GitHub refuses an anchor.

- Exit 0: print the review URL.
- Exit 2 with `head_moved`: tell the user the PR changed during the review and to run it again.
- Any other failure: report the error JSON. Do not retry by hand, and never post with `gh` directly.
