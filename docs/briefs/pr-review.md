# Brief: PR reviewer (`packages/pr-review`)

> Historical brief. Model IDs below were superseded on 2026-09-26: every agent now runs on
> `claude-opus-5-5` (CONTEXT.md decision 22).

Research doc: `docs/research/pr-reviewer.md`. Decisions: 7, 8, 11, 17, 22 (all revised 2026-09-26).

## What to build
- Skill `review-pr` (`/ravn-agents:review-pr <pr-url|number> [--post]`). Default is dry-run: prints
  the review. `--post` sends ONE batched GitHub review (`event: COMMENT`, `line`/`side`).
- Coordinator agent (`claude-opus-5-5`): reads the diff, decides which finders to run, writes each
  finder a self-contained prompt (diff slice, category criteria, output schema) — subagents inherit
  nothing.
- Finder agents (`claude-sonnet-5`), one per category (e.g. correctness, security, tests, repo
  conventions from the target repo's CLAUDE.md). Explicit category criteria with examples; report
  every finding with severity + confidence.
- Verifier agent: challenges each finding against the code before anything is posted.
- TypeScript, not the prompt, applies the policy: verified + high/critical → inline; rest → one
  summary comment. Typed GitHub/API errors (retryable vs terminal) per the research doc.

## Eval
`historical_bug_recall` on PRs from `f3r21/ravn-ui-kit` and `f3r21/ravn-task-management-challenge`
whose bug was fixed by a later PR (labels checked by hand, list the candidates for a maintainer
to confirm), plus clean control PRs for `inline_precision`. Baselines: single-prompt review, and
"all finders" vs coordinator routing. Opus vs Sonnet for the verifier is a secondary comparison.

## Demo target
A live run on a real PR of `ravn-ui-kit`, dry-run by default.
