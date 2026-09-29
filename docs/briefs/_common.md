# Common brief for every build agent

You are building one tool of the `ravn-agents` Claude Code plugin in your own git worktree.

## Read first, in order
1. `CLAUDE.md` (repo rules — binding)
2. `CONTEXT.md` (decisions and platform constraints — binding)
3. `docs/research/foundation-plugin-and-evals.md` sections 1, 2, 4 and 6
4. Your tool's research doc (named in your brief). Its "Design rules" section is your spec.

## Scope
- Touch only `packages/<your-tool>/`, plus appending your agent files to `agents` in
  `.claude-plugin/plugin.json`. Anything else shared (schemas, eval-core, CONTEXT.md): stop and
  report what you need changed and why.
- Reuse `@ravn-agents/eval-core` (`wilson`, `validateReport`) for every eval number.

## Order of work (tracer bullet first)
1. Thin end-to-end slice: the skill runs on one real input and produces real output.
2. Tests for the deterministic code (vitest, next to the source). Test behaviour, not prompts.
3. Eval harness: freeze items in `evals/items.json` before tuning, rubric in `evals/rubric.md`,
   write one report JSON validated by `validateReport`. Smoke-run on 2 items only; the full run
   is the maintainer's call (it costs money).
4. `FAILURE-MODES.md`: each failure mode with id, trigger, chosen behaviour (retry / escalate /
   refuse) and the source that justifies it. Eval failure categories use these ids.
5. `README.md`: what it does, install/usage, the CCAF concepts it applies (link the concept index
   in the foundation doc), eval result placeholder.

## Senior-level bar (decision 6)
End-to-end on real input · eval producing k/n with Wilson CI and a baseline · documented failure
modes with explicit error handling · `npm test`, `npm run typecheck`, `claude plugin validate .`
all green.

## Hand-back
Report: what works end-to-end (with the command that shows it), test/typecheck output, smoke eval
report path, open questions, and the exact commands the human must run (installs, commits).
Never commit, install, post to GitHub or create issues yourself.
