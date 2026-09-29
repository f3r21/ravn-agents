# Research: Tool 1, the PR reviewer

Scope: CCAF D1 (agentic orchestration), D4 (explicit criteria), D5 (reliability) applied to the
`ravn-agents` PR reviewer. Governing decisions in `labs/CONTEXT.md`: 7, 8, 11, 17, 22.
Sources accessed 2026-09-25. Bracketed numbers such as [5] point to the Sources list at the end.
"Exam says" cites private CCAF study notes by title; they are not published.

## Summary

1. Hub-and-spoke is right: a coordinator reads the diff, picks subagents, and does the synthesis. The
   exam and Anthropic's orchestrator-workers guidance both back this [1][2]. Anthropic's own
   review products, though, send a *fixed* set of finders and then a verifier [5][9].
2. Subagents inherit nothing. The coordinator's prompt string is the only channel, so every
   subagent needs the diff slice, the rules, and the output schema passed explicitly [3][4].
3. Precision does not come from a severity gate. It comes from explicit criteria plus a
   separate verification step. Anthropic now recommends *coverage* at the finding stage and
   filtering downstream, because current models obey "only report high severity" literally,
   and that lowers recall [12][13].
4. Published numbers: Anthropic Code Review reports under 1% of findings marked incorrect [6].
   Google AutoCommenter moved from 54% to 80% "useful" by suppressing noisy categories [16]. On
   an academic real-PR benchmark (SWR-Bench) the best F1 was about 19% [19].
5. Decision 8's replay eval is sound, but SZZ labels are noisy (precision and recall of 0.40 to
   0.60 [27], and only half of SZZ "fixes" are real fixes [29]). Labels need manual validation.
   Measuring only "caught" (recall) also needs a precision counterpart on clean PRs [19][32].
6. Post one batched review (`POST .../pulls/{n}/reviews`, `event: COMMENT`) using `line`/`side`.
   GitHub caps content creation at 80 requests/min and 500/hour [34][36].
7. Failures are typed and structured: retryable (429 with `retry-after`, 5xx, 529) versus
   terminal (spend cap 429 without `retry-after`, 406 diff too large, 422 line not in diff)
   [36][40][41]. A failed subagent never passes as "no findings" (`D5 rules`, 5.3).

## 1. Concepts

### 1.1 Coordinator and subagents (orchestrator-worker)

**Definition.** A central LLM breaks a task into subtasks it could not list in advance, hands
them to worker LLMs, and synthesises what they return. Anthropic: "This workflow is well-suited
for complex tasks where you can't predict the subtasks needed", with the example "Coding
products that make complex changes to multiple files each time" [1]. Anthropic contrasts this
with **routing**, a fixed classifier that "works well for complex tasks where there are distinct
categories that are better handled separately" [1]. It also contrasts it with
**parallelization/voting**, whose example is "Reviewing a piece of code for vulnerabilities,
where several different prompts review and flag the code if they find a problem" [1].

**Exam says.**
- The coordinator decomposes, delegates, aggregates and "decides which subagents to invoke per
  query". A static router keyed on query pattern loses (*Decision rules D1*, 1.2).
- The mock exam's correct answer for a "diverse and evolving" query mix: "Have the coordinator
  analyze each query and dynamically decide which subagents to invoke" (practice mock 01,
  research_pipeline item).
- Delegating what the coordinator already holds is wrong. The correct fix is "Have the
  coordinator handle straightforward summarization requests directly using its existing context"
  (practice mock 01).
- Too narrow a decomposition is the coordinator's defect (`Decision rules D1.md`, 1.2).
- Fixed prompt chaining (a per-file pass, then a cross-file pass) fits "predictable multi-aspect
  work". Dynamic decomposition fits open-ended work (`Decision rules D1.md`, 1.6).

**Sources say.**
- Delegation must carry "an objective, an output format, guidance on the tools and sources to
  use, and clear task boundaries". Vague delegation caused duplicated work and gaps [2].
- Cost: "agents typically use about 4× more tokens than chat interactions, and multi-agent
  systems use about 15× more tokens than chats" [2].
- Scale effort to the task: 1 agent with 3 to 10 tool calls for simple lookups, 2 to 4
  subagents for comparisons, 10 or more only for complex research [2].
- Multi-agent fits poorly where agents share context heavily: "most coding tasks involve fewer
  truly parallelizable tasks than research" [2].
- General stance: "Agentic systems often trade latency and cost for better task performance,
  and you should consider when this tradeoff makes sense" [1].
- Current models over-delegate. The docs warn to "Watch for overuse" and suggest: "For simple
  tasks, sequential operations, single-file edits ... work directly rather than delegating" [11].

**What a subagent receives.** A non-fork subagent "starts with a fresh, isolated context window.
It doesn't see your conversation history" [3]. In the Agent SDK, "The only content you pass from
parent to subagent is the Agent tool's prompt string, so include any file paths, error messages,
or decisions the subagent needs directly in that prompt" [4]. Two more facts from [4]:
- The subagent does receive its own system prompt, the tool definitions, and project CLAUDE.md
  (unless `omitClaudeMd` is set).
- The parent gets back only the subagent's final message.

Subagents are invoked through the `Agent` tool. It appears as `"Task"` in the `system:init`
tool list, so match both names [4]. Run-bounding controls [4]:
- `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` (default 3)
- `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` (default 20)
- `maxBudgetUsd`
- per-agent `maxTurns`, which marks the output as partial when reached

Plugin-shipped subagents ignore the `hooks`, `mcpServers` and `permissionMode` frontmatter
fields [3]. This matters for decision 4.

**What Anthropic's review products actually do.**
- *Claude Code Review (managed)*: "multiple agents analyze the diff and surrounding code in
  parallel ... Each agent looks for a different class of issue, then a verification step checks
  candidates against actual code behavior to filter out false positives. The results are
  deduplicated, ranked by severity, and posted as inline comments" [5]. The launch post says the
  system "dispatches multiple agents in parallel based on PR complexity" [6].
- *`code-review` plugin command*: a fixed pipeline [9]:
  1. a Haiku eligibility check
  2. a Sonnet PR summary
  3. four parallel finders: 2 Sonnet agents for CLAUDE.md compliance and 2 Opus bug agents
  4. one validation subagent per candidate issue (Opus for bugs, Sonnet for CLAUDE.md issues)
- The plugin README describes an older variant: four agents, with a self-scored 0 to 100
  confidence and a cutoff of 80 [8]. The README and the command file disagree, so treat the
  command file as authoritative. (Inference: the command file is what runs.)

**Implication for our tool.** Decision 11 (a coordinator chooses the subagents) matches the exam
and [1]. However, Anthropic's shipping reviewers choose *how many* agents dynamically [6] but keep
the *kinds* of finder fixed and always add a verifier [5][9]. The design below keeps dynamic
selection of *specialists*, as decision 11 requires, and adds two things that are never optional:
- a verification stage that always runs
- a coordinator self-handle path for trivial diffs (the mock01 "already has these findings" rule)

### 1.2 Explicit criteria, few-shot, severity gating

**Definition.** Explicit criteria are categorical, checkable report and skip rules, for example
"SQL built by string concatenation". Vague adjectives such as "be thorough" or "important" are
the opposite. Few-shot examples teach where a category boundary lies. A severity gate decides
where a finding is shown.

**Exam says.**
- "'Be thorough and find all issues'. No scope boundary -> false positive storm", and explicit
  criteria give "Dramatically lower that false positive rate" (*Explicit Criteria & Instruction Design*).
- Few-shot: 2 to 4 examples is optimal, with consistent format, category diversity, and at least
  one edge case (`.../Few-Shot Prompting/Few-Shot Prompting.md`).
- Bank A, item 35 (*Bank A answers*):
  - "General instructions such as be conservative or only report high-confidence findings do
    not improve precision. Specific categorical criteria do."
  - "Ranking by the model's own severity rating filters volume, not error rate."
  - "Self-reported confidence scores are poorly calibrated."
- Review in a fresh session, not the generator's session. Otherwise the reviewer keeps the
  generator's reasoning (`.../CICD & Batch Processing/CICD & Batch Processing.md`; Bank A item 36).
- On re-runs, "include the prior findings in context and instruct Claude to report only new or
  still-unaddressed issues" (Bank A item 34).

**Sources say.**
- "Claude responds well to clear, explicit instructions" [11]. The golden rule: show the prompt
  to a colleague with minimal context. Explain *why* a rule exists, because "Claude is smart
  enough to generalize from the explanation" [11].
- Examples should be relevant, diverse, and wrapped in `<example>` tags. "Include 3–5 examples
  for best results" [11]. (Exam: 2 to 4. The overlap is 3 to 4.)
- **Key nuance for decision 17.** The Sonnet 5 and Opus 4.8 guides both say [12][13]: when a
  review prompt says "only report high-severity issues," "be conservative," or "don't nitpick,"
  the model "may investigate the code just as thoroughly, identify the bugs, and then not report
  findings it judges to be below your stated bar ... Precision typically rises, but measured
  recall can fall". Their recommended finder prompt:
  > "Report every issue you find, including ones you are uncertain about or consider
  > low-severity. Do not filter for importance or confidence at this stage - a separate
  > verification step will do that ... For each finding, include your confidence level and an
  > estimated severity so a downstream filter can rank them."
  For single-pass self-filtering the guides say: "be concrete about where the bar is rather than
  using qualitative terms like 'important'". They also advise iterating "against a subset of your
  evals ... to validate recall or F1 score gains" [12][13].
- Opus 5.5: early testers reported "more bugs caught than on Claude Opus 5 and fewer false
  alarms" [14]. This is anecdotal, with no numbers given.
- Anthropic's plugin uses a concrete bar [9]:
  - **Flag:** "will fail to compile or parse", "will definitely produce wrong results regardless
    of inputs", and "Clear, unambiguous CLAUDE.md violations where you can quote the exact rule".
  - **Do not flag:** pre-existing issues, "Pedantic nitpicks that a senior engineer would not
    flag", "Issues that a linter will catch", and "Potential issues that depend on specific
    inputs or state".
- The security-review action excludes whole categories to cut noise, for example DoS, rate
  limiting, and "Generic input validation without proven impact" [10].
- Code Review's `REVIEW.md` levers [5]:
  - redefine "Important"
  - cap nits ("report at most five nits, mention the rest as a count in the summary")
  - skip paths
  - a verification bar: "behavior claims need a `file:line` citation in the source, not an
    inference from naming"
  - re-review convergence: "after the first review, suppress new nits and post Important
    findings only"

**Implication for our tool.** Decision 17 holds if it is built in three layers. The design rules
below spell this out.
1. *Finders* apply categorical report/skip criteria with 3 to 4 examples, but do not self-filter
   on severity or confidence. They emit every finding with a severity and a confidence.
2. A *verifier* confirms each candidate against the code.
3. *Code, not the model*, routes verified high/critical findings inline and everything else to
   the summary.

The severity gate is a routing rule for what is shown. It is not the source of precision
(Bank A item 35).

### 1.3 Reviewer trust and false positives

**Definition.** A false positive is a posted finding that is wrong, or technically true but not
actionable. Trust is the author's willingness to read the next comment.

**Exam says.** "When a system flags too many non-issues, the developer ignores ALL flags.
Including the real ones" (`Explicit Criteria & Instruction Design.md`).

**Sources say.**
- Google: "Incorrect suggested edits take the developers time and reduce the developers' trust
  in the feature". The team calibrated to a target precision of 50%. At that setting the model
  addresses 52% of comments, and 40 to 50% of previewed edits are applied [15].
- AutoCommenter used per-category (per-URL) thresholds. Suppressing 22 non-actionable categories
  raised the useful ratio from 54% to 66%. Later work reached 80%. About 40% of comments were
  resolved [16].
- BitsAI-CR (ByteDance) reports 75.0% precision and uses "Outdated Rate" (the flagged code
  changed afterwards) as an automatic adoption metric [18].
- Beko field study (Qodo PR-Agent, 4,335 PRs): 73.8% of comments marked resolved, but average
  PR closure time rose from 5h52m to 8h20m. Developers reported "out-of-scope or irrelevant
  suggestions" [17].

**Implication.** Our demo should report a precision proxy next to the catch count. The prompt
design should treat the suppression list (categories we never post) as a first-class artifact.

### 1.4 Structured output

**Exam says.** Force the tool call for structure, then validate semantics in code. `tool_use`
guarantees structure, never semantics (*Structured Output via tool_use*).

**Sources say.** Claude Opus 5.5 rejects forced tool use: "`tool_choice: {"type": "any"}` or
`{"type": "tool", ...}` ... returns a 400 `invalid_request_error`". The documented replacement is
`auto` plus strict tool use, or structured outputs [40].

**Implication.** The *pattern* the exam teaches (schema-enforced output, then semantic validation)
still applies. The *mechanism* differs on the decision-22 coordinator model: use strict tool use
or structured outputs, not a forced `tool_choice`. Sonnet 5 subagents are not listed in that
error, so forced tool use should still work there (inference; test it).

## 2. State of the art in AI code review

| System | Architecture | Reported numbers | Source |
|---|---|---|---|
| Claude Code Review (managed) | Parallel specialised agents, verification step, dedup, severity ranking, inline comments plus check run | 16% → 54% of PRs get substantive comments; <1% of findings marked incorrect; >1,000-line PRs: 84% get findings, avg 7.5; <50-line PRs: 31%, avg 0.5; ~20 min; $15 to 25 per review | [5][6] |
| `code-review` plugin / `/code-review` | Fixed pipeline: eligibility, summary, 4 parallel finders, one validator per issue; `--comment` posts inline | No published numbers; effort `low`/`medium` = fewer, higher-confidence findings | [5][9] |
| claude-code-security-review | Diff-aware security scan, category exclusions for FP filtering, 20-min default timeout | "not hardened against prompt injection" | [10] |
| GitHub Copilot code review | Leaves a "Comment" review by default, not Approve/Request changes; custom instructions files | "may highlight problems ... that do not exist"; "may not identify all of the problems ... especially where changes are large"; "may repeat previous comments, even if you resolved or downvoted them" | [21][22] |
| CodeRabbit | `profile`: quiet / chill (default) / assertive; `path_filters`; `path_instructions`; learnings from replies | No FP numbers in docs | [23] |
| Graphite Diamond | Evaluates on internal PRs using acceptance, upvote and downvote rates | Vendor guide: industry FP 5 to 15%, Graphite "closer to 5–8%". Figures of "sub-3%" and "96% positive" seen only in third-party pages: **UNVERIFIED** | [24][25] |
| Google (resolve comments, AutoCommenter) | ML-suggested edits; LLM best-practice comments | 50% target precision / 52% coverage; useful ratio 54% → 80% | [15][16] |
| ByteDance BitsAI-CR | RuleChecker plus ReviewFilter, 2 stages | 75.0% precision; Outdated Rate 26.7% (Go) | [18] |

**Academic benchmarks.**
- **SWR-Bench** [19]: 1,000 manually verified GitHub PRs, 500 with known issues ("Change-PRs",
  average 1.90 issues each) and 500 clean. Ground truth comes from review timelines, supplemented
  by SZZ for issues fixed in later commits.
  - Best overall: PR-Review with Gemini-2.5-Pro, P 16.65%, R 23.18%, F1 19.38%. On functional
    changes, R 40.72%.
  - Aggregating 10 sampled reviews raised F1 by 43.67%.
  - Top false-positive cause: "Lack of Contextual Understanding (48%)".
- **Evaluating LLMs for Code Review** [20]: GPT-4o classified code correctness correctly 68.50%
  of the time with a problem description, and worse without one. The authors recommend "Human
  in the loop LLM Code Review".

**What works (convergent evidence).**
1. Specialised parallel finders, then a verification pass, then dedup and ranking [5][9][18].
2. Categorical suppression of noisy classes [9][10][16].
3. Repo-specific rules files (`REVIEW.md`, CLAUDE.md, Copilot instructions, CodeRabbit
   path instructions) [5][21][23].
4. Never approve or block by default [5][21].
5. Feedback loops (thumbs, resolution, "outdated") as metrics [5][16][18][25].

**What does not work.**
- Vague "be thorough" prompts (exam notes).
- Self-reported confidence as the only filter (Bank A item 35). Note the tension: Anthropic's own
  plugin README once used exactly this, a cutoff of 80 [8].
- Severity words in the finder prompt, which lower recall [12].
- Re-posting on every push with no memory of prior comments [21].
- Recall on large, complex changes stays weak across vendors [19][22].

## 3. Eval methodology (decision 8)

### 3.1 Ground truth: SZZ and its limits

**SZZ** (Śliwerski, Zimmermann, Zeller, MSR 2005, "When do changes induce fixes?") links a
version archive to a bug database. It identifies bug-fixing commits, then traces the lines they
changed back through history (blame) to find the "fix-inducing" commits [26]. (Bibliographic
data was verified via the search index; the ACM full text returned 403.)

Known limitations, all from primary papers:
- **Accuracy.** On 76,046 Linux fix/inducer pairs (the Fixes-tag oracle), SZZ variants "have
  recall and precision between 0.40 and 0.60 ... F1 score in all cases of around 0.50". Recall
  was 13.8% lower than in earlier studies. "17.47% of bug-fixing commits are ghost commits"
  that SZZ cannot trace, for example fixes that only add lines [27]. (Numbers checked against
  the PDF text. One automated summary of the same paper produced different figures, so quote
  only these.)
- **Fix-commit labelling.** "only half of the bug fixing commits determined by SZZ are actually
  bug fixing" (38 Apache projects) [29].
- **Tangling.** Only 17% to 32% of changes in bug-fixing commits actually fix the bug (66% to 87%
  when counting production code only). "3% to 47% of data is noisy without manual untangling" [30].
- **Oracle.** The most reliable ground truth is a fix commit whose message explicitly references
  the inducing commit, confirmed by hand [28].

**Mapping to PRs.** `GET /repos/{owner}/{repo}/commits/{commit_sha}/pulls` "Lists the merged pull
request that introduced the commit" [37b]. Squash merges make one PR a single commit, which
simplifies blame (inference).

### 3.2 SWE-bench-style replay

SWE-bench builds tasks from "real GitHub issues and corresponding pull requests" and judges
success by fail-to-pass tests [31]. The transferable ideas are three:
- freeze the repository at the pre-change commit
- give the system only what it would have had at the time
- grade against an outcome fixed in advance

For review, the "outcome" is: did a finding land on the lines, and describe the defect, that the
later fix corrected?

### 3.3 Metrics for review

Following SWR-Bench definitions [19]:
- **TP**: a ground-truth defect hit by at least one finding.
- **FN**: a ground-truth defect with no finding.
- **FP**: a finding that matches no ground truth. On clean PRs, every posted finding is an FP
  candidate.
- **Precision** = TP_findings / all findings. **Recall** = TP_defects / all defects. F1 is their
  harmonic mean.

Decision 8's number ("how many it would have caught") is **recall** on bug-introducing PRs. It
says nothing about noise. Anthropic's eval guidance says to test "both the cases where a behavior
should occur and where it shouldn't" [32]. Exam 5.5 says an aggregate hides segment failures
(*Decision rules D5*).

Caveat: in replay, a finding with no matching ground truth is not necessarily wrong. It may be a
real bug that was never fixed. So FP counts are an upper bound unless a human adjudicates them
(inference, consistent with [19]'s manual verification step).

### 3.4 LLM-as-judge for matching findings to ground truth

- SWR-Bench uses an LLM for "fact-based matching ... determining if issues in the model's report
  correspond to predefined ground truth". Agreement with humans was Cohen's κ 70.6 to 86.7, while
  BLEU was negative (−35 to −41) [19].
- Anthropic's guidance on model graders [32][33]:
  - Model graders "Requires calibration with human graders".
  - "LLM-based rubrics should be frequently calibrated against expert human judgment".
  - Use a detailed rubric.
  - "Always use a different model for evaluation than the model being evaluated" ("generally
    best practice").
- Start small: "20-50 simple tasks drawn from real failures is a great start" [32]. The research
  system started with "about 20 queries" [2].
- Read the transcripts [32].
- A deterministic pre-check before the judge: does the finding's file match, and does its line
  range overlap the lines the fix changed? Graphite uses "line range validation" as one of its
  scorers [25]. This follows "code-based graders ... preferred" [33].

### 3.5 Concrete protocol for RAVN repos

`ravn-ui-kit` has 85 PRs and `ravn-task-management-challenge` has 120 (CONTEXT.md, Known facts).
Both are internal, which satisfies decision 5.

1. **Candidate fix PRs.** Select merged PRs that close an issue labelled as a bug, or whose
   title or commits say fix/bug/regression. Hand-confirm each one; SZZ fix labels are only about
   50% reliable [29].
2. **Inducing PR.** For each confirmed fix, blame its deleted and modified lines at the fix's
   parent, excluding whitespace, comments and tests [26][30]. Map each inducing commit to its PR
   [37b]. Hand-confirm each pair [28]. Drop ghost cases (fixes that only add lines) or mark them
   "unlinkable" [27].
3. **Ground-truth record.** Record, per defect: inducing PR, file, line range at the inducing
   PR's head, a one-line defect description, fix PR, and the confirmer.
4. **Controls.** Take an equal number of PRs with no later fix touching their lines within N
   months, following SWR-Bench's 500/500 split [19]. These give the precision/noise number.
5. **Replay.** Run the reviewer on each PR's diff at its original head SHA, with no access to
   later history. Store findings as JSON; do not post them.
6. **Match.** First the deterministic file/line-overlap filter, then the LLM judge with a rubric
   ("same defect?", yes/no plus reason) on a different model from the reviewer [33]. Then
   calibrate: hand-grade 20 or more judge decisions and report agreement [32].
7. **Report, in the decision-20 eval-report shape:**
   - caught / total, split into inline-posted and summary-only
   - findings per clean PR
   - precision on inducing PRs
   - tokens and cost per PR
   Segment by repo and by defect type (exam 5.5).
8. **Small-N honesty.** With perhaps 10 to 30 validated defects, report counts rather than
   percentages, and state the confidence interval (inference; no source gives the RAVN yield).

## 4. Posting inline comments (decision 7)

**Endpoint.** `POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews` creates one review with a
`comments` array [34]. Per comment:
- `path` and `body` are required.
- Use `line`, `side` (and `start_line`/`start_side` for ranges) rather than `position`, which "is
  closing down" [35].
- `side`: "Use LEFT for deletions ... RIGHT for additions ... or unchanged lines" [35].
- `subject_type: file` attaches a comment to a file with no line [35].

Review-level fields:
- `event`: `APPROVE` | `REQUEST_CHANGES` | `COMMENT`. "Leaving this blank sets the review action
  state to PENDING" [34].
- `commit_id` should be the head SHA. An older SHA "may render your comment outdated if a
  subsequent commit modifies the line" [35].

**Why batch.** One review request is one content-creating call instead of N. Both endpoints warn
"Creating content too quickly ... may result in secondary rate limiting" [34][35].

**Limits.** From [36]:
- Primary: 5,000 requests/h for authenticated users; `GITHUB_TOKEN` gets 1,000/h per repo.
- Secondary: 100 concurrent requests, 900 points/min, and "no more than 80 content-generating
  requests per minute and no more than 500 content-generating requests per hour".
- On 403/429: wait for `retry-after` or `x-ratelimit-reset`, back off exponentially, and "Make
  content-creation requests serially". Continuing "may result in the banning of your integration".

**Errors.** 422 means "Validation failed, or the endpoint has been spammed" [34][35]. In practice
this includes comments on lines outside the diff. Code Review falls back to listing such findings
under "Additional findings" in the review body [5].

**`gh` mechanics.** `gh api repos/{owner}/{repo}/pulls/N/reviews --input review.json` sends a
full JSON body. `--input -` reads it from stdin [39]. `gh pr diff N --exclude 'pattern'` drops
generated files, and `--name-only` lists the changed files [38].

**Comment content.** Anthropic's command posts "ONE comment per unique issue". It includes a
committable suggestion block only for small, self-contained fixes: "Never post a committable
suggestion UNLESS committing the suggestion fixes the issue entirely" [9].

## 5. Failure modes and error handling

**Exam rule.**
- A failing subagent returns structured error context: failure type, the query attempted,
  partial results, and alternatives.
- A timeout is an access failure the coordinator may retry or route around. "Matched no
  documents" is a valid empty result.
- Returning empty-as-success, or terminating the whole run on one failure, both lose
  (`Decision rules D5.md`, 5.3).
- Structured errors with `retryable: false` for business errors beat parsing message text
  (practice mock 01, `process_refund` item).
- Blind retry-with-backoff for a timeout loses to "acknowledge the system issue ... and offer
  escalation or retry later" (practice mock 01, billing item).
- Synthesis carries coverage annotations saying which parts could not be reviewed
  (`Decision rules D5.md`, 5.3).

| Failure | Signal | Class | Behaviour |
|---|---|---|---|
| Claude rate limit | 429 `rate_limit_error` with `retry-after` [40][41] | transient | SDK retries twice by default, honouring `retry-after` [40]; then return structured `{type:"rate_limited", retryable:true}` to coordinator |
| Spend cap | 429 with no `retry-after`, `error_code: enforced_spend_limit_reached` [41] | terminal | Do not retry ("Retrying ... fails until access resumes" [41]); abort, post nothing, report |
| Overload / server | 529 `overloaded_error`, 500 `api_error` [40] | transient | Backoff via SDK; after exhaustion mark that subagent's scope "not reviewed" |
| Timeout | 504 `timeout_error`; SDK validates non-streaming calls against a 10-minute timeout [40] | transient | Use streaming for long calls [40]; set `maxTurns` and `maxBudgetUsd` [4]; on expiry keep partial findings |
| Subagent cut off | Foreground: partial output plus a cut-off note, or `Agent terminated early due to an API error` [3] | partial | Coordinator records coverage gap, may re-delegate the scope once |
| Concurrency cap | `Concurrent subagent limit reached`, which tells Claude not to retry [3] | back-pressure | Queue; never loop |
| Request too big | 413 `request_too_large` (32 MB Messages API) [40] | terminal for that request | Split by file |
| Diff too large (GitHub) | 406 `too_large` on the diff media type. The line threshold is undocumented: a reviewdog report quotes "maximum number of lines (3000)" [43], other reports quote 20,000, so **UNVERIFIED** | degrade | Fall back to `GET .../pulls/N/files` (max 3,000 files [37]) or local `git diff` |
| Huge diff vs context | Opus 5.5 and Sonnet 5 have 1M-token windows [42]; D5 5.1 lost-in-the-middle | degrade | Coordinator partitions by file or module and sends only relevant slices to each subagent; excludes lockfiles and generated code ([5] skip rules, [38] `--exclude`) |
| Inline comment rejected | 422 [34] | degrade | Move the finding to the summary comment ([5] "Additional findings") |
| GitHub secondary limit | 403/429 plus `retry-after` [36] | transient | One batched review, serial calls only |
| Duplicate on re-run | Prior bot comments exist | logic | Pass prior findings; report only new or still-open ones (Bank A item 34); plugin skips PRs "that already have a comment from Claude" [7] |
| Prompt injection in PR text | Untrusted diff and PR body | security | Security review is "not hardened against prompt injection" [10]; wrap PR content as data; read-only tools for finders |
| Fork PR in Actions | Secrets withheld from fork PR runs [7] | environment | Out of scope for internal repos (decision 5) |

## 6. Design rules for ravn-agents (PR reviewer)

Each rule lists its sources and the CONTEXT.md decisions it serves. **FLAG** marks a source that
contradicts or strains a decision.

1. **The coordinator selects specialists per diff, but the pipeline shape is fixed:** triage,
   then selected finders in parallel, then verification, then synthesis. Trivial diffs are
   reviewed by the coordinator directly, with no subagents. [1][2][11]; D1 1.2, mock01. Decisions
   11, 22.
   **FLAG (tension, not contradiction):** Anthropic's shipping reviewers use a fixed set of finder
   kinds and vary only scale [5][6][9]. Building-effective-agents lists code review as a
   parallelization/voting example, which is a fixed pattern [1]. Keep decision 11, but log the
   coordinator's selection and justify it in the eval: compare against an "all finders" baseline.
2. **Every subagent prompt is self-contained.** It carries the objective, the diff slice with
   file paths and head SHA, the rules, the output schema, and boundaries. Nothing is assumed
   inherited. [2][3][4]; D1 1.3. Decision 11.
3. **Finders apply explicit categorical report/skip criteria with 3 to 4 examples** (one edge
   case, one "do not report"). They do not self-filter on severity or confidence, and they emit
   `severity` and `confidence` per finding. [11][12][13]; exam notes Explicit Criteria, Few-Shot.
   Decision 17.
   **FLAG:** decision 17's "report/skip criteria" must be category criteria, not severity
   thresholds. Anthropic states that severity words in the finder prompt lower recall [12][13].
4. **A verifier confirms every candidate against the code** before it can be posted, and it must
   cite `file:line` evidence [5][9]; SWR-Bench FP causes [19].
   **FLAG:** decision 17 names severity gating as the precision mechanism. Bank A item 35 and
   [12] say severity ranking "filters volume, not error rate". Verification is what buys
   precision. Add it (extends 17).
5. **Severity routing happens in code:** verified high/critical findings go inline, and all other
   verified findings go into one summary comment with counts. Unverified findings are never
   posted. [5] (nit cap, "Additional findings"); exam notes "Code > Prompts". Decision 17.
6. **Structured output.** Findings are strict-schema JSON (path, line, side, severity, category,
   evidence, confidence, fix), validated semantically in code. For example, the line must be in
   the diff hunk. The Opus 5.5 coordinator uses strict tool use or structured outputs, because
   forced `tool_choice` returns 400 on that model [40].
   **FLAG:** the exam teaches forced `tool_choice`; decision 22's coordinator model rejects it.
   Decision 22.
7. **Post exactly one review per run** via `gh api .../pulls/N/reviews --input -`:
   - `event: COMMENT`, never APPROVE or REQUEST_CHANGES
   - `commit_id` set to the head SHA
   - `line`/`side`, not `position`
   - serial calls only
   On 422, move the finding to the summary. [34][35][36][39][5][21]. Decision 7.
8. **Re-runs are idempotent.** Read existing bot comments and pass them to the coordinator; post
   only new or still-open findings. Bank A item 34; [7][21]. Decision 7.
9. **Errors are typed** (`rate_limited`, `overloaded`, `timeout`, `spend_cap`, `diff_too_large`,
   `line_not_in_diff`), with `retryable` and partial results. Transient errors are retried by the
   SDK and then surfaced. Terminal errors are never retried. The final summary lists un-reviewed
   files as coverage gaps. [3][40][41]; D5 5.3; mock01. Decision 6 (failure modes).
10. **Budgets are hard limits in code:** `maxTurns` per subagent, `maxBudgetUsd` per run,
    concurrency at most 5, and depth 1 (finders cannot spawn). [4]. Decision 22; cost awareness
    per the 15× token figure [2].
11. **Models:** Opus 5.5 coordinator and Sonnet 5 finders (decision 22), consistent with
    Anthropic's Opus-lead/Sonnet-worker research system [2].
    **FLAG (minor):** Anthropic's plugin runs its *bug* finders and bug validators on Opus, and
    Sonnet only for CLAUDE.md compliance [9]. The eval should compare Sonnet 5 and Opus 5.5 for
    the verifier at least. Set effort explicitly; Opus 5.5 defaults to `medium` [14][42].
12. **The eval reports recall *and* noise.** Report caught/total on validated inducing PRs
    (decision 8) plus findings-per-PR on matched clean controls. Ground truth is hand-validated
    SZZ. Matching uses a line-overlap pre-filter plus a calibrated LLM judge on a different model.
    [19][26]–[30][32][33].
    **FLAG:** decision 8, as worded, measures recall only. [19] and [32] require the negative
    class. Extend, do not replace.
13. **Treat PR content as untrusted.** Finders get read-only tools (Read, Grep, Glob), and the PR
    body and diff are wrapped as data. [10][14]; [4] tool restrictions. Decision 4 (plugin
    subagents cannot set `permissionMode` or hooks [3], so enforce this with the `tools` list).
14. **Review runs in a fresh context,** never in the session that wrote the code. Exam notes CI/CD
    note; Bank A item 36. Decision 7.

## Sources

All accessed 2026-09-25.

1. Anthropic, "Building effective agents". https://www.anthropic.com/engineering/building-effective-agents
2. Anthropic, "How we built our multi-agent research system". https://www.anthropic.com/engineering/multi-agent-research-system
3. Claude Code Docs, "Subagents". https://code.claude.com/docs/en/sub-agents
4. Claude Code Docs, "Subagents in the SDK". https://code.claude.com/docs/en/agent-sdk/subagents
5. Claude Code Docs, "Code Review". https://code.claude.com/docs/en/code-review
6. Claude blog, "Code Review for Claude Code" (2026-03-09). https://claude.com/blog/code-review
7. Claude Code Docs, "Claude Code GitHub Actions". https://code.claude.com/docs/en/github-actions
8. anthropics/claude-code, `plugins/code-review/README.md`. https://github.com/anthropics/claude-code/blob/main/plugins/code-review/README.md
9. anthropics/claude-code, `plugins/code-review/commands/code-review.md`. https://github.com/anthropics/claude-code/blob/main/plugins/code-review/commands/code-review.md
10. anthropics/claude-code-security-review (README). https://github.com/anthropics/claude-code-security-review
11. Claude Platform Docs, "Prompting best practices". https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
12. Claude Platform Docs, "Prompting Claude Sonnet 5" (Code review harnesses). https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5
13. Claude Platform Docs, "Prompting Claude Opus 4.8" (Code review harnesses). https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-4-8
14. Claude Platform Docs, "Prompting Claude Opus 5.5". https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5
15. Google Research, "Resolving code review comments with ML". https://research.google/blog/resolving-code-review-comments-with-ml/
16. Vijayvergiya et al., "AI-Assisted Assessment of Coding Practices in Modern Code Review" (AIware 2024). https://arxiv.org/html/2405.13565v1
17. Cihan et al., "Automated Code Review In Practice". https://arxiv.org/html/2412.18531v1
18. "BitsAI-CR: Automated Code Review via LLM in Practice". https://arxiv.org/abs/2501.15134
19. Zeng et al., "SWR-Bench: Assessing LLM Performance in Real-World Code Review Comment Generation". https://arxiv.org/html/2509.01494v2
20. "Evaluating Large Language Models for Code Review". https://arxiv.org/abs/2505.20206
21. GitHub Docs, "Using GitHub Copilot code review on GitHub". https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/copilot-code-review
22. GitHub Docs, "Responsible use of GitHub Copilot code review". https://docs.github.com/copilot/responsible-use-of-github-copilot-features/responsible-use-of-github-copilot-code-review
23. CodeRabbit Docs, "Configuration reference". https://docs.coderabbit.ai/reference/configuration
24. Graphite, "Expected false-positive rate from AI code review tools" (vendor guide). https://graphite.com/guides/ai-code-review-false-positives
25. Braintrust, "How Graphite builds reliable AI code review at scale". https://www.braintrust.dev/customers/graphite
26. Śliwerski, Zimmermann, Zeller, "When do changes induce fixes?", MSR 2005, pp. 24–28. https://dl.acm.org/doi/abs/10.1145/1083142.1083147 (metadata via search index; full text 403)
27. Lyu et al., "Evaluating SZZ Implementations: An Empirical Study on the Linux Kernel" (TSE 2024). https://arxiv.org/abs/2308.05060 (numbers checked against https://arxiv.org/pdf/2308.05060)
28. Rosa et al., "Evaluating SZZ Implementations Through a Developer-informed Oracle" (ICSE 2021). https://arxiv.org/abs/2102.03300
29. Herbold et al., "Problems with SZZ and Features: An empirical study of the state of practice of defect prediction data collection" (EMSE 2022). https://arxiv.org/abs/1911.08938
30. Herbold et al., "A Fine-grained Data Set and Analysis of Tangling in Bug Fixing Commits". https://arxiv.org/abs/2011.06244
31. Jimenez et al., "SWE-bench: Can Language Models Resolve Real-World GitHub Issues?". https://arxiv.org/abs/2310.06770
32. Anthropic, "Demystifying evals for AI agents". https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
33. Claude Platform Docs, "Create strong empirical evaluations" (develop tests). https://platform.claude.com/docs/en/test-and-evaluate/develop-tests
34. GitHub REST, "Create a review for a pull request". https://docs.github.com/en/rest/pulls/reviews?apiVersion=2022-11-28#create-a-review-for-a-pull-request
35. GitHub REST, "Create a review comment for a pull request". https://docs.github.com/en/rest/pulls/comments?apiVersion=2022-11-28#create-a-review-comment-for-a-pull-request
36. GitHub REST, "Rate limits for the REST API". https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api?apiVersion=2022-11-28
37. GitHub REST, "List pull requests files". https://docs.github.com/en/rest/pulls/pulls?apiVersion=2022-11-28#list-pull-requests-files
    37b. GitHub REST, "List pull requests associated with a commit". https://docs.github.com/en/rest/commits/commits?apiVersion=2022-11-28#list-pull-requests-associated-with-a-commit
38. GitHub CLI manual, `gh pr diff`. https://cli.github.com/manual/gh_pr_diff
39. GitHub CLI manual, `gh api`. https://cli.github.com/manual/gh_api
40. Claude API Docs, "Errors". https://platform.claude.com/docs/en/api/errors
41. Claude API Docs, "Rate limits". https://platform.claude.com/docs/en/api/rate-limits
42. Claude Platform Docs, "Models overview". https://platform.claude.com/docs/en/about-claude/models/overview
43. reviewdog issue #1696, "GitHub Pull Request diff API responds with 406: diff too large" (secondary; field report). https://github.com/reviewdog/reviewdog/issues/1696

Exam-layer notes (private study notes, not published):
- *The Winning Philosophy*
- *Decision rules D1*
- *Decision rules D5*
- *Explicit Criteria & Instruction Design*
- *Few-Shot Prompting*
- *Structured Output via tool_use*
- *CICD & Batch Processing*
- *Bank A answers* (items 34, 35, 36)
- *Syllabus coverage*
- practice mock 01
