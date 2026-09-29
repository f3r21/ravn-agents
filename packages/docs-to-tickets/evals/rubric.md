# Eval rubric: docs → tickets

Grader: code only (`evals/grade.ts`). No model judge is involved in any reported number.

## Input and ground truth

- **Input**: the task-management challenge brief, copied into `evals/brief/`
  (Goal, Summary, Project Requirements, General Requirements, Resources). The revision log in the
  Goal note, the note metadata and the UI-Kit folder (Figma exports) are left out. `items.json`
  stores the SHA-256 of the rendered brief; the harness refuses to run if the copy changes.
- **Items**: the brief's 39 checkboxes (decision 13), with the ids the parser assigns
  (`header.2`, `update.5`, ...). Bonus, general, goal and resource bullets are parsed and must be
  ticketed or excluded, but are not scored.
- **Grouping**: each item's `pr` is the PR of `f3r21/ravn-task-management-challenge` whose body
  says it covers that section: #1 initial setup, #2 dashboard UI (header, sidebar, main content,
  task card), #3 Get, #4 Create, #5 Update and Delete, #6 Search and filter, #7 user
  information. #8 (README) covers no checkbox. #2 was closed unmerged 11 seconds after #1 merged; its
  base was #1's branch, and #3 targets `dev`. Whether its commits landed through the rest of the
  stack is not checked here; the grouping stays the author's either way.
- **Hand labels**: `acceptableTypes` (initial setup items are `chore`; routing and error boundary
  accept `chore` or `feature`; everything else is `feature`) and `optional` (the three items the
  brief marks "(optional)").

## Split (decision 14)

Tickets may merge requirements inside a section but not across sections, so the split is by
section. In brief order, every third checkbox section starting at the second is **calibration**:
header, task-card, delete, show-the-user-information (13 items). The other seven sections are the
**eval** split (26 items). Thresholds are fitted on calibration tickets only; every reported
number except `calibration_split_recall` is computed on the eval split.

## Metrics

| Name | Definition | Grader |
|---|---|---|
| `requirement_coverage_recall` (headline) | eval items cited in `source_refs` by at least one ticket / eval items | set arithmetic |
| baseline | the same, for a single-pass extraction: same model and schema, no few-shot examples, no validation retry; paired on the same items | set arithmetic |
| `calibration_split_recall` | the headline definition on the calibration split | set arithmetic |
| `source_refs_accuracy` | eval tickets whose in-scope refs all belong to one PR group | labels |
| `type_accuracy` | eval tickets whose type every cited item accepts | labels |
| `priority_accuracy` | eval tickets marked optional exactly when every cited item is optional | labels |
| `needs_review_share` | eval tickets the production routing sends to review with the calibrated thresholds | code (`route`) |

Tickets citing both splits are "mixed": they count in eval field metrics and never in calibration.

## Calibration rule

Per field (`source_refs`, `type`, `priority`), the most permissive confidence level such that
some calibration ticket reported exactly that level, at least 3 tickets are accepted at or above
it, and their observed precision reaches 0.9. No such level: the field always routes to review.
`acceptance_criteria` has no code grader and keeps the uncalibrated default (`high`).

## Not measured yet

- Faithfulness of descriptions and acceptance criteria. A judge would score one ticket against
  its cited requirement text at a time with a yes/no rubric ("every criterion restates or directly
  follows from the cited text; nothing is added"), checked against at least 10 hand-labelled
  tickets before its number is reported (foundation doc § 4.2).
- The ~9 later issues that touch brief requirements (stretch metric in the research doc).
