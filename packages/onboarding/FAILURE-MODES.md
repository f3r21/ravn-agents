# Failure modes: codebase onboarding

Each failure mode has an id, the trigger, the behaviour chosen for it (retry, escalate to a
human, or refuse), where that behaviour lives, and the source that justifies it. Eval failures in
`evals/results/*/report.json` use these ids as `failures[].category`.

Sources: `docs/research/codebase-onboarding.md` (research, R), its numbered references `[n]`, and
the CCAF decision rules cited there (D1, D5). "Code" means the behaviour is enforced by
TypeScript, not by a prompt.

| Id | Failure | Trigger | Behaviour | Where | Source |
|---|---|---|---|---|---|
| F1 | Stale map gives a confident wrong answer | Code changed after the map's SHA | **Escalate.** The SessionStart hook names stale areas in Claude's context and to the user; `ask-codebase` shows the same status, treats stale pages as hints and verifies against live code; the answer says the area was stale | `src/staleness.ts`, `src/session-start.ts`, `skills/ask-codebase/SKILL.md` | R F1; [14][16]; D5.6 |
| F2 | Map too large to load | Too many areas, or a mapper writes too much | **Refuse.** INDEX.md over 200 lines fails the build; a draft over 90 lines or 9,000 characters is rejected. Nothing is truncated silently; generated lists state `(+N more, not listed)` | `src/page.ts` (`renderIndex`), `src/draft.ts`, `src/facts.ts` | R F2; [4] 200-line target; [2][3] |
| F3 | Hallucinated structure: a cited file or line does not exist | Model-written prose | **Retry once, then refuse.** `assemble` rejects any draft citing a path absent at the stamped SHA or a line past the end of the file, or with a claim that has no citation. The skill re-spawns the mapper once with the errors; a second failure marks the area not covered (F4). The live build hit this on 3 of 14 first drafts and all 3 passed on retry | `src/citations.ts`, `src/draft.ts`, `src/build.ts` (`assemble`) | R F3, design rule 11; "Deterministic > Probabilistic" |
| F3b | A cited line exists but the claim about it is false | Model misreads code | **Escalate.** Not detectable by code. Mitigated by making answers re-read the cited code before replying (the map is a router, not an oracle) and by asking the human to review the map before committing it. Seen once in the live build: a first draft said `ErrorBoundary` recovers by changing its `key`; the retry corrected it | `skills/ask-codebase/SKILL.md` step 3, `skills/onboard/SKILL.md` step 5 | R design rule 1; [1][14] |
| F4 | Map silent about an area | Mapper failed, timed out, wrote nothing, or was rejected twice | **Escalate.** The page is written with `status: missing`, the reason, and only the generated facts; INDEX.md marks it **Not covered**; the hook lists it; `ask-codebase` says "not covered by the map" and searches live | `src/build.ts`, `src/page.ts`, `skills/ask-codebase/SKILL.md` | R F4; D5.3 coverage annotations |
| F5 | Map and code disagree | Stale or wrong page | **Escalate.** Code wins; the answer states what the code does and that the page (with its SHA) says otherwise; refresh is offered | `skills/ask-codebase/SKILL.md` step 4 | R F5; D5.6 |
| F6 | Partial build | Subagent crash, timeout or session interrupted | **Retry.** Each draft is a separate file; `assemble` is idempotent and marks absent drafts as not covered; `onboard --refresh` re-maps only missing, stale and new areas | `src/build.ts`, `src/staleness.ts` (`areasToRemap`) | R F6; D5.4 manifest on resume; D1.7 |
| F7 | Context degradation over a long onboarding session | Many questions in one session | **Prevent.** `ask-codebase` loads INDEX.md plus at most two area pages per question, never the whole map; mappers run in isolated subagents and return one line | `skills/ask-codebase/SKILL.md` step 2, `agents/area-mapper.md` | R F7; [1] subagent summaries; D5.4 |
| F8 | Orphaned map nobody refreshes | Code keeps moving | **Escalate.** The hook reports staleness at every session start, resume, clear and compaction, with the exact refresh command | `hooks/hooks.json`, `src/session-start.ts` | R F8; course note on stale markdown |
| F9 | Build on a dirty working tree | Uncommitted changes when `plan` runs | **Refuse.** `plan` exits 2 naming the files: pages stamped with HEAD must describe exactly that commit. Changes inside `docs/codebase-map/` are ignored | `src/build.ts` (`plan`) | Design rule 5 (stamp per area) |
| F10 | Wrong answer on a fresh map | Map routed to the wrong area, or the answer misread the code | **Measured**, not handled at runtime: eval category for any other with-map miss. Transcripts are kept for reading | `src/eval/report.ts` | [35] read the transcripts |
| F11 | Invents an answer the repository does not contain | Question presumes something absent (a database table, Redux) | **Refuse.** `ask-codebase` instructs to say plainly that the code does not contain it instead of guessing | `skills/ask-codebase/SKILL.md` step 4 | R design rule 10; D5.2 |
| F12 | Answer or build session errors out | Budget cap hit, crash, timeout, permission prompt in headless mode | **Escalate.** The harness records the error detail and counts the item as failed, never as skipped; the onboard skill forbids compound shell commands that trigger prompts (seen once in the live build) | `src/eval/run.ts`, `src/eval/transcript.ts`, `skills/onboard/SKILL.md` | Foundation 4.4 honest reporting |
| F13 | The staleness check itself fails | Git missing, corrupt page, unexpected error | **Escalate without blocking.** The hook always exits 0; on error it prints a `systemMessage` saying the check failed and the map may be stale; unreadable pages are listed as such | `src/hook.ts`, `src/page.ts` (`readAreaMeta`) | Foundation 2.3: SessionStart cannot block; design rule 6 |
| F14 | HEAD moves during a build | User commits while mappers run | **Refuse.** `assemble` exits 2 with "HEAD moved"; the skill re-plans | `src/build.ts` (`assemble`) | Design rule 5 |
| F15 | Judge output unparseable | Judge omits the verdict line | **Escalate.** Graded as failed with grader `error`, never a silent pass; shows up in `failures[]` | `src/eval/grade.ts` (`parseVerdict`) | [34][35] judge calibration |

## Not handled

- Cross-area claims whose cited file did not change but whose meaning did (for example a caller
  in another area changed behaviour without touching the cited file). The hook checks the
  area's own files and every cited file; anything subtler is left to F3b's verification step.
- Force-pushed or rebased history. When a page's build commit is no longer in the clone, the
  hook checks area hashes only and says so in its message.
