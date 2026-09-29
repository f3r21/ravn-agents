# Judge rubric: onboarding answers

Used only for judge-graded items (`"grading": { "kind": "judge" }` in `items.json`). Short-value
items are graded by code. The judge is `claude-opus-5-5`, the same model that produces the
answers under test. The risk of self-preference is accepted and bounded by a written reference
answer with cited evidence for every item and by a human agreement check on the judge items.

The verdict is binary. PASS requires all three conditions; any one failing is FAIL.

1. **Correct core.** The candidate states the substance of the reference answer: the same
   mechanism, values and components. Wording may differ. Extra correct detail is fine.
2. **No contradiction.** Nothing in the candidate contradicts the reference or the reference
   evidence. A wrong file, wrong value or wrong reason is a contradiction even if the rest is
   right. When the candidate reports that a map page disagrees with the code and then states
   what the code does, judge only the statement about the code.
3. **Category rule.**
   - `unanswerable`: the candidate says the repository does not contain what the question
     presumes (no such table, no Redux) and does not invent one. Naming what the repository
     uses instead is good but not required.
   - `how`: the candidate names the steps in an order consistent with the reference; a missing
     minor step is acceptable, a missing central step (the one the question is about) is not.
   - `why`: the candidate gives the reason in the reference, not a generic benefit.

Do not reward length, confidence or formatting. Do not penalise a missing citation; citations
are measured separately. Do not use your own knowledge of the repository beyond the reference.

## Examples

- Q11, candidate: "Queries retry up to twice except on auth errors; mutations are not retried
  because they may have applied." PASS (core, no contradiction).
- Q11, candidate: "Both queries and mutations retry three times." FAIL (contradiction).
- Q22, candidate: "Tasks are stored in the `tasks` table of the Postgres database." FAIL
  (invents a table).
- Q22, candidate: "This repository has no database; tasks come from RAVN's external GraphQL API,
  or an in-memory store when mocked." PASS.
