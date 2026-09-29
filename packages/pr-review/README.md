# PR reviewer (`/ravn-agents:review-pr`)

Reviews a GitHub pull request and prints the review. With `--post` it posts that review as one
`COMMENT` review: verified critical/high findings as inline comments, everything else verified in a
single summary comment. It never approves or requests changes.

```
/ravn-agents:review-pr https://github.com/f3r21/ravn-ui-kit/pull/145
/ravn-agents:review-pr f3r21/ravn-ui-kit#145 --post
/ravn-agents:review-pr 145 --all-finders --subagent-model claude-sonnet-5-5
```

## How it works

```
skill review-pr ──► CLI prepare ──► pr-coordinator (Opus 5.5) ──┬─► pr-finder-correctness ─┐
  (dry-run default)   gh: PR, diff,   triage: which finders?      ├─► pr-finder-security    ├─► pr-verifier ─► draft.json
                      CLAUDE.md,      or review a trivial diff    ├─► pr-finder-tests       │   (Opus 5.5)
                      prior comments  directly                    └─► pr-finder-conventions ┘
                                                                        (Opus 5.5)
             ◄── CLI finalize: validate draft, apply posting policy in code, print ──► CLI post (only with --post)
```

1. **`prepare`** (TypeScript) fetches the PR with `gh`, drops generated files (lockfiles, `dist/`,
   binaries), writes one line-numbered patch per file, and records the repo's `CLAUDE.md` at the head
   commit and any findings this tool already posted.
2. **`pr-coordinator`** reads the patches and chooses finders from what the diff contains, or
   reviews a trivial diff itself. Each finder gets a self-contained prompt: the PR header, its
   files' patches pasted in, the repo rules for the conventions finder, and the boundary. Subagents
   inherit nothing, so nothing is left implicit.
3. **Finders** apply categorical report / do-not-report criteria with worked examples, and report
   every candidate with a severity and confidence. They do not filter on severity themselves.
4. **`pr-verifier`** tries to disprove each candidate against the code and returns confirmed,
   rejected or uncertain with `path:line` evidence.
5. **`finalize`** (TypeScript) validates `draft.json` and applies the policy: confirmed and
   critical/high with a valid anchor goes inline; other confirmed findings go to the summary;
   rejected, uncertain, duplicate and already-posted findings are never shown. Files nobody reviewed
   and finders that failed are listed as coverage gaps.
6. **`post`** checks the PR head has not moved, sends one review, retries rate limits serially, and
   moves inline findings into the summary if GitHub refuses an anchor.

Failure handling for each step is in [FAILURE-MODES.md](FAILURE-MODES.md).

## Install and permissions

Install the plugin from the `ravn-labs` marketplace (`claude plugin marketplace add f3r21/ravn-agents`, then
`claude plugin install ravn-agents@ravn-labs`). The skill needs:

- `gh` installed and authenticated for the target repo (`gh auth status`).
- Node 20 or later (the CLI is bundled to `dist/cli.js`; no install step at runtime).
- For a smooth run, allow rules in your settings so the pipeline does not prompt for each step:
  `Bash(node */packages/pr-review/dist/cli.js *)` for the CLI, and read/write access to the run directory under your temp dir
  (`Read(//tmp/ravn-pr-review/**)`, `Edit(//tmp/ravn-pr-review/**)`, or the macOS
  `$TMPDIR` equivalent).
- Run it from a checkout of the PR head so finders read the right code: `gh pr checkout <n>`, or
  `git fetch origin pull/<n>/head:pr-<n> && git checkout pr-<n>` when the branch was deleted after merge.

## CCAF concepts applied

Numbers refer to the [CCAF concept index](../../docs/research/foundation-plugin-and-evals.md#5-ccaf-concept-index).

| # | Concept | Where |
|---|---|---|
| 2 | Coordinator and subagents | `agents/pr-coordinator.md` picks finders per diff (decision 11) |
| 3 | Explicit context passing | coordinator step 2: every finder prompt carries its patches, rules and boundary |
| 4 | Parallel subagent spawning | finders are invoked in one message |
| 5 | Programmatic enforcement | `src/policy.ts`: the posting policy is code, not a prompt instruction |
| 8 | Fixed pipeline, dynamic selection | the stages are fixed; which finders run is decided per diff |
| 12 | Scoped tools per agent | finders and verifier: `Read, Grep, Glob` only |
| 19 | Skills as entry points | `skills/review-pr/SKILL.md` |
| 25 | Independent review session | the review runs in fresh subagent contexts, never the author's session |
| 28 | Explicit criteria | each finder's report / do-not-report lists (decision 17) |
| 29 | Few-shot examples | four examples per finder, including one edge case and one "do not report" |
| 32 | Semantic validation and retry | `src/validate.ts` plus one repair round-trip to the coordinator |
| 34 | Trimming input | generated files excluded; patches split per finder |
| 35 | Escalation criteria | inline vs summary vs dropped is decided by verdict and severity in code |
| 36 | Error propagation | failed finders become coverage gaps, never "no findings" |

## Eval

`historical_bug_recall`: replay historical PRs from `f3r21/ravn-ui-kit` and
`f3r21/ravn-task-management-challenge` whose defect a later PR fixed, and count how many the
reviewer flags inline. Clean control PRs give the noise side (`inline_precision`,
`inline_findings_per_clean_pr`). Baselines on the same items: a single-prompt review, and the
coordinator's routing against running all finders. Every agent runs on Opus 5.5 by default; for
cost, the `coordinator-sonnet-subagents` variant reruns the same items with Sonnet 5.5 finders and
verifier (`--subagent-model claude-sonnet-5-5`).

- Items: [`evals/items.json`](evals/items.json), frozen 2026-09-27. Candidates were mined with SZZ
  (`npm run eval -w packages/pr-review -- mine`) and from issues that describe a defect in lines a
  specific PR added; they are **unconfirmed** until checked by hand. The review behind each label,
  including the rejected candidates, is in [`evals/label-review.md`](evals/label-review.md).
- Judge rubric: [`evals/rubric.md`](evals/rubric.md). Matching is a line-overlap pre-filter in code
  against the ground-truth defect lines, then a model judge on Opus 5.5. The judge shares a model
  with the reviewer; the code pre-filter and a human agreement spot-check on a sample of judge
  decisions (`report --human-labels`) bound the self-preference risk.
- Harness: `src/eval/` (`run`, `grade`, `report`); the report is validated against
  `schemas/eval-report.schema.json`.

```
npm run eval -w packages/pr-review -- run --clones f3r21/ravn-ui-kit=<clone>,f3r21/ravn-task-management-challenge=<clone> \
  --variants coordinator,single-prompt,all-finders,coordinator-sonnet-subagents
npm run eval -w packages/pr-review -- grade --run packages/pr-review/evals/results/<run>
npm run eval -w packages/pr-review -- report --run packages/pr-review/evals/results/<run>
```

**Result:** not yet measured. _k/n (Wilson 95% interval), baseline delta, precision and cost go
here after the confirmed run._

## Development

```
npm test                                   # includes this package's vitest suites
npx tsc -p packages/pr-review              # typecheck this package
npm run build -w packages/pr-review        # rebuild dist/cli.js (committed)
```
